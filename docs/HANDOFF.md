# Handoff — 2026-03-06

## What Was Done This Session

### Polymarket Collector (packages/collectors) — LIVE on VPS

- Discovery: fetches top 20 markets by volume every 2h, merges with pinned.json, filters expired
- Stream: WebSocket /ws/market, emits ODDS_SHIFT on >5% price move
- User tracker: polls 18 whale addresses every 5min, emits WHALE_BET
- Noise filter: skips `updown` slug markets (5-min binary crypto bets)
- Whale threshold: skips bets under $50, weight scales by amount (4/6/8/10)
- Supabase tables live: `signals`, `polymarket_tracked`
- `processed` column added to signals — analyst marks true after reading

### Narrative Analyst (packages/brain) — RUNNING LOCALLY

- Fetches unprocessed signals from Supabase every 15min
- Sends to MiniMax M2.5 for narrative clustering
- Prints terminal report + appends to reports/narratives.csv
- Marks signals processed=true after each run
- Full wallet addresses passed to LLM (no truncation)
- Output quality confirmed good from overnight CSV data

### Docs

- ARCHITECTURE.md written — product vision, brain layers, data flow, decisions log
- PROCESS.md rewritten — lean workflow, reviewer agent rule
- MEMORY.md updated

---

## What's Next (in order)

1. **Narratives → Supabase** — update narrative-analyst.ts to write to `narratives` table instead of CSV. Create the table first in Supabase SQL editor.
2. **Publisher brain** — reads narratives (status=draft), picks best 3-5, marks published
3. **Feed API endpoint** — serves published narratives (simple REST)
4. **Mobile Feed tab** — Expo app, reads from Feed API
5. **Influencer brain** — X post drafts, human approves manually to start

---

## Open Items

- Supabase `narratives` table not created yet — needs to happen before #1 above
- VPS collector stopped for now — restart when ready to collect fresh data
- reports/narratives.csv has good sample data from 2026-03-05 session
- Kalshi as signal source not started
- On-chain signals not yet routed to Supabase signals table
- X API collector not started

---

## Credentials (in .env files only — never committed)

All credentials live in:

- `packages/collectors/.env`
- `packages/brain/.env`

Both gitignored. See MEMORY.md for values if needed.
