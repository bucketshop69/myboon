# Issue 026 — Predict Tab Backend API

## Goal

Add Polymarket market browsing and order forwarding to `packages/api`. Mobile Predict tab calls our VPS — which proxies to Polymarket — bypassing geo-restrictions for users.

No new package. Everything goes into `packages/api/src/`.

---

## Curated Markets Strategy

Markets are hand-picked. A `src/curated.ts` file holds a list of Polymarket slugs split into two categories. Easy to update without code changes — just edit the array.

```ts
// src/curated.ts
export const CURATED_SLUGS = {
  geopolitics: [
    "will-iran-change-its-regime-in-2025",
    "will-russia-and-ukraine-sign-a-peace-deal-in-2025",
    "us-israel-ceasefire-deal-2025",
    // add more
  ],
  sports: [
    "nba-championship-2025",
    "champions-league-winner-2025",
    // add more
  ],
}

export const ALL_SLUGS = [
  ...CURATED_SLUGS.geopolitics,
  ...CURATED_SLUGS.sports,
]
```

---

## Polymarket APIs Used

### Gamma API (public, no auth, raw fetch)
```
Base: https://gamma-api.polymarket.com
GET /markets?slug=<slug>                    → single market detail
GET /events?slug=<slug>                     → event with all markets
```

### CLOB API (for order forwarding only)
```
Base: https://clob.polymarket.com
POST /order                                 → place a signed order
GET  /orders?market=<conditionId>&maker_address=<address>  → user's open orders
GET  /price?token_id=<tokenId>&side=buy     → best price for a token
```

**Important:** Our VPS never holds a private key. Mobile wallet signs orders locally. We only forward the already-signed payload to CLOB.

---

## New Endpoints

Add to `packages/api/src/index.ts` under a `/predict` prefix.

---

### `GET /predict/markets`

Returns all curated markets with live yes/no prices. Fetches each slug from Gamma API in parallel.

**Response `200`:**
```json
[
  {
    "slug": "will-iran-change-its-regime-in-2025",
    "question": "Will Iran change its regime in 2025?",
    "category": "geopolitics",
    "conditionId": "0xabc...",
    "clobTokenIds": ["111...", "222..."],
    "yesPrice": 0.34,
    "noPrice": 0.66,
    "volume24h": 125000,
    "endDate": "2025-12-31T00:00:00Z",
    "active": true,
    "image": "https://..."
  }
]
```

Fetch all slugs in parallel (`Promise.all`). If a single slug fetch fails, skip it (don't fail the whole response). Log the error.

---

### `GET /predict/markets/:slug`

Returns full detail for a single curated market.

**Validation:** If slug is not in `ALL_SLUGS`, return `404 { "error": "Not found" }`. We only serve curated markets.

**Gamma API call:**
```
GET https://gamma-api.polymarket.com/markets?slug=:slug
```

**Response `200`:** Full market object from Gamma API, passed through as-is. No transformation needed.

**Response `404`:** Slug not in curated list or not found upstream.

---

### `POST /predict/order`

Forwards a signed order from the mobile app to Polymarket CLOB. VPS is just a pass-through — handles geo, mobile doesn't need to.

**Request body** (passed through verbatim from mobile):
```json
{
  "order": {
    "salt": 123456,
    "maker": "0x...",
    "signer": "0x...",
    "taker": "0x...",
    "tokenId": "111...",
    "makerAmount": "10000000",
    "takerAmount": "6500000",
    "expiration": "0",
    "nonce": "0",
    "feeRateBps": "0",
    "side": "BUY",
    "signatureType": 2,
    "signature": "0x..."
  },
  "orderType": "GTC",
  "marketId": "0xabc..."
}
```

**CLOB call:**
```
POST https://clob.polymarket.com/order
Content-Type: application/json
Body: request body verbatim
```

**Response:** Pass CLOB response through to mobile as-is.

**On CLOB error:** Log status + body, return `502 { "error": "Order rejected", "detail": "<clob error message>" }`.

---

### `GET /predict/orders/:address`

Returns a user's open orders for all curated markets.

**CLOB call:**
```
GET https://clob.polymarket.com/orders?maker_address=:address
```

**Response `200`:** Array of open orders, passed through from CLOB.

---

### `GET /predict/price/:tokenId`

Returns best available buy/sell price for a token. Mobile uses this to show current price before placing an order.

**CLOB call:**
```
GET https://clob.polymarket.com/price?token_id=:tokenId&side=buy
GET https://clob.polymarket.com/price?token_id=:tokenId&side=sell
```

Fetch both in parallel.

**Response `200`:**
```json
{
  "tokenId": "111...",
  "buy": 0.34,
  "sell": 0.32
}
```

---

## Implementation Notes

- All Gamma API calls: raw `fetch`, no auth, no SDK
- All CLOB calls: raw `fetch`, no auth headers (read endpoints are public; POST /order uses the signature already in the body)
- No `@polymarket/clob-client` needed — we're not signing anything server-side
- `curated.ts` exports `CURATED_SLUGS` and `ALL_SLUGS` — imported by route handlers
- Gamma API fetch helper: reuse `supabaseFetch` pattern but for `https://gamma-api.polymarket.com`
- CLOB fetch helper: same pattern for `https://clob.polymarket.com`
- All errors logged server-side, sanitised before returning to mobile
- CORS already enabled globally — no changes needed

---

## File Structure

```
packages/api/src/
  index.ts          ← add /predict routes here
  curated.ts        ← NEW: hardcoded slug lists
```

No new files beyond `curated.ts`. All routes in `index.ts`.

---

## What NOT to Build

- No wallet management or key storage — mobile handles signing
- No order book depth (`/book` endpoint) — not needed for hackathon
- No trade history — not needed for hackathon
- No authentication middleware — mobile sends signed payloads directly
- No caching — keep it simple for now

---

## Acceptance Criteria

- [ ] `GET /predict/markets` returns all curated markets with yes/no prices
- [ ] Single slug failure does not fail entire list
- [ ] `GET /predict/markets/:slug` returns 404 for non-curated slugs
- [ ] `POST /predict/order` forwards signed order to CLOB, returns CLOB response
- [ ] `GET /predict/orders/:address` returns user's open orders
- [ ] `GET /predict/price/:tokenId` returns buy + sell prices
- [ ] `src/curated.ts` has at least 3 geopolitics + 3 sports slugs
- [ ] No hardcoded secrets, no private keys anywhere
- [ ] No `@polymarket/clob-client` dependency
- [ ] Reviewer subagent passes before commit
