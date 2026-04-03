# #066 — Order Execution Pipeline (Predict)

## Status: BACKLOG

## Problem

The Predict detail screens have YES/NO CTA buttons that navigate to the detail view but there is **no way to actually place a bet**. The entire order flow is missing:

- No bet slip / order form UI
- No order signing (CLOB requires signed orders)
- No order submission
- No order status tracking
- No confirmation / error handling
- The existing `POST /predict/order` API endpoint is a forward-only stub

This is the core transaction layer that #064 (cash out, loss cut) builds on top of.

## Depends On

- **#063 done** — Wallet Connect (need connected wallet)
- **#065 v2 done** — CLOB Auth with embedded Polygon wallet (need L2 API key to sign orders)

## Scope

### 1. Bet Slip UI

Bottom sheet or modal that appears when user taps YES/NO on a market detail screen.

```
┌──────────────────────────────────┐
│  Will X happen?            YES   │
│                                  │
│  Amount (USDC)                   │
│  ┌──────────────────────────┐    │
│  │ $100                     │    │
│  └──────────────────────────┘    │
│  Quick: $10  $50  $100  $500     │
│                                  │
│  Price:     $0.62                │
│  Shares:    161.3                │
│  Potential: $161.30 (+61.3%)     │
│  Fee:       $0.32                │
│                                  │
│  ┌──────────────────────────┐    │
│  │    Place Order            │    │
│  └──────────────────────────┘    │
│  Insufficient balance? Deposit   │
└──────────────────────────────────┘
```

### 2. Order builder

Build a valid Polymarket CLOB order:
- Market order: buy at best ask price
- Limit order (v2): buy at user-specified price
- Calculate shares from amount + price
- Calculate fees (Polymarket takes ~2% on winnings, not on bet)

```ts
interface PredictOrder {
  marketId: string        // condition ID
  tokenId: string         // CLOB token ID (yes or no)
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT'
  amount: number          // USDC amount
  price: number           // limit price (for LIMIT orders)
  shares: number          // computed: amount / price
}
```

### 3. Order signing

Polymarket CLOB orders must be signed with the user's Polygon private key (from #065 embedded wallet):
- Build order payload per CLOB spec
- Sign with `ethers.Wallet.signTypedData()` (EIP-712)
- Attach signature to order

### 4. Order submission

- `POST /predict/order` — forward signed order to `https://clob.polymarket.com/order`
- Handle responses: filled, partial fill, rejected
- Return order ID for tracking

### 5. Order status tracking

- `GET /predict/orders/:address` — already exists (stub)
- Poll for order status updates (filled, cancelled, expired)
- Show in-app notification on fill

### 6. Confirmation & error handling

- Pre-submit confirmation modal: "Buy 161 YES shares at $0.62 for $100?"
- Insufficient balance: show deposit CTA
- Market closed: disable order form, show "Market resolved"
- Network error: retry with exponential backoff
- Slippage: warn if price moved >2% since bet slip opened

## Files

```
apps/hybrid-expo/features/predict/components/BetSlip.tsx        — new: order form bottom sheet
apps/hybrid-expo/features/predict/components/OrderConfirmModal.tsx — new: confirmation before submit
apps/hybrid-expo/features/predict/components/OrderStatusBadge.tsx  — new: pending/filled/error indicator
apps/hybrid-expo/features/predict/predict.api.ts                — add submitOrder(), fetchOrderStatus()
apps/hybrid-expo/features/predict/predict.types.ts              — add PredictOrder, OrderStatus types
apps/hybrid-expo/features/predict/PredictMarketDetailScreen.tsx — wire YES/NO buttons to BetSlip
apps/hybrid-expo/features/predict/PredictSportDetailScreen.tsx  — wire outcome buttons to BetSlip
packages/api/src/index.ts                                       — flesh out POST /predict/order
```

## NOT in scope

- Limit orders (v2)
- Partial fills handling
- Order book display
- Advanced order types (stop, trailing stop)
- Cash out / loss cut (that's #064, builds on this)

## Acceptance

- [ ] Tapping YES/NO on market detail opens bet slip
- [ ] User can enter USDC amount (or use quick-select pills)
- [ ] Shares and potential payout calculated in real-time
- [ ] Confirmation modal shows before order submission
- [ ] Order submitted to CLOB via API proxy
- [ ] Success: show confirmation + navigate to positions
- [ ] Failure: show error message, allow retry
- [ ] Insufficient balance: show deposit CTA
- [ ] Market closed: order form disabled
