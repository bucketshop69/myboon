# Issue #8 — Polymarket CLOB Auth: Implementation Status

**Branch:** `issue/8-clob-auth`
**Last updated:** 2026-04-11
**Polygon address (test):** `0x376CBB9B154aF951417F4E95a292923E96B43e08`

---

## What's Done

### 1. CLOB Auth Flow (server-side)
- **File:** `packages/api/src/clob.ts`
- Phone signs deterministic message (`myboon:polymarket:enable`) with Phantom (Solana MWA)
- Server derives EVM private key: `keccak256(solana_signature)` → Polygon EOA wallet
- Server calls `createOrDeriveApiKey()` to get CLOB API credentials
- In-memory session store with 24h TTL + hourly cleanup
- Builder Program attribution via `@polymarket/builder-signing-sdk`
- Routes: `POST /clob/auth`, `POST /clob/order`, `GET /clob/positions/:addr`, `GET /clob/balance/:addr`, `GET /clob/deposit/:addr`, `DELETE /clob/session/:addr`

### 2. Phone-side Auth Hook
- **File:** `apps/hybrid-expo/hooks/usePolymarketWallet.ts`
- Stores only the polygon address (public) in AsyncStorage
- `enable()` — triggers Phantom sign → sends sig to server → gets polygon address
- `disable()` — clears local + server session
- `isReady` / `isLoading` state for UI gating

### 3. Bet Slip (both market types)
- **Files:** `PredictSportDetailScreen.tsx`, `PredictMarketDetailScreen.tsx`
- Shows USDC balance (fetched from CLOB on open) + entry price
- Amount input with MAX button, no preset $10/$25/$50 strip
- Validation: amount > 0, amount <= balance
- Shows est. payout + share count
- Auth gating: "Open Account to Trade" when no session
- Order submission: calls `POST /clob/order` with dollar amount (server converts to shares)
- Inline feedback: success checkmark or error message
- KeyboardAvoidingView: bet slip rises above number pad, backdrop dismisses keyboard first
- After success: auto-refreshes orders, positions, balance

### 4. Server API Endpoints
- **File:** `packages/api/src/index.ts`
- `GET /predict/portfolio/:address` — Gamma data-api: value + positions + profile in parallel
- `GET /predict/activity/:address` — Gamma data-api: recent trades
- `GET /predict/positions/:address/market/:slug` — positions filtered by slug/eventSlug
- `GET /predict/history/:tokenId` — price history for sparkline charts
- `GET /predict/trending` — trending markets
- Fixed sports 500 bug (`source` → `_source` in mapEventToGame)
- Disabled geopolitics + UCL, EPL only for testing

### 5. Profile Screen
- **File:** `apps/hybrid-expo/app/predict-profile.tsx`
- Real portfolio data from Gamma (no more mock data)
- Equity card: Portfolio value, Cash (USDC balance), P&L, Positions count
- Open Orders section (from CLOB `getOpenOrders()`)
- Filled Positions section with outcome badges, PnL, entry/current price
- Pull-to-refresh (RefreshControl)
- Session expired banner with "tap to reconnect" (re-signs with Phantom)
- Deposit/Withdraw buttons in header (deposit wired, withdraw placeholder)

### 6. Bottom Nav Fix
- **File:** `apps/hybrid-expo/features/feed/components/BottomGlassNav.tsx`
- Changed from `position: absolute` to flex child — no longer floats/obstructs content
- All screens updated: removed extra `paddingBottom` hacks

### 7. Market Data
- **File:** `packages/api/src/curated.ts`
- Geopolitics slugs emptied (all expired)
- `SUPPORTED_SPORTS = ['epl']` only (UCL disabled)

---

## Blocker: On-Chain USDC Approval

**This is the one thing preventing real order fills.**

The derived EOA wallet (`0x376CBB...`) holds $3.99 USDC on Polygon, but the Polymarket exchange contracts have **0 allowance** to spend it. Orders get placed on the CLOB (returns 200) but can't be matched because the exchange can't pull funds.

### What's needed:
1. **Send ~0.01 POL** to `0x376CBB9B154aF951417F4E95a292923E96B43e08` for gas
2. Server calls `USDC.approve(exchangeContract, MAX_UINT256)` on Polygon for each contract:
   - `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` (CTF Exchange)
   - `0xC5d563A36AE78145C45a50134d48A1215220f80a` (Neg Risk CTF Exchange)
   - `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` (Neg Risk Adapter)
3. Both USDC variants may need approval:
   - `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` (USDC.e bridged)
   - `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (native USDC)
4. After approval, call `client.updateBalanceAllowance()` to refresh CLOB cache

### What was tried:
- `POLY_PROXY` (SignatureType 1) — balance shows 0 (funds are in EOA, not proxy)
- `updateBalanceAllowance()` — only refreshes CLOB API cache, doesn't do on-chain approve
- On-chain approve code was written but reverted — wallet has 0 POL for gas

### Resolution path:
Once the wallet has POL gas, add `setOnChainApprovals()` back to `POST /clob/auth` flow. The code was written (ethers Contract.approve), just needs gas. One-time per wallet.

---

## What's Left (beyond the blocker)

- [ ] Withdraw modal (button exists, no modal yet)
- [ ] Cancel order functionality (CLOB client has `cancelOrder()`)
- [ ] Session re-auth when 24h TTL expires mid-use (currently requires manual reconnect)
- [ ] Activity tab (endpoint exists, not wired to UI)
- [ ] Route-aware wallet check on predict screens
- [ ] Clean up debug console.logs from DepositModal
- [ ] data-api `/positions` returns 400 for some queries — needs investigation
