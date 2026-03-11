# myboon — Architecture & Product Vision

## The Product

A mobile-first narrative intelligence app for on-chain traders and prediction market participants.

**Four tabs:**

| Tab | What | Revenue |
|-----|------|---------|
| Feed | Curated narrative intelligence — on-chain + Polymarket + Kalshi signals | x402 API for external consumers |
| Trade | Perps via Pacific SDK (Solana) | Fee share |
| Swap | Jupiter SPL token swap | Fee share |
| Predict | Polymarket via builder code | Affiliate % |

**X account** — auto-posts top narratives surfaced by the influencer brain. Distribution flywheel.

**The moat:** insights. Trade/Swap/Predict are commodities. The Feed is the differentiator — it tells users something they can't get anywhere else. Everything else exists because the Feed earns trust.

---

## Hackathon Plan (near-term)

Mobile app with Feed live, Predict live (list + detail), and Swap in GET-preview mode. Trade remains WIP. Clean demo story:
> "This feed is powered by on-chain signals + prediction market intelligence + a multi-agent brain."

---

## Data Architecture

```
Signal Sources                 Supabase                    Consumers
──────────────                 ────────                    ─────────
Polymarket collectors    →     signals table      →        Brain agents
  - discovery (2h REST)        narratives table   →        Feed API
  - stream (WebSocket)         (processed flag)   →        X posts
  - user tracker (5min)

On-chain stream (future) →     signals table
  - 90 wallet registry
  - tx-parser output

X API (future)           →     signals table
Kalshi (future)          →     signals table
```

**Signals table** — shared intake for all sources. Every collector writes same shape:

```
source: 'POLYMARKET' | 'ONCHAIN' | 'X' | 'KALSHI'
type:   'MARKET_DISCOVERED' | 'ODDS_SHIFT' | 'WHALE_BET' | ...
topic:  string (market question / token / event)
weight: 1-10
metadata: jsonb (source-specific fields)
processed: boolean (false = not yet read by analyst)
```

**Narratives table** — analyst output. Publisher reads this.

```
cluster:           string (narrative title)
observation:       string (analyst note)
score:             1-10
signal_count:      int
signals_snapshot:  jsonb
status:            'draft' | 'published' | 'rejected'
created_at:        timestamptz
```

---

## Brain Architecture

Three layers, each with planned redundancy (2 agents per layer for consensus):

```
Layer 1 — Analysts (runs every 15min)
  Reads: signals (processed=false)
  Does:  clusters signals into narratives, scores them
  Writes: narratives table (status='draft')
  Marks:  signals as processed=true

Layer 2 — Publishers (runs every 30min)
  Reads: narratives (status='draft')
  Does:  picks best 3-5, decides framing
  Writes: narratives (status='published')

Layer 3 — Influencers (runs every 2-4h)
  Reads: narratives (status='published')
  Does:  writes X post drafts (5-10/day)
  Writes: x_posts table (status='draft')
  Human approves before posting (initially)
```

**Current state:**

- Layer 1 (Analyst) ✅ — clusters signals, filters < 7 score before saving. Extracts market slugs deterministically from `key_signals` (`[slug: xxx]` patterns) and saves to `narratives.slugs[]`. Uses tool calling to fetch live market odds mid-analysis.
- Layer 2 (Publisher) ✅ — reads draft narratives (score >= 7), checks own `published_narratives` DB for duplicates/updates (`content_full` + `reasoning` returned for full context), scores each (>= 8 to publish). Builds `predict` actions from `narrative.slugs` in code (deterministic — no LLM guessing). LLM may add `perps` actions for crypto signals. Writes to `published_narratives` with `actions` array. `search_news` (Firecrawl) disabled pending replacement.
- Layer 3 (Influencer) — not started (issue 024)

**Next (frontend track):**

- Issue 027 — Hybrid Expo initialization foundation
- Issue 028 — Feed UI + client service layer
- Issue 029 — Swap UI + GET-only preview service
- Predict/Trade UI integration follows after these foundations

**Multi-agent consensus plan (post-MVP):**

- 2 analysts both save → publisher only picks narratives flagged by both
- 2 publishers agree → goes live
- Reduces noise, increases confidence in what reaches prod

---

## Packages

```
packages/
  shared/           Shared SDK — PolymarketClient, types (imported by brain, collectors, apps)
  tx-parser/        Solana tx parsing — Jupiter, Meteora, SOL transfers
  brain/            All LLM agents — classifier, research, analyst (live), publisher (live)
  collectors/       Data ingestion scripts — Polymarket (live), X (planned), Kalshi (planned)
  entity-memory/    In-memory entity store (pre-persistence MVP)
```

---

## Infrastructure

- **Runtime:** Node.js / TypeScript (ESM)
- **Database:** Supabase (Postgres) — shared between VPS collectors and local brain
- **LLM:** MiniMax M2.5 via Anthropic-compatible API
- **Collectors run on:** US VPS (Polymarket geo-restricted)
- **Brain agents run on:** Local (dev) → VPS (prod)
- **Mobile:** Expo (React Native)
- **Monorepo:** pnpm workspaces
- **Process manager:** PM2 — `ecosystem.config.cjs` at monorepo root starts all 4 services in one command (`pm2 start ecosystem.config.cjs`); auto-restarts on crash; survives reboots via `pm2 startup`. See `docs/DEPLOY.md`.

---

## Collector Details

### Polymarket Collector (`packages/collectors/src/polymarket/`)

- `discovery.ts` — fetches top 20 markets by volume every 2h, merges with `pinned.json`, filters expired
- `stream.ts` — WebSocket `/ws/market`, emits `ODDS_SHIFT` on >5% price move
- `user-tracker.ts` — polls 18 tracked whale addresses every 5min, emits `WHALE_BET` (min $50, weight scaled by amount, filters `updown` noise markets)
- `pinned.json` — hand-picked market slugs (Iran conflict cluster, etc.)
- `tracked-users.json` — 18 whale wallet addresses

### How signals reach the `signals` table

Three paths, all write the same shape:

**Path 1 — `discovery.ts` (every 2h)**
```
pinned.json (curated slugs) + Polymarket top 20 by volume
    → upsert into polymarket_tracked (slug, title, token_id, yes/no price)
    → insert MARKET_DISCOVERED signal
       metadata: { slug ✅, volume, yes_price, no_price }
```

**Path 2 — `stream.ts` (WebSocket, persistent)**
```
polymarket_tracked (populated by discovery — must run first)
    → subscribe to all token_ids via WebSocket
    → on price move > 5%: insert ODDS_SHIFT signal
       metadata: { slug ✅, yes_price, shift_from, shift_to }
```

**Path 3 — `user-tracker.ts` (every 5min)**
```
tracked-users.json (18 whale wallets)
    → poll data-api.polymarket.com/activity per wallet
    → for each new bet:
        resolve slug from polymarket_tracked by conditionId (Gamma API fallback)
        insert WHALE_BET signal
        metadata: { slug ✅, user, amount, side, outcome, marketId }
```

### Filtering Rules

- Markets with `endDate` in the past → skipped
- `updown` slug pattern → noise, skipped
- Bet amount < $500 → skipped
- Bet weight: $500-1999=6, $2000-9999=8, $10k+=10

---

## API Layer (`packages/api`) — LIVE

Hono server, runs on VPS alongside collectors and brain. All Polymarket calls proxied through VPS to bypass geo-restriction.

**Feed endpoints:**

- `GET /health` — liveness
- `GET /narratives` — published narratives list (limit 20, priority desc)
- `GET /narratives/:id` — full narrative detail

**Predict endpoints (curated markets only — edit `src/curated.ts`):**

- `GET /predict/markets` — curated geopolitics markets with live yes/no prices
- `GET /predict/markets/:slug` — single curated geopolitics market detail (404 if not curated)
- `GET /predict/sports/:sport` — dynamic sports market list (`epl`, `ucl`) with 3-way outcomes
- `GET /predict/sports/:sport/:slug` — full sports market detail with per-outcome best bid/ask
- `GET /predict/history/:tokenId?interval=1m|5m|1h|1d` — 7-day price history (strict interval validation)
- `POST /predict/order` — forward signed order to Polymarket CLOB
- `GET /predict/orders/:address` — user open orders
- `GET /predict/price/:tokenId` — best buy/sell price

**Smoke test:** `API_BASE=http://localhost:3000 pnpm --filter @myboon/api smoke`

x402 micropayments on Solana — post-MVP.

---

## Mobile App (`apps/hybrid-expo`) — CURRENT

Expo Router stack with Predict detail routes:

- `/` Feed (live data from API)
- `/predict` live markets feed (geopolitics + sports)
- `/predict-market/[slug]` geopolitics market detail
- `/predict-sport/[sport]/[slug]` sports market detail
- `/swap` interactive preview screen (no execution)
- `/trade` placeholder screen

Service layer split:

- Feed service (`features/feed/feed.api.ts`) consumes `GET /narratives`
- Predict service (`features/predict/predict.api.ts`) consumes curated/sports list + detail endpoints
- Swap service (`features/swap/swap.api.ts`) consumes Jupiter GET endpoints (`tokens`, `price`, `quote`)

Execution policy:

- Swap CTA remains non-transactional (`COMING SOON`)
- No wallet signing or on-chain submit in current phase

---

## Deployment & APK Note

- This architecture doc defines product/system design, not release operations.
- Mobile deployment and APK build flow (EAS profiles, Android APK generation, release cadence) are tracked separately in implementation/runbook issues.
- Current frontend milestone is local/dev validation first; production mobile release pipeline is next-phase work.

---

## X Account Strategy

- Influencer brain produces draft posts from published narratives
- Human approves manually to start
- Goal: 5-10 posts/day
- Posts link back to app Feed for full context

---

## Key Decisions Log

| Decision | Reasoning |
|----------|-----------|
| Supabase over local Postgres | Shared between VPS collectors and local brain without VPN |
| MiniMax over OpenAI | Cost — ~$0.54/month vs much higher |
| Collectors separate from brain | Different runtime concerns, brain is LLM-heavy, collectors are persistent network processes |
| CSV → Supabase for narratives | CSV was for testing only, narratives need to be queryable by API |
| Feed-first for hackathon (with swap preview) | Differentiator is insights; swap preview is UX scaffolding without execution risk |
| Publisher brain before influencer | Single pipeline must work before adding consensus/redundancy |
