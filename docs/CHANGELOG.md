# Changelog

## 2026-03-17

### Collector fixes

- **CLOB API for slug resolution** — replaced Gamma API with `clob.polymarket.com/markets/{conditionId}` in `user-tracker.ts`. Gamma's `condition_id` filter was silently returning a default sorted list instead of the requested market, causing every whale bet to resolve to the same wrong slug (Biden COVID market). CLOB returns the exact market by conditionId with `market_slug` field.

- **conditionId mismatch guard** — added validation in `user-tracker.ts` that rejects any Gamma response where the returned `conditionId` doesn't match the requested one. Guard now redundant with CLOB switch but retained as a safety net.

- **Flushed 1,526 bad signals** — all signals with `slug = 'will-joe-biden-get-coronavirus-before-the-election'` marked `processed = true` in Supabase to prevent analyst from re-processing stale bad data.

### Signal pipeline improvements (#031–#035)

- **Slug as write-time invariant** — slug resolved at signal insertion, fail loud if unresolvable (`validate-signal.ts` guard)
- **Delta-based discovery** — `MARKET_DISCOVERED` only fires on new markets; added `VOLUME_SURGE` (>20% delta) and `MARKET_CLOSING` (48h deadline) signal types
- **Market context builder** — `context-builder.ts` pre-aggregates per-market state (price, volume, whale bets) before analyst LLM call
- **Publisher topic cap** — max 7 published narratives per topic tag per 24h; `thread_id` UUID FK links related narratives
- **Wallet win rate tracking** — `polymarket_wallets` table tracks bet count, win rate (computed at ≥5 resolved bets), total volume per wallet

### DB migrations (run in Supabase SQL editor)

- `031-slug-column.sql` — adds `slug TEXT` column + index to `signals`
- `032-delta-discovery.sql` — adds `volume_previous` and `last_signalled_at` to `polymarket_tracked`
- `034-thread-id.sql` — adds `tags TEXT[]` and `thread_id UUID` FK to `published_narratives`
- `035-wallets.sql` — creates `polymarket_wallets` table

---

## 2026-03-09

### Hackathon submission complete

- All three brain layers live on VPS (Analyst, Publisher, Collector)
- API live at VPS:3000 — `/narratives`, `/predict/*`, `/predict/sports/*`
- Expo mobile app built — Feed, Predict, Swap, Trade tabs
- App rebranded to **myboon** (`xyz.myboon.app`)
