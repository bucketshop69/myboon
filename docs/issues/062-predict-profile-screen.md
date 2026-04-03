# #062 — Predict Profile Screen

## Depends On

- **#061 done** — Predict UI (trending strip, sparkline, live refresh)
- **#063 done** — Wallet Connect (need connected address to query positions)
- **#065 done** — Polymarket CLOB Auth & Address Mapping (positions API requires auth + Polygon address)

## Problem

The Predict tab has no user identity or portfolio view. Users can browse and will be able to trade (future), but have no way to see:
- Which wallet is connected
- What positions they hold across prediction markets
- Their overall P&L and win/loss stats
- Their holdings (USDC, SOL)

The trade screen has a terminal-style profile tab. Predict needs its own full-screen profile that is prediction-market specific — position-centric, not trade-centric.

## Goal

One new screen (`/predict-profile`) accessible via the avatar button in the Predict list header. No wallet execution — read-only view of the connected wallet's Polymarket state.

---

## 1. Wallet Connect State

Before any profile data can load, the user needs to connect a Solana wallet. The profile screen shows a "Connect Wallet" gate if no wallet is connected.

Connection flow (MVP): Phantom deep link or WalletConnect — pick whatever is already used or planned for the Trade tab's connect flow. The profile screen reuses the same wallet state, not its own.

**State shape:**
```ts
interface WalletState {
  connected: boolean
  address: string | null       // base58 Solana address
  shortAddress: string | null  // "7xKp···m3Qr"
}
```

This likely already exists or is planned for the Trade tab. If it does, just consume it here. If not, create a minimal `useWallet()` hook in `apps/hybrid-expo/hooks/useWallet.ts`.

---

## 2. New API endpoint: `GET /predict/portfolio/:address`

Fetches the user's open Polymarket positions and computes P&L.

**Source:** Polymarket CLOB API — `GET https://clob.polymarket.com/positions?user=<address>`

Response shape we return:

```json
{
  "address": "7xKp...",
  "positions": [
    {
      "slug": "us-forces-enter-iran-by-april-30-899",
      "question": "US forces enter Iran by April 30?",
      "sport": null,
      "side": "YES",
      "shares": 250,
      "avgEntry": 0.41,
      "currentPrice": 0.62,
      "currentValue": 155.00,
      "costBasis": 102.50,
      "unrealisedPnl": 52.50,
      "unrealisedPct": 51.2
    }
  ],
  "summary": {
    "totalValue": 648.00,
    "totalCostBasis": 563.30,
    "unrealisedPnl": 84.70,
    "realisedPnl": 57.40,
    "netPnl": 142.10,
    "openPositions": 4,
    "marketsTraded": 17,
    "winRate": 0.63
  }
}
```

**Implementation notes:**
- CLOB `/positions` endpoint returns raw token holdings — map `conditionId` + token side to our market slugs using the existing Dome market lookup
- `realisedPnl` and `marketsTraded` / `winRate` come from CLOB trade history: `GET https://clob.polymarket.com/trades?user=<address>`
- `currentPrice` fetched via `domeGetMarketPrice(tokenId)` — same pattern as existing endpoints
- Returns empty positions array (not 404) if address has no positions

---

## 3. New API endpoint: `GET /predict/holdings/:address`

Fetches wallet token balances on Solana for the portfolio card.

```json
{
  "address": "7xKp...",
  "usdc": 1192.00
}
```

**Implementation:** Solana RPC `getTokenAccountsByOwner` for USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Polymarket is USDC-native — no SOL price needed.

---

## 4. Profile Screen — `apps/hybrid-expo/features/predict/PredictProfileScreen.tsx`

### Route
`/predict-profile` — navigated to from the avatar button in `PredictScreen` header.

### Layout (scrollable, matches mockup)

```
StatusBar
← Back    PROFILE    ⚙ Settings

Identity row
  [Avatar ring]  handle / address / Connected chip

Portfolio card
  Total value | Unrealised P&L | Cash
  ─────────────────────────────────────
  USDC   1,192.00   $1,192.00
  Open positions   4 markets   $648.00 cost
  SOL   0.41   ~$68.04

Stats grid (2 × 3)
  Net PnL | Realised PnL
  Win Rate | Markets traded
  Avg winner | Avg loser

Cumulative P&L chart  (SVG sparkline, 90-day window)

Open Positions list
  [YES] US forces enter Iran...   +$52.50   0.41→0.62
  [NO]  China invades Taiwan...   +$22.10   0.76→0.82
  ...
```

### Connected vs disconnected states

| State | Screen shows |
|---|---|
| Not connected | Full-bleed "Connect Wallet" card, greyed-out skeleton behind |
| Connected, loading | Skeleton placeholders in each section |
| Connected, loaded | Full profile as above |
| CLOB fetch fails | Positions section shows "Unable to load positions" inline error, rest of screen still renders with holdings |

### Navigation

- Entry: avatar ring button in `PredictScreen` header (top-left)
- Back: standard `router.back()`
- Settings (top-right gear icon): placeholder for now, navigates to `/settings` if it exists

---

## 5. New Types — `predict.types.ts`

```ts
export interface PredictPosition {
  slug: string
  question: string
  sport: string | null
  side: 'YES' | 'NO'
  shares: number
  avgEntry: number
  currentPrice: number | null
  currentValue: number | null
  costBasis: number
  unrealisedPnl: number | null
  unrealisedPct: number | null
}

export interface PredictPortfolioSummary {
  totalValue: number
  totalCostBasis: number
  unrealisedPnl: number
  realisedPnl: number
  netPnl: number
  openPositions: number
  marketsTraded: number
  winRate: number
}

export interface PredictPortfolio {
  address: string
  positions: PredictPosition[]
  summary: PredictPortfolioSummary
}

export interface PredictHoldings {
  address: string
  usdc: number
}
```

---

## 6. New API functions — `predict.api.ts`

```ts
fetchPortfolio(address: string): Promise<PredictPortfolio>
fetchHoldings(address: string): Promise<PredictHoldings>
```

---

## Files

```
packages/api/src/index.ts
  — add GET /predict/portfolio/:address
  — add GET /predict/holdings/:address

apps/hybrid-expo/features/predict/predict.types.ts
  — add PredictPosition, PredictPortfolioSummary, PredictPortfolio, PredictHoldings

apps/hybrid-expo/features/predict/predict.api.ts
  — add fetchPortfolio(address), fetchHoldings(address)

apps/hybrid-expo/features/predict/PredictProfileScreen.tsx
  — new screen (full layout as above)

apps/hybrid-expo/app/predict-profile.tsx
  — new route file (Expo Router)

apps/hybrid-expo/hooks/useWallet.ts
  — create if not already shared with Trade tab

apps/hybrid-expo/features/predict/PredictScreen.tsx
  — add avatar button to header, onPress → router.push('/predict-profile')
```

---

## Environment

```
# packages/api/.env
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
# or fallback: https://api.mainnet-beta.solana.com (rate limited)
```

---

## Acceptance

- [ ] `GET /predict/portfolio/:address` returns positions + summary for a known Polymarket address
- [ ] `GET /predict/portfolio/:address` returns `{ positions: [], summary: {...zeroes} }` for an address with no positions (not 404)
- [ ] `GET /predict/holdings/:address` returns USDC + SOL balances
- [ ] Profile screen renders identity, portfolio card, stats, chart, positions list
- [ ] Avatar button on Predict list header navigates to profile screen
- [ ] Disconnected state shows "Connect Wallet" card
- [ ] Loading skeletons shown while data fetches
- [ ] Positions section gracefully degrades if CLOB fetch fails
- [ ] Back navigation works correctly

## Progress (as of 2026-04-03)

- [x] Route `/predict-profile` created — **placeholder only** (text says "coming in #062")
- [x] Backend `GET /predict/portfolio/:address` — implemented in API (line 864)
- [x] Backend `GET /predict/holdings/:address` — implemented in API (line 1023)
- [ ] `PredictProfileScreen` full UI — NOT STARTED (placeholder)
- [ ] `fetchPortfolio()` in predict.api.ts — NOT DONE
- [ ] `fetchHoldings()` in predict.api.ts — NOT DONE
- [ ] Types: `PredictPosition`, `PredictPortfolio`, `PredictHoldings` — NOT DONE
- [ ] Identity row / Portfolio card / Stats grid / Positions list — NOT DONE
- [ ] Cumulative P&L chart (90-day SVG) — NOT DONE
- [ ] Connected vs disconnected states — NOT DONE

## Blockers identified during review

1. **Polymarket is on Polygon, not Solana.** The portfolio API queries CLOB positions by address — but the user connects a Solana wallet. We need an address mapping or the user must provide their Polymarket/Polygon address. See **#065**.
2. **CLOB positions endpoint requires authentication** (L1/L2 API key headers). Read-only position queries still need a signed API key. See **#065**.
3. **`WalletProvider.tsx` uses `@solana/wallet-adapter-react`** — this is a web-only package that doesn't work in Expo/React Native. #063 must land with a mobile-compatible approach first.
