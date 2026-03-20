# #035 — Wallet Win Rate Tracking

## Problem

Currently all whale wallets are treated equally. A wallet that has been right 70% of the time is weighted the same as a wallet that got lucky once. The analyst has no way to know which bets are from credible predictors vs noise.

This means the feed surfaces bets from weak predictors with the same urgency as bets from validated callers.

## Goal

Track win rate per wallet. Surface wallet credibility in signals so the analyst can weight bets accordingly.

Win rate = resolved markets where the wallet bet correctly / total resolved markets the wallet bet on.

## Scope

- New file: `packages/collectors/src/polymarket/wallet-tracker.ts`
- Modified: `packages/collectors/src/polymarket/user-tracker.ts` — include wallet stats in signal metadata
- DB migration

## DB Migration

Run manually via SQL editor:

```sql
CREATE TABLE IF NOT EXISTS wallets (
  address         TEXT PRIMARY KEY,
  label           TEXT,                         -- 'tracked-whale' | 'validated-caller' | 'unknown'
  total_bets      INT DEFAULT 0,
  resolved_bets   INT DEFAULT 0,                -- bets on markets that have since resolved
  correct_bets    INT DEFAULT 0,                -- resolved bets where wallet was on winning side
  win_rate        NUMERIC(4,2),                 -- correct_bets / resolved_bets, null if < 5 resolved
  total_volume    NUMERIC(14,2) DEFAULT 0,
  last_active     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

## How Win Rate Is Computed

Polymarket markets resolve with an outcome (YES or NO). When a market resolves:

1. Query `signals` for all WHALE_BETs on that `marketId`
2. For each wallet that bet, check if their `outcome` matches the resolved outcome
3. Increment `correct_bets` or just `resolved_bets` accordingly
4. Recompute `win_rate = correct_bets / resolved_bets` (only if `resolved_bets >= 5`)

The Polymarket Gamma API returns `resolution` and `resolved_outcome` on resolved markets. Discovery already fetches market data — add a check for `market.resolution !== null`.

## Changes

### 1. `wallet-tracker.ts` — resolution check on discovery

During each discovery run, check if any tracked markets have resolved since last check. For resolved markets, walk the `signals` table and update wallet stats.

Keep this as a lightweight addition to `discovery.ts` — not a new process.

### 2. `user-tracker.ts` — upsert wallet on each bet

When a WHALE_BET signal is created, upsert the wallet into `wallets`:

- Increment `total_bets` and `total_volume`
- Set `last_active = now()`
- Set `label = 'tracked-whale'` if in `tracked-users.json`

### 3. Signal metadata includes wallet stats

When building the WHALE_BET signal, include wallet stats in metadata:

```ts
metadata: {
  user: address,
  amount: rawAmount,
  side: activity.side,
  outcome: activity.outcome,
  marketId: conditionId,
  walletTotalBets: walletStats?.total_bets ?? 0,
  walletWinRate: walletStats?.win_rate ?? null,   // null = not enough data
  walletLabel: walletStats?.label ?? 'unknown',
}
```

### 4. Analyst prompt update

When win_rate is available, the context builder (#033) should surface it in `MarketContext.recentBets`:

```json
{
  "wallet": "0x63ce...",
  "walletLabel": "tracked-whale",
  "walletWinRate": 0.73,
  "amount": 1958,
  "side": "buy",
  "outcome": "YES"
}
```

The analyst system prompt should note: "walletWinRate >= 0.65 with >= 10 resolved bets indicates a validated caller — weight this signal heavily."

## Acceptance Criteria

- [ ] `wallets` table exists and is populated by user-tracker on each bet
- [ ] `win_rate` is computed and stored once a wallet has >= 5 resolved bets
- [ ] WHALE_BET signal metadata includes `walletLabel`, `walletWinRate`, `walletTotalBets`
- [ ] Analyst context builder surfaces win rate in `MarketContext.recentBets`
