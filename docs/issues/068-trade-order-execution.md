# #068 — Trade Order Execution (Pacific Perps)

## Status: BACKLOG

## Problem

The Trade tab (#053) has a complete order form UI (size input, leverage slider, order type selector, Long/Short buttons) but **nothing submits**. All buttons are visual-only. Users can browse markets and see live prices but cannot trade.

The Pacific SDK (`packages/shared/src/pacific/client.ts`) already has `createMarketOrder()` and `createLimitOrder()` with full Solana Ed25519 signing — it just needs to be wired to the mobile UI.

## Depends On

- **#063 done** — Wallet Connect (need connected Solana wallet with signing capability)
- **#054** — Builder Code (orders should include `builder_code: "MYBOON"` for fee share — can be added after MVP)

## Key difference from Predict (#066)

Trade signing is **simpler** than Predict:
- Pacific is on **Solana** — same chain as user's wallet
- PacificClient already implements signing via `tweetnacl` + `bs58`
- No address mapping needed (unlike Polymarket's Polygon problem)
- The SDK is done — this is a wiring issue, not a crypto engineering issue

The challenge: `PacificClient` takes a `Keypair` in the constructor for signing. The mobile wallet (Phantom deep link) gives us a **public key but not the private key**. We need either:
- **Option A:** Use Phantom's `signMessage` deep link to sign each request externally
- **Option B:** Use Mobile Wallet Adapter which provides transaction signing
- **Option C:** Pacific adds a session-based auth (unlikely, we don't control their API)

**Recommendation:** Option A or B — depends on which approach #063 ships. If Phantom deep link: use `phantom://signMessage` for each order. If Mobile Wallet Adapter: use `signMessage()` from the adapter.

## Scope

### 1. Connect PacificClient to wallet

```ts
// Current: PacificClient needs a Keypair (has private key)
const client = new PacificClient({ env: 'mainnet', keypair: someKeypair })

// Needed: PacificClient accepts an external signer
const client = new PacificClient({
  env: 'mainnet',
  signer: {
    publicKey: wallet.publicKey,
    sign: (message: Uint8Array) => wallet.signMessage(message)
  }
})
```

Requires modifying `packages/shared/src/pacific/client.ts` to support an external signer interface alongside the existing Keypair path.

### 2. Order submission flow

Wire the existing Market tab order form to actually submit:

1. User fills size + leverage + selects Long/Short
2. Tap "Long" or "Short" on ActionDock
3. **Confirmation modal**: show order summary (symbol, side, size, leverage, est. fee, est. liq price)
4. User confirms → build order via PacificClient
5. Sign with connected wallet (Phantom deep link `signMessage` or MWA)
6. Submit to Pacific API
7. Show result: success (order ID, fill price) or error (insufficient margin, rejected)

### 3. Order status tracking

- After submission, poll `getOpenOrders(address)` for status
- Show pending → filled transition
- Toast notification on fill

### 4. Position management (close position)

The Profile tab already shows open positions. Add:
- "Close" button per position
- Tapping close → confirmation modal → `createMarketOrder()` with `reduceOnly: true`
- Update positions list after close

### 5. Error handling

- Insufficient margin: show balance + "Deposit" CTA
- Rate limited: queue and retry (PacificClient already tracks rate limits)
- Network error: retry with backoff
- Market closed/halted: disable order form

## Files

```
packages/shared/src/pacific/client.ts               — add external signer interface
apps/hybrid-expo/features/perps/MarketDetailScreen.tsx — wire order form to submission
apps/hybrid-expo/features/perps/components/OrderConfirmModal.tsx — new: confirmation before submit
apps/hybrid-expo/features/perps/components/ClosePositionModal.tsx — new: close position confirm
apps/hybrid-expo/features/perps/perps.api.ts         — add submitOrder(), closePosition()
apps/hybrid-expo/features/perps/perps.types.ts       — add OrderParams, OrderResult types
```

## Acceptance

- [ ] User can submit a market order (Long/Short) from the Market tab
- [ ] Confirmation modal shows before submission
- [ ] Order is signed with connected wallet (Phantom or MWA)
- [ ] Order includes `builder_code: "MYBOON"` when #054 is done (optional for MVP)
- [ ] Success: show order confirmation with fill details
- [ ] Failure: show error with actionable message
- [ ] User can close an open position from the Profile tab
- [ ] Position list updates after close
- [ ] Insufficient margin shows deposit CTA
- [ ] PacificClient supports external signer (not just raw Keypair)
