# 006: Fetch Transactions for a Wallet

## Goal

Create a function that takes a Solana wallet address and returns parsed transactions from RPC.

## Why

- Foundational retrieval step for all parsers
- Required before type/protocol classification
- Enables wallet history analysis on mainnet

---

## Fixed Decisions (Updated)

### Decision 1: RPC Provider

**Chosen:** Helius mainnet RPC from `.env`

```env
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=89af9d38-1256-43d3-9c5a-a9aa454d0def
EXAMPLE_WALLET=7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C
```

### Decision 2: Signature Fetching API

**Chosen:** `getSignaturesForAddress` (current API)

### Decision 3: Transaction Count

**Chosen:** configurable, default `50`

### Decision 4: Error Handling

**Chosen:** throw explicit typed errors for invalid input and RPC failures

---

## Approach

1. Load RPC URL from config (backed by `.env`)
2. Validate wallet address via `PublicKey`
3. Fetch signatures with `getSignaturesForAddress`
4. Fetch parsed tx details by signature
5. Return only successful parsed transactions

---

## Implementation Steps

### Step 1: Add config loader

```typescript
// src/config.ts
export interface AppConfig {
  heliusRpcUrl: string;
  exampleWallet: string;
  defaultCommitment: 'confirmed' | 'finalized' | 'processed';
  defaultTxCount: number;
}
```

### Step 2: Implement wallet tx fetch

```typescript
// src/rpc.ts
export async function fetchWalletTransactions(
  walletAddress: string,
  options?: { count?: number; commitment?: 'confirmed' | 'finalized' | 'processed' }
): Promise<TransactionResponse[]>;
```

Implementation requirements:

- Use `Connection(config.heliusRpcUrl, commitment)`
- Use `connection.getSignaturesForAddress(publicKey, { limit: count })`
- Use `connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })`
- Filter null responses safely
- Include meaningful error messages

### Step 3: Add tests

- valid wallet returns array
- invalid wallet throws
- `count` is respected
- config fails fast when RPC URL missing

---

## Acceptance Criteria

- [ ] Reads RPC URL from root `.env`
- [ ] Uses `getSignaturesForAddress` (not deprecated method)
- [ ] `fetchWalletTransactions(walletAddress)` returns parsed tx array
- [ ] Invalid address throws clear error
- [ ] Tests pass with example wallet `7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C`

---

## Files to Create

| File | Action |
|------|--------|
| `packages/tx-parser/src/config.ts` | Create |
| `packages/tx-parser/src/rpc.ts` | Create |
| `packages/tx-parser/src/__tests__/fetch.test.ts` | Create |

## Files to Modify

| File | Change |
|------|--------|
| `packages/tx-parser/src/types/index.ts` | Add raw tx related types |
| `packages/tx-parser/src/index.ts` | Export fetch/config APIs |
