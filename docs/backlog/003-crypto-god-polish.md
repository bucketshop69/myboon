# Backlog #003 — crypto_god Polish + Pacific Collector Deployment

Consolidates remaining items from #059 (crypto_god) and the deployment tail of #058 (Pacific collectors).

## From #059 — crypto_god remaining

- [ ] Verify `POSITIONING` draft leads with USD OI increase and percentage (SOL was skipped by ranker in e2e test — needs a run where POSITIONING is the top pick to confirm the format)
- [ ] Broadcaster hard-rejects same `{symbol}:WIPEOUT` if posted in last 24h — write a test that inserts a `status='posted'` row for the same fingerprint and confirms hard_reject
- [ ] `why_skipped` written back to `signals.skip_reasoning` for all un-picked signals — confirm in DB after a real run
- [ ] `https://pacifica.fi` appended to approved `draft_text` in DB — confirm in DB after a real run
- [ ] PM2 `myboon-crypto-god` starts cleanly: `pm2 start ecosystem.config.cjs --only myboon-crypto-god`
- [ ] Run completes with `[crypto_god] Run complete.` when no new signals present (no crash on empty signal batch)

## From #058 — Pacific collector deployment

- [ ] `pacific_tracked` table created in Supabase — run `supabase/migrations/20260402_pacific_tracked.sql`
- [ ] PM2 `myboon-pacific-discovery` starts and runs every 2h — confirms real signals (`LIQUIDATION_CASCADE`, `OI_SURGE`, `FUNDING_SPIKE`) appear in `signals` table

## Note on #057

Signal design fully resolved when #058 was implemented — thresholds, weights, and metadata schemas are all encoded in the collector. #057 is closed.
