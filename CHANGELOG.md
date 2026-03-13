# Changelog

All notable changes to MYBOON will be documented in this file.

<!-- markdownlint-disable MD024 -->

---

## [Unreleased]

### Added

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
