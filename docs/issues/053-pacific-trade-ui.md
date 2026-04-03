# #053 — Pacific Trade Tab UI

## Problem

Mobile app has a placeholder Trade tab (`app/trade.tsx` returns `<SectionPlaceholderScreen>`). Users cannot browse perp markets, see live prices, or view positions.

## Goal

Build the Trade tab UI — **read-only until wallet signs orders**:

1. **Trade List** (`/trade`) — Asset strip (trending) + full market table
2. **Market Detail** (`/trade/[symbol]`) — Hero price + chart + two tabs:
   - **Market tab** — order form (disabled until wallet connected)
   - **Profile tab** — wallet card, equity, open positions, PnL stats

Positions live in the Profile tab only — there is no separate positions route.

## Design Reference

- `docs/trade-tab-mockup.html` — interactive two-screen mockup, final design (V2)
- Screen 1: asset strip → markets table (symbol, price, 24h%, OI)
- Screen 2: hero zone → Market | Profile tabs
- **Action dock** (V2): Long/Short buttons pinned above nav at thumb zone — not in scroll. Shows param chips (Size · Lev · Liq) when connected, "Connect Wallet" when not.
- Profile tab: wallet card + 8 stat cards + PnL charts + open positions (alert banner removed in V2)

## Dependencies

- **#052 done** — `packages/shared/src/pacific/` provides `PacificClient` + `PacificWebSocket` + types
- Verified working: `getMarkets()` (63 markets), `getPrices()`, `getPositions()`, `getAccountInfo()`
- No DB migrations required — all data from Pacific REST + WebSocket

## Files Created

```text
apps/hybrid-expo/app/trade/[symbol].tsx          — market detail route
apps/hybrid-expo/features/perps/
  perps.types.ts                                 — merged MarketInfo+PriceInfo display type
  perps.api.ts                                   — direct Pacific REST (no @myboon/shared dep)
  usePerpsWebSocket.ts                           — RN-native WebSocket hook (bypasses isomorphic-ws)
  TradeListScreen.tsx                            — Screen 1
  MarketDetailScreen.tsx                         — Screen 2 (both tabs + ActionDock)
```

## Files to Modify

```text
apps/hybrid-expo/app/trade.tsx                   — replace placeholder with TradeListScreen
```

## Known Constraints

### WebSocket in React Native

`PacificWebSocket` (in `@myboon/shared`) uses `isomorphic-ws` which doesn't work in RN, and `@myboon/shared` is not a dependency of `hybrid-expo`. Solution: `usePerpsWebSocket.ts` — a thin RN-specific hook that uses RN's native global `WebSocket` directly, bypassing the shared package entirely. Subscribes to `prices` channel, heartbeats every 30s, cleans up on unmount.

### No trade history API

`PacificClient` has no `getTradeHistory()` endpoint. Profile tab stats (win rate, cumulative PnL chart, PnL by symbol) **show mock/placeholder data** in Phase 1. These become real when Pacific exposes a trade history endpoint — tracked as a follow-up.

### Chart

No chart library in the Expo app yet. Phase 1 uses SVG sparkline (matches mockup). Full candlestick chart is a follow-up issue.

## Implementation Pattern

Follow `features/predict/` exactly:

- `perps.api.ts` — fetch + map functions, defensive typing
- `perps.types.ts` — display-ready merged type (`PerpsMarket = MarketInfo & PriceInfo fields`)
- Screen components use `useEffect` + `useState` for loading/error/data states

## Progress (as of 2026-04-03)

- [x] TradeListScreen — asset strip + markets table + loading/error states
- [x] MarketDetailScreen — hero price (WebSocket live) + Market/Profile tabs + ActionDock
- [x] Market tab — order form UI (size, leverage slider, order preview) — **disabled, no submission**
- [x] Profile tab — wallet card (equity/margin from `getAccountInfo`), open positions with PnL calc
- [x] ActionDock — "Connect Wallet" when disconnected, Long/Short + param chips when connected
- [x] perps.api.ts — direct Pacific REST fetch functions
- [x] usePerpsWebSocket.ts — RN-native WebSocket hook (bypasses isomorphic-ws)
- [x] Routes: `/trade` and `/trade/[symbol]`
- [ ] **Wallet connect broken** — uses `@solana/wallet-adapter-react` (web-only), not functional in Expo
- [ ] **Order submission** — UI exists but no signing/execution (#054 + #068)
- [ ] **Trade history / PnL stats** — placeholder, Pacific has no `getTradeHistory()` endpoint
- [ ] **Chart** — SVG sparkline stub, no candlestick chart

## Phase 2 items (not in original issue, discovered during build)

- Order submission requires Solana keypair signing via PacificClient (#068)
- Builder code approval flow needed before orders include `MYBOON` (#054)
- WalletProvider.tsx uses web-only SDK — must be fixed by #063 before any wallet features work
- `isomorphic-ws` in PacificWebSocket doesn't work in RN — workaround already in place via usePerpsWebSocket.ts

## Acceptance

- [x] Trade list shows markets with price, 24h%, OI — data from `getPrices()` merged with `getMarkets()`
- [x] Asset strip shows top 6 trending markets (sorted by 24h% abs)
- [x] Tapping strip card or table row navigates to `/trade/[symbol]`
- [x] Market detail shows live price updates via WebSocket (patched for RN)
- [x] **Action dock** pinned above nav: "Connect Wallet" when disconnected; Short/Long buttons + param chips (Size · Lev · Liq) when connected
- [x] Profile tab shows wallet card (equity/margin from `getAccountInfo` when connected)
- [x] Profile tab shows open positions with PnL calc: `(mark - entry) × size × direction`
- [x] Profile stats section renders (mock data clearly marked, not fake-live)
- [x] All screens have loading skeleton + error states
- [x] Back navigation from detail → list works
