# #065 — Polymarket CLOB Auth & Address Mapping

## Status: BACKLOG

## Problem

Polymarket runs on **Polygon**, not Solana. Our app connects Solana wallets (#063). To query user positions, place orders, or do anything authenticated on Polymarket's CLOB, we need to:

1. **Map Solana address → Polymarket identity** — either the user provides their Polygon/Polymarket address, or we build a linking mechanism
2. **Authenticate with CLOB API** — Polymarket requires L1 + L2 API key headers for any user-specific operation (positions, orders, trades)

Without this, #062 (profile), #064 (cash out/loss cut), and #066 (order execution) are all impossible.

## Depends On

- **#063 done** — Wallet Connect (need a connected Solana address first)

## The Polymarket Auth Flow

Polymarket uses a two-level API key system:

### L1 Auth (read-only)
- Derive API key from wallet signature (EIP-712 typed data)
- Used for: reading positions, trade history, open orders
- Endpoint: `POST https://clob.polymarket.com/auth/derive-api-key`

### L2 Auth (read + write)
- Full API credentials with signing capability  
- Used for: placing orders, cancelling orders
- Endpoint: `POST https://clob.polymarket.com/auth/create-api-key`
- Returns: `apiKey`, `secret`, `passphrase`

### The Polygon problem

CLOB auth requires an **Ethereum/Polygon signature** (EIP-712). Our users connect Solana wallets. Options:

#### Option A: Manual Polymarket username / address input (MVP)
- User pastes their Polymarket profile URL or Polygon address in settings
- We query positions via the public data API (no CLOB auth needed for read)
- `data-api.polymarket.com/activity?user=<address>` — public, no auth
- Limits: read-only, no order placement

#### Option B: Polymarket OAuth / API proxy  
- User logs into Polymarket via browser, we get a session token
- Requires web view flow in Expo
- More complex but enables full execution

#### Option C: Embedded Polygon wallet
- Generate a Polygon keypair client-side, store encrypted
- User deposits USDC to this address on Polygon
- Full CLOB auth possible (we control the Polygon key)
- Heaviest lift, but gives full execution capability

**Recommendation:** Option A for MVP (profile read-only via public API). Option C for full execution later.

## Scope (MVP — Option A)

### 1. Polymarket address input
- Settings screen or profile screen: text input for Polymarket address / profile URL
- Parse Polygon address from URL (e.g. `polymarket.com/profile/0x...`)
- Store in AsyncStorage alongside Solana address

### 2. Public API position queries
- `data-api.polymarket.com/activity?user=<polygon_address>` — no auth needed
- `data-api.polymarket.com/positions?user=<polygon_address>` — no auth needed
- Map response to our `PredictPosition` type

### 3. API proxy endpoints
- Update `GET /predict/portfolio/:address` to use public data API (no CLOB auth)
- Update `GET /predict/holdings/:address` — query USDC balance on Polygon via public RPC

## Scope (v2 — Option C, for execution)

### 4. Embedded Polygon wallet
- Generate `ethers.Wallet` keypair on first use
- Encrypt private key with user's Solana signature as passphrase
- Store encrypted key in AsyncStorage
- Expose via `usePolymarketWallet()` hook

### 5. CLOB API key derivation
- Sign EIP-712 typed data with embedded Polygon wallet
- `POST /auth/derive-api-key` → store `apiKey` + `secret` + `passphrase`
- Auto-refresh when expired

### 6. Deposit bridge
- User bridges USDC from Solana → Polygon (Wormhole / deBridge)
- Or deposits USDC directly to their Polygon address
- Show Polygon USDC balance in portfolio

## Files

```
apps/hybrid-expo/hooks/usePolymarketAddress.ts   — new: read/write Polymarket address from AsyncStorage
apps/hybrid-expo/features/predict/PolymarketLinkScreen.tsx — new: input screen for linking Polymarket address
packages/api/src/index.ts                         — update portfolio/holdings to use public data API
```

## Acceptance (MVP)

- [ ] User can input their Polymarket profile URL or Polygon address
- [ ] Address is parsed and stored in AsyncStorage
- [ ] `GET /predict/portfolio/:address` returns positions using public data API (no CLOB auth)
- [ ] Profile screen shows positions for the linked Polymarket address
- [ ] Clear "Link Polymarket Account" CTA on profile screen when no address is linked
- [ ] User can update or remove their linked address

## Acceptance (v2 — execution)

- [ ] Embedded Polygon wallet generated and encrypted
- [ ] CLOB L1 API key derived from Polygon wallet signature
- [ ] CLOB L2 API key created for order placement
- [ ] API keys stored securely and auto-refreshed
- [ ] Deposit bridge shows Polygon USDC balance
