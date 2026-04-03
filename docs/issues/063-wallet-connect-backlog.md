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

## Approach: Solana Mobile Wallet Adapter (MWA) — Seeker-native

**Package:** `@wallet-ui/react-native-web3js`
**Docs:** https://docs.solanamobile.com
**Tutorial:** `docs/tutorials/09-solana-mobile-wallet-adapter.md`

myboon debuts as a **Seeker-exclusive** app. MWA is the native wallet SDK on Seeker phones.

Why MWA over Phantom deep links:
- Works with ANY MWA wallet (Phantom, Solflare, Seeker built-in)
- `signMessage()` built in — Pacific order signing works directly (#068)
- `signAndSendTransaction()` built in — on-chain txs ready
- Seeker-native — zero friction on target hardware
- Expo compatible (custom dev build, no Expo Go)

**Expo constraint:** MWA is Android-only (Seeker is Android). iOS Phantom deep link fallback can be added later.

## Scope

### 1. Remove broken web-only provider
- Delete or rewrite `providers/WalletProvider.tsx` — remove `@solana/wallet-adapter-react` import
- Rewrite `WalletModal.tsx` — show Phantom connect option with deep link

### 2. Create `useWallet()` hook — thin wrapper around `useMobileWallet()`

```ts
// apps/hybrid-expo/hooks/useWallet.ts
import { useMobileWallet } from '@wallet-ui/react-native-web3js';

export function useWallet() {
  const { account, connect, disconnect, signMessage, signAndSendTransaction, connection } = useMobileWallet();
  return {
    connected: !!account,
    address: account?.address ?? null,
    shortAddress: account ? `${account.address.slice(0,4)}···${account.address.slice(-4)}` : null,
    connect,
    disconnect,
    signMessage,              // for Pacific order signing (#068)
    signAndSendTransaction,   // for on-chain txs
    connection,               // Solana RPC Connection
  };
}
```

- Both Trade tab and Predict tab consume the same hook
- `signMessage` eliminates need for separate signing infra

### 3. Polyfill + entry point setup

```js
// polyfill.js — must load before @solana/web3.js
import { install } from 'react-native-quick-crypto';
install();

// index.js — new app entry
import './polyfill';
import 'expo-router/entry';
```

### 4. Provider in `_layout.tsx`

```tsx
<MobileWalletProvider chain="solana:mainnet-beta" endpoint={rpcUrl} identity={appIdentity}>
  <Slot />
</MobileWalletProvider>
```

### 5. Build configuration
- `expo run:android` (no Expo Go — MWA uses Kotlin native modules)
- Add `expo-dev-client` to dependencies

## Dependencies

```bash
pnpm --filter hybrid-expo add @wallet-ui/react-native-web3js react-native-quick-crypto @solana/web3.js expo-dev-client
```

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
