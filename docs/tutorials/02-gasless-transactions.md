# Tutorial: Current Wallet Transaction and Gas Expectations

This note documents what the MYBOON app currently supports around wallet-backed signing and transaction costs.

## Current source of truth

The active mobile wallet path uses Privy embedded Solana wallets and external Solana Mobile Wallet Adapter wallets:

- `apps/hybrid-expo/hooks/usePrivyWallet.ts` exposes the Privy embedded wallet address and `signMessage` handler.
- `apps/hybrid-expo/hooks/useWallet.ts` exposes the external Solana wallet path.
- `apps/hybrid-expo/hooks/usePolymarketWallet.ts` uses the connected wallet interface for Predict/Polymarket signing flows.
- `apps/hybrid-expo/components/drawer/WalletDrawer.tsx` presents the wallet onboarding and connection UI.

## What is implemented today

### Privy message signing

For a Privy embedded Solana wallet, the app gets the provider from the embedded wallet and asks it to sign a message.

```typescript
const provider = await wallet.getProvider();
const { signature } = await provider.request({
  method: 'signMessage',
  params: { message: Buffer.from(message).toString('base64') },
});
```

This supports wallet-authenticated signing flows such as Predict/Polymarket session setup.

### External wallet signing

External Solana wallets continue through the Solana Mobile Wallet Adapter path. Transaction fee behavior for those wallets should be treated as normal wallet behavior unless a specific app-level sponsorship or relayer path is implemented and documented.

## What is not implemented today

The current app path does **not** document an active Solana paymaster, relayer, or fee-sponsorship system for general app transactions.

Do not scope product or engineering work assuming that users can submit arbitrary Solana transactions without SOL unless there is current code and product approval for that behavior.

## Planning guidance

When writing wallet requirements or acceptance criteria:

- Say **Privy embedded Solana wallet** for the current in-app wallet path.
- Say **external Solana wallet** for the Solana Mobile Wallet Adapter path.
- Tie any gas sponsorship, paymaster, relayer, or fee-abstraction claim to real code before treating it as current behavior.
- If fee sponsorship is desired later, scope it as new wallet infrastructure work with explicit product approval, security review, and transaction-level tests.
