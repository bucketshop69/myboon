# 008: Identify DEX Protocol (Swaps)

## Goal

Enhance swap parsing to extract token in/out amounts and fee data.

## Why

- Basic type identification exists from Issue 007
- We need structured swap details for portfolio analytics

---

## Fixed Decisions (Updated)

### Decision 1: Protocol Scope

**Chosen (MVP):** Jupiter v6 only

- Supported now: `JUPITER_V6`
- Deferred: Raydium, Orca, others

### Decision 2: Extraction Method

**Chosen:** compute token deltas from pre/post token balances, then enrich from instruction context if needed

### Decision 3: Multi-hop Representation

**Chosen:** primary input/output tokens only for MVP

---

## Approach

1. Ensure tx is classified as Jupiter swap
2. Build token balance delta map (`post - pre`)
3. Identify input (negative) and output (positive)
4. Return structured `SwapDetails`

---

## Implementation Steps

### Step 1: Add swap types

```typescript
export interface SwapDetails {
  dex: 'jupiter';
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  feeAmount: string;
  feeMint: string | null;
}
```

### Step 2: Implement Jupiter swap parser

- File: `src/parsers/swap.ts`
- Reuse shared balance-delta helper
- Keep functions small and composable

### Step 3: Wire into main transaction parser

- When `type === 'swap'` and `protocol === 'jupiter'`, attach `SwapDetails`

---

## Acceptance Criteria

- [ ] `parseSwapTransaction(tx, 'jupiter')` returns structured swap details when parseable
- [ ] Non-Jupiter or non-swap tx returns `null`
- [ ] Input/output amounts derived from token deltas
- [ ] Unit tests pass

---

## Files to Create

| File | Action |
|------|--------|
| `packages/tx-parser/src/parsers/swap.ts` | Create |
| `packages/tx-parser/src/__tests__/swap.test.ts` | Create |

## Files to Modify

| File | Change |
|------|--------|
| `packages/tx-parser/src/parsers/transaction.ts` | Attach swap details |
| `packages/tx-parser/src/parsers/index.ts` | Export swap parser |
| `packages/tx-parser/src/types/index.ts` | Add swap details type |
