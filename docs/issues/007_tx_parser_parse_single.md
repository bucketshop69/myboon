# 007: Parse a Single Transaction

## Goal

Create a function that classifies one raw transaction into a base type and protocol.

## Why

- First classification layer in parser pipeline
- Enables targeted detail extraction in later issues

---

## Fixed Decisions (Updated)

### Decision 1: Program Coverage (MVP)

Use only verified protocol IDs for now:

- `JUPITER_V6 = 'JUP6LkbZbjS3tLUZoi5QNyVTaV4'`
- `METEORA_DLMM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'`

Do not include Pacific, Raydium LP, Sanctum yet.

### Decision 2: Constants Location

**Chosen:** `src/constants/programIds.ts`

### Decision 3: Parsing Strategy

**Chosen:** inspect instruction program IDs first, then map to `{ type, protocol }`

---

## Approach

1. Extract all program IDs from transaction instructions
2. Match against verified constants
3. Return base classification:
   - Jupiter -> `swap`
   - Meteora DLMM -> `lp` (or `swap` when later rule says so)
   - SPL Token / ATA -> `transfer`
   - else -> `unknown`

---

## Implementation Steps

### Step 1: Create constants file

```typescript
// src/constants/programIds.ts
export const VERIFIED_PROGRAM_IDS = {
  JUPITER_V6: 'JUP6LkbZbjS3tLUZoi5QNyVTaV4',
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROGRAM: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
} as const;
```

### Step 2: Create parser base

- `getProgramIdFromInstruction()` helper
- `identifyTransactionType()` classifier
- clear fallback to `unknown`

### Step 3: Create `parseSingleTransaction()`

Return:

- `type`
- `protocol`
- `timestamp`
- `signature`
- `details` (generic scaffold)

---

## Acceptance Criteria

- [ ] Uses constants from `src/constants/programIds.ts`
- [ ] Jupiter tx classified as `swap` + `jupiter`
- [ ] Meteora DLMM tx classified as `lp` + `meteora-dlmm`
- [ ] SPL transfer classified as `transfer`
- [ ] Unknown programs return `unknown`
- [ ] Unit tests pass

---

## Files to Create

| File | Action |
|------|--------|
| `packages/tx-parser/src/constants/programIds.ts` | Create |
| `packages/tx-parser/src/parsers/base.ts` | Create |
| `packages/tx-parser/src/parsers/transaction.ts` | Create |
| `packages/tx-parser/src/parsers/index.ts` | Create |
| `packages/tx-parser/src/__tests__/parse.test.ts` | Create |

## Files to Modify

| File | Change |
|------|--------|
| `packages/tx-parser/src/types/index.ts` | Add parse-related types |
| `packages/tx-parser/src/index.ts` | Export parser APIs |
