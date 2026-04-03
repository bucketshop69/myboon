# #067 — Price Monitoring Service (Loss Cut / Alerts)

## Status: BACKLOG

## Problem

#064 defines loss cut (stop-loss) for prediction market positions. The client-side MVP (poll price in a `setInterval`) only works while the app is in the foreground. For a real stop-loss that executes while the user is offline, we need a server-side price monitoring service.

This also enables future features: price alerts, position alerts, and automated trading triggers.

## Depends On

- **#065 v2 done** — CLOB Auth (need stored API keys to execute sell orders server-side)
- **#066 done** — Order Execution Pipeline (need order submission flow)

## Scope

### 1. Stop-loss registration API

```
POST /predict/stop-loss
{
  "address": "0x...",           // user's Polymarket address
  "tokenId": "abc123",          // CLOB token ID
  "slug": "market-slug",
  "side": "YES",
  "triggerPrice": 0.30,         // sell when price drops to this
  "shares": 250                 // how many shares to sell
}

DELETE /predict/stop-loss/:id   // cancel a stop-loss
GET /predict/stop-loss/:address // list active stop-losses
```

### 2. Server-side price monitor

Worker process (PM2) that:
1. Reads all active stop-loss orders from DB
2. Groups by token ID, subscribes to Polymarket WebSocket (or polls every 30s)
3. When price ≤ trigger price → execute market sell via CLOB
4. Updates stop-loss record: `status = 'triggered'`, saves execution details
5. Sends push notification to user

### 3. Database table

```sql
CREATE TABLE predict_stop_losses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,           -- Polymarket Polygon address
  token_id text NOT NULL,
  slug text NOT NULL,
  side text NOT NULL,              -- YES or NO
  trigger_price numeric NOT NULL,
  shares numeric NOT NULL,
  status text NOT NULL DEFAULT 'active',  -- active, triggered, cancelled, failed
  created_at timestamptz DEFAULT now(),
  triggered_at timestamptz,
  execution_details jsonb          -- order response from CLOB
);
```

### 4. Push notifications

- Use `expo-notifications` for push tokens
- Register push token on app launch, store in DB
- On stop-loss trigger: send push "Loss cut triggered: sold 250 YES shares of [market] at $0.30"

## MVP alternative (client-side only)

If the server-side approach is too heavy for now:
- Store stop-loss config in AsyncStorage
- Background task via `expo-task-manager` polls prices every 60s
- Execute sell if threshold hit
- Limitation: only works on Android background tasks; iOS kills background tasks aggressively

## Files

```
packages/api/src/index.ts                          — add stop-loss CRUD endpoints
packages/api/src/price-monitor.ts                  — new: price monitoring worker
supabase/migrations/xxx-stop-losses.sql            — new: predict_stop_losses table
apps/hybrid-expo/features/predict/predict.api.ts   — add createStopLoss(), cancelStopLoss()
ecosystem.config.cjs                               — add PM2 process for price monitor
```

## Acceptance

- [ ] User can create a stop-loss via API
- [ ] Server worker monitors prices for all active stop-losses
- [ ] When price hits threshold, market sell order is submitted
- [ ] Stop-loss status updated to 'triggered' with execution details
- [ ] Push notification sent to user on trigger
- [ ] User can cancel an active stop-loss
- [ ] User can list their active stop-losses
