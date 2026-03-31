# #052 — Pacific TypeScript API Client

## Problem

Mobile app and API layer need to fetch Pacific data (markets, prices, positions), but there's no reusable TypeScript client. Each component would duplicate API call logic.

**Gap:** No shared Pacific client. No type definitions. No rate limit handling.

## Goal

Build a minimal TypeScript API client in `packages/shared`:

- `PacificClient` — REST API wrapper (getMarkets, getPrices, getPositions, etc.)
- `PacificWebSocket` — WebSocket client for real-time price updates
- TypeScript types for all Pacific data

**Outcome:** Reusable client with types, error handling, and rate limit management.

## Dependencies

- Blocks: #053 (Trade UI — needs market data)
- No DB migrations required

## Files to Create

- `packages/shared/src/pacific/client.ts`
- `packages/shared/src/pacific/websocket.ts`
- `packages/shared/src/pacific/types.ts`
- `packages/shared/src/pacific/index.ts`

## Acceptance

- [ ] `pnpm --filter @myboon/shared build` compiles without errors
- [ ] Manual test: `getMarkets()` returns 50+ markets
- [ ] Manual test: WebSocket receives real-time price updates
- [ ] Rate limit headers are parsed and respected

## Reference

- `docs/PACIFIC-INTEGRATION.md` — API endpoints
- `docs/tutorials/07-pacific-protocol.md` — TypeScript examples
