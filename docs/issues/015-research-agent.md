# Issue #015: Research Agent (Brain 2)

**Type:** Feature  
**Priority:** Critical  
**Milestone:** Alpha Demo (Colosseum Hackathon)  
**Assignee:** Codex  
**Estimated Effort:** 8-10 hours  
**Depends On:** #014 (Entity Memory Schema), #016 (Classifier Brain)  
**Status:** 🔴 Not Started

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
    ├─ check_research_freshness(entityId)
    ├─ get_token_metadata(mint)
    ├─ get_price_history(mint)
    ├─ analyze_sentiment(mint)
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
  description: "Fetch token metadata from Helius (name, symbol, supply, decimals).",
  parameters: {
    mint: { type: "string", description: "Token mint address" }
  },
  handler: async ({ mint }) => {
    try {
      const response = await helius.getTokenMetadata(mint);
      
      return {
        success: true,
        data: {
          name: response.name,
          symbol: response.symbol,
          decimals: response.decimals,
          supply: response.supply,
          logoUri: response.logoURI,
          description: response.description
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

**`get_price_history`**

```typescript
{
  name: "get_price_history",
  description: "Get price history and current price from Birdeye.",
  parameters: {
    mint: { type: "string", description: "Token mint address" },
    timeframe: {
      type: "string",
      enum: ["24h", "7d", "30d"],
      description: "Timeframe for price history",
      default: "7d"
    }
  },
  handler: async ({ mint, timeframe = "7d" }) => {
    try {
      const [price, history] = await Promise.all([
        birdeye.getPrice(mint),
        birdeye.getPriceHistory(mint, timeframe)
      ]);
      
      const change = ((price.value - history.items[0].value) / history.items[0].value) * 100;
      
      return {
        success: true,
        data: {
          currentPrice: price.value,
          priceChange: change.toFixed(2),
          priceChange24h: price.priceChange24h,
          volume24h: price.volume24h,
          liquidity: price.liquidity,
          marketCap: price.mc,
          history: history.items
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

**`check_rugcheck`**

```typescript
{
  name: "check_rugcheck",
  description: "Check token safety score from Rugcheck.xyz.",
  parameters: {
    mint: { type: "string", description: "Token mint address" }
  },
  handler: async ({ mint }) => {
    try {
      const response = await rugcheck.check(mint);
      
      return {
        success: true,
        data: {
          score: response.score,
          risks: response.risks,
          topHolders: response.topHolders,
          freezeAuthority: response.freezeAuthority,
          mintAuthority: response.mintAuthority,
          lpBurned: response.lpBurned
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

**`analyze_sentiment`**

```typescript
{
  name: "analyze_sentiment",
  description: "Analyze social sentiment from Twitter mentions (past 24h).",
  parameters: {
    symbol: { type: "string", description: "Token symbol or cashtag" },
    entityName: { type: "string", description: "Entity name for search", required: false }
  },
  handler: async ({ symbol, entityName }) => {
    try {
      // Search Twitter API for mentions
      const searchQuery = entityName ? `${symbol} OR ${entityName}` : symbol;
      const tweets = await twitter.search(searchQuery, { timeframe: '24h' });
      
      // Simple sentiment analysis (can be enhanced with AI)
      const bullishKeywords = ['moon', 'bullish', 'buy', 'pump', 'gem'];
      const bearishKeywords = ['dump', 'bearish', 'sell', 'scam', 'rug'];
      
      let bullishCount = 0;
      let bearishCount = 0;
      
      tweets.forEach(tweet => {
        const text = tweet.text.toLowerCase();
        if (bullishKeywords.some(kw => text.includes(kw))) bullishCount++;
        if (bearishKeywords.some(kw => text.includes(kw))) bearishCount++;
      });
      
      const sentiment = bullishCount > bearishCount ? 'bullish' 
                      : bearishCount > bullishCount ? 'bearish' 
                      : 'neutral';
      
      return {
        success: true,
        data: {
          sentiment,
          mentionCount: tweets.length,
          bullishCount,
          bearishCount,
          topTweets: tweets.slice(0, 3).map(t => ({
            author: t.author,
            text: t.text,
            engagement: t.likes + t.retweets
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

**`get_holder_distribution`**

```typescript
{
  name: "get_holder_distribution",
  description: "Get token holder count and distribution from Helius.",
  parameters: {
    mint: { type: "string", description: "Token mint address" }
  },
  handler: async ({ mint }) => {
    try {
      const holders = await helius.getHolders(mint);
      
      // Calculate concentration
      const top10Percentage = holders.slice(0, 10)
        .reduce((sum, h) => sum + h.percentage, 0);
      
      return {
        success: true,
        data: {
          totalHolders: holders.length,
          top10Concentration: top10Percentage.toFixed(2),
          topHolders: holders.slice(0, 5).map(h => ({
            address: h.address,
            percentage: h.percentage,
            amount: h.amount
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

---

### 4. Entity Query Tools

**`get_entity_representations`**

```typescript
{
  name: "get_entity_representations",
  description: "Get all representations (spot, perp, LP) for an entity.",
  parameters: {
    entityId: { type: "string", description: "Entity slug" },
    type: {
      type: "string",
      enum: ["spot-token", "perp-contract", "lp-pair", "all"],
      description: "Filter by representation type",
      default: "all"
    },
    activeOnly: {
      type: "boolean",
      description: "Only return active representations",
      default: true
    }
  },
  handler: async ({ entityId, type = "all", activeOnly = true }) => {
    const filters: any = { entityId };
    if (type !== "all") filters.type = type;
    if (activeOnly) filters.active = true;
    
    const representations = await db.representations.findMany(filters);
    
    return {
      success: true,
      count: representations.length,
      representations: representations.map(r => ({
        id: r.id,
        type: r.type,
        protocol: r.protocol,
        chain: r.chain,
        context: r.context,
        active: r.active,
        lastSeenAt: r.lastSeenAt
      }))
    };
  }
}
```

**`query_entity_timeline`**

```typescript
{
  name: "query_entity_timeline",
  description: "Get recent events for an entity.",
  parameters: {
    entityId: { type: "string", description: "Entity slug" },
    limit: { type: "number", description: "Max events to return", default: 20 },
    types: {
      type: "array",
      items: { type: "string" },
      description: "Filter by event types",
      required: false
    },
    minImportance: {
      type: "number",
      description: "Minimum importance score (0-10)",
      required: false
    }
  },
  handler: async ({ entityId, limit = 20, types, minImportance }) => {
    const filters: any = { entityId };
    if (types) filters.type = { in: types };
    if (minImportance !== undefined) filters.importance = { gte: minImportance };
    
    const events = await db.events.findMany({
      where: filters,
      orderBy: { timestamp: 'desc' },
      limit
    });
    
    return {
      success: true,
      count: events.length,
      events: events.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        type: e.type,
        summary: e.summary,
        importance: e.importance,
        source: e.source
      }))
    };
  }
}
```

---

## Research Agent Implementation

### Core Class

```typescript
import OpenAI from 'openai';

export interface ResearchAgentConfig {
  model: string;              // e.g., "gpt-4o" (needs tool calling)
  apiKey: string;
  tools: MCPTool[];           // MCP tool definitions
  maxIterations?: number;     // Max tool call rounds (default: 10)
}

export class ResearchAgent {
  private client: OpenAI;
  private config: ResearchAgentConfig;
  private tools: Map<string, MCPTool>;

  constructor(config: ResearchAgentConfig) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.tools = new Map(config.tools.map(t => [t.name, t]));
  }

  async enrich(identifiers: string[]): Promise<void> {
    console.log(`[ResearchAgent] Enriching ${identifiers.length} entities...`);
    
    // Process in parallel (but limit concurrency to avoid rate limits)
    const batches = chunk(identifiers, 3); // 3 concurrent
    
    for (const batch of batches) {
      await Promise.all(batch.map(id => this.researchEntity(id)));
    }
  }

  private async researchEntity(identifier: string): Promise<void> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(identifier);
    
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    let iterations = 0;
    const maxIterations = this.config.maxIterations ?? 10;
    
    while (iterations < maxIterations) {
      iterations++;
      
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools: this.getOpenAIToolDefs(),
        tool_choice: 'auto',
        temperature: 0.2
      });
      
      const message = response.choices[0].message;
      messages.push(message);
      
      // If no tool calls, we're done
      if (!message.tool_calls || message.tool_calls.length === 0) {
        console.log(`[ResearchAgent] ${identifier} research complete (${iterations} iterations)`);
        break;
      }
      
      // Execute tool calls
      const toolResults = await Promise.all(
        message.tool_calls.map(tc => this.executeTool(tc))
      );
      
      // Add results to conversation
      toolResults.forEach(result => {
        messages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: JSON.stringify(result.output)
        });
      });
    }
    
    if (iterations >= maxIterations) {
      console.warn(`[ResearchAgent] ${identifier} hit max iterations`);
    }
  }

  private async executeTool(toolCall: OpenAI.Chat.ChatCompletionMessageToolCall) {
    const tool = this.tools.get(toolCall.function.name);
    
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        output: { error: `Unknown tool: ${toolCall.function.name}` }
      };
    }
    
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const output = await tool.handler(args);
      
      return {
        toolCallId: toolCall.id,
        output
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        output: { error: error.message }
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are a crypto research analyst. Your job is to research entities (tokens, assets, protocols) and store structured findings.

**Research workflow:**
1. Resolve identifier to entity (use resolve_entity)
2. Check if we have fresh research (use check_research_freshness)
3. If fresh, retrieve and return (use get_cached_research)
4. If stale/missing:
   a. Fetch token metadata (get_token_metadata)
   b. Get price data (get_price_history)
   c. Check safety (check_rugcheck)
   d. Analyze sentiment (analyze_sentiment)
   e. Get holder data (get_holder_distribution)
   f. Get representations (get_entity_representations)
5. Synthesize findings (summary, sentiment, risks, opportunities)
6. Store results (use store_research_results)

**If entity doesn't exist:**
- Create it (use create_entity)
- Add representation if mint address provided (use add_representation)

**Handle failures gracefully:**
- If a tool fails, continue with available data
- Adjust confidence score based on data completeness

**Output format:**
When research is complete, respond with a brief summary. All structured data should be stored via tools.`;
  }

  private buildUserPrompt(identifier: string): string {
    return `Research this entity: ${identifier}

Determine:
- Is it safe to trade? (rugcheck score, holder distribution)
- What's the price trend? (7-day movement)
- Any social buzz? (Twitter sentiment)
- Where can it be traded? (representations across protocols)

Synthesize findings and store them with appropriate cache TTL.`;
  }

  private getOpenAIToolDefs(): OpenAI.Chat.ChatCompletionTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters,
          required: Object.entries(tool.parameters)
            .filter(([_, def]: any) => def.required !== false)
            .map(([name]) => name)
        }
      }
    }));
  }
}

// Helper
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

---

## Integration with Orchestrator

Update `packages/brain/src/orchestrator.ts`:

```typescript
import { ResearchAgent, type ResearchAgentConfig } from './research.js';

export interface OrchestratorConfig {
  stream: StreamPipelineConfig;
  classifier: ClassifierConfig;
  research: ResearchAgentConfig;    // NEW
  auditLog?: boolean;
  auditPath?: string;
}

export class TransactionOrchestrator {
  private pipeline: StreamPipeline;
  private classifier: ClassifierBrain;
  private research: ResearchAgent;  // NEW
  private config: OrchestratorConfig;
  private isRunning = false;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.classifier = new ClassifierBrain(config.classifier);
    this.research = new ResearchAgent(config.research);  // NEW
    
    this.pipeline = new StreamPipeline({
      ...config.stream,
      onBatch: async (summaries) => this.handleBatch(summaries)
    });
  }

  private async handleBatch(summaries: string[]): Promise<void> {
    const batchId = Date.now();
    
    try {
      // Stage 1: Classify
      const classification = await this.classifier.classify(summaries);
      
      console.log(`[Orchestrator] Batch ${batchId}: ${classification.interesting.length} interesting, ${classification.needsResearch.length} need research`);
      
      // Stage 2: Research (NEW)
      if (classification.needsResearch.length > 0) {
        await this.research.enrich(classification.needsResearch);
      }

      // Optional: Log results
      if (this.config.auditLog) {
        await this.logAudit('research-batch', { 
          batchId, 
          researched: classification.needsResearch 
        });
      }

      // TODO: Stage 3 - Decision engine (future)

    } catch (error) {
      console.error(`[Orchestrator] Batch ${batchId} failed:`, error);
    }
  }

  // ... rest of orchestrator
}
```

---

## Package Structure

```
packages/brain/
  ├── src/
  │   ├── classifier.ts         (Brain 1 - existing)
  │   ├── research.ts           (Brain 2 - NEW)
  │   ├── orchestrator.ts       (Updated with research)
  │   ├── tools/                (NEW)
  │   │   ├── index.ts          (Tool registry)
  │   │   ├── entity.tools.ts   (Entity resolution tools)
  │   │   ├── memory.tools.ts   (Cache management tools)
  │   │   ├── sources.tools.ts  (External API tools)
  │   │   └── query.tools.ts    (Entity query tools)
  │   └── types/
  │       └── mcp.ts            (MCP tool type definitions)
```

---

## Acceptance Criteria

### Research Agent Core ⬜
1. ⬜ `ResearchAgent` class with MCP tool support
2. ⬜ `enrich()` method accepts array of identifiers
3. ⬜ Orchestrates tool calls via OpenAI function calling
4. ⬜ Handles tool execution (async handlers)
5. ⬜ Max iteration limit (prevents infinite loops)
6. ⬜ Graceful error handling (tool failures don't crash agent)

### MCP Tools ⬜
7. ⬜ Entity resolution tools (`resolve_entity`, `create_entity`, `add_representation`)
8. ⬜ Memory tools (`check_research_freshness`, `get_cached_research`, `store_research_results`)
9. ⬜ Data source tools (`get_token_metadata`, `get_price_history`, `check_rugcheck`, `analyze_sentiment`, `get_holder_distribution`)
10. ⬜ Query tools (`get_entity_representations`, `query_entity_timeline`)

### Integration ⬜
11. ⬜ Orchestrator (#016) calls research agent after classification
12. ⬜ Research agent stores results in entity memory (#014)
13. ⬜ Audit logging for research batches

### Testing ⬜
14. ⬜ Unit tests for tool handlers
15. ⬜ Integration test: mock OpenAI tool calling
16. ⬜ End-to-end test: unknown mint → research → stored entity

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
  const mockOpenAI = {
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
    model: 'gpt-4o',
    apiKey: 'test',
    tools: researchTools,
    client: mockOpenAI as any
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
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY,
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
- Model: GPT-4o ($5/1M input, $15/1M output)
- ~1000 tokens per research (including tool results)

**Daily cost:**
- 100 tokens × 1000 tokens × $5/1M = **$0.50/day input**
- 100 tokens × 300 tokens output × $15/1M = **$0.45/day output**
- **Total: ~$0.95/day** or **~$28.50/month**

**Optimization:**
- Use GPT-4o-mini for simple lookups (cheaper)
- Cache aggressively (most tokens don't change hourly)
- Batch tool calls where possible

---

## Out of Scope (Post-MVP)

- ❌ Multi-model fallback (if GPT-4o unavailable)
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
- OpenAI SDK (or Anthropic for Claude)
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
