# #059 — Dome API Migration (Gamma Fallback)

## Problem

All Polymarket data in `packages/api/src/index.ts` is fetched directly from `gamma-api.polymarket.com`. This API is geo-restricted and silently fails or returns wrong data from non-US IPs. The VPS is in the US today, but any network change or geo-block tightening breaks the entire Predict tab with no recovery path.

## Goal

Replace all Gamma API calls with Dome (`api.domeapi.io/v1` via `@dome-api/sdk`), keeping Gamma as a silent fallback. If Dome fails for any reason, the existing Gamma path runs as before. Zero regression.

## Affected Files

```
packages/api/src/index.ts       — all Gamma fetch sites
packages/api/src/dome.ts        — new: Dome client wrapper (mirrors packages/brain/src/dome.ts pattern)
packages/api/package.json       — add @dome-api/sdk dependency
```

## Dome SDK Setup

```bash
pnpm --filter @myboon/api add @dome-api/sdk
```

`.env` on VPS:
```
DOME_API_KEY=<key>
```

## Call Sites to Migrate

### 1. `GET /predict/markets` — curated geopolitics list

**Current:** `gammaFetch('markets?slug=...')` per slug, then CLOB for yes/no prices.

**Dome replacement:**
```ts
// per slug
const market = await dome.polymarket.markets.getBySlug({ slug })
// yes price
const price = await dome.polymarket.markets.getMarketPrice({ token_id: market.clobTokenIds[0] })
```

Dome returns `outcomePrices` directly on the market object — CLOB price fetch may not be needed.

**Fallback:** current `gammaFetch` + `clobFetch` path unchanged, called if Dome throws.

---

### 2. `GET /predict/markets/:slug` — single market detail

**Current:** `gammaFetch('markets?slug=...')`, returns raw Gamma object.

**Dome replacement:**
```ts
const market = await dome.polymarket.markets.getBySlug({ slug })
```

**Fallback:** current `gammaFetch` path.

---

### 3. `GET /predict/sports/:sport` — sport fixtures list

**Current:** `gammaFetch('events?series_id=...')` by hardcoded series ID.

**Dome replacement:**
```ts
const events = await dome.polymarket.events.list({
  tag_slug: sport,   // 'epl' or 'ucl'
  active: true,
  closed: false,
})
```

Dome events have the same shape as Gamma events (`slug`, `title`, `markets[]`, `negRisk`, `volume24hr`, `liquidity`). Map identically.

**Fallback:** current `gammaFetch` path with hardcoded series IDs.

---

### 4. `GET /predict/sports/:sport/:slug` — sport event detail

**Current:** `gammaFetch('events?slug=...')`.

**Dome replacement:**
```ts
// No direct "event by slug" on Dome — use market list filtered by slug prefix, or cache from list call.
// Alternative: dome.polymarket.markets.getBySlug per outcome slug.
```

This is the trickiest call. Strategy: try Dome first by fetching `events.list` filtered to the tag and scanning by slug. If not found or Dome throws, fall back to Gamma immediately.

**Fallback:** current `gammaFetch` path.

---

### 5. `GET /predict/history/:tokenId` — price history

**Current:** `clobFetch('prices-history?...')` — CLOB, not Gamma.

**Dome replacement:**
```ts
const candles = await dome.polymarket.markets.getOhlcv({
  market_id: tokenId,
  resolution: interval,  // 1m, 5m, 1h, 1d
})
```

Dome OHLCV may use `market_id` = token ID or condition ID — confirm from docs.

**Fallback:** current `clobFetch` path unchanged.

---

## Fallback Pattern

Every endpoint follows this wrapper:

```ts
async function withDomeFallback<T>(
  domeFn: () => Promise<T>,
  gammaFn: () => Promise<T>,
  label: string,
): Promise<T> {
  try {
    return await domeFn()
  } catch (err) {
    console.warn(`[api] Dome failed for ${label}, falling back to Gamma:`, err)
    return gammaFn()
  }
}
```

## Environment

- `DOME_API_KEY` — required on VPS. If missing, skip Dome entirely and go straight to Gamma (no crash).
- Dome rate limit: Free tier = 10 QPS / 100 per 10s. Current load is well within that.

## Progress (as of 2026-04-03)

- [x] `packages/api/src/dome.ts` — Dome client wrapper created with all helpers
- [x] `packages/api/src/index.ts` — all predict endpoints import and use Dome
- [x] Gamma fallback pattern implemented
- [ ] **Smoke test not yet run on updated code** — changes are uncommitted
- [ ] **OHLCV shape verification** — confirm Dome OHLCV returns `{t, p}` or add normalisation to match `{history: [{t, p}]}` contract

## Acceptance

- [x] `GET /predict/markets` — Dome primary, Gamma fallback, same response shape
- [x] `GET /predict/markets/:slug` — Dome primary, Gamma fallback
- [x] `GET /predict/sports/:sport` — Dome primary, Gamma fallback
- [x] `GET /predict/sports/:sport/:slug` — Dome primary, Gamma fallback
- [x] `GET /predict/history/:tokenId` — Dome primary, CLOB fallback
- [x] If `DOME_API_KEY` is missing from env, all calls go straight to Gamma/CLOB — no crash
- [ ] Existing smoke test passes: `pnpm --filter @myboon/api smoke`
- [x] No change to response shape — mobile app needs zero changes

## Notes

- `packages/brain/src/dome.ts` already has a working Dome REST client (hand-rolled). The API SDK (`@dome-api/sdk`) is the cleaner path for `packages/api` — different context, no need to share the brain's custom client.
- Dome docs: https://docs.domeapi.io — full endpoint index at https://docs.domeapi.io/llms.txt
