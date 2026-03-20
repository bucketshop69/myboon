# #044 — Nansen Slug Gap: Event Screener + Bettor Profile

## Problem

Two Nansen endpoints produce signals with no usable slug:

**PM_EVENT_TRENDING (event screener):**
- Nansen's event screener returns `event_id` (e.g. `"34051"`) but no `slug` field
- The collector does `event.slug ?? null` — always null
- `isDuplicate('PM_EVENT_TRENDING', null)` returns false (no slug = no dedup check)
- Same 10 trending events are re-inserted to `signals` every 30min cycle
- Analyst gets duplicate signals per event with every run; no predict action routing possible

**PM_BETTOR_ACTIVITY (bettor profile):**
- Nansen's `pnl-by-address` returns `market_id` (e.g. `"1542939"`) but no slug
- Dedup uses slug → always null → always false → same positions re-inserted on every poll
- PnL fields (`total_pnl_usd`, `net_buy_cost_usd`, etc.) are all null in the Nansen response — the endpoint returns position history (what the wallet held), not dollar P&L

## Goal

1. PM_EVENT_TRENDING signals use `event_id` as the dedup key, enriched with slug from Gamma API
2. PM_BETTOR_ACTIVITY signals use `market_id` as the dedup key, enriched with slug from CLOB API
3. Null PnL in bettor profile handled gracefully — signals use position data (side_held, question) without crashing

## Dependencies

- Blocked by: none
- Related: #042 (Nansen intelligence layer — broader collector improvements)

## Scope

- `packages/collectors/src/polymarket/nansen-collector.ts` — fix dedup keys, add slug enrichment
- `packages/shared/src/polymarket/client.ts` — add `getEventByGammaId(eventId)` method (or inline in collector)

## Changes

### 1. Fix PM_EVENT_TRENDING dedup and slug enrichment

Current code (broken):
```ts
const slug = event.slug ?? null  // event_id exists, slug does not → always null
if (await isDuplicate('PM_EVENT_TRENDING', slug)) continue
```

Fix — use `event_id` as the dedup key, then fetch slug from Gamma:

```ts
const eventId = String(event.event_id)
const dedupKey = `event:${eventId}`

if (await isDuplicate('PM_EVENT_TRENDING', dedupKey)) continue

// Fetch slug from Gamma API
let slug: string | null = null
try {
  const gammaRes = await fetch(
    `https://gamma-api.polymarket.com/events?id=${eventId}`
  )
  const gammaData = await gammaRes.json() as { slug?: string }[]
  slug = gammaData[0]?.slug ?? null
} catch {
  // slug stays null — signal still written, analyst skips predict action
}

await insertSignal({
  source: 'NANSEN',
  type: 'PM_EVENT_TRENDING',
  topic: event.title,
  weight: computeEventWeight(event),
  metadata: {
    event_id: eventId,
    slug,                    // may be null — analyst handles gracefully
    volume: event.volume,
    price_change_24h: event.price_change_24h,
  },
})
```

`isDuplicate` should accept a string key directly (not necessarily a Polymarket slug). If the current signature is `isDuplicate(type, slug)` where slug is expected to be a polymarket slug format, either:
- Overload to accept any string key, or
- Prefix keys: `event:34051` will never collide with a slug like `who-wins-ucl-2025`

### 2. Fix PM_BETTOR_ACTIVITY dedup and slug enrichment

Current code (broken):
```ts
const slug = position.slug ?? null  // market_id exists, slug does not → always null
if (await isDuplicate('PM_BETTOR_ACTIVITY', slug)) continue
```

Fix — use `market_id` as the dedup key, fetch slug from CLOB:

```ts
const marketId = String(position.market_id)
const dedupKey = `market:${marketId}`

if (await isDuplicate('PM_BETTOR_ACTIVITY', dedupKey)) continue

// Fetch slug from CLOB API (same API used in user-tracker.ts for whale bets)
let slug: string | null = null
try {
  const clobRes = await fetch(
    `https://clob.polymarket.com/markets/${position.condition_id ?? marketId}`
  )
  const clobData = await clobRes.json() as { market_slug?: string }
  slug = clobData.market_slug ?? null
} catch {
  slug = null
}

await insertSignal({
  source: 'NANSEN',
  type: 'PM_BETTOR_ACTIVITY',
  topic: position.event_title ?? position.question,
  weight: 6,
  metadata: {
    address: position.address,
    market_id: marketId,
    slug,
    event_id: position.event_id,
    question: position.question,
    side_held: position.side_held,
    market_resolved: position.market_resolved,
    // PnL fields omitted — null in Nansen response; will add when available
  },
})
```

### 3. Null PnL handling

The Nansen `pnl-by-address` endpoint returns null for all dollar fields (`total_pnl_usd`, `net_buy_cost_usd`, etc.). This is a data gap in Nansen's API — they track positions but not cost-basis breakdown at the market level.

Do NOT include null PnL fields in signal metadata — they add noise with no value. Signal weight stays at 6 (flat) until a wallet's win rate is queryable via #042.

## Acceptance Criteria

- [ ] Running nansen-collector for 2 cycles produces no duplicate PM_EVENT_TRENDING rows in `signals` for the same event
- [ ] Running nansen-collector for 2 cycles produces no duplicate PM_BETTOR_ACTIVITY rows for the same market+address combination
- [ ] PM_EVENT_TRENDING signals in `signals.metadata` contain `slug` (string or null) and `event_id` (string)
- [ ] PM_BETTOR_ACTIVITY signals in `signals.metadata` contain `slug` (string or null) and `market_id` (string)
- [ ] When Gamma/CLOB lookup fails, signal is still written with `slug: null` (no crash)
- [ ] Analyst does not crash when processing signals with `slug: null` — predict action is skipped for null-slug signals
