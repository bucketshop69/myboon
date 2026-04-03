# #063 — Wallet Connect (Expo Mobile)

## Status: BACKLOG — highest priority blocker for BOTH tracks

**Blocks Predict:** #062 (profile), #064 (cash out/loss cut), #065 (CLOB auth), #066 (order execution)
**Blocks Trade:** #068 (order execution), #054 (builder code)

## Problem

The mobile app has no working wallet connection. The existing `WalletProvider.tsx` uses `@solana/wallet-adapter-react` — a **web-only** package that does not work in React Native / Expo. The `WalletModal.tsx` is a placeholder with non-functional buttons.

Every execution feature (profile positions, cash out, loss cut, order placement) is blocked on this.

## Current state (broken)

```
apps/hybrid-expo/providers/WalletProvider.tsx   — web-only, imports @solana/wallet-adapter-react
apps/hybrid-expo/components/wallet/WalletModal.tsx — placeholder, buttons do nothing
apps/hybrid-expo/components/wallet/WalletButton.tsx — exists, status unknown
hooks/useWallet.ts — DOES NOT EXIST
```

## Approach options

### Option A: Phantom Deep Link (simplest, recommended for MVP)

Phantom supports a deep link protocol for React Native:
1. App opens `phantom://connect?...` with a redirect URI
2. Phantom app opens, user approves
3. Phantom redirects back with the public key + session
4. App stores the address in AsyncStorage

Pros: No SDK dependency, works with any Expo setup, most users have Phantom.
Cons: Phantom-only (add more wallets later), requires `expo-linking` for redirect handling.

### Option B: Mobile Wallet Adapter (`@solana-mobile/wallet-adapter-mobile`)

Solana's official mobile standard. Works with any compliant wallet (Phantom, Solflare, etc).
Pros: Multi-wallet support out of the box.
Cons: More complex setup, may need `expo-prebuild` (no Expo Go).

### Option C: WalletConnect v2

Uses `@walletconnect/react-native-compat`.
Pros: Universal (Ethereum + Solana wallets).
Cons: Heaviest dependency, complex setup, WalletConnect infra sometimes flaky.

**Recommendation:** Option A (Phantom deep link) for MVP. Fastest to ship, covers 80%+ of Solana mobile users. Expand to Option B later.

## Scope

### 1. Remove broken web-only provider
- Delete or rewrite `providers/WalletProvider.tsx` — remove `@solana/wallet-adapter-react` import
- Rewrite `WalletModal.tsx` — show Phantom connect option with deep link

### 2. Create `useWallet()` hook

```ts
// apps/hybrid-expo/hooks/useWallet.ts
interface WalletState {
  connected: boolean
  address: string | null           // base58 Solana pubkey
  shortAddress: string | null      // "7xKp···m3Qr"
  connect: () => Promise<void>     // triggers Phantom deep link
  disconnect: () => void           // clears stored state
}
```

- State backed by React Context + AsyncStorage (persists across app restarts)
- `connect()` opens Phantom deep link, handles redirect callback
- Both Trade tab and Predict tab consume the same hook

### 3. Expo deep link setup
- Configure `app.json` with custom scheme for redirect (e.g. `myboon://`)
- Use `expo-linking` to handle the return callback from Phantom
- Parse the `phantom_encryption_public_key` + `nonce` + `data` from redirect

### 4. Wallet state UI
- Connected: show short address + disconnect option in WalletModal
- Disconnected: show "Connect Phantom" button

## Dependencies

- `expo-linking` — handle deep link redirects (may already be in Expo)
- `@react-native-async-storage/async-storage` — persist wallet address
- `tweetnacl` — decrypt Phantom's response payload (already in shared package)
- `bs58` — base58 encode/decode (already in shared package)

## NOT in scope

- Transaction signing — separate issues: #066 (Predict orders), #068 (Trade orders)
- CLOB authentication — separate issue (#065)  
- Polygon address mapping — separate issue (#065)
- Multi-wallet support — future enhancement
- Pacific order signing — separate issue (#068), but requires `signMessage` capability from this hook

## Critical note for parallel agents

After #063 lands, **two agents can work in parallel**:
- **Predict agent** picks up #065 → #062 → #066 → #064 (Polygon/CLOB path)
- **Trade agent** picks up #068 → #054 (Solana/Pacific path, simpler signing)

The agents share:
- `useWallet()` hook (read address + trigger signing)
- `WalletProvider` in app root
- `WalletModal` component
- `BottomGlassNav`, `FeedHeader`, theme tokens

The agents do NOT cross:
- API clients (`predict.api.ts` vs `perps.api.ts`)
- Types (`predict.types.ts` vs `perps.types.ts`)
- Signing infra (EIP-712/ethers vs Ed25519/tweetnacl)
- Detail screens, list screens, all feature UI

## Files

```
apps/hybrid-expo/providers/WalletProvider.tsx     — rewrite (context provider + AsyncStorage)
apps/hybrid-expo/hooks/useWallet.ts               — new (consumer hook)
apps/hybrid-expo/components/wallet/WalletModal.tsx — rewrite (Phantom deep link UI)
apps/hybrid-expo/components/wallet/WalletButton.tsx — update (consume useWallet)
apps/hybrid-expo/app.json                         — add scheme for deep link redirect
```

## Acceptance

- [ ] `useWallet().connect()` opens Phantom app via deep link
- [ ] On return, `useWallet().address` contains the Solana pubkey
- [ ] `useWallet().connected` is `true` after successful connect
- [ ] Address persists in AsyncStorage across app restarts
- [ ] `useWallet().disconnect()` clears stored state
- [ ] Profile screen (#062) and Trade tab both read from same hook
- [ ] WalletModal shows "Connect Phantom" when disconnected, address + "Disconnect" when connected
- [ ] Works on physical Android device (not just Expo Go simulator)
- [ ] `@solana/wallet-adapter-react` removed from dependencies
