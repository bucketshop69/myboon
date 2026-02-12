# Issue #011: Refactor to Indexer-Based Foundation

**Type:** Refactor / Foundation  
**Priority:** Critical  
**Milestone:** Alpha Demo (Colosseum Hackathon)  
**Assignee:** Codex  
**Estimated Effort:** 3-4 hours  
**Depends On:** None  
**Blocks:** #012 (Jupiter Buy/Sell Classification)

---

## Problem Statement

Current tx-parser uses custom balance delta logic that:

- Manually computes token balance changes
- Doesn't properly handle decimals (assumes 9 or returns raw)
- Tightly couples parsing logic with data extraction
- Will be hard to extend when adding streaming (Phase 2)

We have a cleaner indexer implementation in `/indexer_zero_to_one/packages/core/src/` that:

- Extracts token transfers with proper decimals
- Uses clean utility functions (composable, reusable)
- Is ready for streaming with `TransactionMonitor`
- Separates concerns (transaction analysis, program detection, token transfers)

**Goal:** Refactor tx-parser to use indexer-based utilities as the foundation. Build once, reuse everywhere.

---

## Reference Implementation

**Source:** `/home/main-user/.openclaw/workspace/indexer_zero_to_one/packages/core/src/`

### Key Files to Adapt

- `account.ts` - Token transfer extraction with decimals
- `program.ts` - Program detection and inner instructions
- `transaction.ts` - Transaction analysis (account keys, instruction count)
- `websocket.ts` - Streaming monitor (Phase 2)

---

## Requirements

### 1. Create Utility Module Structure

Create `packages/tx-parser/src/utils/` with:

```
utils/
  ├── accountKeys.ts     (Extract all account keys from tx)
  ├── programCheck.ts    (Check if program was used)
  ├── tokenTransfers.ts  (Extract token transfers with decimals)
  ├── innerInstructions.ts (Parse inner instructions)
  └── types.ts           (Shared utility types)
```

### 2. Port `accountKeys.ts`

**Purpose:** Extract all account keys from a transaction (static + dynamic loaded addresses)

**Reference:** `indexer_zero_to_one/.../transaction.ts` lines 13-22

**Implementation:**

```typescript
import type { ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';

export function getAllAccountKeys(transaction: ParsedTransactionWithMeta): string[] {
  const accountKeys = transaction.transaction.message
    .staticAccountKeys.map((key: PublicKey) => key.toBase58());

  // Add dynamically loaded addresses (if any)
  if (transaction.meta?.loadedAddresses) {
    accountKeys.push(
      ...transaction.meta.loadedAddresses.writable.map((k) => k.toBase58()),
      ...transaction.meta.loadedAddresses.readonly.map((k) => k.toBase58())
    );
  }

  return accountKeys;
}
```

**Why:** Every parser needs this. DRY principle.

### 3. Port `programCheck.ts`

**Purpose:** Check if a specific program was used in a transaction

**Reference:** `indexer_zero_to_one/.../program.ts` `isUsedProgram()`

**Implementation:**

```typescript
import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import { getAllAccountKeys } from './accountKeys.js';

export function isUsedProgram(
  transaction: ParsedTransactionWithMeta,
  programId: string
): boolean {
  const accountKeys = getAllAccountKeys(transaction);
  const compiledInstructions = transaction.transaction.message.compiledInstructions;

  return compiledInstructions.some(
    (instruction) => accountKeys[instruction.programIdIndex] === programId
  );
}

export function getCalledPrograms(
  transaction: ParsedTransactionWithMeta
): string[] {
  const accountKeys = getAllAccountKeys(transaction);
  const compiledInstructions = transaction.transaction.message.compiledInstructions;

  const programIds = new Set<string>();
  
  for (const instruction of compiledInstructions) {
    programIds.add(accountKeys[instruction.programIdIndex]);
  }

  return [...programIds];
}
```

**Why:** Replace `getTransactionProgramIds()` in `base.ts` with cleaner version.

### 4. Port `tokenTransfers.ts`

**Purpose:** Extract token transfers with proper decimals (no more guessing!)

**Reference:** `indexer_zero_to_one/.../account.ts` `getTokenTransfers()`

**Implementation:**

```typescript
import type { ParsedTransactionWithMeta } from '@solana/web3.js';

export interface TokenTransfer {
  mint: string;
  from: string | undefined;
  to: string | undefined;
  amount: string;        // Already formatted for UI
  decimals: number;      // From uiTokenAmount
  change: number;        // Positive = gained, negative = lost
}

export function getTokenTransfers(
  transaction: ParsedTransactionWithMeta
): TokenTransfer[] {
  const meta = transaction.meta;
  if (!meta) return [];

  const preTokenBalances = meta.preTokenBalances || [];
  const postTokenBalances = meta.postTokenBalances || [];

  const transfers: TokenTransfer[] = [];

  for (const postBalance of postTokenBalances) {
    const preBalance = preTokenBalances.find(
      (pre) => pre.accountIndex === postBalance.accountIndex
    );

    const preAmount = Number(preBalance?.uiTokenAmount.amount || '0');
    const postAmount = Number(postBalance.uiTokenAmount.amount || '0');
    const change = postAmount - preAmount;

    // Skip if no change
    if (change === 0) continue;

    transfers.push({
      mint: postBalance.mint,
      from: change < 0 ? postBalance.owner : undefined,
      to: change > 0 ? postBalance.owner : undefined,
      amount: postBalance.uiTokenAmount.uiAmountString || postAmount.toString(),
      decimals: postBalance.uiTokenAmount.decimals,
      change
    });
  }

  return transfers;
}
```

**Why:**

- Proper decimal handling (no assumptions)
- Direction built-in (from/to based on sign)
- Clean interface for all parsers

### 5. Port `innerInstructions.ts`

**Purpose:** Extract inner instructions (needed for complex swaps, LP operations)

**Reference:** `indexer_zero_to_one/.../program.ts` `getInnerInstructions()`

**Implementation:**

```typescript
import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import { getAllAccountKeys } from './accountKeys.js';

export interface InnerInstruction {
  programId: string;
  accounts: number[];
  data: string;
  parentIndex: number;
}

export function getInnerInstructions(
  transaction: ParsedTransactionWithMeta
): InnerInstruction[] {
  const meta = transaction.meta;
  if (!meta) return [];

  const accountKeys = getAllAccountKeys(transaction);
  const innerInstructions = meta.innerInstructions || [];
  const result: InnerInstruction[] = [];

  for (const innerSet of innerInstructions) {
    const parentIndex = innerSet.index;

    for (const instruction of innerSet.instructions) {
      result.push({
        programId: accountKeys[instruction.programIdIndex],
        accounts: instruction.accounts,
        data: instruction.data,
        parentIndex
      });
    }
  }

  return result;
}
```

**Why:** Complex swaps (Jupiter aggregation) and LP operations need this.

### 6. Update `base.ts`

**Replace:**

```typescript
export function getTransactionProgramIds(transaction: ParsedTransactionWithMeta): Set<string>
```

**With:**

```typescript
import { getCalledPrograms } from '../utils/programCheck.js';

export function getTransactionProgramIds(transaction: ParsedTransactionWithMeta): Set<string> {
  return new Set(getCalledPrograms(transaction));
}
```

**Or:** Deprecate `getTransactionProgramIds()` and have parsers import `getCalledPrograms()` directly.

### 7. Deprecate Old Balance Delta Logic

**In `parsers/swap.ts`:**

- Keep for backwards compatibility (don't break existing tests)
- Add deprecation comment: `// DEPRECATED: Use getTokenTransfers() from utils/tokenTransfers.ts`
- Future parsers should NOT use this

---

## Acceptance Criteria

### Must Have

1. ✅ `utils/accountKeys.ts` created with `getAllAccountKeys()`
2. ✅ `utils/programCheck.ts` created with `isUsedProgram()` and `getCalledPrograms()`
3. ✅ `utils/tokenTransfers.ts` created with `getTokenTransfers()`
4. ✅ `utils/innerInstructions.ts` created with `getInnerInstructions()`
5. ✅ `utils/types.ts` created with shared types
6. ✅ All utilities have TypeScript types matching Solana web3.js
7. ✅ Existing tests pass (96%+ parse rate maintained)
8. ✅ Old `swap.ts` balance delta logic marked as deprecated

### Nice to Have

- Unit tests for each utility function
- JSDoc comments with examples

---

## Testing

**Step 1:** Run existing tests

```bash
npm test
```

**Expected:** All pass (no breaking changes)

**Step 2:** Verify utilities work standalone

```typescript
import { getTokenTransfers } from '../utils/tokenTransfers.js';

it('extracts token transfers with decimals', async () => {
  const signature = '<jupiter-swap-signature>';
  const tx = await fetchSingleTransaction(signature);
  const transfers = getTokenTransfers(tx);
  
  expect(transfers.length).toBeGreaterThan(0);
  expect(transfers[0].decimals).toBeDefined();
  expect(transfers[0].amount).toBeDefined();
});
```

**Step 3:** Smoke test with wallet analysis

```bash
npm test analyze-wallet
```

**Expected:** Same parse rate (96%+)

---

## Implementation Notes

### File Structure

```
packages/tx-parser/src/
  ├── utils/               (NEW)
  │   ├── accountKeys.ts   
  │   ├── programCheck.ts  
  │   ├── tokenTransfers.ts
  │   ├── innerInstructions.ts
  │   └── types.ts         
  ├── parsers/
  │   ├── base.ts          (UPDATE - use new utils)
  │   ├── swap.ts          (DEPRECATE balance delta logic)
  │   └── ...
  └── ...
```

### Type Safety

- Use `ParsedTransactionWithMeta` from `@solana/web3.js` (not fetching tx every time)
- Reference types, don't duplicate them
- All utilities accept `transaction` parameter (already fetched)

### Migration Path

- This issue creates the utilities
- #012 (Jupiter parser) will use them
- Future parsers (Raydium, Orca, Meteora) use them too
- Eventually remove deprecated `swap.ts` balance delta code

---

## Dependencies

**None** - This is the foundation.

---

## Follow-up Issues

- #012: Jupiter Buy/Sell Classification (uses these utilities)
- #013: Meteora LP Classification (uses these utilities)
- Future: Raydium, Orca parsers (use these utilities)

---

## Why This Matters

**Without this:** Every parser reinvents token transfer extraction → messy, inconsistent, buggy

**With this:**

- Write parser logic, not data extraction
- Proper decimals everywhere
- Easy to add new DEXs/programs
- Ready for Phase 2 streaming

**This is the foundation that makes everything else easier.**

---

**PM Approval:** ✅ bibhu  
**EM Review:** ✅ (ready for Codex)  
**Created:** 2026-02-12 15:00 IST  
**References:** `/indexer_zero_to_one/packages/core/src/`
