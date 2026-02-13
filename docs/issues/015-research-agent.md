# Issue #015: Research Agent (Brain 2)

**Type:** Feature  
**Priority:** Critical  
**Milestone:** Alpha Demo (Colosseum Hackathon)  
**Assignee:** Codex  
**Estimated Effort:** 8-10 hours  
**Depends On:** #014 (Entity Memory Schema), #016 (Classifier Brain)  
**Status:** 🟡 In Progress (core delivered; extended tools deferred)

---

## Problem Statement

After the Classifier Brain (#016) identifies transactions needing research, we need an **intelligent research agent** that:

1. Receives list of entity identifiers (mints, symbols, names)
2. Resolves identifiers to canonical entities (handles fakes, disambiguation)
3. Checks if research is fresh (cache hit/miss)
4. For stale/missing entities: orchestrates multi-source data gathering
5. Synthesizes findings into structured knowledge
6. Stores results in Entity Memory (#014)

**Key difference from traditional data pipeline:** The agent **reasons** about what data to fetch and how to interpret it, using MCP tools for flexible data access.

---

## Architecture Context

```
Stream Pipeline (#013)
    ↓ onBatch(summaries)
Transaction Orchestrator (#016)
    ↓ classifier.classify(summaries)
Classifier Brain (#016)
    ↓ Classification { interesting, needsResearch }
Research Agent (#015) ← WE ARE HERE
    ├─ resolve_entity(identifier)
    ├─ create_entity(input)
    ├─ add_representation(input)
    ├─ check_research_freshness(entityId)
    ├─ get_cached_research(entityId)
    ├─ get_token_metadata(mint)
    └─ store_research_results(entityId, findings)
    ↓ Enriched EntityResearch records
Decision Engine (future)
```

**Integration with Orchestrator (#016):**

```typescript
// In TransactionOrchestrator.handleBatch()
const classification = await this.classifier.classify(summaries);

if (classification.needsResearch.length > 0) {
  // Pass to research agent
  await this.research.enrich(classification.needsResearch);
}
```

---

## Implementation Snapshot (2026-02-13)

### Implemented in code

1. `ResearchAgent` implemented with MiniMax Anthropic-compatible tool-calling loop.
2. `enrich(identifiers)` implemented with batched concurrency.
3. Max-iteration guard + graceful fallback behavior implemented.
4. MCP tool registry implemented with:
   - Entity tools: `resolve_entity`, `create_entity`, `add_representation`
   - Memory tools: `check_research_freshness`, `get_cached_research`, `store_research_results`
   - Data source tool (alpha): `get_token_metadata` via Jupiter Tokens API V2
5. Research integrated into orchestrator:
   - runs after classification
   - dedupe/freshness gating
   - audit logging (`research.jsonl`)
6. Runner wiring completed in `packages/brain/src/run.ts`.
7. Smoke/demo scripts added:
   - `research:smoke`
   - `demo:replay`

### Deferred in current alpha scope

1. Extra data-source tools (`get_price_history`, `check_rugcheck`, `analyze_sentiment`, `get_holder_distribution`).
2. Entity query tools (`get_entity_representations`, `query_entity_timeline`).
3. Formal unit/integration/e2e test suite.

---

## MCP-Based Design

### Why MCP for Research Agent?

**Traditional approach (rigid):**

```typescript
// Hardcoded workflow ❌
const metadata = await helius.getTokenMetadata(mint);
const price = await birdeye.getPrice(mint);
const rugcheck = await rugcheck.check(mint);
const research = combineData(metadata, price, rugcheck);
await db.save(research);
```

**MCP approach (adaptive):**

```typescript
// Model decides workflow ✅
const task = `Research token ${mint}. Determine:
- Is it safe to trade? (check rugcheck score)
- What's the price trend? (7-day chart)
- Any social buzz? (Twitter mentions)
- Available on which protocols? (representations)

Tools: check_research_freshness, resolve_entity, get_token_metadata, 
       get_price_history, check_rugcheck, analyze_sentiment, 
       store_research_results`;

const result = await mcpAgent.run(task, { tools: researchTools });
```

**Benefits:**

- Model adapts to available data (if rugcheck fails, still proceeds)
- Can prioritize (check cache first, skip expensive calls if fresh)
- Handles edge cases (unknown token → more thorough research)
- Natural language reasoning about findings

---

## MCP Tools Definition

### Tool Categories

1. **Entity Resolution** — Map identifier → canonical entity
2. **Memory Management** — Check/store cached research
3. **Data Sources** — External APIs for token data
4. **Analysis** — Synthesize and score findings

**Alpha scope note:** Implemented set is Entity Resolution + Memory Management + `get_token_metadata`. Remaining tools are backlog.

---

### 1. Entity Resolution Tools

**`resolve_entity`**

```typescript
{
  name: "resolve_entity",
  description: "Resolve an identifier (mint address, symbol, or name) to a canonical entity. Returns entity info or null if not found.",
  parameters: {
    identifier: {
      type: "string",
      description: "Mint address, token symbol (e.g., 'SKR'), or entity name (e.g., 'Seeker')"
    }
  },
  handler: async ({ identifier }) => {
    // Check if it's a mint address (base58, 32-44 chars)
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(identifier)) {
      // Look up representation by mint
      const repr = await db.representations.findByMint(identifier);
      if (repr) {
        const entity = await db.entities.findById(repr.entityId);
        return { entity, representation: repr };
      }
      return { entity: null, message: "Mint not found in database" };
    }
    
    // Try as symbol
    const entities = await db.entities.findBySymbol(identifier.toUpperCase());
    if (entities.length === 1) {
      return { entity: entities[0] };
    } else if (entities.length > 1) {
      return {
        entity: null,
        message: "Multiple entities found with this symbol. Need disambiguation.",
        candidates: entities
      };
    }
    
    // Try as name (fuzzy search)
    const byName = await db.entities.searchByName(identifier);
    if (byName.length > 0) {
      return { entity: byName[0], candidates: byName };
    }
    
    return { entity: null, message: "Entity not found" };
  }
}
```

**`create_entity`**

```typescript
{
  name: "create_entity",
  description: "Create a new entity in the database. Use when encountering an unknown token that needs tracking.",
  parameters: {
    name: { type: "string", description: "Entity name (e.g., 'Seeker')" },
    symbol: { type: "string", description: "Token symbol (e.g., 'SKR')", required: false },
    type: { 
      type: "string", 
      enum: ["crypto-token", "macro-asset", "protocol", "person", "concept", "meme"],
      description: "Entity classification"
    },
    metadata: {
      type: "object",
      description: "Optional metadata (description, category, socials)",
      required: false
    }
  },
  handler: async ({ name, symbol, type, metadata }) => {
    // Generate slug ID
    const id = slugify(name);
    
    const entity = await db.entities.create({
      id,
      name,
      symbol,
      type,
      verified: false, // Default to unverified
      metadata: metadata ?? {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    
    return { success: true, entity };
  }
}
```

**`add_representation`**

```typescript
{
  name: "add_representation",
  description: "Link a new representation (mint, perp market, LP pool) to an existing entity.",
  parameters: {
    entityId: { type: "string", description: "Entity slug (e.g., 'seeker')" },
    type: {
      type: "string",
      enum: ["spot-token", "perp-contract", "lp-pair", "lending", "staking"],
      description: "Representation type"
    },
    protocol: { type: "string", description: "Protocol name (e.g., 'jupiter', 'drift', 'meteora')" },
    chain: { type: "string", description: "Blockchain (e.g., 'solana')", required: false },
    context: {
      type: "object",
      description: "Type-specific data (mint, market, pair, poolAddress)",
      required: true
    }
  },
  handler: async ({ entityId, type, protocol, chain, context }) => {
    const representation = await db.representations.create({
      id: uuidv4(),
      entityId,
      type,
      protocol,
      chain,
      context,
      active: true,
      discoveredAt: Date.now(),
      lastSeenAt: Date.now()
    });
    
    return { success: true, representation };
  }
}
```

---

### 2. Memory Management Tools

**`check_research_freshness`**

```typescript
{
  name: "check_research_freshness",
  description: "Check if cached research exists for an entity and if it's still fresh.",
  parameters: {
    entityId: { type: "string", description: "Entity slug" },
    maxAgeMs: { 
      type: "number", 
      description: "Maximum acceptable age in milliseconds (e.g., 3600000 for 1 hour)",
      default: 3600000
    }
  },
  handler: async ({ entityId, maxAgeMs = 3600000 }) => {
    const research = await db.research.getLatest(entityId);
    
    if (!research) {
      return {
        exists: false,
        fresh: false,
        message: "No cached research found"
      };
    }
    
    const age = Date.now() - research.timestamp;
    const fresh = age < maxAgeMs && Date.now() < research.expiresAt;
    
    return {
      exists: true,
      fresh,
      age,
      ageHours: (age / (1000 * 60 * 60)).toFixed(1),
      expiresAt: research.expiresAt,
      expiresIn: research.expiresAt - Date.now()
    };
  }
}
```

**`get_cached_research`**

```typescript
{
  name: "get_cached_research",
  description: "Retrieve cached research data for an entity.",
  parameters: {
    entityId: { type: "string", description: "Entity slug" }
  },
  handler: async ({ entityId }) => {
    const research = await db.research.getLatest(entityId);
    
    if (!research) {
      return { found: false, message: "No research data available" };
    }
    
    return {
      found: true,
      research: research.findings,
      timestamp: research.timestamp,
      sources: research.sources,
      expiresAt: research.expiresAt
    };
  }
}
```

**`store_research_results`**

```typescript
{
  name: "store_research_results",
  description: "Save research findings to entity memory.",
  parameters: {
    entityId: { type: "string", description: "Entity slug" },
    findings: {
      type: "object",
      description: "Research findings object",
      properties: {
        summary: { type: "string" },
        sentiment: { type: "string", enum: ["bullish", "bearish", "neutral", "unknown"] },
        confidence: { type: "number" },
        risks: { type: "array", items: { type: "string" } },
        opportunities: { type: "array", items: { type: "string" } },
        metadata: { type: "object" }
      },
      required: ["summary", "confidence"]
    },
    sources: {
      type: "array",
      description: "List of data sources used",
      items: {
        type: "object",
        properties: {
          tool: { type: "string" },
          success: { type: "boolean" },
          error: { type: "string" }
        }
      }
    },
    ttl: {
      type: "number",
      description: "Cache lifetime in seconds",
      default: 3600
    }
  },
  handler: async ({ entityId, findings, sources, ttl = 3600 }) => {
    const now = Date.now();
    const research = await db.research.create({
      id: uuidv4(),
      entityId,
      timestamp: now,
      ttl,
      expiresAt: now + (ttl * 1000),
      findings,
      sources,
      createdAt: now
    });
    
    return { success: true, research };
  }
}
```

---

### 3. Data Source Tools

**`get_token_metadata`**

```typescript
{
  name: "get_token_metadata",
  description: "Fetch token metadata from Jupiter Tokens API V2 (alpha source of truth).",
  parameters: {
    mint: { type: "string", description: "Token mint address" }
  },
  handler: async ({ mint }) => {
    const response = await fetch(
      `https://api.jup.ag/tokens/v2/search?query=${mint}`,
      { headers: { "x-api-key": process.env.JUPITER_API_KEY ?? "" } }
    );
    const rows = await response.json();
    const token = rows.find((row: any) => row.id === mint);
    return token
      ? { found: true, mint, token }
      : { found: false, mint };
  }
}
```

**Deferred in alpha:** `get_price_history`, `check_rugcheck`, `analyze_sentiment`, `get_holder_distribution`.

### 4. Entity Query Tools

**Status:** Deferred in alpha (not implemented yet).

Planned tools:

1. `get_entity_representations`
2. `query_entity_timeline`

---

## Research Agent Implementation

Current implementation (source of truth):

1. `packages/brain/src/research/agent.ts`
2. `packages/brain/src/research/llm/minimax.ts`
3. `packages/brain/src/research/tools/*.ts`
4. `packages/brain/src/research/data-sources/jupiter-tokens.client.ts`

Runtime flow:

1. Resolve identifier with `resolve_entity`.
2. Create unverified entity + representation when missing.
3. Check freshness with `check_research_freshness`.
4. If fresh, return via `get_cached_research`.
5. If stale/missing, run MiniMax tool-calling loop with bounded iterations.
6. Persist findings via `store_research_results`.
7. Return normalized `ResearchResult` plus per-identifier audit summary.

---

## Integration with Orchestrator

Current integration is in `packages/brain/src/orchestrator.ts`:

1. Classifier runs first per batch.
2. Research runs only when `needsResearch` has targets.
3. Targets are deduped and freshness-filtered before `enrich()`.
4. Audit output is appended to `research.jsonl` when audit logging is enabled.
5. `onResearch` callback receives `{ results, audit }`.

---

## Package Structure

```
packages/brain/
  ├── src/
  │   ├── classifier.ts
  │   ├── orchestrator.ts
  │   ├── run.ts
  │   ├── research-smoke.ts
  │   ├── demo-replay.ts
  │   └── research/
  │       ├── agent.ts
  │       ├── index.ts
  │       ├── llm/
  │       │   └── minimax.ts
  │       ├── prompts/
  │       │   └── research.ts
  │       ├── data-sources/
  │       │   └── jupiter-tokens.client.ts
  │       ├── tools/
  │       │   ├── index.ts
  │       │   ├── registry.ts
  │       │   ├── entity.tools.ts
  │       │   ├── memory.tools.ts
  │       │   └── data-source.tools.ts
  │       └── types/
  │           └── mcp.ts
```

---

## Config & Environment

Update root `.env`:

```bash
# Brain 1 (Classifier)
CLASSIFIER_MODEL=MiniMax-M2.5-lightning

# Brain 2 (Research Agent)
RESEARCHER_MODEL=MiniMax-M2.5
JUPITER_API_KEY=...   # optional if endpoint/rate tier requires it
MINIMAX_API_KEY=...
```

---

## Acceptance Criteria

### Research Agent Core ✅

1. ✅ `ResearchAgent` class with MCP tool support
2. ✅ `enrich()` method accepts array of identifiers
3. ✅ Orchestrates tool calls via LLM tool-calling loop (MiniMax-compatible)
4. ✅ Handles tool execution (async handlers)
5. ✅ Max iteration limit (prevents infinite loops)
6. ✅ Graceful error handling (tool failures don't crash agent)

### MCP Tools 🟡

1. ✅ Entity resolution tools (`resolve_entity`, `create_entity`, `add_representation`)
2. ✅ Memory tools (`check_research_freshness`, `get_cached_research`, `store_research_results`)
3. 🟡 Data source tools: `get_token_metadata` implemented; remaining sources deferred
4. ⬜ Query tools (`get_entity_representations`, `query_entity_timeline`) deferred

### Integration ✅

1. ✅ Orchestrator (#016) calls research agent after classification
2. ✅ Research agent stores results in entity memory (#014)
3. ✅ Audit logging for research batches

### Testing 🟡

1. ⬜ Unit tests for tool handlers (deferred)
2. ⬜ Integration test: mock LLM tool calling (deferred)
3. ⬜ End-to-end automated test (deferred)
4. ✅ Manual smoke/demo scripts available (`research:smoke`, `demo:replay`)

---

## Testing Strategy

### Unit Tests

**Tool handlers:**

```typescript
it('resolve_entity finds entity by mint', async () => {
  const result = await tools.resolve_entity({ 
    identifier: 'ABC123...xyz' 
  });
  
  expect(result.entity).toBeDefined();
  expect(result.entity.id).toBe('seeker');
});

it('check_research_freshness returns fresh status', async () => {
  const result = await tools.check_research_freshness({
    entityId: 'seeker',
    maxAgeMs: 3600000
  });
  
  expect(result.exists).toBe(true);
  expect(result.fresh).toBe(true);
});
```

### Integration Tests

**Mock tool calling flow:**

```typescript
it('research agent enriches new entity', async () => {
  const mockLLM = {
    chat: {
      completions: {
        create: jest.fn()
          .mockResolvedValueOnce({
            // First call: resolve entity
            choices: [{
              message: {
                tool_calls: [{
                  id: 'call_1',
                  function: { 
                    name: 'resolve_entity', 
                    arguments: JSON.stringify({ identifier: 'ABC...xyz' })
                  }
                }]
              }
            }]
          })
          .mockResolvedValueOnce({
            // Second call: entity not found, create it
            choices: [{
              message: {
                tool_calls: [{
                  id: 'call_2',
                  function: {
                    name: 'create_entity',
                    arguments: JSON.stringify({ name: 'NewToken', type: 'crypto-token' })
                  }
                }]
              }
            }]
          })
          // ... more tool calls ...
          .mockResolvedValueOnce({
            // Final call: no more tools
            choices: [{
              message: { content: 'Research complete.' }
            }]
          })
      }
    }
  };

  const agent = new ResearchAgent({
    model: 'MiniMax-M2.5',
    apiKey: 'test',
    tools: researchTools,
    client: mockLLM as any
  });

  await agent.enrich(['ABC...xyz']);

  // Verify entity was created and research stored
  const entity = await db.entities.findById('newtoken');
  expect(entity).toBeDefined();
  
  const research = await db.research.getLatest('newtoken');
  expect(research).toBeDefined();
});
```

### Manual Testing

**Run with real mints:**

```typescript
const agent = new ResearchAgent({
  model: process.env.RESEARCHER_MODEL ?? 'MiniMax-M2.5',
  apiKey: process.env.MINIMAX_API_KEY,
  tools: buildResearchTools(db, apis)
});

// Test with known token
await agent.enrich(['So11111111111111111111111111111111111111112']); // SOL

// Test with unknown token
await agent.enrich(['ABC123...unknownMint']);

// Check database for stored research
const research = await db.research.getLatest('sol');
console.log(research.findings);
```

---

## Cost Estimates

**Assumptions:**

- Classifier identifies ~5-10 tokens needing research per batch
- Research agent processes ~50-100 tokens/day
- Average 5-8 tool calls per token
- Model: MiniMax-M2.5
- ~1000 tokens per research (including tool results)

**Daily cost:**

- Cost depends on active MiniMax pricing tier (estimate from provider billing)

**Optimization:**

- Keep strict cache TTLs to reduce repeated research calls
- Cache aggressively (most tokens don't change hourly)
- Batch tool calls where possible

---

## Out of Scope (Post-MVP)

- ❌ Multi-model fallback (if MiniMax unavailable)
- ❌ Advanced sentiment analysis (dedicated AI model)
- ❌ Real-time news monitoring (RSS/API integration)
- ❌ Cross-chain entity tracking (Sol + ETH + Base)
- ❌ Historical research versioning
- ❌ Research quality scoring (track accuracy over time)
- ❌ Auto-invalidation on events (e.g., rug → invalidate bullish research)

---

## Dependencies

- #014 (Entity Memory Schema) — database layer
- #016 (Classifier Brain) — upstream classification
- MiniMax Anthropic-compatible API endpoint (`https://api.minimax.io/anthropic/v1/messages`)
- External APIs: Helius, Birdeye, Rugcheck, Twitter

---

## Follow-up Issues

- Future: Decision Engine (Brain 3) consumes research + interesting txs
- Future: Alert generation based on research + events
- Future: Research quality tracking + feedback loop

---

**PM Approval:** ✅ bibhu  
**EM Review:** Pending  
**Created:** 2026-02-13 13:15 IST
