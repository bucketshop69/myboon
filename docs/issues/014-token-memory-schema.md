# Issue #014: Entity Memory Schema

**Type:** Feature  
**Priority:** Critical  
**Milestone:** Alpha Demo (Colosseum Hackathon)  
**Assignee:** PM + EM (schema design) → Codex (implementation)  
**Estimated Effort:** 6-8 hours  
**Depends On:** None  
**Status:** 🟡 In Progress (MVP package implemented; DB adapter pending)

---

## Problem Statement

We need a **knowledge graph schema** that tracks entities (tokens, assets, protocols) across multiple protocols and contexts.

**Key insight:** Our brain doesn't think "this mint address" — it thinks **"Seeker"** as a concept that exists as:

- A spot token on Jupiter/Raydium
- A perp contract on Drift
- A perp contract on Hyperliquid
- An LP pair (SKR-SOL) on Meteora
- An LP pair (SKR-SOL) on Raydium

All these are **representations of the same entity**. Our memory system must capture this.

---

## Implementation Snapshot (2026-02-13)

### Implemented in code

1. `packages/entity-memory/` package created and exported.
2. Core types implemented (`Entity`, `Representation`, `EntityEvent`, `EntityResearch`, `ResearchResult`).
3. Repository layer implemented for entities/representations/events/research (in-memory `Map` mode for alpha).
4. Service layer implemented:
   - `EntityService` (identifier resolution, entity creation, representation management)
   - `ResearchService` (freshness checks, TTL handling, completion flow, research-to-result projection)
   - `CacheService` helper
5. SQL migration files added:
   - `migrations/001_create_entities.sql`
   - `migrations/002_create_representations.sql`
   - `migrations/003_create_events.sql`
   - `migrations/004_create_research.sql`
6. Seed scaffold added: `seeds/initial-entities.ts`
7. `drizzle.config.ts` scaffold added for migration alignment.

### Deferred from this issue scope (next phase)

1. Real PostgreSQL client wiring in `src/db/client.ts`.
2. Drizzle/Kysely-backed repositories (replace in-memory stores).
3. Atomic DB transaction support across multi-table operations.
4. Automated unit/integration tests and seed validation tests.

---

## Mental Model: Entity-Centric Knowledge Graph

```
Entity: "Seeker"
├── Core Identity
│   ├── id: "seeker"
│   ├── name: "Seeker"
│   ├── symbol: "SKR"
│   └── verified: true
│
├── Representations (WHERE it exists - one record per protocol)
│   ├── Spot Token
│   │   ├── Protocol: Jupiter
│   │   ├── Mint: ABC...xyz
│   │   └── Chain: Solana
│   ├── Perp Contract (Drift)
│   │   ├── Protocol: Drift
│   │   └── Market: SKR-PERP
│   ├── Perp Contract (Hyperliquid)
│   │   ├── Protocol: Hyperliquid
│   │   └── Market: SKR-USD-PERP
│   ├── LP Pair (Meteora)
│   │   ├── Protocol: Meteora
│   │   ├── Pair: SKR-SOL
│   │   └── Pool: XYZ...123
│   └── LP Pair (Raydium)
│       ├── Protocol: Raydium
│       ├── Pair: SKR-SOL
│       └── Pool: DEF...456
│
├── Events Timeline (WHAT happened)
│   ├── [2026-02-13 12:45] Fee spike on Meteora SKR-SOL (+150% APY)
│   ├── [2026-02-13 10:30] Whale bought 100k SKR on Jupiter
│   ├── [2026-02-12 16:20] Partnership announced with ABC Protocol
│   ├── [2026-02-11 09:00] Perp funding rate on Drift turned negative
│   └── [2026-02-10 14:15] New LP pool SKR-SOL launched on Raydium
│
└── Research Memory (WHAT we learned)
    ├── Last updated: 2026-02-13 13:00
    ├── Sentiment: Bullish
    ├── Key findings: Strong DeFi integration, growing liquidity
    ├── Risks: Low holder count, high concentration
    └── Sources: [rugcheck, birdeye, twitter_analysis]
```

**Critical difference from flat "token DB":**

- One entity (Seeker) → many representations (Drift perp, Meteora LP, etc.)
- One entity (Gold) → zero blockchain representations (macro asset)
- One entity (Penguin) → multiple FAKE tokens we need to filter

---

## Schema Design

### 1. Entity (Core)

**The canonical "thing" we track.**

```typescript
interface Entity {
  id: string;                     // Slug: "seeker", "penguin", "gold", "btc"
  name: string;                   // Display: "Seeker"
  symbol?: string;                // "SKR" (if applicable)
  type: EntityType;               // Classification
  
  verified: boolean;              // Is this THE official entity?
  verifiedBy?: string;            // 'team' | 'community' | 'auto'
  
  metadata: {
    description?: string;
    category: string[];           // ['defi', 'gaming'], ['meme'], ['commodity']
    tags?: string[];              // ['narrative:ai', 'chain:solana']
    
    socials?: {
      twitter?: string;
      discord?: string;
      telegram?: string;
      website?: string;
    };
    
    relationships?: EntityRelationship[];
  };
  
  createdAt: number;              // Unix timestamp (ms)
  updatedAt: number;
}

type EntityType = 
  | 'crypto-token'    // Blockchain token (has mint/contract)
  | 'macro-asset'     // Gold, oil, stocks (no blockchain)
  | 'protocol'        // Drift, Meteora, Raydium
  | 'person'          // KOL, influencer, whale
  | 'concept'         // "AI narrative", "DePIN sector"
  | 'meme';           // Meme tokens (special classification)

interface EntityRelationship {
  type: 'listed-on' | 'integrated-with' | 'competes-with' | 'founder' | 'partner';
  targetEntityId: string;
  since?: number;                 // When relationship started
  metadata?: Record<string, any>;
}
```

**Examples:**

```typescript
// Crypto token with multiple representations
{
  id: "seeker",
  name: "Seeker",
  symbol: "SKR",
  type: "crypto-token",
  verified: true,
  verifiedBy: "team",
  metadata: {
    description: "DeFi gaming token",
    category: ["defi", "gaming"],
    tags: ["chain:solana"],
    socials: {
      twitter: "https://twitter.com/seekerprotocol",
      discord: "https://discord.gg/seeker"
    },
    relationships: [
      { type: "listed-on", targetEntityId: "meteora" },
      { type: "integrated-with", targetEntityId: "drift" }
    ]
  },
  createdAt: 1739012345000,
  updatedAt: 1739012345000
}

// Macro asset (no blockchain representation)
{
  id: "gold",
  name: "Gold",
  symbol: "XAU",
  type: "macro-asset",
  verified: true,
  metadata: {
    description: "Precious metal commodity",
    category: ["commodity", "precious-metal"]
  },
  createdAt: 1739012345000,
  updatedAt: 1739012345000
}

// Meme token with fake detection needed
{
  id: "penguin",
  name: "Penguin",
  symbol: "PENGU",
  type: "meme",
  verified: true,
  verifiedBy: "community",
  metadata: {
    description: "The original Penguin meme token",
    category: ["meme"],
    tags: ["verified:true"],
    socials: {
      twitter: "https://twitter.com/pengutoken"
    }
  },
  createdAt: 1739012345000,
  updatedAt: 1739012345000
}
```

---

### 2. Representation (Where Entity Exists)

**Different ways the entity manifests. ONE record per protocol/market.**

```typescript
interface Representation {
  id: string;                     // UUID
  entityId: string;               // Links to Entity
  
  type: RepresentationType;
  protocol: string;               // 'jupiter', 'drift', 'meteora', 'raydium', 'hyperliquid'
  chain?: string;                 // 'solana', 'ethereum', 'base' (if applicable)
  
  // Context depends on type (only relevant fields populated)
  context: {
    // Spot token
    mint?: string;                // Token mint address
    
    // Perp contract
    market?: string;              // Market identifier (e.g., "SKR-PERP", "SKR-USD-PERP")
    
    // LP pair
    pair?: string;                // Human-readable pair (e.g., "SKR-SOL")
    poolAddress?: string;         // Pool contract address
    
    // Additional metadata
    metadata?: Record<string, any>;
  };
  
  active: boolean;                // Is this still live/relevant?
  discoveredAt: number;           // When we first found this
  lastSeenAt: number;             // Last activity/update
}

type RepresentationType =
  | 'spot-token'      // SPL token, ERC20, etc.
  | 'perp-contract'   // Drift, Hyperliquid, dYdX
  | 'lp-pair'         // Raydium, Meteora, Orca, Uniswap
  | 'lending'         // Kamino, Solend
  | 'staking'         // Staking pools
  | 'futures'         // Traditional futures
  | 'option';         // Options contracts
```

**Examples (multiple representations for Seeker):**

```typescript
// Spot token on Solana
{
  id: "repr_seeker_spot_1",
  entityId: "seeker",
  type: "spot-token",
  protocol: "jupiter",
  chain: "solana",
  context: {
    mint: "SKR7QH3gZEkLXpR9xCdVWZoWkP8g2FxQ4K5m8D2a9B3c"
  },
  active: true,
  discoveredAt: 1739012345000,
  lastSeenAt: 1739445600000
}

// Perp on Drift
{
  id: "repr_seeker_perp_drift",
  entityId: "seeker",
  type: "perp-contract",
  protocol: "drift",
  chain: "solana",
  context: {
    market: "SKR-PERP"
  },
  active: true,
  discoveredAt: 1739012400000,
  lastSeenAt: 1739445600000
}

// Perp on Hyperliquid
{
  id: "repr_seeker_perp_hyper",
  entityId: "seeker",
  type: "perp-contract",
  protocol: "hyperliquid",
  context: {
    market: "SKR-USD-PERP"
  },
  active: true,
  discoveredAt: 1739012500000,
  lastSeenAt: 1739445600000
}

// LP pair on Meteora
{
  id: "repr_seeker_lp_meteora",
  entityId: "seeker",
  type: "lp-pair",
  protocol: "meteora",
  chain: "solana",
  context: {
    pair: "SKR-SOL",
    poolAddress: "METxyz123...pooladdress"
  },
  active: true,
  discoveredAt: 1739012600000,
  lastSeenAt: 1739445600000
}

// LP pair on Raydium
{
  id: "repr_seeker_lp_raydium",
  entityId: "seeker",
  type: "lp-pair",
  protocol: "raydium",
  chain: "solana",
  context: {
    pair: "SKR-SOL",
    poolAddress: "RAYabc456...pooladdress"
  },
  active: true,
  discoveredAt: 1739012700000,
  lastSeenAt: 1739445600000
}
```

**Key insight:** One entity → many representations. Research agent can query: "Show me all ways to trade Seeker" → returns spot, multiple perps, multiple LPs.

---

### 3. EntityEvent (Timeline)

**Things that happen related to an entity. All events link to the entity, not individual representations.**

```typescript
interface EntityEvent {
  id: string;                     // UUID
  entityId: string;               // Main entity
  relatedEntityIds?: string[];    // Other entities involved
  
  timestamp: number;              // Unix timestamp (ms)
  type: EventType;
  
  summary: string;                // Human-readable one-liner
  
  representationId?: string;      // Which representation (if applicable)
  
  data: Record<string, any>;      // Type-specific payload
  
  source: {
    type: 'transaction' | 'news' | 'social' | 'protocol' | 'price' | 'manual';
    reference?: string;           // tx sig, article URL, tweet ID
    confidence?: number;          // 0-100 (for AI-generated events)
  };
  
  importance: number;             // 0-10 (for filtering/prioritization)
  
  createdAt: number;
}

type EventType =
  | 'trade'           // Buy/sell/swap
  | 'lp-activity'     // Add/remove liquidity
  | 'perp-trade'      // Perp open/close/liquidation
  | 'news'            // External news article
  | 'social'          // Twitter/Discord significant mention
  | 'protocol-event'  // Listing, integration, upgrade
  | 'price-movement'  // Significant price change
  | 'volume-spike'    // Unusual volume
  | 'fee-spike'       // LP fee anomaly
  | 'whale-activity'  // Large holder movement
  | 'listing'         // New exchange/protocol listing
  | 'partnership';    // Announced partnership
```

**Examples:**

```typescript
// Whale trade (from tx stream)
{
  id: "event_seeker_whale_buy_1",
  entityId: "seeker",
  relatedEntityIds: ["whale-7"],  // If we track the whale as entity
  timestamp: 1739445600000,
  type: "trade",
  summary: "Whale bought 100k SKR for 25 SOL on Jupiter",
  representationId: "repr_seeker_spot_1",
  data: {
    direction: "buy",
    amount: 100000,
    fundingAmount: 25,
    fundingToken: "SOL",
    protocol: "jupiter",
    signature: "4zmtr...xyz"
  },
  source: {
    type: "transaction",
    reference: "4zmtr...xyz",
    confidence: 100
  },
  importance: 8,
  createdAt: 1739445600000
}

// Fee spike on LP
{
  id: "event_seeker_fee_spike_meteora",
  entityId: "seeker",
  timestamp: 1739445700000,
  type: "fee-spike",
  summary: "SKR-SOL LP fees on Meteora spiked to 150% APY (+120% vs 24h avg)",
  representationId: "repr_seeker_lp_meteora",
  data: {
    currentAPY: 150,
    avgAPY24h: 30,
    percentChange: 400,
    poolAddress: "METxyz123...pooladdress"
  },
  source: {
    type: "protocol",
    reference: "https://meteora.ag/pools/METxyz123",
    confidence: 100
  },
  importance: 7,
  createdAt: 1739445700000
}

// Social buzz (from Twitter monitoring)
{
  id: "event_seeker_social_1",
  entityId: "seeker",
  timestamp: 1739445800000,
  type: "social",
  summary: "KOL @crypto_alpha tweeted about Seeker partnership, 2.5k likes",
  data: {
    platform: "twitter",
    author: "@crypto_alpha",
    engagement: {
      likes: 2500,
      retweets: 430
    },
    sentiment: "bullish"
  },
  source: {
    type: "social",
    reference: "https://twitter.com/crypto_alpha/status/123456",
    confidence: 85
  },
  importance: 6,
  createdAt: 1739445800000
}

// Macro event (gold example)
{
  id: "event_gold_rally_1",
  entityId: "gold",
  timestamp: 1739445900000,
  type: "price-movement",
  summary: "Gold breaks $2,100, up 3.5% on Fed rate cut speculation",
  data: {
    price: 2105.50,
    percentChange24h: 3.5,
    driver: "fed-rate-cut-speculation"
  },
  source: {
    type: "news",
    reference: "https://reuters.com/gold-rally",
    confidence: 95
  },
  importance: 8,
  createdAt: 1739445900000
}
```

---

### 4. EntityResearch (Brain's Memory)

**What the research agent learned about an entity. Cached with TTL.**

```typescript
interface EntityResearch {
  id: string;                     // UUID
  entityId: string;
  
  timestamp: number;              // When research was done
  ttl: number;                    // Cache lifetime (seconds)
  expiresAt: number;              // timestamp + ttl
  
  findings: {
    summary: string;              // High-level takeaway
    sentiment?: 'bullish' | 'bearish' | 'neutral' | 'unknown';
    confidence: number;           // 0-100
    
    risks: string[];              // Identified risk factors
    opportunities: string[];      // Identified upside
    
    // Structured data from research tools
    metadata: {
      // Token fundamentals
      marketCap?: number;
      volume24h?: number;
      liquidity?: number;
      holders?: number;
      
      // Safety/trust
      rugcheckScore?: number;     // 0-100
      contractVerified?: boolean;
      auditStatus?: string;
      
      // Social metrics
      twitterFollowers?: number;
      discordMembers?: number;
      telegramMembers?: number;
      
      // Price/technical
      price?: number;
      priceChange24h?: number;
      ath?: number;
      atl?: number;
      
      // Custom fields
      [key: string]: any;
    };
  };
  
  sources: ResearchSource[];      // What tools/APIs were used
  
  createdAt: number;
}

interface ResearchSource {
  tool: string;                   // 'rugcheck', 'birdeye', 'twitter_analysis', 'helius'
  timestamp: number;
  dataFreshness?: number;         // How old was the source data (ms)
  success: boolean;
  error?: string;
}
```

**Examples:**

```typescript
// Fresh research on Seeker
{
  id: "research_seeker_1",
  entityId: "seeker",
  timestamp: 1739445600000,
  ttl: 3600,                      // 1 hour cache
  expiresAt: 1739449200000,
  findings: {
    summary: "Mid-cap DeFi gaming token with growing ecosystem. Strong liquidity on Meteora, active perp markets. Moderate risk due to low holder count.",
    sentiment: "bullish",
    confidence: 75,
    risks: [
      "Low holder count (1,245 holders)",
      "High token concentration (top 10 hold 45%)",
      "Recent smart contract not audited"
    ],
    opportunities: [
      "Growing liquidity on multiple DEXs",
      "Active perp markets on Drift + Hyperliquid",
      "Partnership with major gaming protocol announced",
      "Strong community engagement on Discord"
    ],
    metadata: {
      marketCap: 5200000,
      volume24h: 850000,
      liquidity: 1200000,
      holders: 1245,
      rugcheckScore: 72,
      contractVerified: true,
      auditStatus: "pending",
      twitterFollowers: 12500,
      discordMembers: 8300,
      price: 0.52,
      priceChange24h: 8.5,
      ath: 1.85,
      atl: 0.08
    }
  },
  sources: [
    { tool: "rugcheck", timestamp: 1739445550000, success: true },
    { tool: "birdeye", timestamp: 1739445560000, success: true },
    { tool: "twitter_analysis", timestamp: 1739445570000, success: true },
    { tool: "helius_metadata", timestamp: 1739445580000, success: true }
  ],
  createdAt: 1739445600000
}

// Macro asset research (Gold)
{
  id: "research_gold_1",
  entityId: "gold",
  timestamp: 1739445600000,
  ttl: 14400,                     // 4 hour cache (slower moving)
  expiresAt: 1739460000000,
  findings: {
    summary: "Gold in strong uptrend, breaking key resistance. Fed rate cut expectations driving demand. Historical safe-haven correlation with crypto volatility.",
    sentiment: "bullish",
    confidence: 90,
    risks: [
      "Overbought on RSI (76)",
      "Possible profit-taking at $2,100 level"
    ],
    opportunities: [
      "Fed pivot narrative strengthening",
      "Institutional demand rising",
      "Historically inversely correlated with USD strength"
    ],
    metadata: {
      price: 2105.50,
      priceChange24h: 3.5,
      ath: 2150.00,
      atl: 1620.00,
      rsi: 76,
      correlationWithBTC: -0.32
    }
  },
  sources: [
    { tool: "marketdata_api", timestamp: 1739445550000, success: true },
    { tool: "news_aggregator", timestamp: 1739445560000, success: true }
  ],
  createdAt: 1739445600000
}
```

---

## Database Implementation

### Technology Choice

**Recommended: PostgreSQL with JSONB**

**Pros:**

- ✅ Flexible schema (JSONB for metadata/context/data)
- ✅ Strong indexing (B-tree, GiST for JSONB)
- ✅ ACID transactions
- ✅ JSON queries via `->` and `->>` operators
- ✅ Full-text search on text fields
- ✅ Easy deployment (familiar, stable)

**Alternative: Neo4j (Graph DB)**

- Better for complex relationship queries
- Overkill for MVP
- Use later if entity relationships become critical

### PostgreSQL Schema

```sql
-- Entities table
CREATE TABLE entities (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  symbol VARCHAR(50),
  type VARCHAR(50) NOT NULL,
  verified BOOLEAN DEFAULT false,
  verified_by VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_symbol ON entities(symbol);
CREATE INDEX idx_entities_verified ON entities(verified);
CREATE INDEX idx_entities_metadata ON entities USING GIN(metadata);

-- Representations table
CREATE TABLE representations (
  id VARCHAR(255) PRIMARY KEY,
  entity_id VARCHAR(255) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  protocol VARCHAR(100) NOT NULL,
  chain VARCHAR(50),
  context JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  discovered_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL
);

CREATE INDEX idx_representations_entity ON representations(entity_id);
CREATE INDEX idx_representations_type ON representations(type);
CREATE INDEX idx_representations_protocol ON representations(protocol);
CREATE INDEX idx_representations_active ON representations(active);
CREATE INDEX idx_representations_context ON representations USING GIN(context);

-- Entity events table
CREATE TABLE entity_events (
  id VARCHAR(255) PRIMARY KEY,
  entity_id VARCHAR(255) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  related_entity_ids JSONB,
  timestamp BIGINT NOT NULL,
  type VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  representation_id VARCHAR(255) REFERENCES representations(id),
  data JSONB DEFAULT '{}',
  source JSONB NOT NULL,
  importance INTEGER DEFAULT 5,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_events_entity ON entity_events(entity_id);
CREATE INDEX idx_events_timestamp ON entity_events(timestamp DESC);
CREATE INDEX idx_events_type ON entity_events(type);
CREATE INDEX idx_events_importance ON entity_events(importance DESC);
CREATE INDEX idx_events_representation ON entity_events(representation_id);

-- Entity research table
CREATE TABLE entity_research (
  id VARCHAR(255) PRIMARY KEY,
  entity_id VARCHAR(255) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  timestamp BIGINT NOT NULL,
  ttl INTEGER NOT NULL,
  expires_at BIGINT NOT NULL,
  findings JSONB NOT NULL,
  sources JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_research_entity ON entity_research(entity_id);
CREATE INDEX idx_research_expires ON entity_research(expires_at);
CREATE INDEX idx_research_timestamp ON entity_research(timestamp DESC);

-- Helper view: latest research per entity
CREATE VIEW latest_research AS
SELECT DISTINCT ON (entity_id) *
FROM entity_research
ORDER BY entity_id, timestamp DESC;
```

---

## MCP Tools (for Research Agent #015)

These tools will be implemented in #015 but defined here for schema alignment.

### Entity Resolution & Lookup

```typescript
// Resolve identifier to canonical entity
resolve_entity(identifier: string): Entity | null
  // Input: mint address, symbol, name, slug
  // Output: Canonical entity or null if not found
  // Smart: checks mint → representation → entity
  //        checks symbol with disambiguation
  //        handles fakes (verified flag)

// Get full entity data
get_entity(entityId: string): Entity | null

// Get all representations for entity
get_entity_representations(entityId: string, filters?: {
  type?: RepresentationType;
  protocol?: string;
  active?: boolean;
}): Representation[]

// Find entities by filters
search_entities(filters: {
  type?: EntityType;
  symbol?: string;
  verified?: boolean;
  category?: string;
}): Entity[]
```

### Event Management

```typescript
// Store new event
store_entity_event(event: Omit<EntityEvent, 'id' | 'createdAt'>): EntityEvent

// Query event timeline
query_entity_timeline(entityId: string, filters?: {
  types?: EventType[];
  since?: number;
  until?: number;
  minImportance?: number;
  limit?: number;
}): EntityEvent[]

// Get related entities via events
get_related_entities(entityId: string, relationshipType?: string): Entity[]
```

### Research Management

```typescript
// Check if research is fresh
check_research_freshness(entityId: string, maxAgeMs: number): {
  exists: boolean;
  fresh: boolean;
  age?: number;
  expiresAt?: number;
}

// Get cached research
get_entity_research(entityId: string): EntityResearch | null

// Store research results
store_entity_research(
  entityId: string, 
  findings: EntityResearch['findings'],
  sources: ResearchSource[],
  ttl: number
): EntityResearch

// Invalidate stale research
invalidate_research(entityId: string): void
```

### Entity Creation & Updates

```typescript
// Create new entity (with optional representations)
create_entity(
  entity: Omit<Entity, 'createdAt' | 'updatedAt'>,
  representations?: Omit<Representation, 'id' | 'entityId' | 'discoveredAt' | 'lastSeenAt'>[]
): Entity

// Add new representation to existing entity
add_representation(
  entityId: string,
  representation: Omit<Representation, 'id' | 'entityId' | 'discoveredAt' | 'lastSeenAt'>
): Representation

// Update entity metadata
update_entity(entityId: string, updates: Partial<Entity>): Entity

// Mark representation as inactive
deactivate_representation(representationId: string): void
```

---

## Acceptance Criteria

### Schema Design ✅

1. ✅ Entity, Representation, EntityEvent, EntityResearch types defined
2. ✅ PostgreSQL schema with proper indexes
3. ✅ Examples for common use cases (crypto token, macro asset, meme with fakes)

### Database Implementation ⬜

1. ⬜ PostgreSQL database setup (Docker or local)
2. ✅ Migration scripts to create tables + indexes
3. ✅ Seed script scaffold with example entities

### Data Access Layer ⬜

1. ✅ Create `packages/entity-memory/` package
2. ⬜ Implement ORM/query builder (Drizzle or Kysely recommended)
3. ✅ Repository pattern for each table (in-memory MVP implementation)
4. ⬜ Transaction support for atomic multi-table operations

### Testing ⬜

1. ⬜ Unit tests for repository methods
2. ⬜ Integration tests with test database
3. ⬜ Seed data validation

---

## Implementation Notes

### Why One Representation Per Protocol?

**Scenario:** Seeker exists on 5 protocols (Jupiter spot, Drift perp, Hyperliquid perp, Meteora LP, Raydium LP).

**Design:**

- 1 Entity record (id: "seeker")
- 5 Representation records (one per protocol)

**Benefits:**

- Query "Show all ways to trade Seeker" → fetch representations by entityId
- Event on Meteora LP → link to specific representation → link to entity
- Easy to add/remove protocols (just insert/delete representation)
- Each representation has its own lifecycle (discovered_at, last_seen_at, active)

### Entity ID Generation

**Current implementation:** UUID primary key + unique slug index.

- `id` is generated UUID for collision-safe canonical identity.
- `slug` remains human-readable and unique for lookup/routing.
- This matches PM/EM direction: UUID primary, slug indexed.

**Slug generation rule (current):**

- Programmatic slugify from name/symbol, with numeric suffix if needed.

### Handling Fake Tokens

**Problem:** 100 fake "Penguin" tokens exist.

**Solution:**

1. One verified entity: `{ id: "penguin", verified: true }`
2. Multiple representations, but only ONE linked to verified entity
3. Fake tokens → either not tracked OR tracked as separate unverified entities

**Research agent logic:**

```typescript
// When encountering mint ABC...xyz claiming to be "Penguin"
const entity = await resolveEntity("ABC...xyz");

if (!entity) {
  // New token - need to verify if it's THE Penguin
  const verified = await verifyTokenIdentity("ABC...xyz", "Penguin");
  
  if (verified) {
    // Link to official entity
    await addRepresentation("penguin", { mint: "ABC...xyz", ... });
  } else {
    // It's a fake - either ignore or track as separate entity
    await createEntity({
      id: "penguin-fake-123",
      name: "Penguin (unverified)",
      verified: false,
      ...
    });
  }
}
```

### TTL Strategy

**Research cache lifetimes:**

- High-volatility tokens (memes): 10-30 minutes
- Mid-cap DeFi tokens: 1-2 hours
- Blue chips (BTC, ETH): 4-6 hours
- Macro assets (Gold): 4-12 hours
- Protocols/concepts: 24 hours

**Adaptive TTL:**

```typescript
function calculateTTL(entity: Entity): number {
  if (entity.type === 'meme') return 10 * 60; // 10 min
  if (entity.type === 'crypto-token' && entity.metadata.category?.includes('defi')) {
    return 60 * 60; // 1 hour
  }
  if (entity.type === 'macro-asset') return 4 * 60 * 60; // 4 hours
  return 30 * 60; // 30 min default
}
```

---

## Out of Scope (Post-MVP)

- ❌ Graph database migration (Neo4j)
- ❌ Advanced relationship queries ("find tokens connected to entity X")
- ❌ Vector embeddings for entity similarity
- ❌ Historical research versioning (track how findings change over time)
- ❌ Multi-chain entity aggregation (same token on Sol + ETH)
- ❌ Real-time research invalidation on events

---

## Package Structure

```
packages/entity-memory/
  ├── package.json
  ├── tsconfig.json
  ├── drizzle.config.ts           (ORM config)
  ├── src/
  │   ├── index.ts                (exports)
  │   ├── entity-memory.ts        (composition root)
  │   ├── db/
  │   │   ├── client.ts           (DB client placeholder for next phase)
  │   │   └── schema.ts           (schema placeholder + SQL is source of truth)
  │   ├── repositories/
  │   │   ├── entity.repo.ts
  │   │   ├── representation.repo.ts
  │   │   ├── event.repo.ts
  │   │   └── research.repo.ts
  │   ├── services/
  │   │   ├── entity.service.ts   (entity resolution + entity ops)
  │   │   ├── research.service.ts (freshness + research completion)
  │   │   └── cache.service.ts    (TTL helper)
  │   └── types/
  │       └── index.ts            (TypeScript interfaces from this doc)
  ├── migrations/
  │   ├── 001_create_entities.sql
  │   ├── 002_create_representations.sql
  │   ├── 003_create_events.sql
  │   └── 004_create_research.sql
  └── seeds/
      └── initial-entities.ts     (Seed common entities)
```

---

## Dependencies

- PostgreSQL 15+
- Drizzle ORM (or Kysely)
- `pg` driver
- Zod (for validation)

## Related Runtime Env

```bash
CLASSIFIER_MODEL=MiniMax-M2.5-lightning
RESEARCHER_MODEL=MiniMax-M2.5
```

---

**PM Approval:** ✅ bibhu  
**EM Review:** Pending  
**Created:** 2026-02-13 13:10 IST
