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

Pacific collectors       →     signals table      →        Brain agents
  (planned #051)           (FUNDING_SPIKE,
  - discovery (2h REST)     ODDS_SHIFT, VOLUME_SURGE)
  - stream (WebSocket)

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
- Layer 2 (Publisher) ✅ — LangGraph `publisher-graph`: publisher node → critic/editor reflection loop (up to 2 revision attempts). Publisher = Editor-in-Chief (research + editorial judgment). Critic = Senior Editor (clarity, angle freshness, lead quality, classification, tone). Sports narratives skip search tools, write from signal data only. Builds `predict` actions from `narrative.slugs` deterministically; LLM may add `perps` actions for crypto signals. MiniMax M2.7 with 8192 max_tokens. `search_news` (Firecrawl) disabled; replaced by `search_published` + `get_tag_history` Supabase tools.
- Layer 3 (Influencer) ✅ — reads `published_narratives` from last 4h that have no `x_post` yet. LangGraph `influencer-graph` generates X post drafts. Writes to `x_posts` table (`status='draft'`). Human reviews manually before any post goes live. PostgREST two-step query (no raw SQL subqueries).
- Content type taxonomy ✅ — `ContentType` = `fomo | signal | sports | macro | news | crypto`. Flows from analyst output → narratives table → publisher → published_narratives → influencer. DB CHECK constraint updated. Each agent (analyst, publisher, critic, influencer) classifies and routes per content_type. Default is `signal` (not `fomo`) to avoid misclassifying geopolitical content as whale alerts.

- Layer 3b (sports_broadcaster) ✅ — **sports content pipeline** (issue #050). Runs hourly via PM2 cron. Loads `sports-calendar.json` (UCL/EPL fixtures). Phase detection per match: `preview` (T-26h to T-2h), `live` (T to T+6h), `post_match` (T+6h to T+12h). Registers calendar slugs in `polymarket_tracked` T-24h before kickoff via Dome API. Deduplicates via `x_posts.slug + agent_type = 'sports_broadcaster_{phase}'`. LangGraph `sportsBroadcasterGraph` (`write → broadcast → resolve → save`): writer has distinct voice per phase; broadcaster hard-rejects hype, enforces odds presence + tension lead (max 2 retries on soft_reject). Odds fetched via Dome API (`api.domeapi.io/v1`) — geo-unrestricted, batch per match. Match-aware collector (`match-watcher.ts`) polls `data-api.polymarket.com/activity` every 5min for all calendar slugs within watch window, writes `WHALE_BET` signals with `source: 'match-watcher'`. Sports signals filtered from `fomo_master` and `narrative-analyst` to prevent duplicate coverage. Phase 3 (post-match close-out) deferred to backlog #002.

- Layer 3b (fomo_master) ✅ — **specialized broadcast floor** (issues #047, #048). Runs hourly via PM2 cron. Reads `WHALE_BET` signals (weight ≥ 8, last 4h) directly — no narrative layer. LangGraph `fomo-master-graph`: `rank → write → broadcast → resolve` loop. Runner does all deterministic enrichment before graph: slug clustering (one representative per market), Nansen bettor profile (cached 24h), live Polymarket odds (no cache), market_history (7d signal aggregate). Ranker picks 1-3 best stories using explicit framework (contrarian conviction > wallet credibility > pattern > size > timing). Writer classifies each signal by archetype (CONTRARIAN / CLUSTER / AUTHORITY / FRESH_WALLET / GENERAL — first match wins on live_odds, cluster_context, nansen_profile) then writes 4-5 line observational posts: build tension through facts, end with implication. `slug` attached deterministically from `signal.metadata.slug` in writeNode (never from LLM). `chief_broadcaster` reviews all drafts in one batch — 3-way decision: approved / soft_reject (max 2 retries) / hard_reject. Duplicate detection uses angle fingerprint `{slug}:{archetype}` — same market with different archetype is a fresh story. Only `status='posted'` records count toward frequency limits. Approved drafts save as `status='draft'`. Polymarket profile URL appended in code, never by LLM. `why_skipped` written back to `signals.skip_reasoning` after each run.

**Next (pipeline track):**

- Issue #042 — Nansen intelligence layer: wallet PnL via Nansen CLI enriches analyst signal weights
- Issue #044 — Nansen slug gap fix: PM_EVENT_TRENDING and PM_BETTOR_ACTIVITY dedup + slug enrichment
- Issue #041 (influencer graph) + #043 (critic/influencer quality) — content pipeline improvements
- `sports_analyst` + `macro_analyst` — Phase 3 of broadcast floor (see #047)

**Multi-agent consensus plan (post-MVP):**

- 2 analysts both save → publisher only picks narratives flagged by both
- 2 publishers agree → goes live
- Reduces noise, increases confidence in what reaches prod

---

## Packages

```
apps/
  hybrid-expo/      Mobile app — Expo Router, Feed/Predict/Swap/Trade tabs (live)
  web/              Landing page — Next.js 15 App Router (@myboon/web, port 3001)

packages/
  shared/           Shared SDK — PolymarketClient, PacificClient (REST+WebSocket), types
  tx-parser/        Solana tx parsing — Jupiter, Meteora, SOL transfers
  brain/            All LLM agents — classifier, research, analyst (live), publisher (live)
  collectors/       Data ingestion scripts — Polymarket (live), Pacific (planned), X/Kalshi (planned)
  entity-memory/    In-memory entity store (pre-persistence MVP)
```

---

## Infrastructure

- **Runtime:** Node.js / TypeScript (ESM)
- **Database:** Supabase (Postgres) — shared between VPS collectors and local brain
- **LLM:** MiniMax M2.7 via Anthropic-compatible API (`api.minimax.io/anthropic`)
- **Collectors run on:** US VPS (Polymarket geo-restricted)
- **Brain agents run on:** Local (dev) → VPS (prod)
- **Mobile:** Expo (React Native) — `apps/hybrid-expo`
- **Landing page:** Next.js 15 App Router — `apps/web` (`pnpm --filter @myboon/web dev`, port 3001)
  - `/` — Hero section (phone mockup + floating tab cards)
  - `/world` — Interactive pixel art newsroom (Canvas 2D, scroll-to-zoom, drag-to-pan)
- **Monorepo:** pnpm workspaces
- **Process manager:** PM2 — `ecosystem.config.cjs` at monorepo root starts all 4 services in one command (`pm2 start ecosystem.config.cjs`); auto-restarts on crash; survives reboots via `pm2 startup`. See `docs/DEPLOY.md`.

---

## Collector Details

### Polymarket Collector (`packages/collectors/src/polymarket/`)

- `discovery.ts` — fetches top 20 markets by volume every 2h, merges with `pinned.json`, filters expired
- `stream.ts` — WebSocket `/ws/market`, emits `ODDS_SHIFT` on >5% price move
- `user-tracker.ts` — polls 18 tracked whale addresses every 5min, emits `WHALE_BET` (min $500, weight scaled by amount, filters `updown` noise markets)
- `match-watcher.ts` — polls `data-api.polymarket.com/activity` every 5min for all sports calendar slugs within T-24h to T+12h window. Writes `WHALE_BET` signals with `source: 'match-watcher'`. Complements `user-tracker` — covers any wallet, not just the tracked whitelist.
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
        resolve slug via CLOB API (/markets/{conditionId}) — exact match, no fallback
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
- `/trade` placeholder screen (Pacific perps integration planned #053)

Service layer split:

- Feed service (`features/feed/feed.api.ts`) consumes `GET /narratives` + `GET /narratives/:id` + `GET /predict/markets/:slug`
- Predict service (`features/predict/predict.api.ts`) consumes curated/sports list + detail endpoints
- Swap service (`features/swap/swap.api.ts`) consumes Jupiter GET endpoints (`tokens`, `price`, `quote`)
- Perps service (planned #053) — will consume Pacific markets, prices, positions via `PacificClient`

Feed card design:

- No title — `content_small` is the only card text
- Category pill derived from `tags[0]` (raw tag from API, e.g. `ucl`, `iran`, `macro`)
- Tap opens `NarrativeSheet` — bottom sheet with `content_full` + prediction market odds block (if `actions` contains `type: 'predict'`)
- Prediction block renders up to 3 predict actions per narrative (first 3 slugs)
- Slug routing: `ucl-*`, `epl-*` etc. → `GET /predict/sports/:sport/:slug` (multi-outcome); all others → `GET /predict/markets/:slug` (binary)
- Binary block: YES/NO odds bars + price change pills (today, 1w) + resolves date + YES/NO CTAs → navigates to `/predict-market/[slug]`
- Sports block: team outcome bars (gold) + volume + View Market CTA → navigates to `/predict-sport/[sport]/[slug]`
- `GET /predict/markets/:slug` no longer gated to curated list — serves any valid Polymarket slug
- Resolved/inactive markets: predict block hidden silently (null fetch = no render)
- Filter chips removed — no category filtering in current phase

Execution policy:

- Swap CTA remains non-transactional (`COMING SOON`)
- YES/NO/View Market navigates to Predict tab detail — no order execution from Feed
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
| Pacific SDK in `packages/shared` (#052) | Reusable across collectors, API layer, and mobile app; TypeScript types + REST + WebSocket in one module |
| Dome API over Gamma for sports odds (#050) | Gamma API is geo-restricted (blocks US VPS). Dome (`api.domeapi.io/v1`) proxies Polymarket data without restriction — same odds, no geo block. Used for market registration and live odds in sports-broadcaster. |
