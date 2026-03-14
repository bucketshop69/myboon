# #032 — Delta-Based Discovery (Kill the Noise)

## Problem

`discovery.ts` runs every 2 hours and fires a `MARKET_DISCOVERED` signal for every market it finds — all 20+ top markets plus all pinned markets, every single run. Most of these markets haven't changed. The analyst receives hundreds of `MARKET_DISCOVERED` signals per day that add no new information.

Estimated noise: ~240 MARKET_DISCOVERED signals/day, ~90% are redundant.

## Goal

Discovery only fires a signal when something actually changed:
- A market is genuinely new (not seen before)
- Volume jumped significantly (>20% since last check)
- Market is approaching resolution (end_date within 48h)

The `polymarket_tracked` upsert still happens every run (keeps prices fresh). Only the signal insert is gated.

## Scope

- `packages/collectors/src/polymarket/discovery.ts`

## Changes

### 1. Add `volume_previous` and `last_signalled_at` to `polymarket_tracked`

```sql
ALTER TABLE polymarket_tracked ADD COLUMN IF NOT EXISTS volume_previous NUMERIC DEFAULT 0;
ALTER TABLE polymarket_tracked ADD COLUMN IF NOT EXISTS last_signalled_at TIMESTAMPTZ;
```

### 2. Delta detection logic

Before inserting a `MARKET_DISCOVERED` signal, check:

```
is_new         = market was not in polymarket_tracked before this upsert
volume_delta   = (current_volume - previous_volume) / previous_volume
approaching    = end_date is within 48h AND has not been signalled in last 6h
```

Only insert a signal if:
- `is_new` → signal type: `MARKET_DISCOVERED`
- `volume_delta > 0.20` → signal type: `VOLUME_SURGE`, metadata includes delta %
- `approaching` → signal type: `MARKET_CLOSING`, metadata includes end_date and current yes_price

### 3. Update `polymarket_tracked` upsert

After a signal is fired, update `last_signalled_at = now()` and `volume_previous = current_volume` so the next run has a baseline.

### 4. Remove redundant MARKET_DISCOVERED noise

The daily `MARKET_DISCOVERED` signal for a stable market that's been tracked for weeks provides zero information to the analyst. Stopping this insert is the single highest-leverage noise reduction.

## New Signal Types

| Type | Meaning | When |
|---|---|---|
| `MARKET_DISCOVERED` | Market not seen before | First time a conditionId appears |
| `VOLUME_SURGE` | Volume up >20% since last check | Any discovery run |
| `MARKET_CLOSING` | Market resolves within 48h | Once per 6h max |

## Acceptance Criteria

- [ ] Repeated `runDiscovery()` calls on stable markets produce 0 new `MARKET_DISCOVERED` signals
- [ ] New market (not in `polymarket_tracked`) produces exactly 1 `MARKET_DISCOVERED` signal
- [ ] Volume surge >20% produces a `VOLUME_SURGE` signal with delta % in metadata
- [ ] `polymarket_tracked` prices are still updated every run regardless of signal gate
