# Issue #013: Transaction Stream Pipeline

**Type:** Feature  
**Priority:** Critical  
**Milestone:** Alpha Demo (Colosseum Hackathon)  
**Assignee:** Codex  
**Estimated Effort:** 2-3 hours  
**Depends On:** #011 (Indexer Foundation), #012 (Jupiter Buy/Sell)  
**Status:** 🟡 In Progress (1/10 acceptance criteria complete)

---

## Progress Update (2026-02-12 17:15 IST)

✅ **Wallet Registry Complete** — Created `walletRegistry.ts` with:
- ~90 pre-configured wallets (KOLs, whales, traders, DLMM LPs, meme wallets)
- Category system with emojis (🎤 KOL, 🐋 Whale, 📈 Trader, 💧 DLMM, 👛 Other)
- Helper functions for label lookup and category filtering

**Next Steps:**
1. Integrate wallet registry into `config.ts`
2. Implement stream pipeline components (filter, formatter, batcher, pipeline)
3. Add tests

---

## Problem Statement

We need a 24/7 transaction stream pipeline that:

1. Watches 50-100 pre-configured wallets via WebSocket
2. Parses and classifies each transaction using tx-parser
3. Filters out noise (only keeps buy/sell/LP/perps)
4. Converts to LLM-friendly human-readable summaries
5. Batches and emits for downstream consumption (LLM Brain in #016)

This is the central nervous system of pnl.fun — everything flows through here.

---

## Architecture

```
50-100 wallets (config)
    ↓
WebSocket: connection.onLogs() per wallet
    ↓
On new signature → fetch full transaction
    ↓
Parse with parseSingleTransaction() (#011, #012)
    ↓
Filter: KEEP buy, sell, lp, perp | DROP transfer, unknown
    ↓
Format: Convert to LLM-friendly one-liner summary
    ↓
Batch: Collect N transactions (default: 10)
    ↓
Emit batch via callback (→ LLM Brain in #016)
```

---

## Reference Implementation

**WebSocket monitoring pattern from:** `/home/main-user/.openclaw/workspace/indexer_zero_to_one/packages/core/src/websocket.ts`

Key patterns to adapt:

- `connection.onLogs(pubkey, callback, "confirmed")` for wallet subscription
- Success/failure callback separation
- `removeOnLogsListener()` for cleanup

**Important difference:** Reference fetches signature only. We need to fetch full parsed transaction after receiving signature.

---

## Requirements

### 1. Wallet Config ✅

**Status:** Wallet registry complete; config integration pending

**Completed:**
- ✅ Created `packages/tx-parser/src/constants/walletRegistry.ts`
- ✅ Registry contains ~90 wallets with labels + categories (kol, whale, dlmm, trader, meme, other)
- ✅ Helper functions: `getWalletInfo()`, `getWalletLabel()`, `getWalletsByCategory()`
- ✅ Category emojis for display: 🎤 KOL, 🐋 Whale, 💧 DLMM, 📈 Trader, 👛 Other

**Pending:**

Update `config.ts` to expose wallet selection:

```typescript
export interface AppConfig {
  heliusRpcUrl: string;
  exampleWallet: string;
  defaultCommitment: CommitmentLevel;
  defaultTxCount: number;
  watchedWallets: string[];     // NEW - defaults to 'all' or specific category
}
```

**Load from env:**

```typescript
import { getWalletsByCategory } from './constants/walletRegistry.js';

// WATCHED_WALLETS=all | kol | whale | trader | meme | dlmm | other
// Or comma-separated addresses: 7iNJ7CLNT...,8kLP2abc...
const walletFilter = readOptionalEnv('WATCHED_WALLETS', env) ?? 'all';
const watchedWallets = parseWalletFilter(walletFilter);

function parseWalletFilter(filter: string): string[] {
  // If it's a category, use registry
  if (['all', 'kol', 'whale', 'trader', 'meme', 'dlmm', 'other'].includes(filter)) {
    return getWalletsByCategory(filter as WalletCategory | 'all');
  }
  
  // Otherwise treat as comma-separated list
  return filter.split(',').map(w => w.trim()).filter(w => w.length > 0);
}
```

### 2. Transaction Filter

Create `packages/tx-parser/src/stream/filter.ts`:

```typescript
import type { ParsedTransaction, TransactionType } from '../types/index.js';

const RELEVANT_TYPES: TransactionType[] = ['buy', 'sell', 'lp', 'perp'];

export function isRelevantTransaction(transaction: ParsedTransaction): boolean {
  return RELEVANT_TYPES.includes(transaction.type);
}
```

**Why separate file:** Filter criteria will grow (perps, NFTs, etc.). Keep it isolated.

### 3. LLM-Friendly Formatter

Create `packages/tx-parser/src/stream/formatter.ts`:

**Purpose:** Convert a `ParsedTransaction` into a human-readable one-liner that an LLM can reason about.

**Format examples:**

```
[2026-02-12 16:25 IST] Wallet:7iNJ...Vo9C bought 50,000 XYZ_MINT(needsResearch) for 2.5 SOL via Jupiter | sig:4zmtr...
[2026-02-12 16:26 IST] Wallet:8kLP...3def sold 10,000 ABC_MINT for 1.2 SOL via Jupiter | sig:9PhxC...
[2026-02-12 16:28 IST] Wallet:7iNJ...Vo9C lp on Meteora DLMM | sig:2x9G9...
```

**Implementation:**

```typescript
import type { ParsedTransaction } from '../types/index.js';

export function formatTransactionForLLM(
  transaction: ParsedTransaction,
  walletAddress: string
): string {
  const timestamp = transaction.timestamp 
    ? new Date(transaction.timestamp * 1000).toISOString()
    : 'unknown-time';
  
  const walletShort = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  const sigShort = transaction.signature.slice(0, 8);

  switch (transaction.type) {
    case 'buy':
      return formatBuySell(timestamp, walletShort, transaction, sigShort);
    case 'sell':
      return formatBuySell(timestamp, walletShort, transaction, sigShort);
    case 'lp':
      return `[${timestamp}] Wallet:${walletShort} lp on ${transaction.protocol} | sig:${sigShort}`;
    default:
      return `[${timestamp}] Wallet:${walletShort} ${transaction.type} on ${transaction.protocol} | sig:${sigShort}`;
  }
}

// Build buy/sell summary using BuySellDetails
function formatBuySell(timestamp, walletShort, transaction, sigShort) {
  const details = transaction.details;
  const action = details.direction; // 'buy' or 'sell'
  const targetMint = details.targetToken.mint.slice(0, 8);
  const researchFlag = details.targetToken.needsResearch ? '(needsResearch)' : '';
  const fundingAmount = details.fundingAmount;
  const targetAmount = details.targetAmount;
  const fundingMint = details.fundingToken.isKnown 
    ? getFundingSymbol(details.fundingToken.mint)
    : details.fundingToken.mint.slice(0, 8);

  return `[${timestamp}] Wallet:${walletShort} ${action} ${targetAmount} ${targetMint}${researchFlag} for ${fundingAmount} ${fundingSymbol} via Jupiter | sig:${sigShort}`;
}
```

**Note:** `getFundingSymbol()` should resolve known mints to symbols (SOL, USDC, USDT). Import from `constants/knownTokens.ts` — add a reverse lookup helper there:

```typescript
// Add to constants/knownTokens.ts
const MINT_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_FUNDING_TOKENS).map(([symbol, mint]) => [mint, symbol])
);

export function getFundingSymbol(mint: string): string {
  return MINT_TO_SYMBOL[mint] ?? mint.slice(0, 8);
}
```

### 4. Batch Collector

Create `packages/tx-parser/src/stream/batcher.ts`:

```typescript
export interface BatcherConfig {
  batchSize: number;           // Default: 10
  flushIntervalMs: number;     // Default: 60000 (60s)
}

export type BatchCallback = (summaries: string[]) => void;

export class TransactionBatcher {
  private buffer: string[] = [];
  private config: BatcherConfig;
  private onBatch: BatchCallback;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: BatcherConfig, onBatch: BatchCallback) {
    this.config = config;
    this.onBatch = onBatch;
  }

  add(summary: string): void {
    this.buffer.push(summary);

    if (this.buffer.length >= this.config.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      // Start timer for partial batch flush
      this.flushTimer = setTimeout(() => this.flush(), this.config.flushIntervalMs);
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];
    this.clearTimer();
    this.onBatch(batch);
  }

  stop(): void {
    this.flush(); // Emit remaining
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
```

### 5. Stream Pipeline (Main Orchestrator)

Create `packages/tx-parser/src/stream/pipeline.ts`:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { parseSingleTransaction } from '../parsers/transaction.js';
import { isRelevantTransaction } from './filter.js';
import { formatTransactionForLLM } from './formatter.js';
import { TransactionBatcher, type BatcherConfig, type BatchCallback } from './batcher.js';

export interface StreamPipelineConfig {
  rpcUrl: string;
  wallets: string[];
  batchSize?: number;          // Default: 10
  flushIntervalMs?: number;    // Default: 60000
  commitment?: string;         // Default: 'confirmed'
  onBatch: BatchCallback;
}

export class StreamPipeline {
  private connection: Connection;
  private config: StreamPipelineConfig;
  private batcher: TransactionBatcher;
  private subscriptionIds: number[] = [];

  constructor(config: StreamPipelineConfig) { ... }

  async start(): Promise<void> {
    // For each wallet:
    // 1. Create PublicKey
    // 2. Subscribe via connection.onLogs(pubkey, callback, commitment)
    // 3. In callback:
    //    a. Skip if logs.err (failed tx)
    //    b. Fetch full transaction: connection.getParsedTransaction(signature)
    //    c. Parse: parseSingleTransaction(tx)
    //    d. Filter: isRelevantTransaction(parsed)
    //    e. Format: formatTransactionForLLM(parsed, walletAddress)
    //    f. Add to batcher: batcher.add(summary)
    // 4. Store subscription ID for cleanup
  }

  async stop(): Promise<void> {
    // 1. Unsubscribe all wallet listeners
    // 2. Stop batcher (flushes remaining)
  }
}
```

### 6. Export Stream Module

Create `packages/tx-parser/src/stream/index.ts`:

```typescript
export * from './pipeline.js';
export * from './batcher.js';
export * from './filter.js';
export * from './formatter.js';
```

Update `packages/tx-parser/src/index.ts`:

```typescript
export * from './stream/index.js';
```

---

## File Structure

```
packages/tx-parser/src/
  ├── stream/                    (NEW - pending)
  │   ├── index.ts               (exports)
  │   ├── pipeline.ts            (StreamPipeline - main orchestrator)
  │   ├── batcher.ts             (TransactionBatcher - batch collector)
  │   ├── filter.ts              (isRelevantTransaction - type filter)
  │   └── formatter.ts           (formatTransactionForLLM - LLM summaries)
  ├── constants/
  │   ├── walletRegistry.ts      ✅ DONE - wallet database with categories
  │   └── knownTokens.ts         (UPDATE - add getFundingSymbol())
  ├── config.ts                  (UPDATE - add watchedWallets integration)
  └── index.ts                   (UPDATE - export stream module)
```

---

## Acceptance Criteria

### Must Have

1. ⬜ `stream/pipeline.ts` — `StreamPipeline` class connects to WebSocket for multiple wallets
2. ⬜ `stream/filter.ts` — Filters to only `buy`, `sell`, `lp`, `perp` types
3. ⬜ `stream/formatter.ts` — Converts parsed transactions to human-readable one-liners
4. ⬜ `stream/batcher.ts` — Collects N summaries (default 10), emits via callback
5. ⬜ Time-based flush (60s) for partial batches
6. ✅ **Wallet registry created** — `constants/walletRegistry.ts` with ~90 wallets (categories + labels)
7. ⬜ `config.ts` updated with `watchedWallets` integration using registry
8. ⬜ `constants/knownTokens.ts` updated with `getFundingSymbol()` reverse lookup
9. ⬜ `StreamPipeline.stop()` properly cleans up all subscriptions
10. ⬜ Existing tests pass (no breaking changes)

### Testing

**Unit tests for batcher:**

```typescript
it('emits batch when batchSize reached', () => {
  const batches: string[][] = [];
  const batcher = new TransactionBatcher(
    { batchSize: 3, flushIntervalMs: 60000 },
    (batch) => batches.push(batch)
  );

  batcher.add('tx1');
  batcher.add('tx2');
  expect(batches.length).toBe(0);
  
  batcher.add('tx3');
  expect(batches.length).toBe(1);
  expect(batches[0]).toEqual(['tx1', 'tx2', 'tx3']);
});

it('flushes partial batch on stop', () => {
  const batches: string[][] = [];
  const batcher = new TransactionBatcher(
    { batchSize: 10, flushIntervalMs: 60000 },
    (batch) => batches.push(batch)
  );

  batcher.add('tx1');
  batcher.add('tx2');
  batcher.stop();
  
  expect(batches.length).toBe(1);
  expect(batches[0]).toEqual(['tx1', 'tx2']);
});
```

**Unit tests for filter:**

```typescript
it('allows buy and sell transactions', () => {
  expect(isRelevantTransaction({ type: 'buy', ... })).toBe(true);
  expect(isRelevantTransaction({ type: 'sell', ... })).toBe(true);
});

it('filters out transfers and unknown', () => {
  expect(isRelevantTransaction({ type: 'transfer', ... })).toBe(false);
  expect(isRelevantTransaction({ type: 'unknown', ... })).toBe(false);
});
```

**Unit tests for formatter:**

```typescript
it('formats buy transaction as LLM-friendly string', () => {
  const summary = formatTransactionForLLM(mockBuyTx, '7iNJ...Vo9C');
  expect(summary).toContain('bought');
  expect(summary).toContain('SOL');
  expect(summary).toContain('via Jupiter');
});
```

**Integration test (manual):**

```typescript
// Run with real RPC to verify WebSocket works
const pipeline = new StreamPipeline({
  rpcUrl: process.env.HELIUS_RPC_URL,
  wallets: ['7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C'],
  batchSize: 5,
  onBatch: (summaries) => {
    console.log('=== BATCH ===');
    summaries.forEach(s => console.log(s));
  }
});

await pipeline.start();
// Wait for transactions...
// await pipeline.stop();
```

---

## Out of Scope

- ❌ LLM integration (that's #016)
- ❌ Token context/research triggering (that's #015)
- ❌ Persistence of stream data
- ❌ Token count tracking for LLM context (post-demo optimization)
- ❌ Helius webhooks/geyser optimization (post-demo)
- ❌ Moving to dedicated agent package (post-demo)

---

## Implementation Notes

**WebSocket pattern:**

- Use `connection.onLogs(pubkey, callback, "confirmed")` per wallet
- Reference: `/indexer_zero_to_one/packages/core/src/websocket.ts`
- Don't copy the class — adapt the pattern into `StreamPipeline`

**Fetch after signature:**

- `onLogs` gives us signature only
- Must call `connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })` to get full data
- Use existing `parseSingleTransaction()` from parsers

**Error handling:**

- If fetch fails for a signature → log warning, skip (don't crash pipeline)
- If parse returns null → skip
- If WebSocket disconnects → log error (reconnect logic is post-demo)

**Concurrency:**

- Multiple wallets emit signatures concurrently
- Batcher handles concurrent `add()` calls (single-threaded Node.js, no race conditions)

**Performance:**

- 50-100 wallets × ~1 tx/min each = ~100 tx/min max
- After filtering (only buy/sell/LP) = maybe 10-30 relevant tx/min
- Very manageable for MVP

---

## Dependencies

- #011 (Indexer Foundation) — uses utilities
- #012 (Jupiter Buy/Sell) — uses buy/sell classification and `BuySellDetails` type

---

## Follow-up Issues

- #016: LLM Brain consumes batches from this pipeline
- Future: Token count tracking for batch optimization
- Future: Helius webhooks for efficient multi-wallet monitoring
- Future: Reconnect logic for WebSocket drops
- Future: Move to dedicated `packages/stream-watcher/` package

---

**PM Approval:** ✅ bibhu  
**EM Review:** ✅ (ready for Codex)  
**Created:** 2026-02-12 16:32 IST
