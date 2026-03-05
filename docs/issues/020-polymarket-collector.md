# Issue #020: Polymarket Collector

**Type:** Feature
**Priority:** High
**Status:** 🟡 In Progress
**Package:** `packages/collectors`

---

## Problem Statement

We need Polymarket as a signal source for the narrative engine. When a market has massive OI or odds shift dramatically (e.g. war ceasefire goes 20% → 75%), that is a narrative signal. We also want to track specific high-conviction users (whales) and hand-picked markets that are always relevant regardless of volume.

---

## Solution Approach

Three-part collector:

**Part 1 — Discovery (REST, runs every 2h via cron)**
- Fetch top 50 markets by volume from Gamma API, filter expired, take first 20 active
- Merge with pinned markets from `pinned.json` (fetched by slug, also filtered for expiry)
- Upsert all into `polymarket_tracked` table
- Write `MARKET_DISCOVERED` signal per market

**Part 2 — Stream (WebSocket, persistent process)**
- Subscribes to all tracked token IDs via CLOB WebSocket (`/ws/market`)
- On `best_bid_ask` event: if shift > 5% from cached price → write `ODDS_SHIFT` signal
- Auto-reconnects on disconnect

**Part 3 — User tracker (REST, polls every 5min)**
- Loads tracked users from `tracked-users.json`
- Polls `https://data-api.polymarket.com/activity?user=<address>&limit=20` per user
- Detects new activity since last poll (compare by timestamp)
- Writes `WHALE_BET` signal for new positions

---

## Signal Schema

```ts
interface Signal {
  source: 'POLYMARKET'
  type: 'MARKET_DISCOVERED' | 'ODDS_SHIFT' | 'WHALE_BET'
  topic: string        // market question
  weight: number       // 1-10
  metadata: {
    marketId?: string
    slug?: string
    volume?: number
    endDate?: string
    yes_price?: number
    no_price?: number
    shift_from?: number     // ODDS_SHIFT only
    shift_to?: number       // ODDS_SHIFT only
    user?: string           // WHALE_BET only
    amount?: number         // WHALE_BET only
    side?: string           // WHALE_BET only (BUY/SELL)
    outcome?: string        // WHALE_BET only (YES/NO)
  }
}
```

---

## Config Files

**`src/polymarket/pinned.json`** — hand-picked market slugs, always tracked:
```json
[
  "will-the-iranian-regime-fall-by-march-31",
  "will-israel-launch-a-major-ground-offensive-in-lebanon-by-march-31",
  "us-forces-enter-iran-by-march-31-222-191-243-517-878-439-519",
  "us-x-iran-ceasefire-by-march-31",
  "will-france-uk-or-germany-strike-iran-by-march-31-929",
  "will-another-country-strike-iran-by-march-31-833",
  "will-hassan-khomeini-be-the-next-supreme-leader-of-iran",
  "iran-leader-end-of-2026"
]
```

**`src/polymarket/tracked-users.json`** — whale addresses to monitor:
```json
[
  "0xf59db7ef18f784e17862c182d1134d5c8df38f85",
  "0xc3cd1d612bbf9fbf80da5a9bff0b0470cb46816c",
  "0x63ce342161250d705dc0b16df89036c8e5f9ba9a",
  "0x928589e0b5b686e33f95aaddab8b6a0f8d3ac19d",
  "0x24c8cf69a0e0a17eee21f69d29752bfa32e823e1",
  "0xed61f86bb5298d2f27c21c433ce58d80b88a9aa3",
  "0xa59c570a9eca148da55f6e1f47a538c0c600bb62",
  "0x7b75e76b13a8d792bd4ce25d76a50be61ced3fd1",
  "0x7ac83882979ccb5665cea83cb269e558b55077cd",
  "0x843a6da3886cf889435cf0920659a00a68db8070",
  "0x1c1e841584db14084e10e7dca2ad0ab7b60dbfe7",
  "0xf58b1c1340d6f8c0871e8ea8ee7b80ec6b8a5f34",
  "0x43372356634781eea88d61bbdd7824cdce958882",
  "0x05374492e37f036fb751d708fe487aeca60b5b0f",
  "0x5ecde7348ea5100af4360dd7a6e0a3fb1d420787",
  "0x39d0f1dca6fb7e5514858c1a337724a426764fe8",
  "0xdd225a03cd7ed89e3931906c67c75ab31cf89ef1",
  "0xd218e474776403a330142299f7796e8ba32eb5c9"
]
```

---

## File Structure

```
packages/collectors/
  src/
    polymarket/
      types.ts
      client.ts          -- Gamma + CLOB + Data API helpers
      discovery.ts       -- REST: top markets + pinned merge + upsert
      stream.ts          -- WebSocket: best_bid_ask → ODDS_SHIFT signals
      user-tracker.ts    -- REST poll: whale activity → WHALE_BET signals
      pinned.json
      tracked-users.json
    index.ts             -- starts all three
  package.json
  tsconfig.json
  .env.example
```

---

## Key Implementation Notes

- **Pinned market fetch:** `GET https://gamma-api.polymarket.com/markets?slug=<slug>` — same expiry check as discovery
- **User activity API:** `GET https://data-api.polymarket.com/activity?user=<address>&limit=20&sortBy=TIMESTAMP&sortDirection=DESC`
- **New activity detection:** store `lastSeenTimestamp` per user in memory, compare on each poll
- **User poll interval:** every 5 minutes via `setInterval`
- **WebSocket endpoint:** `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- **Subscribe message:** `{ type: "market", assets_ids: [...tokenIds], custom_feature_enabled: true }`
- **Odds shift threshold:** configurable via `ODDS_SHIFT_THRESHOLD` env (default 0.05)
- Runs on VPS (US region) — Polymarket is geo-restricted locally

---

## Supabase Tables

Already created. `polymarket_tracked` full schema:
```sql
create table polymarket_tracked (
  token_id text primary key,
  no_token_id text,
  market_id text not null,
  slug text,
  title text,
  volume numeric,
  end_date text,
  yes_price numeric,
  no_price numeric,
  updated_at timestamptz default now()
);
```

---

## Acceptance Criteria

- [ ] Discovery merges top-20 volume markets + all pinned slugs, skips expired
- [ ] Pinned markets with passed endDate are silently skipped (no error)
- [ ] Stream connects to `/ws/market`, handles `best_bid_ask` events, reconnects on drop
- [ ] User tracker polls 17 addresses every 5min, writes `WHALE_BET` on new activity
- [ ] All three start from `index.ts`
- [ ] Tested on VPS — all three signal types appearing in Supabase

---

## Out of Scope

- X collector (separate issue)
- On-chain signal routing (separate issue)
- Narrative agent (separate issue)
- Any order placement / trading logic
