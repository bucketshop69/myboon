# #053 — Pacific Trade Tab UI

## Problem

Mobile app has a placeholder Trade tab with no functionality. Users cannot view perpetual markets, see live prices, or manage positions.

**Gap:** Complete trading UI needs to be built from scratch. Design is ready.

## Goal

Build the Trade tab UI (read-only until wallet integration):

1. **Market List** (`/trade`) — Browse all Pacific markets, sort by volume/OI
2. **Market Detail** (`/trade/[symbol]`) — View market info, price chart, order form (disabled)
3. **Positions** (`/trade/positions`) — View open positions with PnL

**Outcome:** Users can view markets, see live prices, and view positions.

## Dependencies

- Builds on: #052 (Pacific API client — provides data)
- No DB migrations required

## Files to Create

- `apps/hybrid-expo/app/trade.tsx`
- `apps/hybrid-expo/app/trade/[symbol].tsx`
- `apps/hybrid-expo/app/trade/positions.tsx`
- `apps/hybrid-expo/src/features/perps/` — Feature module

## Acceptance

- [ ] Market list shows 50+ markets with price, volume, OI, funding
- [ ] Market detail shows live price updates via WebSocket
- [ ] Positions screen shows PnL calculation
- [ ] All screens have loading and error states

## Reference

- `docs/PACIFIC-INTEGRATION.md` — API endpoints
- User has design ready (Figma/mockup)
