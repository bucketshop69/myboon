# 001: Wallet Connection

## Goal

Add wallet connection to MYBOON with both traditional wallets AND Lazorkit passkey auth.

## Why

Users need to authenticate to:

1. Save their P&L cards to a collection
2. Access gasless transactions (via Lazorkit paymaster)
3. Future: mint P&L as NFTs

---

## Critical Thinking & Decisions

### Decision 1: Why not Lazorkit-only?

**Considered:** Use only Lazorkit passkey auth (simpler, fewer deps)

**Rejected because:**
- Power users already have Phantom/Backpack installed
- Forcing passkey-only alienates existing crypto users
- Wallet Adapter lets us support BOTH with same codebase

**Chosen:** Lazorkit as ONE option among many wallets

---

### Decision 2: Why Wallet Standard over custom UI?

**Considered:** Build custom modal with separate Lazorkit + wallet buttons

**Rejected because:**
- Two different `useWallet` hooks to manage
- State sync issues (which connection is active?)
- More code to maintain

**Chosen:** Register Lazorkit via Wallet Standard → appears in existing modal

**Tradeoff:** Less control over Lazorkit's position in the list, but unified codebase wins.

---

### Decision 3: Why not use LazorkitProvider directly?

**Considered:** Wrap app with `LazorkitProvider` from `@lazorkit/wallet`

**Rejected because:**
- That's for Lazorkit-only apps
- We want multi-wallet support
- `registerLazorkitWallet()` is the integration path for wallet-adapter

**Chosen:** Use `registerLazorkitWallet()` + standard wallet-adapter providers

---

### Decision 4: Devnet vs Mainnet

**Chosen:** Devnet for MVP

**Why:**
- Bounty requires devnet demo
- No real funds at risk during development
- Lazorkit paymaster is free on devnet

**Future:** Add network switcher, use env vars for RPC/paymaster URLs

---

### Risk: What if Lazorkit doesn't appear in wallet list?

**Root cause:** `registerLazorkitWallet()` called AFTER `WalletProvider` mounts

**Mitigation:** 
- Call `registerLazorkitWallet()` in `useEffect` with empty deps `[]`
- Ensure it runs before wallet detection happens
- Add console log to confirm registration

---

## Approach

Use **Solana Wallet Adapter** with **Lazorkit registered as a wallet option**.

This means:
- Phantom, Solflare, Backpack show up as options
- Lazorkit passkey appears alongside them
- Same `useWallet()` hook works for all
- No separate auth systems to maintain

---

## Implementation Steps

### Step 1: Install dependencies
```bash
pnpm add @lazorkit/wallet @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/web3.js @coral-xyz/anchor buffer
```

### Step 2: Create wallet provider
- Create `src/providers/WalletProvider.tsx`
- Register Lazorkit wallet on mount via `registerLazorkitWallet()`
- Wrap app with `ConnectionProvider` → `WalletProvider` → `WalletModalProvider`

### Step 3: Add connect button to header
- Create `src/components/ConnectButton.tsx`
- Use `useWallet()` from wallet-adapter
- Show connected address or "Connect Wallet" button

### Step 4: Add Buffer polyfill (Next.js specific)
- Handle `Buffer is not defined` error
- Add polyfill in layout.tsx or providers file

### Step 5: Import wallet-adapter CSS
- Import `@solana/wallet-adapter-react-ui/styles.css`

---

## Config (Devnet)

```typescript
export const LAZORKIT_CONFIG = {
  RPC_URL: "https://api.devnet.solana.com",
  PORTAL_URL: "https://portal.lazor.sh",
  PAYMASTER: {
    paymasterUrl: "https://kora.devnet.lazorkit.com"
  },
  CLUSTER: "devnet" as const
};
```

---

## Acceptance Criteria

- [x] User can click "Connect Wallet" button
- [x] Modal shows Lazorkit + any installed browser wallets
- [x] Selecting Lazorkit triggers passkey prompt (FaceID/TouchID/Windows Hello)
- [x] Selecting traditional wallet opens that wallet's popup
- [x] Connected wallet address displays below input (full address, greyed)
- [x] Can disconnect wallet (logout icon)
- [x] Session persists on page refresh (autoConnect works)
- [x] No console errors related to Buffer or SSR

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/providers/WalletProvider.tsx` | Create |
| `src/components/ConnectButton.tsx` | Create |
| `src/app/layout.tsx` | Modify (wrap with provider) |
| `src/lib/config.ts` | Create (centralize config) |

---

## References

- [Lazorkit Wallet Standard Docs](https://docs.lazorkit.com/wallet-standard)
- [Solana Wallet Adapter Docs](https://github.com/solana-labs/wallet-adapter)
- [Lazorkit Troubleshooting](https://docs.lazorkit.com/troubleshooting)
