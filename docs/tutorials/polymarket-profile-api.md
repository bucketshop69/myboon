# Polymarket Profile & Position APIs

Replaces Nansen for wallet profiling. All endpoints are public, no auth required.
Calls must be proxied through US VPS (geo-restricted).

---

## 1. Public Profile

Get display name, bio, X handle, verified badge, account age.

```
GET https://gamma-api.polymarket.com/public-profile?address={wallet}
```

| Param | Required | Description |
|-------|----------|-------------|
| `address` | yes | Wallet address (`0x...`, 40 hex chars) — proxy wallet or user address |

**Response:**

```json
{
  "createdAt": "2024-02-09T01:08:31.155094Z",
  "proxyWallet": "0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b",
  "profileImage": "https://polymarket-upload.s3.us-east-2.amazonaws.com/...",
  "displayUsernamePublic": true,
  "bio": "PredictFolio . Com",
  "pseudonym": "Peppery-Capital",
  "name": "Car",
  "users": [{ "id": "501613", "creator": true, "mod": false }],
  "xUsername": "CarOnPolymarket",
  "verifiedBadge": true
}
```

**Key fields for profiling:**
- `name` / `pseudonym` — display identity
- `xUsername` — cross-reference with X
- `verifiedBadge` — notable trader flag
- `createdAt` — account age (veteran vs fresh wallet)
- `users[].creator` — market creator flag

---

## 2. Portfolio Value

Total current value of all open positions.

```
GET https://data-api.polymarket.com/value?user={wallet}
```

**Response:**

```json
[{ "user": "0x7c3d...", "value": 205466.43 }]
```

Use this to classify wallet size: <$1K retail, $1K-$50K mid, $50K+ whale.

---

## 3. Markets Traded

Total count of unique markets traded.

```
GET https://data-api.polymarket.com/traded?user={wallet}
```

**Response:**

```json
{ "user": "0x7c3d...", "traded": 6580 }
```

High count = experienced trader. Use alongside account age for credibility scoring.

---

## 4. Current Positions

All open positions with PnL, avg price, current price.

```
GET https://data-api.polymarket.com/positions?user={wallet}
```

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `user` | yes | — | Wallet address |
| `market` | no | — | Comma-separated condition IDs (mutually exclusive with `eventId`) |
| `eventId` | no | — | Comma-separated event IDs (mutually exclusive with `market`) |
| `sizeThreshold` | no | `1` | Min position size |
| `limit` | no | `100` | Max results (max 500) |
| `offset` | no | `0` | Pagination offset (max 10000) |
| `sortBy` | no | `TOKENS` | `CURRENT`, `INITIAL`, `TOKENS`, `CASHPNL`, `PERCENTPNL`, `TITLE`, `RESOLVING`, `PRICE`, `AVGPRICE` |
| `sortDirection` | no | `DESC` | `ASC` or `DESC` |
| `redeemable` | no | `false` | Filter redeemable positions |
| `mergeable` | no | `false` | Filter mergeable positions |

**Response (per position):**

```json
{
  "proxyWallet": "0x7c3d...",
  "conditionId": "0x5db9...",
  "size": 45874.79,
  "avgPrice": 0.6313,
  "initialValue": 28962.18,
  "currentValue": 34176.72,
  "cashPnl": 5214.54,
  "percentPnl": 18.00,
  "totalBought": 153575.83,
  "realizedPnl": 9629.28,
  "curPrice": 0.745,
  "title": "Will the U.S. invade Iran before 2027?",
  "slug": "will-the-us-invade-iran-before-2027",
  "outcome": "No",
  "outcomeIndex": 1,
  "endDate": "2026-12-31",
  "negativeRisk": false
}
```

**Key fields for profiling:**
- `cashPnl` / `percentPnl` — is this wallet winning or losing?
- `size` — position conviction (large size = high conviction)
- `avgPrice` vs `curPrice` — is the position in profit?
- `slug` — cross-reference with the market the signal came from

---

## 5. Closed Positions

Historical resolved/exited positions with realized PnL.

```
GET https://data-api.polymarket.com/closed-positions?user={wallet}
```

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `user` | yes | — | Wallet address |
| `market` | no | — | Comma-separated condition IDs |
| `eventId` | no | — | Comma-separated event IDs |
| `title` | no | — | Filter by market title |
| `limit` | no | `10` | Max results (max 50) |
| `offset` | no | `0` | Pagination offset (max 100000) |
| `sortBy` | no | `REALIZEDPNL` | `REALIZEDPNL`, `TITLE`, `PRICE`, `AVGPRICE`, `TIMESTAMP` |
| `sortDirection` | no | `DESC` | `ASC` or `DESC` |

**Response (per position):**

```json
{
  "proxyWallet": "0x7c3d...",
  "conditionId": "0x7750...",
  "avgPrice": 0.013656,
  "totalBought": 50229.00,
  "realizedPnl": 33100.25,
  "curPrice": 1,
  "title": "Will Israel take military action in Lebanon on March 20, 2026?",
  "slug": "will-israel-take-military-action-in-lebanon-on-march-20-2026",
  "outcome": "Yes",
  "endDate": "2026-03-31T00:00:00Z",
  "timestamp": 1774510003
}
```

**Key fields for profiling:**
- `realizedPnl` — track record (sum top closed positions = lifetime profit)
- `avgPrice` — did they buy early at low odds? (contrarian signal)
- Sort by `REALIZEDPNL DESC` to find their biggest wins

---

## 6. Activity (Trade History)

Individual trades with timestamps, sizes, sides.

```
GET https://data-api.polymarket.com/activity?user={wallet}
```

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `user` | yes | — | Wallet address |
| `market` | no | — | Comma-separated condition IDs |
| `eventId` | no | — | Comma-separated event IDs |
| `type` | no | — | `TRADE`, `SPLIT`, `MERGE`, `REDEEM`, `REWARD`, `CONVERSION`, `MAKER_REBATE`, `REFERRAL_REWARD` |
| `start` | no | — | Unix timestamp lower bound |
| `end` | no | — | Unix timestamp upper bound |
| `limit` | no | `100` | Max results (max 500) |
| `offset` | no | `0` | Pagination offset (max 10000) |
| `sortBy` | no | `TIMESTAMP` | `TIMESTAMP`, `TOKENS`, `CASH` |
| `sortDirection` | no | `DESC` | `ASC` or `DESC` |
| `side` | no | — | `BUY` or `SELL` |

**Response (per activity):**

```json
{
  "proxyWallet": "0x7c3d...",
  "timestamp": 1776511690,
  "conditionId": "0x0e4a...",
  "type": "TRADE",
  "size": 309.49,
  "usdcSize": 191.88,
  "transactionHash": "0x45ea...",
  "price": 0.62,
  "side": "BUY",
  "outcomeIndex": 0,
  "title": "US x Iran permanent peace deal by May 31, 2026?",
  "slug": "us-x-iran-permanent-peace-deal-by-may-31-2026",
  "outcome": "Yes",
  "name": "Car",
  "pseudonym": "Peppery-Capital",
  "bio": "PredictFolio . Com",
  "profileImage": "https://..."
}
```

**Note:** Activity response includes profile fields inline (`name`, `pseudonym`, `bio`, `profileImage`) — no need for a separate profile call if you already have activity data.

---

## Profiling Recipe

To build a complete wallet profile (replacing Nansen), make these calls in parallel:

```
1. GET /public-profile?address={wallet}     → identity, X handle, verified, account age
2. GET /value?user={wallet}                 → portfolio size
3. GET /traded?user={wallet}                → experience (market count)
4. GET /positions?user={wallet}&limit=5&sortBy=CASHPNL  → top current positions by PnL
5. GET /closed-positions?user={wallet}&limit=5           → top historical wins
```

From these 5 calls you can derive:

| Metric | Source | How |
|--------|--------|-----|
| **Identity** | public-profile | `name`, `pseudonym`, `xUsername` |
| **Credibility** | public-profile | `verifiedBadge`, `createdAt` (account age) |
| **Wallet size** | value | `value` (total portfolio) |
| **Experience** | traded | `traded` (market count) |
| **Win rate proxy** | closed-positions | count profitable / total closed |
| **Conviction** | positions | largest position `size` relative to portfolio |
| **Track record** | closed-positions | sum of `realizedPnl` across top positions |
| **Style** | positions + closed | does wallet buy early at low odds? (contrarian) or follow momentum? |

### Suggested wallet classification

```
Portfolio < $1K           → retail
Portfolio $1K-$50K        → mid-size
Portfolio $50K+           → whale
Traded > 500 markets      → experienced
Verified badge            → notable
Account age > 1 year      → veteran
Top closed PnL > $10K     → proven winner
```

### Geo note

`gamma-api.polymarket.com` and `data-api.polymarket.com` are both geo-restricted.
All calls must go through the US VPS proxy (same as existing collector infrastructure).

### Rate limits

No documented rate limits, but batch calls per wallet and cache aggressively (24h for profile/value/traded, shorter for positions).
