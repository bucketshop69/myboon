# Changelog

All notable changes to MYBOON will be documented in this file.

<!-- markdownlint-disable MD024 -->

---

## [Unreleased]

### Added

- `[#050]` Sports Content Pipeline — Phase 1 (Preview) + Phase 2 (Match-Aware Collection)
  - **`packages/brain/src/sports-broadcaster.ts`** — Runner: loads `sports-calendar.json`, registers calendar matches in `polymarket_tracked` (T-24h window via Dome API), detects phase (`preview` / `live` / `post_match`), deduplicates per match+phase via `x_posts.slug` + `agent_type`, fetches batch odds via Dome
  - **`packages/brain/src/graphs/sports-broadcaster-graph.ts`** — LangGraph `sportsBroadcasterGraph`: `write → broadcast → resolve → save`. Writer has distinct voice sections per phase. Broadcaster hard-rejects hype, enforces odds presence + tension lead. Max 2 retries on `soft_reject`. Saves as `agent_type = 'sports_broadcaster_{phase}'` with `slug` column for dedup.
  - **`packages/brain/src/sports-calendar.json`** — 3 UCL fixtures (Real Madrid vs Bayern, Barcelona vs Atlético, PSG vs Liverpool — April 2026). Each entry: `match`, `sport`, `kickoff`, `slugs: { home, away, draw }` from Polymarket.
  - **`packages/brain/src/dome.ts`** — Dome API REST client (geo-unrestricted Polymarket proxy, `api.domeapi.io/v1`). `fetchOutcomeOdds(slugs)`: single round-trip market lookup + parallel price fetches. `resolveMarketBySlug(slug)`: market metadata for `polymarket_tracked` registration. Replaces Gamma API throughout brain + collectors.
  - **`packages/brain/src/run-sports-broadcaster.ts`** — PM2 entry point
  - **`packages/collectors/src/polymarket/match-watcher.ts`** — Match-aware collector: polls `data-api.polymarket.com/activity` per calendar slug every 5min from T-24h to T+12h. Writes `WHALE_BET` signals with `source: 'match-watcher'`. Resolves `conditionId` from `polymarket_tracked`, falls back to Dome API.
  - **`ecosystem.config.cjs`** — Added `myboon-sports-broadcaster` PM2 process (hourly cron)
  - **`packages/collectors/src/index.ts`** — Added `startMatchWatcher()` call
  - **`packages/brain/src/fomo-master.ts`** — Sports slug filter: signals matching `/^(ucl|epl|nba|nfl|la-liga)-/` excluded to prevent duplicate coverage
  - **`packages/brain/src/narrative-analyst.ts`** — Sports `content_type` filter: clusters with `content_type='sports'` excluded before `narratives` insert
  - **DB migration** — `ALTER TABLE x_posts ADD COLUMN IF NOT EXISTS slug text` — run in Supabase dashboard
  - **Phase windows**: preview = T-26h to T-2h · live = T to T+6h (covers UCL extra time + penalties) · post_match = T+6h to T+12h (deferred to backlog #002)
  - **`docs/tutorials/08-dome-api.md`** — Dome API reference: prices, OHLCV, events, wallet analytics, order book

- `[#052]` Pacific Protocol TypeScript API Client
  - **`packages/shared/src/pacific/`** — New Pacific SDK module
    - `PacificClient` — REST API wrapper with 20+ methods (getMarkets, getPrices, getPositions, createMarketOrder, etc.)
    - `PacificWebSocket` — Real-time price stream client with auto-reconnect (exponential backoff) + heartbeat (ping/pong every 30s)
    - `types.ts` — Strict TypeScript types for all Pacific data structures (Markets, Prices, Orders, Positions, API errors)
    - `client.ts` — Ed25519 signing using `tweetnacl` for authenticated requests, deterministic JSON serialization, rate limit awareness
    - `websocket.ts` — Connection management, subscription handling, typed event emitter for price/orderbook/trades/funding streams
  - **E2E Test Suite** — `pacific.test.ts` with 6 tests (markets, prices, account info, positions, orders, WebSocket connection)
  - **Dependencies** — Added `@solana/web3.js`, `bs58`, `tweetnacl`, `isomorphic-ws`, `ws`, `decimal.js`
  - **Test Results** — 5/5 passing (63 markets, live BTC price ~$68.5k, WebSocket connection verified)
  - **Status** — Production-ready, blocks #051 (collectors), #053 (Trade UI), #054 (builder code), #055 (brain integration)

- `[#049]` Content type taxonomy expansion + agent routing
  - **`publisher-types.ts`** — `ContentType` expanded to `'fomo' | 'signal' | 'sports' | 'macro' | 'news' | 'crypto'`
  - **DB migration** — `published_narratives_content_type_check` constraint updated to include all 6 types
  - **`narrative-analyst.ts`** — `NarrativeCluster` interface gets `content_type?` field. SYSTEM_PROMPT gets classification rules (sports slug patterns, macro topics, fomo vs signal vs news detection, default `signal`). `saveNarratives` passes `content_type` to DB.
  - **`publisher-llm.ts`** — content_type classification rules expanded to all 6 types. Sports and macro get first-match priority.
  - **`publisher-graph.ts`** — critic CLASSIFICATION check updated to recognize sports/macro/crypto.
  - **`influencer-graph.ts`** — prompt routing for all 6 content types. Removed hardcoded 280 char slice.

- `[#048]` fomo_master persuasion upgrade — archetype classification + voice rewrite
  - **PERSUASION_PLAYBOOK** — 5 archetypes with 4-5 line example posts: CONTRARIAN (bet against consensus), CLUSTER (convergence pattern), AUTHORITY (track record), FRESH_WALLET (curiosity gap), GENERAL (fallback). Observational voice: build tension through facts, end with implication. Not hype.
  - **WRITER_SYSTEM_PROMPT rewrite** — archetype classification priority order (CONTRARIAN → CLUSTER → AUTHORITY → FRESH_WALLET → GENERAL, first match wins). 4-5 line format, no character limit constraint. TIME_SENSITIVE modifier adds timing line as final punctuation when market resolves within 48h.
  - **BROADCASTER_SYSTEM_PROMPT rewrite** — angle fingerprint `{slug}:{archetype}` as duplicate detection unit. Same market + different archetype = fresh angle, always approve. Only `status='posted'` records count toward frequency limits (rejected drafts never published — don't treat as coverage).
  - **Data flow** — `PendingDraft` + `WriterOutput` now carry `slug` (attached deterministically from `signal.metadata.slug` in `writeNode`, never from LLM) and `archetype` (from LLM writer output). `broadcastNode` passes both to broadcaster.

- `[#047]` Specialized broadcast floor — `fomo_master` agent + inline `chief_broadcaster`
  - **Runner** (`packages/brain/src/fomo-master.ts`) — deterministic pre-enrichment before graph: slug clustering (one representative per market, highest weight wins; tiebreaker: most recent), `cluster_context` attached to representative, Nansen bettor profile (cached 24h via `NansenClient`), live Polymarket odds (Gamma API, no cache), market_history (7d signal aggregate by slug). Dual timelines: `posted_timeline` (status=posted only, for writer) and `full_timeline` (all 7d, for broadcaster).
  - **Graph** (`packages/brain/src/graphs/fomo-master-graph.ts`) — 4-node LangGraph: `rank → write → broadcast → resolve`, conditional routing after `resolve`.
    - `rank` — picks 1-3 signals using explicit framework (contrarian conviction > wallet credibility > pattern > size > timing). Uses short IDs (S1, S2…) to reduce UUID hallucination. Early exit to END if zero picks. Outputs `why_skipped` map.
    - `write` — Lookonchain-style X drafts, one per ranked signal. On retry: receives `previous_draft` + directional broadcaster edits `[{issue, fix}]`. Writer owns voice.
    - `broadcast` — single batch LLM call reviews all pending drafts. 3-way decision: `approved` / `soft_reject` / `hard_reject`.
    - `resolve` — **new node** (replaces router logic): single place broadcast results are processed. Bumps attempt counts, splits drafts into approved/pending/rejected, stores `broadcaster_reasoning` with each draft. Eliminates double-computation bug and potential infinite loop from unbumped attempt counters.
  - Max 2 write retries per draft on soft_reject. Hard_reject and max-retry exhaustion save as `status='rejected'`. `why_skipped` written back to `signals.skip_reasoning` after graph run.
  - Polymarket profile URL (`https://polymarket.com/{address}`) appended deterministically in `saveNode` — never in LLM prompts or broadcaster check.
  - **PM2 process** `myboon-fomo-master` — `cron_restart: '0 */1 * * *'`, `autorestart: false`.
  - **DB migrations required**: `x_posts` — `fomo_reasoning TEXT`, `broadcaster_reasoning TEXT`; `signals` — `skip_reasoning TEXT` (plus base columns `agent_type`, `signal_ids`, `reviewed_at`, `reviewed_by` if not already added).

- `[#045]` Landing page — `apps/web` (Next.js 15, `@myboon/web`, port 3001)
  - Hero section: centered phone mockup with 4 floating tab cards (Feed, Predict, Trade, Swap)
  - Independent CSS float animations per element — phone and each card drift on different cycles
  - Hover-to-preview: hovering a card transitions the phone screen to that tab's content + syncs bottom nav active icon
  - Icon row below CTA: Newsroom (`/world`), GitHub, X, Download
  - "Coming soon" tooltip on Get Early Access + Download click
  - Design tokens match mobile app theme (colors, fonts, spacing)
  - `docs/hero.html` — approved designer HTML prototype (reference only, not served)
  - `docs/news_room.html` — pixel art newsroom canvas prototype for `/world` route (approved)

- `[#046]` `/world` route — interactive pixel art 2D newsroom at `apps/web/src/app/world/`
  - Canvas 2D `requestAnimationFrame` loop, fixed 1280×720 logical space, CSS letterboxed 16:9
  - 6 rooms: Wire Room, Research Desk, Editorial Room, Archive Room, Broadcast Desk, Server Room
  - 7 agent characters with independent walk state machines (idle → walking → visiting → returning)
  - Analyst walks to Archive on timer, shows "DB WRITE" label while visiting
  - Publisher walks to Editor's desk to model critic/review loop
  - Data flow particles along all 5 inter-room paths (geometry-derived, not hardcoded)
  - Pulsing dashed LLM cables from every agent room down to Server Room
  - Scroll-to-zoom (0.4×–4.0×, centered on cursor), drag-to-pan, default view centered at 1.2×
  - Hover: dims all other elements, shows tooltip with agent/room description
  - Click: opens slide-in side panel with overview + live stats + how-it-works detail
  - HUD, live feed widget, side panel rendered as React JSX over canvas
  - `Press Start 2P` pixel font loaded via `next/font/google`

---

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

---

### Added

- `[#040]` Feed predict block — sports support + multiple actions + redesign
  - Slug routing: `ucl-*`/`epl-*` prefixes route to `GET /predict/sports/:sport/:slug`; all others to `GET /predict/markets/:slug`
  - Up to 3 predict blocks rendered per narrative (first 3 `predict` actions)
  - Binary block redesigned: YES/NO bars, price change pills (today ↑↓, 1w ↑↓), resolves date, YES/NO CTAs
  - Sports block: multi-outcome bars (gold, one per team), volume, View Market CTA
  - All colors use design tokens exclusively — no hardcoded hex values
  - `PredictMarketData` extended with `endDateIso`, `oneDayPriceChange`, `oneWeekPriceChange`
  - `outcomePrices` parsed correctly from Gamma's stringified JSON array format
  - `GET /predict/markets/:slug` curated gate removed — now serves any valid Polymarket slug

### Fixed

- `[#040]` `outcomePrices` from Gamma was a JSON string `"[\"0.295\", \"0.705\"]"` — parsed correctly now so YES/NO bars render
- `[api]` `GET /predict/markets/:slug` returned 404 for any slug not in `CURATED_GEOPOLITICS_SLUGS` — removed gate so feed predict blocks work for all publisher-emitted slugs

### Added

- `[#030]` Feed card redesign + narrative detail sheet
  - `NarrativeSheet` — bottom sheet (Modal + animated `translateY`, drag-to-dismiss) opens on card tap. Fetches `content_full` from `GET /narratives/:id`. Renders prediction market block (yes/no odds bars, volume, Bet YES/Bet NO CTAs → `/predict-market/[slug]`) when `actions` contains `type: 'predict'`
  - `FeedCard` rebuilt — category pill + time + body text only. No title, no stripe, no score, no action chips
  - `FeedList` swapped `ScrollView` → `FlatList` with `onCardPress` handler
  - `NarrativeAction` type added (`type: 'predict' | 'perps'`, `slug?`, `asset?`)
  - `feed.api.ts` — `fetchNarrativeDetail`, `fetchPredictMarket` added; `actions` mapped from API response; `deriveCategory` removed
  - `FeedCategory` type widened to `string` — category pill now uses `tags[0]` directly (raw API tag, e.g. `ucl`, `iran`, `macro`) instead of keyword-mapped fixed enum
  - `FilterChips` component deleted — filter row removed from Feed entirely

- PM2 deployment config — `ecosystem.config.cjs` at monorepo root manages all 4 VPS processes (`myboon-api`, `myboon-collectors`, `myboon-analyst`, `myboon-publisher`) with auto-restart and crash recovery
- `docs/DEPLOY.md` — first-time VPS setup guide, day-to-day PM2 operations, `.env` reference, smoke test instructions

### Fixed

- `[collectors/user-tracker]` Replaced `.single()` with array query in `resolveMarket` — `.single()` was returning the first row in `polymarket_tracked` when no rows matched, causing all WHALE_BET signals to receive the same wrong slug
- `[collectors/user-tracker]` Noise filter expanded to catch "Up or Down" and "Up/Down" topic patterns — BTC/Solana short-window binary signals were slipping through the previous `updown` slug-only filter
- `[collectors/user-tracker]` Gamma API fallback now correctly extracts `slug` from response — `GammaMarketLookup` was missing the `slug` field, hardcoding `null` even when Gamma returned a valid slug
- `[api]` `GET /narratives` now includes `actions` field and orders by `created_at.desc` first (previously `priority.desc` first)

### Changed

- `[collectors/user-tracker]` Minimum whale bet raised $50 → $500 — weight scale updated to 6/8/10 (removed $50-499 tier entirely)
- `[collectors/user-tracker]` WHALE_BET signals now include `slug` in metadata — resolved from `polymarket_tracked` by conditionId, falls back to Gamma API (title only). All three signal types now carry `slug ✅`
- `[analyst]` `extractSlugs()` parses `[slug: xxx]` patterns from LLM-generated `key_signals` per cluster — deterministic, per-cluster slug extraction saved to `narratives.slugs text[]`
- `[publisher]` `actions` field added to `PublishedOutput` and `published_narratives` insert — `NarrativeAction` type supports `predict` (slug) and `perps` (asset symbol)
- `[publisher]` predict actions built deterministically from `narrative.slugs` in code — no LLM slug guessing. LLM may only add `perps` actions for crypto signals. Requires DB migration: `ALTER TABLE narratives ADD COLUMN slugs text[] NOT NULL DEFAULT '{}'`
- `[publisher]` Firecrawl `search_news` tool commented out (TODO: restore when replacement available) — publisher now runs leaner with only `search_published`
- `[publisher]` `search_published` now returns `content_full` and `reasoning` — gives the LLM full context to distinguish duplicates from story updates (e.g. odds jumping 60% → 80%)
- `[publisher]` System prompt updated: three explicit cases — duplicate (reject), material update (publish referencing prior piece), new story (judge on merit)
- `[analyst]` Clusters scoring < 7 filtered before Supabase insert — only quality narratives reach the publisher queue

- `[#021]` `packages/shared` — new shared SDK package (`@myboon/shared`)
  - `PolymarketClient` class: `getTopMarkets`, `getMarketBySlug`, `getMarketByConditionId`, `getOrderBook`, `getMarketSnapshot`
  - `MarketSnapshot` type: market + live yes/no prices + fetchedAt timestamp
  - Config-injected (no env vars at module level) — usable from any package or app
- `[#022]` Narrative analyst tool calling
  - `packages/brain/src/analyst-tools/polymarket.tools.ts` — `get_market_snapshot` and `get_market_by_condition` tools
  - Analyst upgraded with Anthropic tool-use loop (max 10 iterations) — fetches live odds mid-analysis before writing observations
  - `get_market_by_condition` resolves conditionId then fetches full snapshot in one call
  - System prompt updated: focus on interesting/unusual positions, no whale labels, flag contrarian bets (yes_price < 0.3)
- `[#027]` Frontend PRD added: `docs/issues/027-hybrid-expo-initialization.md`
  - Defines Expo route shell, theming foundation, shared nav/header shell, branding assets, and env bootstrap
- `[#028]` Frontend PRD added: `docs/issues/028-feed-ui-service.md`
  - Defines Feed tab UI states and client service contract for `GET /narratives`
- `[#029]` Frontend PRD added: `docs/issues/029-swap-ui-service.md`
  - Defines Swap tab UI and GET-only Jupiter preview integration (token search, price, quote)
- `[#026]` Predict backend expanded in `packages/api`
  - Curated geopolitics market list/detail (`/predict/markets`, `/predict/markets/:slug`) now uses geopolitics-only slug set
  - Dynamic sports endpoints added for EPL/UCL (`/predict/sports/:sport`, `/predict/sports/:sport/:slug`) with 3-outcome payloads
  - Predict history endpoint available (`/predict/history/:tokenId`) with strict interval validation (`1m|5m|1h|1d`)
  - API smoke test updated for new curated slug + sports coverage
- `[#026]` Expo Predict UI implemented in `apps/hybrid-expo`
  - New Predict tab feed with category filters and live cards for geopolitics + sports outcomes
  - Detail routes/screens added: `/predict-market/[slug]` and `/predict-sport/[sport]/[slug]`
  - New client service/types for predict list + detail API integration

### Changed

- `[#021]` `packages/collectors` refactored — Polymarket API logic moved to `@myboon/shared`; Supabase singleton split into `supabase.ts`; signal types in `signal-types.ts`
- `[#022]` Narrative analyst writes to Supabase `narratives` table (status=draft) instead of CSV
- `docs/ARCHITECTURE.md` updated to match current frontend phase
  - Near-term plan now documents Feed live + Swap GET-preview
  - Removed stale “Next: Feed API (#025)” note
  - Added current `apps/hybrid-expo` route/service snapshot
- Feed card layout in Expo updated to remove the left percent/progress column and use a full-width card body

- `packages/collectors` — new package for Polymarket signal ingestion
  - REST discovery: fetches top 20 Polymarket markets every 2h, writes `MARKET_DISCOVERED` signals to Supabase
  - WebSocket stream: subscribes to tracked markets, emits `ODDS_SHIFT` signal on >5% price movement
  - Shared `signals` table schema (source, type, topic, weight, metadata)
  - `polymarket_tracked` table for managing active market subscriptions
- `docs/issues/020-polymarket-collector.md` — PRD for Polymarket collector
- `docs/issues/019-meteora-dlmm-parser-poc.md` — PRD for Meteora DLMM parser (blocked on tx signatures)
- `docs/milestones/` — milestone retrospectives

### Changed

- `docs/VISION.md` — updated to reflect narrative intelligence direction
- `packages/tx-parser` — Meteora DLMM detection, wallet registry and program ID updates

### Removed

- `docs/issues/018-wire-classifier-to-minimax.md` — completed, archived

---

## [0.2.0] — 2026-02-13 (Colosseum Hackathon)

### Added

- Project scaffolding (Next.js + Tailwind + Framer Motion)
- README with project overview
- Issue tracking system (`docs/issues/`)
- `001_wallet_connection.md` - Wallet connection spec with Lazorkit + Wallet Adapter
- `002_custom_wallet_modal.md` - Custom wallet modal spec
- `003_wallet_details_gasless_transfer.md` - Wallet details modal + gasless transfer spec
- **Wallet connection with Lazorkit passkey + Solana Wallet Adapter**
  - `WalletProvider` with Lazorkit registration + LazorkitProvider
  - Buffer polyfill for Next.js SSR
- **Custom Wallet Modal (002)**
  - `WalletButton` - Wallet icon / connected address + disconnect
  - `WalletModal` - Split-view modal container
  - `PasskeySection` - Left side with Lazorkit passkey option
  - `WalletList` / `WalletListItem` - Right side with traditional wallets
  - Dual wallet support (Lazorkit native + Solana Wallet Adapter)
  - Responsive design (stacks on mobile)
- **Wallet Details Modal + Gasless Transfer (003)**
  - `WalletDetailsModal` - Tabbed modal with Transfer/Swap views
  - `AddressDisplay` - Wallet address with copy + explorer link
  - `BalanceDisplay` - SOL + USDC balances with refresh
  - `TransferForm` - USDC transfer with gasless/traditional wallet support
  - `ConfirmTransferModal` - Transfer confirmation dialog
  - `useBalances` hook - Efficient balance fetching
  - Devnet USDC support with proper PDA (off-curve) handling
  - Gasless transfers via Lazorkit paymaster
  - Traditional wallet transfers with normal gas fees
  - Design system aligned buttons and UI elements
- **Gasless Raydium Swap (004)**
  - `SwapForm` - Integrated Raydium swap UI in Wallet Details Modal
  - Dual Mode: Gasless swaps for Lazorkit, normal gas swaps for traditional wallets
  - `raydium.ts` - Raydium API integration helpers for quotes and transactions
  - Live quote fetching with price impact calculation
  - Token flip functionality and automatic ATA handling
  - Support for `LEGACY` transactions via Raydium Trade API
  - Compact UI matching design system (removed inline selectors, matched TransferForm styling)
- **Transaction parser package (`packages/tx-parser`)**
  - Standalone TypeScript package with strict typing, build/test scripts, and root env usage
  - RPC fetch layer for wallet history and single-signature transaction retrieval
  - Parsing core split into classification, detail resolution, and protocol-specific modules
  - Protocol coverage for verified IDs: Jupiter V6, Meteora DLMM, SPL Token, Associated Token
  - Jupiter swap detail extraction from token balance deltas
  - Orchestration APIs for parsing wallet history and single signatures
  - Integration-style test suite using real RPC calls/signatures and shared fixtures

### Changed

- Replaced old `ConnectWallet` component with new wallet component system
- `WalletButton` now opens details modal when connected
- Updated `MYBOON` logo on home page to use `pnl-green` for 'P' and `pnl-red` for 'L'
- Updated site title to `MYBOON`
- `WalletButton` now shows text "Connect Wallet" instead of icon when disconnected
- Added muted hint text below connected wallet button
- `PasskeySection` now shows three icons (Face, Fingerprint, Phone) to represent passkey methods
- Parser architecture refactored toward decoupled fetch/parse/orchestration boundaries for reuse across web and agents
- `[#011]` `packages/tx-parser` foundation refactored with indexer-style utilities: `accountKeys`, `programCheck`, `tokenTransfers`, `innerInstructions`, and shared utility `types`
- `[#011]` `identifyTransactionType` program detection now routes through shared `programCheck` utilities, and legacy swap balance-delta logic is marked deprecated for upcoming parser migration
- `[#012]` Jupiter parsing now routes through dedicated `parsers/jupiter.ts`, classifying wallet-side swaps as `buy`/`sell` when flow is known-funding-token to unknown-token (or reverse)
- `[#012]` `ParsedTransaction` and swap detail types now support buy/sell semantics (`TokenInfo`, `BuySellDetails`, `LegacySwapDetails`) while keeping legacy swap parsing compatible
- `[#013]` added stream pipeline foundation (`stream/pipeline.ts`, `filter.ts`, `formatter.ts`, `batcher.ts`) with WebSocket log subscriptions, global signature dedupe, idempotent start/stop lifecycle, and batched callback emission
- `[#013]` config now supports `WATCHED_WALLETS` category/CSV parsing via wallet registry, known-token helpers now include `getFundingSymbol()`, and wallet registry exports were finalized with invalid address cleanup
- `[#013]` stream summaries now use wallet registry labels and include parseable full mint markers for unknown tokens in buy/sell flows (`mint:<full-address>`)
- `[#016]` added new `@myboon/brain` package with `ClassifierBrain` (LLM JSON classification + pass-through fallback) and `TransactionOrchestrator` (sequential batch queue, idempotent lifecycle, optional JSONL audit logging)
- `[#018]` wired classifier to MiniMax Anthropic-compatible API (`/v1/messages`) and added `packages/brain/src/run.ts` runner plus `brain:start` command for end-to-end stream → orchestrator → classifier execution
- `[#014]` added new `@myboon/entity-memory` package (types, repositories, services, migrations, seed scaffold) with in-memory MVP mode and repository/service boundaries for future Postgres/Supabase wiring
- `[#015]` implemented Research Agent (Brain 2) with MiniMax tool-calling loop, entity+memory MCP tools, Jupiter Tokens V2 metadata tool, orchestrator integration, and research audit logging
- added demo/smoke runners for Brain 2: `research:smoke` and `demo:replay` to showcase end-to-end stream → classify → research → memory flow in terminal
- classifier parsing now tolerates fenced JSON responses from LLM output and captures normalized/raw response payloads for demo logging
- classifier prompt noise rules updated to remove strict tiny-trade `<$50` filter
- issue docs updated for #014/#015/#016 to reflect implemented scope, MiniMax env/model usage, and deferred items

### Planned

- [x] Wallet connection (Lazorkit passkey + traditional wallets)
- [x] Custom wallet modal with split view
- [x] Wallet details modal with gasless USDC transfer
- [x] Gasless Raydium swap (004)
- [ ] Transaction parser (Jupiter swaps)
- [ ] P&L card component (animated)
- [ ] Share/export functionality

---

## [0.0.1] - 2026-01-12

### Added

- Initial monorepo setup with pnpm workspaces
- `apps/web` - Next.js 16 frontend
- Basic project structure

---

## Legend

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes
