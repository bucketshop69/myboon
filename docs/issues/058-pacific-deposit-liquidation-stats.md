# #058 — Pacific Protocol Deposit & Liquidation Stats

## Problem

We have no visibility into Pacific Protocol protocol-level activity — liquidations, deposits, and withdrawals. After a large liquidation event there's no signal being emitted and no content we can post about it.

**Example:** "Pacific Protocol had $4.2M in liquidations yesterday — BTC longs got wrecked as price dropped 8%."

## Goal

Collect and emit signals for three protocol-level Pacific events:

1. **`LIQUIDATION_CASCADE`** — Large liquidation events inferred from OI drops correlated with price moves
2. **`OI_SURGE`** — Open interest surges (new money entering, bullish positioning)
3. **`FUNDING_SPIKE`** — Extreme funding rates (crowded trades, potential mean reversion)

Deposit and withdrawal tracking (true on-chain TVL flows) requires parsing Solana transactions against Pacific's vault program — tracked as a follow-on in the **Deposit Tracking** section below.

## Signal Definitions

### `LIQUIDATION_CASCADE`

**Trigger:** OI drops >10% within a 2h window AND price moved >2% in same direction

**Rationale:** When longs get liquidated, OI drops and price falls. When shorts get liquidated, OI drops and price rises. Correlated OI-drop + price-move is the best proxy available from the REST API.

**Weight:** 7 (single market, <$1M estimated) → 9 (multi-market or >$5M estimated)

**Metadata:**
```json
{
  "symbol": "BTC",
  "oi_before": "3800000",
  "oi_after": "3200000",
  "oi_drop_usd": "600000",
  "oi_drop_pct": "15.8",
  "price_move_pct": "-8.2",
  "side_liquidated": "long",
  "mark_price": "87000",
  "timestamp": 1759222967974
}
```

### `OI_SURGE`

**Trigger:** OI increases >25% within a 2h window

**Weight:** 6

**Metadata:**
```json
{
  "symbol": "ETH",
  "oi_before": "1200000",
  "oi_after": "1600000",
  "oi_increase_usd": "400000",
  "oi_increase_pct": "33.3",
  "mark_price": "3200",
  "funding_rate": "0.00008",
  "timestamp": 1759222967974
}
```

### `FUNDING_SPIKE`

**Trigger:** Funding rate exceeds 0.01%/hr (annualized ~87.6%)

**Weight:** 8 (>0.01%/hr) → 9 (>0.05%/hr)

**Metadata:**
```json
{
  "symbol": "BTC",
  "funding_rate": "0.00015",
  "funding_rate_annualized": "131.4",
  "next_funding": "0.00018",
  "open_interest": "3600000",
  "timestamp": 1759222967974
}
```

## Database Changes

### New table: `pacific_tracked`

Stores last-seen OI/price/funding per symbol for delta detection.

```sql
CREATE TABLE pacific_tracked (
  symbol         text PRIMARY KEY,
  open_interest  numeric,
  volume_24h     numeric,
  mark_price     numeric,
  funding_rate   numeric,
  oi_previous    numeric,       -- OI at last signal emission
  last_signalled_at timestamptz,
  updated_at     timestamptz DEFAULT now()
);
```

## Deposit & Withdrawal Tracking (Follow-on)

True deposit/withdrawal stats require on-chain data. Pacific users deposit USDC collateral into Pacific's Solana program vaults.

**Approach options:**
1. **On-chain parsing** — Watch Pacific's vault program address for deposit/withdrawal instructions. Requires Solana RPC + transaction parsing (similar to `packages/collectors/src/nansen/`).
2. **Pacific stats endpoint** — Request that Pacific add `/api/v1/stats` returning daily deposit/withdrawal volumes. File request with Pacific team.
3. **TVL proxy** — Track total OI across all markets as a rough TVL proxy (OI growth ≈ more capital deposited). Approximate but immediate.

**Decision:** Start with TVL proxy in this issue (OI_SURGE catches it indirectly). File separate issue for on-chain vault parsing once we have a Solana RPC connection.

## Files

- `supabase/migrations/20260402_pacific_tracked.sql` — Table for OI snapshots
- `packages/collectors/src/pacific/utils.ts` — Formatting helpers
- `packages/collectors/src/pacific/discovery.ts` — Main collector (2h cron)
- `packages/collectors/src/polymarket/signal-types.ts` — Add `PACIFIC` source + new types
- `packages/collectors/src/index.ts` — Wire up `startPacificDiscoveryCron()`

## Acceptance

- [ ] `pacific_tracked` table exists in Supabase
- [ ] `LIQUIDATION_CASCADE` signals appear in `signals` table after OI drops
- [ ] `OI_SURGE` signals appear after OI spikes
- [ ] `FUNDING_SPIKE` signals appear when funding exceeds 0.01%/hr
- [ ] PM2 runs `myboon-pacific-discovery` every 2h

## Dependencies

- Resolves part of: #051 (Pacific Collectors)
- Resolves signal design for: #057 (Pacific Signal Design)
- Blocks: #055 (Pacific Brain — needs signals to exist first)

## Reference

- `docs/PACIFIC-INTEGRATION.md` — API endpoints
- `packages/shared/src/pacific/client.ts` — `getPrices()` returns OI, funding, volume
- `packages/collectors/src/polymarket/discovery.ts` — Pattern to follow
