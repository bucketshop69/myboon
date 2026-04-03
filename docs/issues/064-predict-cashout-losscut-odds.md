# #064 — Predict: Cash Out, Loss Cut & Multi-Format Odds

## Status: BACKLOG

## Problem

Competing betting apps (e.g. Guru365) offer cash-out, loss-cut, and multiple odds display formats (decimal, points) that make the UX more intuitive for users coming from sports betting. Our Predict tab currently only shows Polymarket's raw probability (0–1 / percentage). Users familiar with traditional betting find this unfamiliar and harder to reason about.

## Features

### 1. Cash Out

Sell an open position at the current market price before the market resolves.

- Show real-time cash-out value on each open position (current shares × best bid)
- One-tap "Cash Out: $X.XX" button on the position card
- Executes a market sell via Polymarket CLOB API
- Confirmation modal showing entry price, current price, and P&L before executing

**Polymarket mechanism:** `createMarketSellOrder()` against best bid on the order book.

### 2. Loss Cut (Stop-Loss)

Automatically exit a position when the price drops below a user-defined threshold.

- User sets a loss-cut price per position (e.g. "sell if price drops below $0.30")
- Client-side price monitor (WebSocket or polling) triggers a market sell when threshold is hit
- Visual indicator on position card showing the loss-cut level
- Push notification when a loss-cut triggers

**Implementation options:**
- **Client-side (MVP):** poll market price, fire sell order when threshold hit — requires app to be running
- **Server-side (v2):** backend worker monitors prices and executes on behalf of user — works offline

### 3. Multi-Format Odds Display

Let users choose how odds are displayed across the Predict tab.

| Format | Example | Conversion from Polymarket price `p` |
|---|---|---|
| Probability (default) | 47% | `p × 100` |
| Decimal (European) | 2.12 | `1 / p` |
| Points (Indian) | +112 | `((1 / p) - 1) × 100` |

- Global toggle in Predict settings or inline selector on market detail
- Applies everywhere: market cards, order book, position cards, bet slip
- Store preference in AsyncStorage
- Conversion is display-only — all internal logic stays in probability (0–1)

## Dependencies

- **#063 done** — Wallet Connect (need connected address)
- **#065 done** — Polymarket CLOB Auth & Address Mapping (L1/L2 headers for sell orders + Polygon address)
- **#066 done** — Order Execution Pipeline (cash out and loss cut both submit sell orders — need the signing + submission infra)
- **#067** — Price Monitoring Service (server-side price watcher for loss cut triggers — MVP can use client-side polling but server-side needed for offline)

## Not in Scope

- Trailing stop-loss or advanced order types
- Partial cash-out (sell X% of position)
- Odds format for American odds (+150 / -200) — can add later

## Acceptance

- [ ] User sees "Cash Out: $X.XX" on each open position with real-time value
- [ ] Tapping cash out sells the full position at market price
- [ ] User can set a loss-cut price on any open position
- [ ] Loss cut auto-sells when price hits threshold (client-side MVP)
- [ ] User can switch odds display between Probability / Decimal / Points
- [ ] Odds preference persists across app restarts
- [ ] All market screens (list, detail, bet slip) respect the chosen format

## Progress (as of 2026-04-03)

- [x] Issue written
- [ ] Everything else — NOT STARTED

## Missing components identified during review

- `OddsFormatter` utility — pure function: `formatOdds(price: number, format: 'probability' | 'decimal' | 'points'): string`
- `OddsFormatToggle` component — inline selector or settings screen toggle
- `PositionCard` with cash out button — reusable across profile and detail screens
- `StopLossModal` — modal to set/edit loss cut threshold per position
- `CashOutConfirmModal` — shows entry, current, P&L before executing sell
- `useOddsFormat()` hook — reads/writes preference to AsyncStorage, provides formatter

## Note on odds format (can be built independently)

The multi-format odds display (#064.3) has **no dependency** on wallet connect or CLOB auth. It's a pure display conversion. This could be split out and shipped immediately as a standalone change to improve UX while the execution pipeline is being built.
