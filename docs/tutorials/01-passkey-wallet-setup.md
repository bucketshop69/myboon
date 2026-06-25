# Tutorial: Current Wallet Onboarding with Privy

This guide documents the current wallet onboarding path used by the MYBOON mobile app. The active app flow uses **Privy** for email OTP and passkey authentication, then hydrates a Privy embedded Solana wallet for the user.

## Current app path

- `apps/hybrid-expo/hooks/usePrivyWallet.ts` wraps Privy's embedded Solana wallet APIs.
- `apps/hybrid-expo/components/drawer/WalletDrawer.tsx` calls the Privy email OTP and passkey handlers from the wallet drawer.
- `apps/hybrid-expo/hooks/useWallet.ts` remains the Solana Mobile Wallet Adapter path for external wallets.
- `apps/hybrid-expo/hooks/usePolymarketWallet.ts` consumes the connected wallet interface for Predict/Polymarket signing.

## 1. Privy wallet hook

`usePrivyWallet` exposes the app-facing wallet state and auth actions:

```typescript
import { usePrivy, useEmbeddedSolanaWallet, useLoginWithEmail, isConnected } from '@privy-io/expo';
import { useLoginWithPasskey, useSignupWithPasskey } from '@privy-io/expo/passkey';
```

The hook reports:

- whether the user is authenticated with Privy
- whether the embedded Solana wallet is connected or still preparing
- the embedded wallet address
- email OTP login helpers
- passkey login/signup helpers
- `waitForWallet()` for post-auth hydration
- `signMessage` for wallet-backed message signing

## 2. Email OTP onboarding

The wallet drawer sends an email OTP, verifies the code, waits for the embedded wallet, and then closes the drawer once the wallet is ready.

```typescript
await privy.sendEmailOTP(emailInput.trim());
await privy.loginWithEmailOTP(otpCode.trim());
await privy.waitForWallet();
```

## 3. Passkey onboarding

The wallet drawer first attempts passkey login for existing users. If that fails, it falls back to passkey signup, then waits for the embedded Solana wallet to hydrate.

```typescript
try {
  await privy.loginWithPasskey();
} catch {
  await privy.signupWithPasskey();
}
await privy.waitForWallet();
```

## 4. Embedded Solana wallet creation

After Privy authentication, `usePrivyWallet` auto-creates an embedded Solana wallet when Privy reports the wallet status as `not-created`.

```typescript
if (authenticated && solanaWalletStatus === 'not-created' && createSolanaWallet && !creatingRef.current) {
  creatingRef.current = true;
  createSolanaWallet();
}
```

The wallet is considered ready only when the embedded wallet has an address.

## 5. External wallet path

The app still supports external Solana wallets through Solana Mobile Wallet Adapter. Those wallets are separate from Privy's embedded wallet path and should be described as external-wallet behavior.

## Current behavior summary

| Behavior | Current source of truth |
| --- | --- |
| Email OTP login | Privy wallet drawer flow |
| Passkey login/signup | Privy passkey hooks |
| Embedded Solana wallet | Privy embedded wallet hook |
| External Solana wallet | Solana Mobile Wallet Adapter hook |
| Predict/Polymarket message signing | Current wallet interface consumed by `usePolymarketWallet` |

When planning wallet work, treat Privy as the current app onboarding path unless the product direction explicitly changes.
