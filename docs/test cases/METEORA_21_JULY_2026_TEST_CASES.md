# Meteora DLMM App — Beta Test Cases

Date: 2026-07-21
Source PRD: [`docs/PRDs/meteora dlmm app PRD.md`](../PRDs/meteora%20dlmm%20app%20PRD.md) —
governed by its Beta Scope Amendment (2026-07-21).
Scope: **beta P0 only** — discover a pool, open a position (two-token, a
choice of Spot/Curve/Bid-Ask distribution, one calculated default range), and
claim/add/remove/close an existing position directly from its Profile row.
Limit orders, Buy lower/Sell higher, manual range and presets, and Zap In are
postponed beyond beta and are not covered here — see `Postponed (post-beta)`
at the bottom for where their old test cases live.

## How to read this document

- **TC ID** groups: `POOLS`, `DETAIL` (pool detail / create position),
  `PROFILE`, `POS` (position management action sheets), `TXN` (transaction
  lifecycle), `SEC` (security/token policy), `STATE` (loading/empty/stale/
  failure), `FLAG` (feature flags/rollback), `A11Y` (accessibility), `PERF`
  (caching/freshness), `ANALYTICS`.
- **Priority** P0 = blocks beta, P1 = should pass before beta, P2 = polish/edge case.
- **Status** is Not Run for all cases; update per test cycle.

---

## 1. Pools — Options (Screen 1)

Unchanged by the beta amendment — Pools browsing was already right-sized and
confirmed working against live data in manual QA.

### TC-POOLS-001: Home tile opens Pools

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. From Home, tap the Meteora Apps tile.

**Expected**
- App opens directly to Pools, not a placeholder or Home redirect.
- Meteora identity (mark/name) is visible in the top bar.
- A `Profile` action is visible in the header.

### TC-POOLS-002: Pool row shows required fields

**Priority:** P0 · **Type:** Functional / UI · **Status:** Not Run

**Steps**
1. Load Pools with at least one approved pool available.
2. Inspect a pool row.

**Expected**
- Row shows token pair symbols/icons, verification state as text (not
  icon-only), current pool price, TVL, 24h volume, 24h fees (or fees/TVL),
  and freshness state when stale.
- Row does not lead with APY/APR as the primary metric.

### TC-POOLS-003: Search by symbol, name, pair, and address

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. Search by a token symbol, a token name, a pair name, and a full pool address.

**Expected**
- Each search mode returns the matching pool(s).
- Search is debounced and a fast subsequent edit cancels the stale in-flight
  request.

### TC-POOLS-004: Default and alternate sorting

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. Load Pools with no sort chosen, then switch sort to TVL and to 24h fees.

**Expected**
- Default sort is 24h volume descending; each alternate sort reorders correctly.

### TC-POOLS-005: Pagination and infinite scroll preserve position

**Priority:** P1 · **Type:** Functional · **Status:** Not Run

**Steps**
1. Scroll to load a second page, navigate into a pool, then back.

**Expected**
- Additional pages load via infinite scroll; returning to Pools preserves scroll position.

### TC-POOLS-006: Meteora approval gate excludes ineligible pools

**Priority:** P0 · **Type:** Functional / Security · **Status:** Not Run

**Steps**
1. Attempt to load a pool that is `is_blacklisted = true` upstream, or has an
   unverified token, unsupported Token-2022 extension, or unreadable RPC state.

**Expected**
- None of the above appear as actionable options in Pools or pool detail.
- TVL/volume alone never substitutes for the approval gate.
- A server-side emergency denylist pool is excluded even if all other checks pass.

### TC-POOLS-007: Loading, refresh, empty, stale, unavailable states

**Priority:** P0 · **Type:** State / UI · **Status:** Not Run

**Steps**
1. Load Pools cold, pull to refresh, search with no matches, simulate zero
   approved pools, a stale cache response, and upstream unavailable.

**Expected**
- Cold load: shaped skeleton rows, not a blank screen.
- Refresh: current rows remain visible with a refresh-in-progress indicator.
- No results: search term preserved, `Clear search` available.
- Stale: data age is shown; browsing remains available.
- Unavailable: retry action shown; core actions never require returning to
  Meteora's own app.

---

## 2. Pool Detail and Create Position (Screen 2, beta scope)

Beta ships **one goal, one range, three distributions**: Earn fees goal,
two-token funding, a choice of Spot/Curve/Bid-Ask distribution, one
server-calculated default range. Everything else this screen's PRD section
describes (Buy lower/Sell higher, manual range, presets, Zap In, the Limit
tab) is postponed — see the bottom of this document.

### TC-DETAIL-001: Pool overview fields and reference-price handling

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. Open an approved pool with a healthy reference price.
2. Open a pool where pool price diverges beyond the configured execution threshold.

**Expected**
- Overview shows pair, pool address shortcut, current price, TVL, 24h volume,
  24h fees, base fee, current dynamic fee, and updated time.
- When price divergence exceeds threshold, browsing remains available but
  `Add Liquidity` is blocked with a plain-language explanation.

### TC-DETAIL-002: Default range renders correctly and has an accessible text equivalent

**Priority:** P0 · **Type:** UI / Accessibility · **Status:** Not Run
(See phase-two doc TC-MET-RANGE-001 for the detailed 69-bin default-range
calculation; that case's Spot-only assertions remain in scope for beta.)

**Steps**
1. Open pool detail and inspect the calculated default range graphic.
2. Query the accessible text equivalent.

**Expected**
- The default range is calculated and shown without requiring any user input
  (no preset picker, no manual entry fields).
- Current pool price and the calculated range remain legible.
- An accessible text equivalent states current price and the calculated
  min/max — not conveyed by the graphic alone.

### TC-DETAIL-003: Earn fees — two-token position with Spot/Curve/Bid-Ask distribution choice

**Priority:** P0 · **Type:** Functional · **Status:** Not Run
(Cross-ref phase-two doc TC-MET-STRATEGY-001/002/003 for the per-distribution
shape assertions — all three remain in scope for beta.)

**Steps**
1. Open pool detail and confirm the flow starts directly on Earn fees,
   two-token funding — with no goal picker and no funding-mode picker visible.
2. Confirm the Spot / Curve / Bid-Ask distribution picker is visible and
   switching between them updates the range chart's liquidity shape without
   resetting the chosen range.
3. Confirm the calculated token mix is shown for the default range under the
   selected distribution.

**Expected**
- No `Buy lower` / `Sell higher` goal option is presented.
- No `Start with one token` / Zap In option is presented.
- Spot, Curve, and Bid-Ask are all selectable and each renders a visibly
  distinct liquidity shape (per phase-two doc TC-MET-STRATEGY-001–003).
- Token mix for the default range is calculated and shown before signing.

### TC-DETAIL-004: Amount entry — decimals, Max, and validation

**Priority:** P0 · **Type:** Functional / Data integrity · **Status:** Not Run

**Steps**
1. Enter amounts using decimal strings for both tokens.
2. Tap `Max`.
3. Enter an amount exceeding spendable balance.
4. Enter an amount that would leave insufficient SOL for fees/rent.

**Expected**
- All money math uses decimal/atomic string types, never floating-point.
- Entering either side computes and displays the required other side.
- `Max` reserves enough SOL for transaction fee and account rent.
- Insufficient balance, insufficient SOL, and below-minimum amount are all
  surfaced before review — never after tapping sign.
- Balances resolve to a real value or an explicit `Unavailable` — never hang
  indefinitely in a "Checking…" state. This includes both the web platform
  build and native — the balance-fetch path must be implemented on both, not
  stubbed on one (a previously fixed regression: the web build's balance
  fetch silently always returned null).

### TC-DETAIL-005: Liquidity slippage control bounds

**Priority:** P1 · **Type:** Functional / Boundary · **Status:** Not Run

**Steps**
1. Open the slippage control and inspect the default.
2. Attempt to set slippage outside the bounded range.

**Expected**
- Default is server-policy-set and shown as a percent.
- Only values within the bounded range are accepted.
- Changing slippage never triggers a wallet action.

### TC-DETAIL-006: Inline review shows all required facts, no separate Review page

**Priority:** P0 · **Type:** Functional / UI · **Status:** Not Run

**Steps**
1. Complete the flow up to just before the final action.

**Expected**
- Inline review shows: pool name + shortened address, funding mode, token
  amounts, min/current/max price, in-range status, base + dynamic fee,
  slippage tolerance, estimated network fee, refundable rent,
  estimated transaction count, quote expiry countdown, and both required
  risk disclosures.
- No separate generic `Review` button/page exists.

### TC-DETAIL-007: Final action label reflects true state

**Priority:** P0 · **Type:** Functional / UI · **Status:** Not Run

**Steps**
1. Walk through: no wallet, unsupported wallet, stale preview, ready,
   signing, confirming, complete.

**Expected**
- Bottom action label truthfully matches state at each step (`Connect Solana
  wallet`, `Wallet not supported`, `Refresh preview`, `Add liquidity`,
  `Sign 1 of N`, `Confirming`, `Position created`).
- Wallet approval prompt opens only when all inline validation and preview
  data are current.

### TC-DETAIL-008: Add-to-existing-position mode skips goal/distribution/range selection (they're already locked in)

**Priority:** P0 · **Type:** Functional / Regression · **Status:** Not Run

This is a regression check for a previously fixed routing bug: entering this
screen from an existing position's `Add liquidity` action sheet must behave
differently from entering it fresh from Pools. This applies regardless of
which distribution (Spot/Curve/Bid-Ask) the position was originally created
with — an existing position's distribution is fixed and never re-selectable
on Add.

**Steps**
1. From an open position's action sheet (see Section 4), tap `Add liquidity`.
2. Observe what the screen asks for.

**Expected**
- The screen opens directly to the amount step — no goal, distribution, or
  range selection is shown, since the position's existing range and
  distribution are fixed.
- The existing range and distribution are displayed as read-only context
  (e.g., "Adding to your existing Curve position, 77.34–79.48 range"), not
  re-offered as choices.
- Token ratio is recalculated for the current range/price.
- Preview/cost/simulation/sign/reconciliation rules match a fresh create.

---

## 3. Meteora Profile (Screen 3, beta scope)

Beta ships **Positions** and **History** tabs only. The **Orders** tab is
postponed with limit orders — see the bottom of this document.

### TC-PROFILE-001: Disconnected state

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. Open Profile with no wallet connected.

**Expected**
- Explains a Solana address is required to load positions.
- Offers a connect action; browsing Pools remains available without connecting.

### TC-PROFILE-002: Profile summary ledger fields and unavailable handling

**Priority:** P0 · **Type:** Functional / Data integrity · **Status:** Not Run

**Steps**
1. Load Profile for a wallet with full data available.
2. Simulate one aggregate (e.g., P&L) being unavailable upstream.

**Expected**
- Summary renders as a flat, divided ledger showing: current position
  balance, open position count, unclaimed fees, and P&L (source + updated time).
- An unavailable aggregate renders literally as `Unavailable`, never as `$0`.
- P&L is labeled as an indexed estimate, not a guaranteed accounting statement.

### TC-PROFILE-003: Position list grouped by pool, and each row opens the action sheet (not pool detail)

**Priority:** P0 · **Type:** Functional / UI · **Status:** Not Run

This supersedes the old routing assertion — the beta fix is that a position
row must **not** navigate straight into pool detail.

**Steps**
1. Load Profile with at least one open position.
2. Tap the position row.

**Expected**
- Positions are grouped by pool; each group/row shows pair, current
  balance, unclaimed fees, P&L (if available), and range status
  (`In range` / `Out of range` / `Mixed` / `Status unavailable`) in text +
  icon, never color alone.
- Tapping the row opens the position action sheet (Section 4) — it does
  **not** navigate to the pool's create-position screen.

### TC-PROFILE-004: History is read-only, date ordered, and uses resolved token symbols

**Priority:** P1 · **Type:** Functional · **Status:** Not Run

**Steps**
1. Load History after performing at least one action.

**Expected**
- Shows add, remove, fee claim, and position close events, date ordered, read-only.
- Each row shows a resolved token pair symbol (e.g., `SOL / USDC`), never a
  raw mint address (regression check for a previously fixed defect).

---

## 4. Position Management (beta: action sheet from the Profile row, not a dedicated screen)

This section replaces the old "Screen 4: Position Detail" test cases. Per
the Beta Scope Amendment, there is no dedicated Position Detail route for
beta — claim, remove, and close are action-sheet flows launched directly
from the Profile position row (Section 3); add routes into the pool-detail
amount step in add-mode (TC-DETAIL-008).

### TC-POS-001: Action sheet opens with the four expected actions

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. From Profile, tap an open position row.

**Expected**
- An action sheet opens (not a full-page navigation) offering: `Add
  liquidity`, `Claim fees`, `Remove liquidity`, `Close position`.
- The sheet shows enough context to confirm this is the right position
  (pair, current balance) without needing a separate detail page.
- Dismissing the sheet returns to the exact Profile scroll position.

### TC-POS-002: Add liquidity routes to pool detail in add-mode

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. From the action sheet, tap `Add liquidity`.

**Expected**
- Matches TC-DETAIL-008: routes to the amount step only, with the existing
  range/distribution shown as fixed context, not re-offered as choices.

### TC-POS-003: Claim fees — action sheet flow

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. From the action sheet, tap `Claim fees` on a position with unclaimed fees.

**Expected**
- Shows exactly which claimable assets are included, plus network fee and
  rent, before signing.
- Signs and confirms without leaving the action-sheet flow (no navigation to
  a separate page).
- No copy implies a claim compounds the position.
- Multi-step claims (if required) show clear step progress within the sheet.

### TC-POS-004: Remove liquidity — partial and boundary behavior

**Priority:** P0 · **Type:** Functional / Boundary · **Status:** Not Run

**Steps**
1. From the action sheet, tap `Remove liquidity`.
2. Remove using a percentage preset (e.g., 25/50/75%).
3. Remove an exact bounded amount.
4. Attempt to remove 100% via this control.

**Expected**
- Estimated token outputs are shown before signing.
- Removing liquidity from the active bin as only one token is
  explained/blocked as documented.
- Partial removal leaves the position open (not auto-closed) and the action
  sheet reflects the updated balance afterward.
- Selecting 100% clearly transitions toward the Close flow (TC-POS-005)
  rather than silently behaving the same as a partial remove.

### TC-POS-005: Close position — destructive action

**Priority:** P0 · **Type:** Functional / Destructive · **Status:** Not Run

**Steps**
1. From the action sheet, tap `Close position`.
2. Confirm the destructive-action confirmation step.

**Expected**
- Removes 100%, claims eligible fees/rewards, closes the position account,
  and reclaims refundable rent where the protocol flow permits.
- Requires a dedicated destructive-action confirmation distinct from the
  normal sheet action (per PRD accessibility rules — a modal, not a color
  alone, signals destructiveness).
- Each transaction step is shown; completion is not reported until the close
  is confirmed, or the remaining step is clearly marked recoverable.
- After close, the position no longer appears in the Positions list on next load.

### TC-POS-006: Rebalance is absent

**Priority:** P1 · **Type:** Regression / Scope · **Status:** Not Run

**Expected**
- No automatic or one-tap rebalance action exists anywhere. Out-of-range
  positions can only be held, added to, partially removed, or fully closed.

---

## 5. Transaction Lifecycle

### TC-TXN-001: Readiness checks block build when any precondition fails

**Priority:** P0 · **Type:** Functional / Security · **Status:** Not Run

**Steps**
1. Attempt preview/build with: unsupported cluster/program, mismatched wallet
   authority, non-sign-and-send wallet, unapproved/unsupported/disabled pool,
   failed token policy, stale/unsynchronized prices, invalid active bin/range,
   unreadable balances/token accounts, insufficient SOL, out-of-decimal-bounds
   amounts, and expired preview.

**Expected**
- Each individual failing precondition blocks preview or build with a
  specific, actionable message.

### TC-TXN-002: Ephemeral resource keypair handling

**Priority:** P0 · **Type:** Security · **Status:** Not Run

**Steps**
1. Create a new position and inspect what is sent to the build endpoint vs.
   what stays on-device.

**Expected**
- Mobile app generates the ephemeral position keypair locally; only the
  public key is sent to the build endpoint.
- The returned transaction is partially signed locally with that keypair
  before the connected wallet signs and sends.
- The ephemeral secret never leaves the device and is discarded only after a
  recoverable terminal state is reached.

### TC-TXN-003: Server + mobile validation before wallet prompt

**Priority:** P0 · **Type:** Security · **Status:** Not Run

**Expected**
- Server validates pool, mints, wallet authority, position public key,
  expected program IDs, and action parameters when building.
- Mobile independently validates returned wallet, pool, position, program
  allowlist, step count, and expiry before showing the wallet prompt.
- Simulation runs when RPC/tx type permits; a simulation failure blocks
  signing with a stable error code.

### TC-TXN-004: Signing and confirmation state machine

**Priority:** P0 · **Type:** Functional / State · **Status:** Not Run

**Steps**
1. Walk a transaction through prepared → awaiting_wallet → submitted →
   confirmed → syncing_resource → complete.
2. Force each alternative terminal state: wallet_rejected,
   expired_before_submit, simulation_failed, onchain_failed,
   partially_complete, confirmation_unknown.

**Expected**
- Each step signs only after the prior required step confirms.
- Pending plan/signature state persists locally across app background/return.
- Wallet rejection is shown as a rejection, not a protocol failure; inputs
  are preserved and the user returns safely to review.
- `confirmed` and `indexed` are tracked as distinct states; indexer lag shows
  `Confirmed on-chain — syncing position`, not failure.

### TC-TXN-005: No duplicate submission on repeated taps

**Priority:** P0 · **Type:** Functional / Regression · **Status:** Not Run

**Steps**
1. Rapidly tap the final action button multiple times during submission.

**Expected**
- Only one transaction is submitted.

### TC-TXN-006: Background/resume during wallet approval

**Priority:** P0 · **Type:** Functional / Mobile · **Status:** Not Run

**Steps**
1. Background the app during wallet approval, then return.

**Expected**
- Pending state and signature are preserved; the user can resume without
  losing track of the transaction or risking duplicate submission.

---

## 6. Wallet Support

### TC-WALLET-001: Unsupported Privy embedded wallet stays read-only

**Priority:** P0 · **Type:** Functional · **Status:** Not Run

**Steps**
1. With only the Privy embedded wallet active, browse Pools and Profile.
2. Attempt to execute.

**Expected**
- Browse and Profile work normally (read-only).
- Execution is blocked with a clear "wallet not supported" message.

### TC-WALLET-002: Supported MWA wallet full lifecycle

**Priority:** P0 · **Type:** Functional / Integration · **Status:** Not Run

**Steps**
1. Connect a Mobile Wallet Adapter–supported Solana wallet.
2. Complete create, add, claim, remove, and close.

**Expected**
- Each action signs and completes without the user's key leaving the device.

---

## 7. Security, Token Policy, and Risk Controls

### TC-SEC-001: Token-2022 default-block behavior

**Priority:** P0 · **Type:** Security · **Status:** Not Run

**Expected**
- Unknown/unsupported Token-2022 extensions and unresolved freeze-authority
  or transfer-hook behavior are blocked by default.
- `Verified metadata` is presented as metadata verification only, never a
  safety endorsement.

### TC-SEC-002: Program and account allowlist enforcement

**Priority:** P0 · **Type:** Security · **Status:** Not Run

**Expected**
- Official DLMM program ID and allowlisted supporting programs are verified
  on both API and mobile before signing.
- Wallet authority, pool address, position owner, token mints, and fee payer
  are all validated.

### TC-SEC-003: No secret material in logs

**Priority:** P0 · **Type:** Security · **Status:** Not Run

**Expected**
- No ephemeral position secret material or serialized signed transactions
  appear in logs.
- Analytics never contains raw wallet addresses, exact balances, exact
  deposit amounts, or position addresses.

### TC-SEC-004: Blacklist/eligibility rechecked immediately before build

**Priority:** P0 · **Type:** Security / Regression · **Status:** Not Run

**Expected**
- Eligibility is rechecked immediately before construction; a now-ineligible
  action is blocked even though the earlier read succeeded.

---

## 8. Loading, Empty, Stale, and Failure States

### TC-STATE-001: Full state matrix per screen

**Priority:** P0 · **Type:** State / UI · **Status:** Not Run

**Steps**
Exercise each state on Pools, Pool Detail, and Profile: Loading, Empty,
Stale, Partial, Offline, Upstream error, RPC error, Wallet rejected, Indexer
lag, Unknown confirmation.

**Expected**
- Loading: skeleton/progress with existing content retained where possible.
- Empty: explains whether it's no positions, no search match, or policy
  excluding all pools.
- Stale: shows last-updated time; browse continues, build/sign is disabled.
- Offline: cached read-only state shown; build/sign disabled.
- RPC error: shown distinctly from Meteora Data API error; never renders a
  false zero balance.
- No error state ever clears a submitted signature or invites a blind
  duplicate transaction.

---

## 9. Feature Flags, Rollback, and Operations

### TC-FLAG-001: Independent flag control

**Priority:** P0 · **Type:** Functional / Ops · **Status:** Not Run

**Steps**
1. Toggle each flag independently: `meteora_browse_enabled`,
   `meteora_execution_enabled`, `meteora_management_enabled`,
   `meteora_profile_enabled`.

**Expected**
- Each flag controls only its own surface.

### TC-FLAG-002: Global execution kill switch

**Priority:** P0 · **Type:** Ops / Reliability · **Status:** Not Run

**Expected**
- Takes effect without an app release.
- New execution is blocked; Profile and the Close action remain available
  per the documented rollback order.

### TC-FLAG-003: Rollback order is honored

**Priority:** P1 · **Type:** Ops · **Status:** Not Run

**Expected**
- Rollback order: (1) disable affected management action, (2) disable new
  execution while preserving Profile/Close, (3) keep read-only data
  available, (4) hide Meteora entirely only if reads are misleading/unsafe.

---

## 10. Caching and Freshness

### TC-PERF-001: Cache TTLs and stale fallback per resource

**Priority:** P1 · **Type:** Non-functional · **Status:** Not Run

**Expected**
- Approved pool list: fresh ≤20s, stale fallback ≤5min.
- Pool detail: fresh ≤10s, stale fallback ≤2min.
- Portfolio/positions: 5s deduplicated cache per wallet.
- Transaction preview/build: never served from stale cache.

---

## 11. Accessibility

### TC-A11Y-001: Touch targets and Pressable semantics

**Priority:** P0 · **Type:** Accessibility · **Status:** Not Run

**Expected**
- All interactive targets ≥44×44pt.
- Every Pressable exposes correct role, label, and state — including filter
  chips and retry buttons (regression check for a previously fixed defect).

### TC-A11Y-002: Font scaling and minimum text size

**Priority:** P0 · **Type:** Accessibility · **Status:** Not Run

**Expected**
- 200% system font scale does not clip critical amounts or CTAs.

### TC-A11Y-003: Non-color-only status communication

**Priority:** P0 · **Type:** Accessibility · **Status:** Not Run

**Expected**
- Range status (in/out of range) and the destructive Close confirmation are
  never conveyed by color alone.

### TC-A11Y-004: Action sheet focus management

**Priority:** P0 · **Type:** Accessibility · **Status:** Not Run

**Steps**
1. Open and close the position action sheet and each of its sub-flows
   (claim/remove/close).

**Expected**
- Focus moves into the sheet on open, is trapped while open, and returns to
  the invoking position row on close.

### TC-A11Y-005: TalkBack full-flow pass

**Priority:** P0 · **Type:** Accessibility / Release gate · **Status:** Not Run

**Steps**
1. Complete Pools → pool detail → create position → Profile → action sheet →
   claim → add → remove → close, entirely with Android TalkBack enabled.

**Expected**
- Every step is navigable and actionable via TalkBack.

### TC-A11Y-006: Reduced motion

**Priority:** P1 · **Type:** Accessibility · **Status:** Not Run

**Expected**
- Animations (including the action sheet's open/close transition) respect
  the OS reduced-motion preference.

---

## 12. Analytics and Privacy

### TC-ANALYTICS-001: Required product/reliability events fire

**Priority:** P1 · **Type:** Functional / Analytics · **Status:** Not Run

**Expected**
- Events fire for: tile opened; pool list loaded/failed/stale; pool opened;
  preview requested/blocked/expired; wallet readiness/prompt opened/rejected;
  transaction step submitted/confirmed/failed; position reconciled; profile
  loaded/empty/failed; add/claim/remove/close started/completed/failed.

### TC-ANALYTICS-002: No sensitive data in analytics payloads

**Priority:** P0 · **Type:** Privacy / Security · **Status:** Not Run

**Expected**
- Payloads contain no raw wallet address, exact balance, exact deposit
  amount, position address, or signed transaction.

---

## 13. Controlled Mainnet Validation (pre-beta gate)

### TC-MAINNET-001: End-to-end lifecycle on one approved high-liquidity pool

**Priority:** P0 · **Type:** E2E / Manual · **Status:** Not Run

**Steps**
1. Use one approved high-liquidity pool and the smallest meaningful amounts.
2. Create a position (Earn fees, two-token, Spot, default range); verify in
   Meteora's official app and myboon Profile.
3. Claim fees if available, via the action sheet.
4. Add a small additional amount, via the action sheet → add-mode pool detail.
5. Partially remove, via the action sheet.
6. Fully remove and close, via the action sheet.
7. Record every signature and compare displayed state against RPC and Meteora.

**Expected**
- Every step completes truthfully, matches on-chain/Meteora state, and no
  fabricated value is ever shown.

---

## 14. Beta Success Criteria Verification

### TC-BETA-001: Comprehension test (5-user moderated)

**Priority:** P0 · **Type:** Usability · **Status:** Not Run

**Expected — at least 4 of 5 users correctly identify:**
- which two assets they are depositing
- the selected price range
- that fees vary and are not guaranteed
- what `Out of range` means
- the number of wallet approvals still required
- how to claim fees, add more, remove, or close an existing position from Profile

### TC-BETA-002: Reliability thresholds

**Priority:** P0 · **Type:** Non-functional · **Status:** Not Run

**Expected**
- No critical crash in the Meteora journey on the target Android device.
- No fabricated pool, balance, fee, or P&L value observed.
- No duplicate transaction caused by UI retry.
- Every submitted signature remains recoverable after app background/restart.
- ≥95% of submitted test transactions reach a truthful terminal state or
  recoverable `confirmation_unknown`.
- Confirmed positions reconcile into Profile within 30 seconds.

### TC-BETA-003: Accessibility thresholds

**Priority:** P0 · **Type:** Accessibility · **Status:** Not Run

**Expected**
- All beta flows complete with TalkBack.
- 200% font scaling never hides review facts or the primary action.
- No action/status depends only on color or a gesture.

---

## Acceptance Criteria Traceability (beta)

| PRD Beta Acceptance Criterion | Covered by |
| --- | --- |
| Home tile opens real Pools route | TC-POOLS-001 |
| Pools exposes approved, non-blacklisted pools | TC-POOLS-006 |
| Search/sort/pagination/refresh/empty/stale states work | TC-POOLS-003–007 |
| Pool detail shows decision-level metrics, freshness, accessible summary | TC-DETAIL-001, TC-DETAIL-002 |
| Earn fees (two-token, Spot, default range) produces a valid range | TC-DETAIL-002, TC-DETAIL-003 |
| Review shows inputs, range, fees, slippage, costs, tx count, expiry, risk | TC-DETAIL-006 |
| Unsupported wallets can browse/view Profile but not execute | TC-WALLET-001 |
| Supported wallet creates position without secret leaving device | TC-TXN-002, TC-WALLET-002 |
| Transaction progress survives backgrounding, prevents duplicates | TC-TXN-005, TC-TXN-006 |
| Profile shows truthful positions, unavailable values marked as such | TC-PROFILE-002, TC-PROFILE-003 |
| Claim/Add/Remove/Close reachable via action sheet from Profile row | TC-POS-001–005, TC-MAINNET-001 |
| Add liquidity does not re-ask goal/distribution/range | TC-DETAIL-008, TC-POS-002 |
| Pool/token/program/account/tx-plan validation runs before signing | TC-TXN-001, TC-TXN-003, TC-SEC-001–004 |
| Browse/execution/profile/management disable independently | TC-FLAG-001–003 |
| TalkBack, large text, min touch-target checks pass | TC-A11Y-001–006, TC-BETA-003 |
| Beta Readiness PRD updated after approval | Out of test scope — documentation follow-up. |

---

## Exit Criteria (beta)

- All P0 test cases in this document pass, or have a documented, approved exception.
- Controlled mainnet validation (Section 13) completes with every signature
  recorded and cross-checked against RPC and Meteora's own app.
- Beta success criteria (Section 14) are measured and meet threshold.
- The confirmed QA blockers this scope change was written to fix — position-row
  routing and stuck balance loading — are re-verified as fixed via
  TC-PROFILE-003 and TC-DETAIL-004.

---

## Postponed (post-beta)

These PRD requirements and their test cases are out of scope for this beta
per the Beta Scope Amendment. They are not deleted — retained here as a
pointer for the post-beta scoping pass, so nothing needs to be re-derived
from the PRD from scratch later:

- **Buy lower / Sell higher goals** — single-sided DCA positions.
- **Focused / Balanced / Wide presets and manual min/max range entry** —
  beta ships one calculated default range only.
- **Ape In / Zap In ("Start with one token")** — swap-plus-liquidity combined flow.
- **DLMM limit orders in full** — discovery, place, monitor, partial-fill,
  cancel, close, the pool-detail Limit tab, and the Profile Orders tab.
- **A dedicated Position Detail route/screen** — superseded by the action-sheet
  model in Section 4; revisit only if usage shows action sheets are
  insufficient.

When any of these come back into scope, restore the corresponding test
cases from this document's prior version (git history) rather than
rewriting them from the PRD.
