# Perps Venue Integration Checklist

Use this checklist when adding a new perps venue such as Hyperliquid, Drift, or another Phoenix-like application. The goal is to keep every perps venue consistent across Markets, market details, profile, wallet drawer, execution, and history.

## 1. Markets Home

- Add the app card to the Markets home screen.
- Show venue icon, venue name, family `Perps`, venue status, and two useful signals.
- Route the card to `/markets/{venue}`.
- Keep the card density, theme, and status language consistent with Pacifica and Phoenix.
- Do not add unsupported stats just to fill the card.

## 2. Wallet Drawer Entry

- Add the venue profile entry to the wallet drawer.
- Route it to `/markets/{venue}/profile`.
- Show a clear venue label and icon.
- Use the same connected/no-account/readiness behavior as the existing perps venues.
- Ensure wallet drawer profile access works even when the user is not coming from the Markets tab.

## 3. Market List

- Add `/markets/{venue}`.
- Show symbol, max leverage, price, 24h change, and open interest when available.
- Hide or gracefully degrade unavailable fields.
- Add search.
- Match the Pacifica/Phoenix list layout and visual density.
- Use live stats when the venue supports them, not only static market config.
- Tapping a row must route to `/markets/{venue}/{symbol}`.

## 4. Market Detail

- Add `/markets/{venue}/{symbol}`.
- Match the perps detail pattern: header price, chart, market stats, order ticket, and user positions below.
- Support buy/sell or long/short.
- Support market orders.
- Support limit orders when the venue supports them.
- Validate amount, balance, min order size, margin, and reduce-only flows before submission.
- Show clear wallet/API errors.
- Show positions for the current market.
- Support close position.
- Support set/edit TP/SL.
- Support clear/cancel TP/SL from the detail position card.
- Refresh position state after order, close, TP/SL, or cancel actions.

## 5. Profile

- Add `/markets/{venue}/profile`.
- Show account summary: equity, margin used, available/withdrawable, unrealized PnL, account leverage, and risk.
- Show deposit and withdraw actions when supported.
- Include positions tab.
- Include orders tab.
- Include history tab.
- Positions must support close and TP/SL.
- Orders must support cancel/clear where the venue supports it.
- History should include trades, orders, collateral, deposits/withdrawals, and funding where available.
- Empty states should explain whether the user has no account, no positions, no orders, or no history.

## 6. Backend/API Adapter

- Create a venue adapter under the API layer.
- Normalize market list data to the shared perps shape.
- Normalize market detail and live stats.
- Normalize account/profile state.
- Normalize positions.
- Normalize open orders and conditional orders.
- Normalize order, trade, collateral, deposit, withdraw, and funding history where available.
- Preserve useful raw venue responses for debugging.
- Add builder or signed API routes for:
  - market order
  - limit order
  - close/reduce-only order
  - set/edit TP/SL
  - clear/cancel TP/SL
  - cancel open order
  - deposit
  - withdraw

## 7. Wallet And Auth

- Document the venue auth model before implementation.
- Confirm whether the venue uses wallet transaction signing, wallet-message auth, API/session auth, or API keys.
- Implement account detection for the connected wallet.
- Handle connected-wallet-but-no-venue-account states.
- Handle activation, invite, registration, or subaccount creation if required.
- Keep auth and signing behavior consistent between market detail, profile, and wallet drawer routes.

## 8. Execution

- Prefer the official venue SDK when available.
- Build transactions or signed API payloads on the backend when secrets or venue SDK constraints require it.
- Simulate chain transactions before wallet send when possible.
- Log simulation failures with instruction/action context.
- Validate order size before building the transaction.
- Validate transferable funds, not only total balance.
- Show insufficient balance, reserved margin, min size, and venue rejection errors in user-readable language.
- Refresh state after every successful action.
- Do not mark success until the wallet/API returns a usable signature or order id.

## 9. TP/SL

- Confirm whether TP/SL is attached to an order, position-level, trigger-order based, or venue-side conditional.
- Confirm trigger direction mapping for long and short positions.
- Prefer fixed position size when setting TP/SL from an existing position.
- Use percent-based sizing only when the venue requires it or no fixed size exists.
- Show TP/SL on position cards in both market detail and profile.
- Show active TP/SL in orders if the venue exposes them as open orders/triggers.
- Add clear/cancel action wherever TP/SL is displayed.
- Refresh positions and orders after TP/SL set/edit/clear.

## 10. Deposit And Withdraw

- Identify supported collateral assets and networks.
- Build deposit flow.
- Build withdraw flow.
- Validate amount.
- Show available/transferable collateral.
- Handle reserved margin and withdrawal cooldown errors.
- Refresh profile and collateral history after successful deposit/withdraw.

## 11. UX Parity Review

- Compare against Pacifica and Phoenix before calling the venue complete.
- Check Markets home card.
- Check wallet drawer entry.
- Check market list.
- Check market detail.
- Check profile.
- Check order ticket.
- Check positions.
- Check orders.
- Check history.
- Check deposit/withdraw.
- Remove unsupported sections instead of showing empty or misleading values.
- Keep theme, spacing, typography, and mobile density consistent.

## 12. QA Pass

- Markets card opens the venue.
- Wallet drawer opens the venue profile.
- Market list loads and search works.
- Market row opens details.
- Details chart and stats load.
- Market order can be submitted.
- Limit order can be submitted or is clearly unavailable.
- Position appears in market detail.
- Position appears in profile.
- TP/SL can be set from profile.
- TP/SL can be set from market detail.
- TP/SL can be cleared from profile/orders.
- TP/SL can be cleared from market detail.
- Position can be closed.
- Open orders appear.
- Open orders can be canceled.
- Trade/order/collateral history appears.
- Deposit works when supported.
- Withdraw works when supported.
- All successful actions refresh the UI.
- All expected failure states show actionable messages.
