# #060 — Predict API Enhancements

## Problem

The current predict API (`packages/api/src/index.ts`) was built for MVP — curated list + raw passthrough. To support a richer Predict UI (#061), it needs three additions:

1. **Curated geopolitics refresh** — all 8 current slugs in `curated.ts` are expired (Iran/March 31 markets). The list endpoint returns dead markets.
2. **Price history on detail** — `GET /predict/history/:tokenId` exists but the mobile detail screen never calls it. The endpoint needs to be confirmed working with Dome OHLCV (#059) and a clean response contract documented.
3. **Market discovery — dynamic geopolitics** — instead of a hardcoded slug list, support a dynamic category endpoint so trending markets surface automatically.

## Depends On

- **#059 done** — Dome migration must land first; endpoints in this issue use Dome data.

## Changes

### 1. Refresh `curated.ts`

Replace expired Iran/March 31 slugs with active high-volume markets. Categories:

- **Geopolitics** — US/global political events, war, elections (active, >$50k vol)
- Keep the same `CURATED_GEOPOLITICS_SLUGS` array shape — just update the values.

Source: Dome events list filtered by `tag_slug: 'politics'` or `tag_slug: 'geopolitics'`, sorted by `volume24hr`, top 8-10 active markets.

Do this manually — pick slugs, paste into `curated.ts`. Not automated yet.

---

### 2. New endpoint: `GET /predict/trending`

Returns top N currently active markets across all categories, sorted by 24h volume. Replaces the need to curate by hand for the "discover" section of the Predict UI.

```
GET /predict/trending?limit=10&tag=politics
```

Response shape (same as `/predict/markets` list items):
```json
[
  {
    "slug": "...",
    "question": "...",
    "category": "geopolitics",
    "yesPrice": 0.62,
    "noPrice": 0.38,
    "volume24h": 450000,
    "endDate": "2026-06-01T00:00:00Z",
    "active": true,
    "image": null
  }
]
```

Implementation: Dome `events.list({ active: true, closed: false })` sorted by `volume24hr`, limit N.

---

### 3. Price history response contract

Confirm `GET /predict/history/:tokenId` response shape after #059 Dome migration:

```json
{
  "history": [
    { "t": 1712000000, "p": 0.62 },
    { "t": 1712003600, "p": 0.63 }
  ]
}
```

The mobile chart (#061) needs this exact shape. If Dome OHLCV returns a different shape, normalize in the API layer — the mobile never sees raw Dome/CLOB format.

Current CLOB response: `{ history: [{ t, p }] }` — confirm Dome matches or add mapping.

---

### 4. New endpoint: `GET /predict/markets/:slug/price`

Lightweight live price poll for the detail screen (refresh without refetching full market):

```
GET /predict/markets/:slug/price
```

Response:
```json
{
  "slug": "...",
  "yesPrice": 0.64,
  "noPrice": 0.36,
  "fetchedAt": "2026-04-02T10:00:00Z"
}
```

Uses `dome.polymarket.markets.getMarketPrice` by token ID (resolved from slug). Fallback: CLOB price endpoint.

---

## Files

```
packages/api/src/curated.ts     — refresh slugs
packages/api/src/index.ts       — add /predict/trending, /predict/markets/:slug/price, normalize history response
```

## Progress (as of 2026-04-03)

- [x] `curated.ts` refreshed — 8 active geopolitics slugs (Iran, China, Trump, Netanyahu)
- [x] `GET /predict/trending` implemented (line 721 in index.ts)
- [x] `GET /predict/markets/:slug/price` implemented (line 787)
- [x] `GET /predict/portfolio/:address` implemented (line 864) — **note: was not in original issue, added during build**
- [x] `GET /predict/holdings/:address` implemented (line 1023) — **note: was not in original issue, added during build**
- [ ] Smoke test not yet run

## Discovered during build

The portfolio and holdings endpoints (#062 backend) were built alongside #060 API work since the file was already open. These are complete on the backend but the mobile UI hasn't consumed them yet.

## Acceptance

- [x] `curated.ts` has 8-10 active, non-expired geopolitics slugs
- [ ] `GET /predict/markets` returns only active markets (no expired/closed) — **needs verify**
- [x] `GET /predict/trending` returns top 10 active markets by volume
- [x] `GET /predict/history/:tokenId` response shape is `{ history: [{ t, p }] }` — consistent regardless of Dome or CLOB source
- [x] `GET /predict/markets/:slug/price` returns `{ slug, yesPrice, noPrice, fetchedAt }`
- [ ] Smoke test passes
