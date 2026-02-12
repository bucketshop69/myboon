# Issue #012: Jupiter Swap Buy/Sell Classification

**Type:** Enhancement  
**Priority:** High  
**Milestone:** Alpha Demo (Colosseum Hackathon)  
**Assignee:** Codex  
**Estimated Effort:** 2-3 hours  
**Depends On:** #011 (Indexer Foundation - must complete first)

---

## Problem Statement

Current Jupiter swap parsing identifies swaps but doesn't classify them as BUY or SELL operations. For agentic intelligence, we need to know:
- When a trader **buys** an unknown token using funding tokens (SOL/USDC/USDT)
- When a trader **sells** an unknown token back to funding tokens
- Which tokens need research (unknown SPL tokens)

This is critical for the agent to trigger research on newly discovered tokens and build sentiment context.

---

## Current Behavior

```typescript
// What we return now
{
  type: 'swap',
  protocol: 'jupiter',
  details: {
    kind: 'swap',
    dex: 'jupiter',
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "XYZabc123...",
    inputAmount: "2000000000",
    outputAmount: "1000000000"
  }
}
```

**Issues:**
- No semantic distinction between buy/sell
- No funding token identification
- No research trigger flag
- Manual balance delta computation (no proper decimals)

---

## Desired Behavior

```typescript
// What we should return
{
  type: 'buy', // or 'sell' or 'swap'
  protocol: 'jupiter',
  details: {
    kind: 'buy',
    dex: 'jupiter',
    fundingToken: {
      mint: "So11111111111111111111111111111111111111112",
      isKnown: true
    },
    targetToken: {
      mint: "XYZabc123...",
      isKnown: false,
      needsResearch: true
    },
    fundingAmount: "2.0",      // UI-friendly, proper decimals
    targetAmount: "1000.0",    // From TokenTransfer
    direction: 'buy'
  }
}
```

---

## Requirements

### 1. Known Token Constants

Create `constants/knownTokens.ts`:

```typescript
export const KNOWN_FUNDING_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
} as const;

export function isKnownFundingToken(mint: string): boolean {
  return Object.values(KNOWN_FUNDING_TOKENS).includes(mint);
}
```

### 2. Create Dedicated Jupiter Parser

Create `parsers/jupiter.ts` - this uses utilities from #011:

**Imports:**
```typescript
import { VERIFIED_PROGRAM_IDS } from '../constants/programIds.js';
import { isKnownFundingToken } from '../constants/knownTokens.js';
import { isUsedProgram } from '../utils/programCheck.js';           // FROM #011
import { getTokenTransfers, type TokenTransfer } from '../utils/tokenTransfers.js'; // FROM #011
import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import type { BuySellDetails, LegacySwapDetails } from '../types/index.js';
```

**Main function:**
```typescript
export function parseJupiterTransaction(
  transaction: ParsedTransactionWithMeta
): BuySellDetails | LegacySwapDetails | null
```

**Logic flow:**

1. **Verify Jupiter V6 program present:**
   ```typescript
   if (!isUsedProgram(transaction, VERIFIED_PROGRAM_IDS.JUPITER_V6)) {
     return null;
   }
   ```

2. **Extract token transfers (uses #011 utilities):**
   ```typescript
   const transfers = getTokenTransfers(transaction);
   if (transfers.length < 2) return null; // Swap needs at least 2 transfers
   ```

3. **Find input and output tokens:**
   - Input = transfer with negative change (tokens leaving wallet)
   - Output = transfer with positive change (tokens entering wallet)
   - If multiple, pick largest by absolute value

4. **Classify using known token check:**
   ```typescript
   const inputIsKnown = isKnownFundingToken(input.mint);
   const outputIsKnown = isKnownFundingToken(output.mint);
   ```

5. **Return classified details:**
   - If `inputIsKnown && !outputIsKnown` → `BuySellDetails` with `kind: 'buy'`
   - If `!inputIsKnown && outputIsKnown` → `BuySellDetails` with `kind: 'sell'`
   - Otherwise → `LegacySwapDetails` with `kind: 'swap'`

**Key advantages over old approach:**
- ✅ Decimals handled automatically (from `TokenTransfer.decimals`)
- ✅ Amounts already formatted (from `TokenTransfer.amount`)
- ✅ Direction clear (from `TokenTransfer.change` sign)
- ✅ No manual balance delta computation

**Key fields:**
- BUY: `fundingToken` = input, `targetToken` = output, `targetToken.needsResearch = true`
- SELL: `fundingToken` = output, `targetToken` = input, `targetToken.needsResearch = true`
- SWAP: fallback for both-known or both-unknown cases

### 3. Update Registry

In `parsers/registry.ts`:

**Current line 11:**
```typescript
'swap:jupiter': (transaction) => parseSwapTransaction(transaction, 'jupiter'),
```

**Change to:**
```typescript
'swap:jupiter': (transaction) => parseJupiterTransaction(transaction),
```

**Add import at top:**
```typescript
import { parseJupiterTransaction } from './jupiter.js';
```

**Note:** Keep `parseSwapTransaction` import for now (backwards compatibility). Future: deprecate it.

### 4. Enhanced Details Type

Update `types/index.ts`:

```typescript
export interface TokenInfo {
  mint: string;
  isKnown: boolean;
  needsResearch?: boolean; // true if isKnown=false and is SPL token
}

export interface BuySellDetails {
  kind: 'buy' | 'sell';
  dex: 'jupiter';
  fundingToken: TokenInfo;
  targetToken: TokenInfo;
  fundingAmount: string;
  targetAmount: string;
  direction: 'buy' | 'sell';
  feeAmount: string;
}

export type SwapDetails = BuySellDetails | LegacySwapDetails;

// Keep old SwapDetails as LegacySwapDetails for edge cases
export interface LegacySwapDetails {
  kind: 'swap';
  dex: 'jupiter';
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  feeAmount: string;
  feeMint: string | null;
}
```

### 5. Transaction Type Update

Update `TransactionType` in `types/index.ts`:

```typescript
export type TransactionType =
  | 'buy'
  | 'sell'
  | 'swap'
  | 'perp'
  | 'lp'
  | 'nft'
  | 'transfer'
  | 'unknown';
```

Add parsed transaction types:

```typescript
export interface ParsedBuyTransaction extends ParsedTransactionBase {
  type: 'buy';
  protocol: 'jupiter';
  details: BuySellDetails;
}

export interface ParsedSellTransaction extends ParsedTransactionBase {
  type: 'sell';
  protocol: 'jupiter';
  details: BuySellDetails;
}

// Update ParsedTransaction union
export type ParsedTransaction =
  | ParsedBuyTransaction
  | ParsedSellTransaction
  | ParsedSwapTransaction
  | ParsedLpTransaction
  | ParsedTransferTransaction
  | ParsedUnknownTransaction;
```

---

## Acceptance Criteria

### Must Have

**Prerequisites:**
- ⚠️ Issue #011 completed (utilities must exist first)

**Implementation:**
1. ✅ `constants/knownTokens.ts` created with SOL, USDC, USDT mint addresses
2. ✅ `isKnownFundingToken()` helper function works correctly
3. ✅ `parsers/jupiter.ts` created for all Jupiter V6 logic
4. ✅ Jupiter parser uses `getTokenTransfers()` from #011 utilities
5. ✅ Jupiter parser uses `isUsedProgram()` from #011 utilities
6. ✅ Jupiter swaps classified as `buy` when: known → unknown
7. ✅ Jupiter swaps classified as `sell` when: unknown → known
8. ✅ Unknown SPL tokens flagged with `needsResearch: true`
9. ✅ Amounts already formatted (from `TokenTransfer.amount`)
10. ✅ Decimals properly handled (from `TokenTransfer.decimals`)
11. ✅ Registry updated: line 11 changes to call `parseJupiterTransaction()`
12. ✅ Existing tests pass (96%+ parse rate maintained)

### Testing

**Step 1:** Add unit tests in `parse.test.ts`

Find a Jupiter swap transaction from the analyze-wallet test output:
- Look for transactions with `type: 'swap', protocol: 'jupiter'`
- Pick one where SOL → unknown token (for BUY test)
- Pick one where unknown token → SOL (for SELL test)
- Use their signatures in test cases

```typescript
it('classifies buy transaction correctly', async () => {
  const signature = '<use-real-signature-from-wallet-test>';
  const tx = await fetchSingleTransaction(signature);
  const result = parseSingleTransaction(tx);
  
  expect(result.type).toBe('buy');
  expect(result.details.kind).toBe('buy');
  expect(result.details.fundingToken.isKnown).toBe(true);
  expect(result.details.targetToken.needsResearch).toBe(true);
  expect(result.details.fundingAmount).toBeDefined();
  expect(result.details.targetAmount).toBeDefined();
});

it('classifies sell transaction correctly', async () => {
  const signature = '<use-real-signature-from-wallet-test>';
  const tx = await fetchSingleTransaction(signature);
  const result = parseSingleTransaction(tx);
  
  expect(result.type).toBe('sell');
  expect(result.details.kind).toBe('sell');
  expect(result.details.fundingToken.isKnown).toBe(true);
  expect(result.details.targetToken.needsResearch).toBe(true);
});
```

**Step 2:** Run wallet analysis

```bash
npm test analyze-wallet
```

**Expected results:**
- At least 80% of Jupiter swaps classified as `buy` or `sell` (not generic `swap`)
- Parse rate remains 96%+
- Output shows breakdown: `buy: X, sell: Y, swap: Z`

---

## Out of Scope

- ❌ Token symbol resolution (use mint addresses only, DB later)
- ❌ USDC→USDT edge cases (stay as 'swap')
- ❌ Meteora LP transactions (separate issue)
- ❌ On-chain metadata fetching
- ❌ Database integration

---

## Implementation Notes

**File structure:**
```
parsers/
  ├── jupiter.ts    (NEW - all Jupiter V6 logic)
  ├── swap.ts       (KEEP - don't break existing code)
  ├── registry.ts   (UPDATE - line 11 + import)
  └── ...
utils/              (FROM #011)
  ├── tokenTransfers.ts
  ├── programCheck.ts
  └── ...
```

**Key difference from old approach:**
- ❌ OLD: Manual balance delta computation in parser
- ✅ NEW: Use `getTokenTransfers()` utility (cleaner, proper decimals)

**Classification algorithm:**
```typescript
const transfers = getTokenTransfers(transaction);
const input = transfers.find(t => t.change < 0); // Negative = leaving
const output = transfers.find(t => t.change > 0); // Positive = entering

if (isKnownFundingToken(input.mint) && !isKnownFundingToken(output.mint)) {
  // BUY: Known token → Unknown token
  return buildBuyDetails(input, output);
}

if (!isKnownFundingToken(input.mint) && isKnownFundingToken(output.mint)) {
  // SELL: Unknown token → Known token
  return buildSellDetails(input, output);
}

// SWAP: Both known or both unknown
return buildSwapDetails(input, output);
```

**Type safety:**
- Use discriminated union: `kind: 'buy' | 'sell' | 'swap'`
- Keep `LegacySwapDetails` for backwards compatibility

**Amount formatting:**
- Already done by `getTokenTransfers()` (returns `TokenTransfer.amount` as string)
- Decimals included in `TokenTransfer.decimals`

**Edge cases:**
- If `transfers.length < 2` → return null (not a valid swap)
- If both tokens known or both unknown → return `LegacySwapDetails` with `kind: 'swap'`

---

## Dependencies

**⚠️ CRITICAL:** #011 (Indexer Foundation) must be completed first

This issue uses:
- `getTokenTransfers()` from `utils/tokenTransfers.ts`
- `isUsedProgram()` from `utils/programCheck.ts`

Without #011, this issue cannot be implemented.

---

## Follow-up Issues

- #013: Meteora LP transaction classification
- #014: Transfer transaction detail extraction
- Future: Raydium, Orca parsers (all use #011 utilities)

---

**PM Approval:** ✅ bibhu  
**EM Review:** ✅ (ready for Codex after #011)  
**Created:** 2026-02-12 14:30 IST  
**Updated:** 2026-02-12 15:05 IST (refactored to use #011 utilities)
