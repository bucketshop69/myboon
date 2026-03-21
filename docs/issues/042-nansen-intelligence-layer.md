# #042 — Nansen Intelligence Layer

## Problem

The analyst brain has no way to judge the credibility of a whale bet or the conviction behind a market. A `WHALE_BET` from a wallet with a 70% prediction win rate is treated identically to one from a fresh wallet. The analyst also has no visibility into trending markets or events outside its hardcoded 18-wallet tracker — it only discovers markets that already appear in `polymarket_tracked`.

Issue #035 (wallet win rate) proposed building this manually. Nansen's `prediction-market` CLI endpoints already provide richer data. #035 is superseded by this issue.

## Goal

1. `NansenClient` in `packages/shared` wraps the Nansen CLI as a subprocess — single source of truth for all Nansen calls across brain and collectors
2. Two new signal types (`PM_MARKET_SURGE`, `PM_EVENT_TRENDING`) flow from a new Nansen collector into the existing `signals` table — analyst picks them up automatically
3. Two new analyst tools (`nansen_bettor_profile`, `nansen_market_depth`) registered in the tool calling loop — analyst can call them mid-analysis to score credibility and market depth

## Dependencies

- Closes: #035 (wallet win rate — superseded by `nansen_bettor_profile`)
- Blocks: none
- Related: #037 (critic agent — independent, parallel issue #043)

## Scope

- `packages/shared/src/nansen/client.ts` — new file, NansenClient class
- `packages/shared/src/nansen/index.ts` — barrel export
- `packages/shared/src/index.ts` — export NansenClient
- `packages/collectors/src/nansen/index.ts` — new file, PM signal collector
- `packages/collectors/src/index.ts` — add nansen collector to startup
- `packages/brain/src/analyst-tools/nansen.tools.ts` — new file, two analyst tools
- `packages/brain/src/narrative-analyst.ts` — register nansen tools in `analystTools`
- `packages/collectors/package.json` — add `@myboon/shared` dependency if not present
- `ecosystem.config.cjs` — add `myboon-nansen-collector` process
- DB migration — `nansen_cache` table

## DB Migration

Run manually via Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS nansen_cache (
  key         TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_hours   INT NOT NULL DEFAULT 24
);

CREATE INDEX nansen_cache_fetched_idx ON nansen_cache(fetched_at);
```

## Changes

### 1. NansenClient in `packages/shared`

Wraps the Nansen CLI via `child_process.execSync`. All callers go through this — no direct CLI calls scattered across packages.

```ts
// packages/shared/src/nansen/client.ts

import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'

export interface NansenClientOptions {
  supabaseUrl: string
  supabaseKey: string
}

export class NansenClient {
  private supabase: ReturnType<typeof createClient>

  constructor(opts: NansenClientOptions) {
    this.supabase = createClient(opts.supabaseUrl, opts.supabaseKey)
  }

  private async fromCache<T>(key: string): Promise<T | null> {
    const { data } = await this.supabase
      .from('nansen_cache')
      .select('data, fetched_at, ttl_hours')
      .eq('key', key)
      .single()

    if (!data) return null

    const ageHours = (Date.now() - new Date(data.fetched_at).getTime()) / 36e5
    if (ageHours > data.ttl_hours) return null

    return data.data as T
  }

  private async toCache(key: string, data: unknown, ttlHours: number): Promise<void> {
    await this.supabase.from('nansen_cache').upsert({
      key,
      data,
      fetched_at: new Date().toISOString(),
      ttl_hours: ttlHours,
    })
  }

  private exec(args: string): unknown {
    const raw = execSync(`nansen ${args} --format json`, {
      encoding: 'utf8',
      timeout: 15000,
    })
    const parsed = JSON.parse(raw)
    if (!parsed.success) throw new Error(`Nansen error: ${JSON.stringify(parsed)}`)
    return parsed.data
  }

  async marketScreener(query: string = ''): Promise<unknown> {
    const key = `pm:market-screener:${query}`
    const cached = await this.fromCache(key)
    if (cached) return cached

    const data = this.exec(`research prediction-market market-screener --query "${query}"`)
    await this.toCache(key, data, 0.5) // 30min TTL
    return data
  }

  async eventScreener(query: string = ''): Promise<unknown> {
    const key = `pm:event-screener:${query}`
    const cached = await this.fromCache(key)
    if (cached) return cached

    const data = this.exec(`research prediction-market event-screener --query "${query}"`)
    await this.toCache(key, data, 1) // 1h TTL
    return data
  }

  async bettorProfile(address: string): Promise<unknown> {
    const key = `pm:pnl:${address}`
    const cached = await this.fromCache(key)
    if (cached) return cached

    const data = this.exec(`research prediction-market pnl-by-address --address ${address}`)
    await this.toCache(key, data, 24) // 24h TTL
    return data
  }

  async marketDepth(marketId: string): Promise<unknown> {
    const key = `pm:depth:${marketId}`
    const cached = await this.fromCache(key)
    if (cached) return cached

    const holders = this.exec(`research prediction-market top-holders --market-id ${marketId}`)
    const orderbook = this.exec(`research prediction-market orderbook --market-id ${marketId}`)
    const data = { holders, orderbook }
    await this.toCache(key, data, 0.083) // 5min TTL
    return data
  }
}
```

Export from `packages/shared/src/nansen/index.ts`:

```ts
export { NansenClient } from './client.js'
```

Re-export from `packages/shared/src/index.ts`:

```ts
export { NansenClient } from './nansen/index.js'
```

---

### 2. Nansen PM Signal Collector (`packages/collectors/src/nansen/index.ts`)

Polls market screener and event screener every 30min. Emits `PM_MARKET_SURGE` when a market has significant 24h volume growth and `PM_EVENT_TRENDING` when an event cluster is trending. Writes to `signals` table — same shape as existing collectors.

```ts
// Signal shape emitted
{
  source: 'NANSEN',
  type: 'PM_MARKET_SURGE' | 'PM_EVENT_TRENDING',
  topic: string,         // market question or event title
  slug: string | null,   // market slug if available, else null
  weight: number,        // 1-10 scaled by volume or OI
  metadata: {
    market_id?: string,
    volume_24h?: number,
    open_interest?: number,
    category?: string,
    top_market_question?: string,
    source_endpoint: 'market-screener' | 'event-screener',
  },
  processed: false,
}
```

**Weighting logic:**

- `PM_MARKET_SURGE`: weight = `Math.min(Math.floor(volume_24h / 1_000_000) + 5, 10)` — $1M 24h volume = weight 6, $5M+ = weight 10
- `PM_EVENT_TRENDING`: weight = `Math.min(Math.floor(total_volume_24hr / 5_000_000) + 4, 10)`

**Dedup logic:** Before inserting, check `signals` table for existing signal with same `type` + `slug` within last 2h. Skip if found.

**Run loop:** Poll every 30 minutes via `setInterval`. Fetch `marketScreener('')` and `eventScreener('')`. Filter top 5 results from each by 24h volume. Insert signals that pass dedup check.

Add `NANSEN_API_KEY` to `.env` (root, gitignored). Reference: see `.env.example` pattern used by other packages.

```env
NANSEN_API_KEY=<your_key>
```

Update `packages/collectors/src/index.ts` to start nansen collector alongside existing Polymarket collectors.

---

### 3. Update Signal types

`packages/collectors/src/polymarket/signal-types.ts` — extend `source` and `type` unions:

```ts
export interface Signal {
  source: 'POLYMARKET' | 'NANSEN'  // add NANSEN
  type:
    | 'MARKET_DISCOVERED'
    | 'ODDS_SHIFT'
    | 'WHALE_BET'
    | 'VOLUME_SURGE'
    | 'MARKET_CLOSING'
    | 'PM_MARKET_SURGE'    // new
    | 'PM_EVENT_TRENDING'  // new
  topic: string
  slug?: string
  weight: number
  metadata: Record<string, unknown>  // widen to Record — existing fields still work
}
```

---

### 4. Analyst tools (`packages/brain/src/analyst-tools/nansen.tools.ts`)

Two tools registered in the analyst's tool calling loop. Both use `NansenClient` initialised with env vars.

```ts
import { NansenClient } from '@myboon/shared'

const nansenClient = new NansenClient({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
})

export const nansenTools: ResearchTool<any>[] = [
  {
    name: 'nansen_bettor_profile',
    description:
      'Fetch the Polymarket prediction track record for a wallet address. Returns win rate, total realized PnL, and trade count. Use this when a WHALE_BET or PM_MARKET_SURGE signal includes a wallet address — it tells you whether to trust the signal.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'EVM wallet address (0x...)' },
      },
      required: ['address'],
      additionalProperties: false,
    },
    async execute(args: { address: string }) {
      return nansenClient.bettorProfile(args.address)
    },
  },
  {
    name: 'nansen_market_depth',
    description:
      'Fetch top position holders and orderbook for a Polymarket market by its numeric market ID. Use this when analysing a narrative to understand who is positioned on each side and how concentrated the market is. Returns holders array and orderbook bids/asks.',
    inputSchema: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Numeric Polymarket market ID (e.g. "1484949")' },
      },
      required: ['market_id'],
      additionalProperties: false,
    },
    async execute(args: { market_id: string }) {
      return nansenClient.marketDepth(args.market_id)
    },
  },
]
```

---

### 5. Register nansen tools in analyst

`packages/brain/src/narrative-analyst.ts` — import and spread into `analystTools`:

```ts
import { nansenTools } from './analyst-tools/nansen.tools.js'

const analystTools: ResearchTool<any>[] = [
  ...createPolymarketTools(polymarketClient),
  ...nansenTools,
]
```

No other changes to analyst — tool calling loop already handles any number of tools.

---

### 6. PM2 config

Add to `ecosystem.config.cjs`:

```js
{
  name: 'myboon-nansen-collector',
  script: './packages/collectors/src/nansen/index.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx/esm',
  autorestart: true,
  watch: false,
  env: { NODE_ENV: 'production' }
}
```

## Acceptance Criteria

- [ ] `nansen_cache` table exists in Supabase
- [ ] `NansenClient.bettorProfile('0x...')` returns data on first call and serves from cache on second call within 24h (verify via `nansen_cache` table in Supabase)
- [ ] `pnpm --filter @myboon/collectors start` starts nansen collector alongside Polymarket collectors without error
- [ ] After one poll cycle, at least one `PM_MARKET_SURGE` or `PM_EVENT_TRENDING` signal appears in `signals` table with `source = 'NANSEN'`
- [ ] No duplicate signals for the same market within a 2h window
- [ ] Analyst brain tool loop logs `[narrative-analyst] Tool call: nansen_bettor_profile(...)` when processing a `WHALE_BET` signal with a known address
- [ ] Analyst brain tool loop logs `[narrative-analyst] Tool call: nansen_market_depth(...)` when processing a narrative with a numeric market ID in metadata
- [ ] `ecosystem.config.cjs` starts `myboon-nansen-collector` process cleanly via `pm2 start`
- [ ] Issue #035 closed — no `wallet-tracker.ts` file created
