# myboon — Architecture & Product Vision

> **Last updated:** 2026-04-26 · Covers commits through `5c07623`

## The Product

A mobile-first narrative intelligence app for on-chain traders and prediction market participants.

**Four tabs:**

| Tab | What | Revenue |
|-----|------|---------|
| Feed | Curated narrative intelligence — on-chain + Polymarket + Kalshi signals | x402 API for external consumers |
| Trade | Perps via Pacific SDK (Solana) | Fee share |
| Swap | Jupiter SPL token swap | Fee share |
| Predict | Polymarket via builder code | Affiliate % |

**The moat:** insights. Trade/Swap/Predict are commodities. The Feed is the differentiator — it tells users something they can't get anywhere else. Everything else exists because the Feed earns trust.

---

## Current Milestone

All four tabs functional. Feed, Predict (full CLOB execution), and Trade (full perps execution) are production-ready. Swap remains preview-only. Cross-cutting polish (error boundaries, fonts, haptics, shared config) complete.

> **Demo story:** "Feed powered by on-chain signals + prediction market intelligence + multi-agent brain. Tap any market → trade it instantly via gasless wallet."

---

## Data Architecture

```
Signal Sources                 Supabase                    Consumers
──────────────                 ────────                    ─────────
Polymarket collectors    →     signals table      →        Brain agents
  - discovery (2h REST)        narratives table   →        Feed API
  - stream (WebSocket)         (processed flag)
  - user tracker (5min)
  - match watcher (5min)

Pacific collector        →     signals table      →        Brain agents
  - discovery (2h REST)     (FUNDING_SPIKE,
                             CROWDED_TRADE, POSITIONING)

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

Two editorial layers, with planned redundancy later if the single path proves reliable:

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
```

**Current state:**

- Layer 1 (Analyst) ✅ — clusters signals, filters < 7 score before saving. Extracts market slugs deterministically from `key_signals` (`[slug: xxx]` patterns) and saves to `narratives.slugs[]`. Uses tool calling to fetch live market odds mid-analysis.
- Layer 2 (Publisher) ✅ — LangGraph `publisher-graph`: publisher node → critic/editor reflection loop (up to 2 revision attempts). Publisher = Editor-in-Chief (research + editorial judgment). Critic = Senior Editor (clarity, angle freshness, lead quality, classification, tone). Sports narratives skip search tools, write from signal data only. Builds `predict` actions from `narrative.slugs` deterministically; LLM may add `perps` actions for crypto signals. MiniMax M2.7 with 8192 max_tokens. `search_news` (Firecrawl) disabled; replaced by `search_published` + `get_tag_history` Supabase tools.
- Content type taxonomy ✅ — `ContentType` = `fomo | signal | sports | macro | news | crypto`. Flows from analyst output → narratives table → publisher → published_narratives. DB CHECK constraint updated. Each feed agent classifies and routes per content_type. Default is `signal` (not `fomo`) to avoid misclassifying geopolitical content as whale alerts.
- X broadcast layer removed — the direct-to-`x_posts` agents (`influencer`, `fomo_master`, `crypto_god`, and `sports_broadcaster`) were removed after proving too noisy and duplicative. Feed is the only editorial source of truth; any future external distribution should be a thin adapter over `published_narratives`.

**Next (pipeline track):**

- Feed quality review loop — evaluate published narratives against outcomes and human usefulness.
- Pacific brain integration — route perps intelligence through the analyst/publisher path, not a separate broadcast path.

**Multi-agent consensus plan (post-MVP):**

- 2 analysts both save → publisher only picks narratives flagged by both
- 2 publishers agree → publish to Feed
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
  brain/            LLM agents — narrative analyst, publisher, intelligence scoring
  collectors/       Data ingestion scripts — Polymarket (live), Pacific (live), X/Kalshi (planned)
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
  - `/` — Hero (Framer Motion stagger entrance) → FeaturesScroll (sticky phone + 4 panels) → NewsroomSection (newsroom canvas inline)
  - `/world` — Standalone newsroom (deprecated banner; route kept alive)
- **Monorepo:** pnpm workspaces
- **Process manager:** PM2 — `ecosystem.config.cjs` at monorepo root starts the API, collectors, analyst, and publisher (`pm2 start ecosystem.config.cjs`); auto-restarts long-running services; survives reboots via `pm2 startup`. See `docs/DEPLOY.md`.

---

## Collector Details

### Polymarket Collector (`packages/collectors/src/polymarket/`)

- `discovery.ts` — fetches top 20 markets by volume every 2h via Gamma, merges with `pinned.json` (fetched via Dome API — supports both event slugs and single-market slugs), filters expired
- `stream.ts` — WebSocket `/ws/market`, emits `ODDS_SHIFT` on >5% price move
- `user-tracker.ts` — polls 18 tracked whale addresses every 5min, emits `WHALE_BET` (min $500, weight scaled by amount, filters `updown` noise markets)
- `match-watcher.ts` — polls `data-api.polymarket.com/activity` every 5min for all sports calendar slugs within T-24h to T+12h window. Writes `WHALE_BET` signals with `source: 'match-watcher'`. Complements `user-tracker` — covers any wallet, not just the tracked whitelist.
- `pinned.json` — hand-picked market slugs (crypto, macro, geopolitics, sports)
- `tracked-users.json` — 18 whale wallet addresses

### Pacific Collector (`packages/collectors/src/pacific/`)

- `discovery.ts` — fetches all Pacific perps markets every 2h, emits `FUNDING_SPIKE`, `CROWDED_TRADE`, `POSITIONING` signals based on funding rate and OI thresholds

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

**Predict endpoints (config-driven market collections — `src/curated.ts`):**

- `GET /predict/feed` — unified feed: pinned binary markets + EPL + IPL matches. Params: `category`, `sport`, `limit`. Filters `-more-markets` and `-exact-score` slugs. IPL deduped by team+date (keeps higher volume). Sort: live → upcoming → binary by volume.
- `GET /predict/markets` — curated geopolitics markets with live yes/no prices
- `GET /predict/markets/:slug` — any valid Polymarket slug (no longer gated to curated list)
- `GET /predict/sports/:sport` — dynamic sports market list (`epl`, `ipl`) with 3-way outcomes
- `GET /predict/sports/:sport/:slug` — full sports market detail with per-outcome best bid/ask
- `GET /predict/history/:tokenId?interval=1m|5m|1h|1d` — 7-day price history (strict interval validation)
- `POST /predict/order` — forward signed order to Polymarket CLOB
- `GET /predict/orders/:address` — user open orders
- `GET /predict/price/:tokenId` — best buy/sell price

**Sports match status detection (#47):**

Gamma API has a known bug where `active`/`closed` flags stay stale after sports matches end (rs-clob-client #199). `deriveMatchStatus()` uses multi-signal detection instead:

1. `closed` flag — if Gamma eventually flips it
2. `umaResolutionStatus` — `"proposed"` or `"resolved"` means outcome decided on-chain (UMA oracle)
3. Outcome prices — any outcome ≥ 0.995 means market is effectively resolved
4. Time elapsed — match can't be live after max duration (5h IPL T20, 3h EPL football)
5. `gameStartTime` vs now — upcoming/live fallback

Future: Sports WebSocket (`wss://sports-api.polymarket.com/ws`) for real-time match state — this is how Polymarket.com itself detects match end.

**CLOB proxy endpoints (read-only + execution):**

- `GET /clob/book/:tokenId` — order book
- `GET /clob/midpoint/:tokenId` — midpoint price
- `GET /clob/last-trade-price/:tokenId` — last trade price
- `GET /clob/markets` — CLOB markets list
- `POST /clob/wrap` — gasless USDC.e → pUSD wrapping
- `POST /clob/withdraw` — gasless withdraw (min $1)
- `POST /clob/cancel` — cancel open order

**Portfolio endpoints (Gamma data-api):**

- `GET /portfolio/:address` — user portfolio summary
- `GET /portfolio/:address/activity` — recent trade activity
- `GET /portfolio/:address/positions` — market positions

**Smoke test:** `API_BASE=http://localhost:3000 pnpm --filter @myboon/api smoke`

x402 micropayments on Solana — post-MVP.

---

## Mobile App (`apps/hybrid-expo`) — CURRENT

Expo Router stack with full execution on Predict and Trade tabs:

- `/` Feed (live data from API) — pull-to-refresh, pagination, skeleton loaders, live timeAgo
- `/predict` live markets feed (geopolitics + sports) — search, pull-to-refresh
- `/predict-market/[slug]` geopolitics market detail — 3-zone layout, tabs, bet slip, buy/sell execution
- `/predict-sport/[sport]/[slug]` sports market detail — sports bet slip (EPL), multi-outcome
- `/swap` interactive preview screen (no execution)
- `/trade` Pacific perps market list — asset strip (top 6 trending) + full table (#053 ✅)
- `/trade/[symbol]` Market detail — hero price (WebSocket live) + chart + order form (TP/SL) + Profile tab (wallet card, equity, open positions) + fixed action dock (Long/Short)

### CLOB Auth & Order Flow (Predict)

Solana-derived EVM key → gasless Safe wallet via Builder Relayer → local order signing on phone:

1. User authenticates — Solana wallet signs → derives EVM key → deploys gasless Safe wallet via Builder Relayer
2. Auto-wraps USDC.e → pUSD on balance check
3. Orders signed locally on phone (CLOB V2 SDK), forwarded to Polymarket CLOB via geo-proxy
4. Builder code `MYB00N` attached to all order paths (affiliate tracking)
5. Session expiry UX — handles expired CLOB sessions gracefully
6. Cancel orders, open orders view, portfolio + positions from Gamma data-api

### Perps Execution (Trade)

- On-chain deposit flow (Pacific testnet + mainnet) + withdrawal flow with signed API
- Place order + close position with TP/SL, USD/native toggle
- Robinhood-style UI redesign

Service layer split:

- Feed service (`features/feed/feed.api.ts`) consumes `GET /narratives` + `GET /narratives/:id` + `GET /predict/markets/:slug`
- Predict service (`features/predict/predict.api.ts`) consumes curated/sports list + detail + CLOB endpoints
- Swap service (`features/swap/swap.api.ts`) consumes Jupiter GET endpoints (`tokens`, `price`, `quote`)
- Perps service (`features/perps/perps.api.ts`) — direct Pacific REST (`api.pacifica.fi/api/v1`); `usePerpsWebSocket.ts` for live prices (RN-native global WebSocket, bypasses isomorphic-ws)

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

### Cross-Cutting (X0 + X1)

- Global error boundary with recovery
- Navigation consolidation (shared tab bar)
- Shared API config (single base URL, timeouts)
- Custom fonts (brand typography)
- Console cleanup (no dev noise in prod)
- Color system standardization
- Haptic feedback on interactions
- Pull-to-refresh across all tabs

Execution policy:

- **Predict**: Full CLOB execution live — buy, sell, cancel orders via gasless Safe wallet + local signing
- **Trade**: Full perps execution live — deposit, place order (TP/SL), close position, withdraw
- **Swap**: CTA remains non-transactional (`COMING SOON`)
- **Feed**: YES/NO/View Market navigates to Predict detail — no order execution from Feed

---

## Deployment & APK Note

- This architecture doc defines product/system design, not release operations.
- Mobile deployment and APK build flow (EAS profiles, Android APK generation, release cadence) are tracked separately in implementation/runbook issues.
- Current frontend milestone is local/dev validation first; production mobile release pipeline is next-phase work.

---

## Distribution Strategy

- Feed is the source of truth for editorial output.
- Direct X broadcast agents have been removed.
- Any future external distribution should be a thin adapter over `published_narratives`, with deterministic dedupe and explicit posted-state tracking.

---

## Key Decisions Log

| Decision | Reasoning |
|----------|-----------|
| Supabase over local Postgres | Shared between VPS collectors and local brain without VPN |
| MiniMax over OpenAI | Cost — ~$0.54/month vs much higher |
| Collectors separate from brain | Different runtime concerns, brain is LLM-heavy, collectors are persistent network processes |
| CSV → Supabase for narratives | CSV was for testing only, narratives need to be queryable by API |
| Feed-first for hackathon (with swap preview) | Differentiator is insights; swap preview is UX scaffolding without execution risk |
| Feed before distribution | Single editorial pipeline must work before adding external distribution again |
| Pacific SDK in `packages/shared` (#052) | Reusable across collectors, API layer, and mobile app; TypeScript types + REST + WebSocket in one module |
| Dome API over Gamma for sports odds (#050) | Gamma API is geo-restricted (blocks US VPS). Dome (`api.domeapi.io/v1`) proxies Polymarket data without restriction — same odds, no geo block. |
| Dome API for pinned market discovery | Gamma `?slug=` only works for single-outcome markets. Multi-outcome events (BTC price targets, WTI, FIFA) need Dome `?event_slug=` to resolve all sub-markets. Discovery now tries event_slug first, falls back to market_slug. |
| Gasless Safe wallet over EOA signing | Builder Relayer deploys Safe per user — no gas for user, no private key export. Solana wallet derives EVM key deterministically. |
| CLOB V2 over V1 | V1 deprecated by Polymarket. V2 SDK + preprod test markets for validation before mainnet. |
| Local order signing over server-side | Phone signs orders locally with derived EVM key — server never touches private keys. Geo-proxy only forwards signed payloads. |
| Gamma data-api for portfolio | Portfolio, activity, and position data served via Gamma's data-api (same infra as Polymarket frontend). More reliable than CLOB endpoints for read-heavy queries. |
| Multi-signal match status over Gamma flags (#47) | Gamma's `active`/`closed` flags are stale for sports (confirmed bug rs-clob-client #199). Use UMA oracle status + price ≥0.995 + max match duration instead. Sports WebSocket is the authoritative source (future). |
