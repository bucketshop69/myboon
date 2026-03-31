# #057 — Pacific Signal Design Discussion

## Problem

We need to decide which Pacific signals matter for narratives and how they should be weighted.

**Current candidates:**
- `FUNDING_SPIKE` — Funding rate spikes (extreme positioning)
- `ODDS_SHIFT` — Price moves (>5%, >10%, >20%)
- `VOLUME_SURGE` — Volume up vs 7d average
- `LIQUIDATION_CASCADE` — Large liquidations (Pacific may not expose this yet)
- `OPEN_INTEREST_SURGE` — OI jumps (smart money positioning)

## Goal

Define the signal taxonomy for Pacific Protocol:

1. **Which signal types** should we emit?
2. **What thresholds** trigger each signal?
3. **Weight rules** — how significant is each signal (1-10)?
4. **Metadata schema** — what data should each signal include?

## Discussion Points

### 1. Signal Types

Which of these should we implement? Any others?

- [ ] `MARKET_DISCOVERED` — New market in top 20
- [ ] `ODDS_SHIFT` — Price move thresholds (5%, 10%, 20%?)
- [ ] `FUNDING_SPIKE` — Funding rate threshold (0.01%/hr? 0.05%/hr?)
- [ ] `VOLUME_SURGE` — Volume vs 7d avg (2x? 3x? 5x?)
- [ ] `OPEN_INTEREST_SURGE` — OI jump threshold?
- [ ] `LIQUIDATION_CASCADE` — If Pacific exposes this
- [ ] Other?

### 2. Weight Rules

How should we weight each signal (1-10)?

**Example framework:**
| Signal | Threshold | Weight |
|--------|-----------|--------|
| `ODDS_SHIFT` | 5-10% move | 6 |
| `ODDS_SHIFT` | 10-20% move | 8 |
| `ODDS_SHIFT` | >20% move | 10 |
| `FUNDING_SPIKE` | >0.01%/hr | 8 |
| `VOLUME_SURGE` | >2x avg | 7 |

**Your call:** What thresholds make sense?

### 3. Metadata Schema

What metadata should each signal include?

**Example for `FUNDING_SPIKE`:**
```json
{
  "symbol": "BTC",
  "funding_rate": "0.00015",
  "annualized_rate": "130.5",
  "previous_funding": "0.00005",
  "timestamp": 1716200000000
}
```

**Define metadata for each signal type.**

### 4. Cross-Market Clustering

Should Pacific signals cluster with related Polymarket markets automatically?

**Example:**
- Pacific: BTC funding spike
- Polymarket: "BTC > $100K by June"

**Should these auto-cluster?** Or should Analyst decide?

## Decision Format

Comment with your answers:

```
SIGNAL TYPES:
- ODDS_SHIFT: Yes, thresholds at 5%, 10%, 20%
- FUNDING_SPIKE: Yes, threshold at 0.01%/hr
- VOLUME_SURGE: Yes, threshold at 3x 7d avg
...

WEIGHTS:
- ODDS_SHIFT 5-10%: 6
- ODDS_SHIFT 10-20%: 8
- ODDS_SHIFT >20%: 10
...

METADATA:
- ODDS_SHIFT: { symbol, price_from, price_to, shift_percent, timeframe }
...
```

## Outcome

This decision will update:
- #051 (Collectors) — Signal emission logic
- #055 (Brain) — Signal interpretation rules

## Reference

- `docs/PACIFIC-INTEGRATION.md` — Pacific API details
- `docs/issues/051-pacific-collectors.md` — Current collector spec
