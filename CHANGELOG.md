# Changelog

All notable changes to PNLdotfun will be documented in this file.

<!-- markdownlint-disable MD024 -->

---

## [Unreleased]

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
- Updated `PNLDOTFUN` logo on home page to use `pnl-green` for 'P' and `pnl-red` for 'L'
- Updated site title to `PNL.FUN`
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
- `[#016]` added new `@pnldotfun/brain` package with `ClassifierBrain` (LLM JSON classification + pass-through fallback) and `TransactionOrchestrator` (sequential batch queue, idempotent lifecycle, optional JSONL audit logging)
- `[#018]` wired classifier to MiniMax Anthropic-compatible API (`/v1/messages`) and added `packages/brain/src/run.ts` runner plus `brain:start` command for end-to-end stream → orchestrator → classifier execution

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
