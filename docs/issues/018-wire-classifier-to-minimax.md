# Issue #018: Wire Classifier to MiniMax & Create Runner

**Type:** Integration  
**Priority:** CRITICAL  
**Milestone:** Alpha Demo (Colosseum Hackathon)  
**Assignee:** Codex  
**Estimated Effort:** 30 minutes  
**Depends On:** #013 (Stream Pipeline) ✅, #016 (Classifier Brain) ✅  
**Status:** 🔴 Not Started

---

## Problem Statement

The classifier brain (`packages/brain`) is built but not connected to MiniMax API or running. We need to:

1. Update classifier to use MiniMax API (Anthropic-compatible endpoint)
2. Create runner script to start the full pipeline
3. Wire stream → orchestrator → classifier → console output
4. Verify end-to-end flow with live transactions

**Current state:** Stream and classifier exist as separate components  
**Target state:** Full pipeline running with MiniMax as the LLM backend

---

## Architecture

```
Stream Pipeline (#013)
    ↓ WebSocket monitors 90 wallets
    ↓ Detects transactions
    ↓ Formats to LLM-friendly summaries
    ↓ Batches (10 transactions)
Orchestrator
    ↓ Receives batch via onBatch()
Classifier Brain (#016)
    ↓ Calls MiniMax API (https://api.minimax.io/anthropic)
    ↓ Model: MiniMax-M2.5-lightning
    ↓ Returns Classification { interesting, needsResearch }
Console Output + Audit Logs
```

---

## Requirements

### 1. Update Classifier API Endpoint

**File:** `packages/brain/src/classifier.ts`

**Change:** Replace current API endpoint with MiniMax Anthropic-compatible endpoint.

**Current implementation uses fetch()** — update the endpoint and headers:

```typescript
// In classify() method
const apiUrl = 'https://api.minimax.io/anthropic';

const response = await fetch(`${apiUrl}/v1/messages`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': this.config.apiKey,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: this.config.model, // e.g., 'MiniMax-M2.5-lightning'
    max_tokens: 2000,
    system: this.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.1
  })
});
```

**Why MiniMax:**

- Anthropic-compatible API (drop-in replacement)
- Cost efficient for 24/7 operation (~30-40% cheaper than GPT-4o)
- M2.5-lightning: Fast filtering for Brain 1 (classifier)
- Supports thinking/reasoning blocks
- Response format matches Anthropic SDK expectations

---

### 2. Create Runner Script

**File:** `packages/brain/src/run.ts` (NEW)

```typescript
import { TransactionOrchestrator } from './orchestrator.js';
import { loadAppConfig } from '@pnldotfun/tx-parser';

async function main() {
  console.log('[Brain] Starting pnl.fun classifier brain...');
  
  // Load tx-parser config (RPC, wallets)
  const txConfig = loadAppConfig();
  
  // Validate required env vars
  const apiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing MINIMAX_API_KEY or ANTHROPIC_API_KEY');
  }

  const orchestrator = new TransactionOrchestrator({
    stream: {
      rpcUrl: txConfig.heliusRpcUrl,
      wallets: txConfig.watchedWallets,
      batchSize: 10,
      commitment: 'confirmed',
      onBatch: undefined // Set by orchestrator
    },
    classifier: {
      model: process.env.CLASSIFIER_MODEL || 'MiniMax-M2.5-lightning',
      apiKey,
      systemPrompt: undefined // Use default from prompts/classifier.ts
    },
    auditLog: true,
    auditPath: './data/audit',
    onClassification: async (classification) => {
      console.log('\n=== CLASSIFICATION RESULT ===');
      console.log(`Batch processed at: ${new Date().toISOString()}`);
      console.log(`Interesting: ${classification.interesting.length}`);
      console.log(`Need Research: ${classification.needsResearch.length}`);
      
      if (classification.interesting.length > 0) {
        console.log('\nInteresting transactions:');
        classification.interesting.forEach((tx, i) => {
          console.log(`  ${i + 1}. ${tx.slice(0, 120)}...`);
        });
      }
      
      if (classification.needsResearch.length > 0) {
        console.log('\nTokens needing research:');
        classification.needsResearch.forEach((mint) => {
          console.log(`  - ${mint}`);
        });
      }
      
      if (classification.reasoning) {
        console.log(`\nReasoning: ${classification.reasoning}`);
      }
      console.log('============================\n');
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Brain] Received SIGINT, shutting down gracefully...');
    await orchestrator.stop();
    console.log('[Brain] Shutdown complete.');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Brain] Received SIGTERM, shutting down gracefully...');
    await orchestrator.stop();
    process.exit(0);
  });

  // Start the pipeline
  await orchestrator.start();
  console.log('[Brain] Classifier brain running. Press Ctrl+C to stop.');
  console.log('[Brain] Monitoring 90 wallets for transactions...\n');
}

main().catch((error) => {
  console.error('[Brain] Fatal error:', error);
  process.exit(1);
});
```

---

### 3. Add Script to Package

**File:** `packages/brain/package.json`

**Add to scripts section:**

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "brain:start": "node --loader tsx src/run.ts",
    "test": "echo \"No tests configured\""
  }
}
```

**Note:** If `tsx` is not available, use:

```json
"brain:start": "node --experimental-specifier-resolution=node dist/run.js"
```

And require `pnpm build` before running.

---

### 4. Environment Variables

**File:** Root `.env` (PM has already configured)

**Expected vars:**

```bash
# MiniMax API
MINIMAX_API_KEY=your_minimax_key_here
CLASSIFIER_MODEL=MiniMax-M2.5-lightning

# Transaction parser (already configured)
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
WATCHED_WALLETS=all
```

**Fallback logic in code:**

```typescript
const apiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY;
```

This allows using either env var name.

---

## Testing Steps

### Manual Test (End-to-End)

1. **Build brain package:**

   ```bash
   cd /home/main-user/.openclaw/workspace/pnldotfun
   pnpm --filter @pnldotfun/brain build
   ```

2. **Start runner:**

   ```bash
   pnpm --filter @pnldotfun/brain brain:start
   ```

3. **Verify startup logs:**

   ```
   [Brain] Starting pnl.fun classifier brain...
   [Orchestrator] Starting transaction stream...
   [StreamPipeline] Subscribed to 90 wallets
   [Brain] Classifier brain running. Press Ctrl+C to stop.
   [Brain] Monitoring 90 wallets for transactions...
   ```

4. **Wait for transactions:**
   - Stream will detect transactions from monitored wallets
   - After 10 transactions (or timeout), batch is emitted
   - Classifier processes batch → calls MiniMax API
   - Results logged to console

5. **Expected classification output:**

   ```
   === CLASSIFICATION RESULT ===
   Batch processed at: 2026-02-13T10:45:00.000Z
   Interesting: 3
   Need Research: 2

   Interesting transactions:
     1. [2026-02-13T10:40:00.000Z] Wallet:🐋 Whale-7 bought 50000 of ABC...xyz(mint:ABC123...)(needsResearch) for 2.5 SOL...
     2. [2026-02-13T10:41:00.000Z] Wallet:🎤 Ansem sold 10000 of XYZ...def(mint:XYZ456...) for 1.2 SOL...
     3. [2026-02-13T10:42:00.000Z] Wallet:📈 traderpow bought 25000 of DEF...ghi(mint:DEF789...)(needsResearch) for 1.0 SOL...

   Tokens needing research:
     - ABC123...full_mint_address
     - DEF789...full_mint_address

   Reasoning: Flagged whale buy of new token (ABC), KOL sell activity (XYZ), trader accumulation (DEF)
   ============================
   ```

6. **Check audit logs:**

   ```bash
   cat data/audit/batch.jsonl | tail -5
   cat data/audit/classification.jsonl | tail -5
   ```

7. **Test shutdown:**
   - Press Ctrl+C
   - Verify graceful shutdown:

     ```
     [Brain] Received SIGINT, shutting down gracefully...
     [Orchestrator] Stopping transaction stream...
     [StreamPipeline] Unsubscribed from 90 wallets
     [Brain] Shutdown complete.
     ```

---

## Expected Behavior

### Normal Flow

1. **Startup:**
   - Loads config from env
   - Validates API key exists
   - Starts orchestrator
   - Orchestrator starts stream pipeline
   - Pipeline subscribes to 90 wallets via WebSocket

2. **Transaction Detection:**
   - WebSocket detects transaction signature
   - Fetches full transaction
   - Parses with `parseSingleTransaction()`
   - Filters (keeps buy/sell/lp, drops noise)
   - Formats to LLM-friendly summary
   - Adds to batcher

3. **Batch Ready:**
   - Batcher collects 10 transactions (or timeout after 60s)
   - Emits batch via `onBatch()` callback
   - Orchestrator receives batch

4. **Classification:**
   - Orchestrator calls `classifier.classify(summaries)`
   - Classifier builds prompt with system + user messages
   - Calls MiniMax API at `https://api.minimax.io/anthropic/v1/messages`
   - Parses JSON response
   - Extracts mints from `needsResearch` field
   - Returns `Classification` object

5. **Output:**
   - Orchestrator logs to console (via `onClassification` callback)
   - Writes to audit logs (`data/audit/*.jsonl`)
   - Pipeline continues monitoring for next batch

### Error Handling

**If MiniMax API fails:**

- Classifier catches error
- Logs error message
- Returns fallback: `{ interesting: all summaries, needsResearch: [] }`
- Pipeline continues (doesn't crash)

**If no transactions detected:**

- Stream waits for activity
- Batch timeout (60s) triggers empty batch
- Classifier skips processing (no work to do)

**If invalid wallet in config:**

- Pipeline logs warning
- Skips invalid wallet
- Continues with valid wallets

---

## Acceptance Criteria

### Must Have

1. ✅ Classifier updated to call MiniMax API endpoint
2. ✅ `run.ts` created with full orchestrator setup
3. ✅ `brain:start` script added to package.json
4. ✅ Stream → Orchestrator → Classifier working end-to-end
5. ✅ Classification results logged to console
6. ✅ Audit logs written to `data/audit/batch.jsonl` and `data/audit/classification.jsonl`
7. ✅ Graceful shutdown on Ctrl+C (SIGINT)
8. ✅ API key validation (throws error if missing)
9. ✅ Console output includes reasoning from classifier

### Should Have

- Clear startup logs (what's happening at each stage)
- Truncated transaction display (first 120 chars)
- Timestamp on classification results
- Token count if available from MiniMax response

### Nice to Have

- Token usage tracking per batch
- Latency metrics (time from batch → classification)
- Error rate tracking

---

## Out of Scope

- ❌ Research agent integration (that's #015)
- ❌ Decision engine (future)
- ❌ Alert output to Discord/Telegram (that's #017)
- ❌ Web UI for monitoring
- ❌ Persistent storage of classifications (use audit logs)
- ❌ Model fallback logic (if MiniMax down, just pass through)

---

## Performance Expectations

**Transaction volume:**

- 90 wallets monitored
- ~1-2 transactions per wallet per hour
- ~100-180 transactions/hour total
- After filtering: ~10-30 relevant transactions/hour
- ~1-3 batches/hour to classifier

**Latency:**

- WebSocket detection: <1s
- Transaction fetch: ~500ms
- Batch wait: max 60s (or 10 transactions)
- MiniMax API call: ~1-2s
- Total: ~2-3s from detection → classification

**Cost:**

- ~500 tokens per batch (10 summaries + system prompt)
- ~3 batches/hour × 24 hours = 72 batches/day
- 72 × 500 = 36k tokens/day
- MiniMax pricing: Very affordable for MVP

---

## Dependencies

- #013 Stream Pipeline ✅ (complete)
- #016 Classifier Brain ✅ (complete)
- MiniMax API key (PM has configured in .env)

---

## Follow-up Issues

- #015: Research Agent (uses classified results)
- #017: Output Layer (alerts based on classifications)
- Future: Model fallback/retry logic
- Future: Classification metrics dashboard

---

## Implementation Notes

### MiniMax API Details

**Endpoint:** `https://api.minimax.io/anthropic`  
**Path:** `/v1/messages`  
**Headers:**

- `Content-Type: application/json`
- `x-api-key: {your_key}`
- `anthropic-version: 2023-06-01`

**Request format:** (Anthropic-compatible)

```json
{
  "model": "MiniMax-M2.5-lightning",
  "max_tokens": 2000,
  "system": "You are a transaction classifier...",
  "messages": [
    { "role": "user", "content": "Analyze these 10 transactions..." }
  ],
  "temperature": 0.1
}
```

**Response format:** (Anthropic-compatible)

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "{\"interesting\": [...], \"needsResearch\": [...], \"reasoning\": \"...\"}"
    }
  ],
  "model": "MiniMax-M2.5-lightning",
  "usage": {
    "input_tokens": 450,
    "output_tokens": 120
  }
}
```

### Classifier Already Has This Logic

The current `classifier.ts` uses fetch() directly. Just update:

1. API URL to `https://api.minimax.io/anthropic`
2. Headers (use `x-api-key` instead of `Authorization`)
3. Model name to `MiniMax-M2.5-lightning`

Everything else stays the same.

---

## Risk Assessment

**Low risk:**

- Simple endpoint change (Anthropic-compatible)
- Runner script follows existing patterns
- All components already tested individually

**Potential issues:**

- MiniMax rate limits (unlikely at ~3 calls/hour)
- WebSocket disconnections (existing pipeline handles this)
- Invalid API key (caught at startup)

**Mitigation:**

- Clear error logging
- Graceful fallback on classifier failure
- Audit logs preserve data if needed for replay

---

**PM Approval:** ✅ bibhu (API key configured)  
**EM Review:** ✅ Ready for Codex  
**Created:** 2026-02-13 10:46 IST  
**Target Delivery:** 11:15 IST (30 minutes)
