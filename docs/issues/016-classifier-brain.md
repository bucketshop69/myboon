# Issue #016: Classifier Brain (Brain 1)

**Type:** Feature  
**Priority:** Critical  
**Milestone:** Alpha Demo (Colosseum Hackathon)  
**Assignee:** Codex  
**Estimated Effort:** 4-5 hours  
**Depends On:** #013 (Transaction Stream Pipeline)  
**Status:** 🔴 Not Started

---

## Problem Statement

We need an intelligent **first-stage filter** that:

1. Receives batches of 10 transaction summaries from the stream pipeline
2. Quickly identifies which transactions are **interesting** (not routine noise)
3. Flags which **token mints need research** (new/unknown tokens)
4. Passes filtered results to downstream agents (Research → Decision)

This is **Brain 1** in a three-stage architecture:

- **Brain 1 (Classifier)** ← We are here
- **Brain 2 (Research Agent)** — #015 (future)
- **Brain 3 (Decision Engine)** — Future

**Goal:** Filter out 80-90% of noise using a **fast, cheap model**, so expensive models downstream only see high-signal transactions.

---

## Architecture Context

```
Stream Pipeline (#013)
    ↓ onBatch(summaries: string[])
Transaction Orchestrator
    ↓ classifier.classify(summaries)
Classifier Brain (#016) ← WE ARE HERE
    ↓ Classification { interesting, needsResearch }
Research Agent (#015)
    ↓
Decision Engine (future)
```

**Key Design Principle:** In-memory data flow (no queues/databases between stages for MVP).

---

## Input Format

**Source:** Stream pipeline `onBatch` callback  
**Type:** `string[]` — Array of human-readable transaction summaries  
**Batch Size:** 10 transactions (configurable)

**Example input:**

```typescript
const summaries = [
  "[2026-02-12T11:25:00.000Z] Wallet:🐋 Whale-7 bought 50000 XYZ_MINT(needsResearch) for 2.5 SOL via Jupiter | sig:4zmtr...",
  "[2026-02-12T11:26:00.000Z] Wallet:📈 traderpow sold 10000 ABC_MINT for 1.2 SOL via Jupiter | sig:9PhxC...",
  "[2026-02-12T11:27:00.000Z] Wallet:👛 Wallet-25 transfer 0.1 SOL | sig:2x9G9...",
  "[2026-02-12T11:28:00.000Z] Wallet:💧 DLMM-1 lp on Meteora DLMM | sig:8kJpL...",
  // ... 6 more
];
```

---

## Output Format

**Type:** `Classification` object  
**Structure:**

```typescript
interface Classification {
  interesting: string[];      // Transaction summaries that passed filter
  needsResearch: string[];    // Token mints that need enrichment
  reasoning?: string;          // Optional: Why these were chosen (for debugging)
}
```

**Example output:**

```typescript
{
  interesting: [
    "[2026-02-12T11:25:00.000Z] Wallet:🐋 Whale-7 bought 50000 XYZ_MINT...",
    "[2026-02-12T11:26:00.000Z] Wallet:📈 traderpow sold 10000 ABC_MINT..."
  ],
  needsResearch: [
    "XYZ_MINT_FULL_ADDRESS",
    "ABC_MINT_FULL_ADDRESS"
  ],
  reasoning: "Flagged: whale buy of new token (XYZ), trader sell of unknown token (ABC). Filtered out: routine transfer, LP activity."
}
```

---

## Classification Logic (LLM Prompt)

The classifier uses an LLM to make intelligent filtering decisions.

### Prompt Template

```typescript
const CLASSIFIER_SYSTEM_PROMPT = `
You are a transaction classifier for crypto wallet monitoring. Your job is to filter out noise and identify interesting patterns.

**INTERESTING transactions include:**
- Buys/sells by whales (🐋) or KOLs (🎤)
- Large position changes (>$1k equivalent)
- Buys of tokens flagged with (needsResearch)
- Unusual activity from known traders
- First-time buys of new tokens by smart wallets

**NOISE (filter out):**
- Small transfers (<$100)
- Routine LP activity (unless very large)
- Transfers between known wallets
- Tiny buys/sells (<$50)

**Token research needed when:**
- Token is flagged (needsResearch)
- Token appears multiple times in same batch
- Large buy/sell of unknown token

Return JSON only, no explanation:
{
  "interesting": ["transaction summary 1", "transaction summary 2"],
  "needsResearch": ["mint_address_1", "mint_address_2"],
  "reasoning": "brief explanation"
}
`;

const CLASSIFIER_USER_PROMPT = (summaries: string[]) => `
Analyze these ${summaries.length} transactions:

${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Which are interesting? Which tokens need research?
`;
```

---

## Requirements

### 1. Classifier Brain Class

Create `packages/brain/src/classifier.ts`:

```typescript
import OpenAI from 'openai';

export interface ClassifierConfig {
  model: string;                    // e.g., "MiniMax-M2.5-lightning"
  apiKey: string;
  systemPrompt?: string;            // Optional override
}

export interface Classification {
  interesting: string[];
  needsResearch: string[];
  reasoning?: string;
}

export class ClassifierBrain {
  private client: OpenAI;
  private config: ClassifierConfig;
  private systemPrompt: string;

  constructor(config: ClassifierConfig) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  async classify(summaries: string[]): Promise<Classification> {
    if (summaries.length === 0) {
      return { interesting: [], needsResearch: [] };
    }

    const userPrompt = this.buildUserPrompt(summaries);
    
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1  // Low temp for consistent filtering
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from classifier LLM');
    }

    return this.parseClassification(content, summaries);
  }

  private buildUserPrompt(summaries: string[]): string {
    return `Analyze these ${summaries.length} transactions:\n\n${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nWhich are interesting? Which tokens need research?`;
  }

  private parseClassification(content: string, summaries: string[]): Classification {
    try {
      const parsed = JSON.parse(content);
      
      // Validate structure
      if (!Array.isArray(parsed.interesting) || !Array.isArray(parsed.needsResearch)) {
        throw new Error('Invalid classification structure');
      }

      // Extract mint addresses from needsResearch strings
      const mints = this.extractMints(parsed.needsResearch, summaries);

      return {
        interesting: parsed.interesting,
        needsResearch: mints,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      console.error('Failed to parse classification:', error);
      // Fallback: return all as interesting if parsing fails
      return {
        interesting: summaries,
        needsResearch: [],
        reasoning: 'Parse error - defaulted to all interesting'
      };
    }
  }

  private extractMints(needsResearch: string[], summaries: string[]): string[] {
    // Extract mint addresses from transaction summaries
    // Look for patterns like "ABC_MINT" or "XYZ_MINT(needsResearch)"
    const mints: string[] = [];
    
    for (const item of needsResearch) {
      // If it's already a base58 address, use it
      if (this.isValidMint(item)) {
        mints.push(item);
        continue;
      }
      
      // Otherwise, search summaries for the token mention
      for (const summary of summaries) {
        if (summary.includes(item)) {
          const mint = this.extractMintFromSummary(summary);
          if (mint) mints.push(mint);
        }
      }
    }
    
    return [...new Set(mints)]; // Dedupe
  }

  private isValidMint(address: string): boolean {
    // Basic validation: base58, 32-44 chars
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  private extractMintFromSummary(summary: string): string | null {
    // Pattern: look for base58 addresses in summary
    // This is a simplified extraction - may need refinement
    const match = summary.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    return match ? match[0] : null;
  }
}
```

### 2. Transaction Orchestrator

Create `packages/brain/src/orchestrator.ts`:

```typescript
import { StreamPipeline, type StreamPipelineConfig } from '@pnldotfun/tx-parser';
import { ClassifierBrain, type ClassifierConfig, type Classification } from './classifier.js';

export interface OrchestratorConfig {
  stream: StreamPipelineConfig;
  classifier: ClassifierConfig;
  auditLog?: boolean;               // Enable disk logging?
  auditPath?: string;               // Where to log
}

export class TransactionOrchestrator {
  private pipeline: StreamPipeline;
  private classifier: ClassifierBrain;
  private config: OrchestratorConfig;
  private isRunning = false;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.classifier = new ClassifierBrain(config.classifier);
    
    // Wire stream pipeline to classifier
    this.pipeline = new StreamPipeline({
      ...config.stream,
      onBatch: async (summaries) => this.handleBatch(summaries)
    });
  }

  private async handleBatch(summaries: string[]): Promise<void> {
    const batchId = Date.now();
    
    try {
      // Optional: Log raw input
      if (this.config.auditLog) {
        await this.logAudit('batch', { batchId, summaries });
      }

      // Stage 1: Classify
      const classification = await this.classifier.classify(summaries);
      
      console.log(`[Orchestrator] Batch ${batchId}: ${classification.interesting.length} interesting, ${classification.needsResearch.length} need research`);
      
      // Optional: Log classification
      if (this.config.auditLog) {
        await this.logAudit('classification', { batchId, classification });
      }

      // TODO: Stage 2 - Pass to research agent (#015)
      // if (classification.needsResearch.length > 0) {
      //   await this.research.enrich(classification.needsResearch);
      // }

      // TODO: Stage 3 - Pass to decision engine
      // if (classification.interesting.length > 0) {
      //   await this.decider.decide(classification.interesting, contexts);
      // }

    } catch (error) {
      console.error(`[Orchestrator] Batch ${batchId} failed:`, error);
      // Don't crash pipeline on brain errors
    }
  }

  private async logAudit(type: string, data: any): Promise<void> {
    if (!this.config.auditPath) return;
    
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const logFile = path.join(this.config.auditPath, `${type}.jsonl`);
    const line = JSON.stringify({ timestamp: Date.now(), ...data }) + '\n';
    
    await fs.appendFile(logFile, line);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[Orchestrator] Already running');
      return;
    }
    
    this.isRunning = true;
    console.log('[Orchestrator] Starting transaction stream...');
    await this.pipeline.start();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('[Orchestrator] Stopping transaction stream...');
    await this.pipeline.stop();
  }
}
```

### 3. Package Structure

```
packages/brain/                     (NEW PACKAGE)
  ├── package.json
  ├── tsconfig.json
  ├── src/
  │   ├── index.ts                  (exports)
  │   ├── classifier.ts             (ClassifierBrain)
  │   ├── orchestrator.ts           (TransactionOrchestrator)
  │   ├── prompts/
  │   │   └── classifier.ts         (prompt templates)
  │   └── types/
  │       └── index.ts              (shared types)
  └── test/
      ├── classifier.test.ts
      └── orchestrator.test.ts
```

### 4. Config & Environment

Update root `.env`:

```bash
# Brain config
CLASSIFIER_MODEL=MiniMax-M2.5-lightning
MINIMAX_API_KEY=...
AUDIT_LOG_ENABLED=true
AUDIT_LOG_PATH=./data/audit
```

---

## Acceptance Criteria

### Must Have

1. ✅ `ClassifierBrain` class accepts batch of transaction summaries
2. ✅ Calls configured LLM with system + user prompt
3. ✅ Returns structured `Classification` object
4. ✅ Extracts mint addresses from summaries when `needsResearch` is flagged
5. ✅ `TransactionOrchestrator` wires stream pipeline to classifier
6. ✅ Orchestrator handles errors gracefully (doesn't crash pipeline)
7. ✅ Idempotent `start()`/`stop()` methods
8. ✅ Optional audit logging to disk (JSONL format)
9. ✅ Unit tests for classifier parsing logic
10. ✅ Integration test: mock stream → orchestrator → classifier

### Should Have

- Configurable system prompt (allow override)
- Low temperature (0.1) for consistent filtering
- JSON mode for reliable parsing
- Fallback behavior if LLM fails (default to all interesting)

### Nice to Have

- Token usage tracking per batch
- Latency metrics (classifier response time)
- Filter accuracy metrics (% filtered out)

---

## Testing Strategy

### Unit Tests

**Classifier parsing:**

```typescript
it('parses valid classification response', () => {
  const response = `{
    "interesting": ["tx1", "tx2"],
    "needsResearch": ["mint_abc"],
    "reasoning": "test"
  }`;
  
  const classification = classifier.parseClassification(response, mockSummaries);
  
  expect(classification.interesting).toHaveLength(2);
  expect(classification.needsResearch).toContain('mint_abc');
});

it('handles malformed JSON gracefully', () => {
  const response = 'not json';
  
  const classification = classifier.parseClassification(response, mockSummaries);
  
  // Should fallback to all interesting
  expect(classification.interesting).toEqual(mockSummaries);
});
```

### Integration Tests

**Mock end-to-end flow:**

```typescript
it('orchestrator processes batch through classifier', async () => {
  const mockClassifier = {
    classify: jest.fn().mockResolvedValue({
      interesting: ['tx1'],
      needsResearch: ['mint_abc']
    })
  };

  const orchestrator = new TransactionOrchestrator({
    stream: mockStreamConfig,
    classifier: mockClassifierConfig
  });

  // Simulate batch from stream
  await orchestrator['handleBatch'](['tx1', 'tx2', 'tx3']);

  expect(mockClassifier.classify).toHaveBeenCalledWith(['tx1', 'tx2', 'tx3']);
});
```

### Manual Testing

**Run with real stream:**

```typescript
const orchestrator = new TransactionOrchestrator({
  stream: {
    rpcUrl: process.env.HELIUS_RPC_URL,
    wallets: ['7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C'],
    batchSize: 10
  },
  classifier: {
    model: process.env.CLASSIFIER_MODEL ?? 'MiniMax-M2.5-lightning',
    apiKey: process.env.MINIMAX_API_KEY
  },
  auditLog: true,
  auditPath: './data/audit'
});

await orchestrator.start();

// Wait for transactions...
// Check data/audit/classification.jsonl for results
```

---

## Out of Scope

- ❌ Research agent integration (that's #015)
- ❌ Decision engine (future issue)
- ❌ Alert generation (future issue)
- ❌ Token memory/storage (that's #014)
- ❌ Model selection logic (hardcode for MVP)
- ❌ Multi-model fallback
- ❌ Rate limiting / backpressure

---

## Implementation Notes

### Why In-Memory Data Flow?

**Pros:**

- ✅ Simple (no queue infrastructure)
- ✅ Fast (no serialization overhead)
- ✅ Easy to debug (single process)
- ✅ Good for MVP/demo

**When to add queues:**

- Brain processing time > 10s per batch
- Need independent scaling of components
- Production deployment with high availability

For hackathon demo, in-memory is perfect.

### Mint Address Extraction

Transaction summaries from #013 currently show shortened mints (e.g., `XYZ_MINT`). We need full base58 addresses for research.

**Two options:**

1. **Update #013 formatter** to include full mint in summary (e.g., `XYZ_MINT(full:AbC...123)`)
2. **Classifier extracts from original transaction** — but this requires passing more data

**Recommendation:** Update #013 formatter to include full mint in a parseable format.

### Error Handling Philosophy

**Pipeline must not crash on brain errors.** If classifier fails:

- Log error
- Optionally: default all transactions to "interesting" (pass-through)
- Continue processing next batch

This ensures data flow robustness.

---

## Dependencies

- #013 (Transaction Stream Pipeline) — MUST be complete
- MiniMax Anthropic-compatible API endpoint (`https://api.minimax.io/anthropic/v1/messages`)

---

## Follow-up Issues

- #015: Research Agent (Brain 2)
- #014: Token Memory Schema
- Future: Decision Engine (Brain 3)
- Future: Alert Output Layer

---

## Cost Estimates

**Assumptions:**

- 10 tx/batch, 10 batches/hour = 100 tx/hour
- Classifier model: MiniMax-M2.5-lightning
- ~500 tokens per batch (10 summaries + system prompt)

**Monthly cost:**

- 100 tx/hour × 24 hours × 30 days = 72k tx/month
- 7,200 batches/month × 500 tokens = 3.6M tokens/month
- Cost depends on active MiniMax pricing tier (estimate at runtime from provider billing)

Very cheap. Can afford to run 24/7.

---

**PM Approval:** ✅ bibhu  
**EM Review:** Pending  
**Created:** 2026-02-12 19:25 IST
