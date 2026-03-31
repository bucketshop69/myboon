# #051 — Pacific Protocol Collectors

## Problem

myboon currently ingests Polymarket data only. Pacific Protocol (perps DEX on Solana) has 50+ markets with real-time prices, funding rates, and volume data — but we have no collectors for it.

**Gap:** No Pacific signals in `signals` table. Analyst agent is blind to perp market movements.

## Goal

Build two Pacific collectors:

1. **discovery.ts** — Fetch top 20 markets by volume every 2h, insert `MARKET_DISCOVERED` signals
2. **stream.ts** — WebSocket subscription for live prices, emit `ODDS_SHIFT` and `FUNDING_SPIKE` signals

**Outcome:** Pacific signals flow into `signals` table. Analyst can cluster them into narratives.

## Dependencies

- Blocked on: #057 (Signal design — defines which signals matter)
- Uses: Existing `signals` table (no migrations needed)

## Files to Create

- `packages/collectors/src/pacific/discovery.ts`
- `packages/collectors/src/pacific/stream.ts`
- `packages/collectors/src/pacific/utils.ts`

## Acceptance

- [ ] PM2 runs `myboon-pacific-discovery` every 2h
- [ ] PM2 runs `myboon-pacific-stream` persistently
- [ ] Supabase `signals` table shows Pacific signals with `processed: false`

## Reference

- `docs/PACIFIC-INTEGRATION.md` — API endpoints
- `packages/collectors/src/polymarket/` — Reference structure
