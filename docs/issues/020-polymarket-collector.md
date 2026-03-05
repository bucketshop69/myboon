# Issue #020: Polymarket Collector

**Type:** Feature
**Priority:** High
**Status:** ⚪ To Do
**Package:** `packages/collectors`

---

## Problem Statement

We need Polymarket as a signal source for the narrative engine. When a market has massive OI or odds shift dramatically (e.g. war ceasefire goes 20% → 75%), that is a narrative signal. We need to capture both: what markets exist and what's moving in real-time.

---

## Solution Approach

Two-part collector:

**Part 1 — Discovery (REST, runs every 2h via cron)**

- Fetch top 20 markets by volume from Gamma API
- Normalize each into a `Signal` and upsert to Supabase `signals` table
- Maintains a `tracked_markets` list in Supabase for the WebSocket to subscribe to

**Part 2 — Stream (WebSocket, persistent process)**

- Subscribes to tracked market token IDs via Polymarket CLOB WebSocket
- On each price update, compares to last known price
- If shift > 5% → emits an `ODDS_SHIFT` signal to Supabase

Both parts write the same `Signal` shape. The narrative agent reads from `signals`.

---

## Signal Schema

```ts
interface Signal {
  id: string           // uuid
  source: 'POLYMARKET'
  type: 'MARKET_DISCOVERED' | 'ODDS_SHIFT'
  topic: string        // market question — used for narrative clustering
  weight: number       // 1-10, ODDS_SHIFT gets higher weight
  metadata: {
    marketId: string
    slug: string
    volume?: number
    endDate?: string
    yes_price?: number
    no_price?: number
    shift_from?: number   // ODDS_SHIFT only
    shift_to?: number     // ODDS_SHIFT only
  }
  created_at: string
}
```

---

## Supabase Tables Needed

```sql
-- signals (shared across all collectors)
create table signals (
  id uuid primary key default gen_random_uuid(),
  source text not null,         -- 'POLYMARKET' | 'ONCHAIN' | 'X'
  type text not null,
  topic text not null,
  weight integer default 5,
  metadata jsonb,
  created_at timestamptz default now()
);

-- tracked_markets (polymarket-specific, managed by discovery)
create table polymarket_tracked (
  token_id text primary key,
  market_id text not null,
  question text not null,
  yes_price numeric,
  no_price numeric,
  updated_at timestamptz default now()
);
```

---

## File Structure

```
packages/collectors/
  src/
    polymarket/
      discovery.ts      -- REST: fetch top markets, upsert signals + tracked list
      stream.ts         -- WebSocket: subscribe, detect shifts, emit signals
      types.ts          -- shared types (reuse from demo code)
      client.ts         -- Gamma + CLOB REST helpers (from demo code)
    index.ts            -- entry point, starts discovery cron + stream
  package.json
  tsconfig.json
  .env.example
```

---

## Key Implementation Notes

- **WebSocket endpoint:** `wss://ws-subscriptions-clob.polymarket.com/ws/` — subscribe with `{ type: "subscribe", channel: "price_change", assets_ids: [...tokenIds] }`
- **Odds shift threshold:** 5% absolute change (configurable via env `ODDS_SHIFT_THRESHOLD`)
- **Discovery cron:** `node-cron` every 2h, or a simple `setInterval`
- **Gamma API top markets:** `GET https://gamma-api.polymarket.com/events?active=true&closed=false&limit=20&order=volume&ascending=false`
- Reuse `parseTokenIds()`, `getMarketOdds()`, `Market` type, `GammaEvent` type from demo code — don't rewrite
- Runs on VPS (US region) — Polymarket is geo-restricted locally
- No auth needed for read-only market data — CLOB credentials only needed if placing orders (not this issue)

---

## Acceptance Criteria

- [ ] `packages/collectors` package scaffolded with tsconfig + package.json
- [ ] Discovery script fetches top 20 markets, writes `MARKET_DISCOVERED` signals to Supabase
- [ ] Stream subscribes to tracked token IDs via WebSocket, reconnects on disconnect
- [ ] Odds shift > 5% writes `ODDS_SHIFT` signal to Supabase with `shift_from` / `shift_to`
- [ ] `signals` and `polymarket_tracked` tables created in Supabase
- [ ] Tested on VPS — signals appearing in Supabase dashboard

---

## Out of Scope

- X collector (separate issue)
- On-chain signal routing (separate issue)
- Narrative agent (separate issue)
- Any order placement / trading logic
