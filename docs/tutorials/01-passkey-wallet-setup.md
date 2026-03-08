# Tutorial: implementing Passkey Authentication with Lazorkit

This guide explains how we integrated **Lazorkit's Passkey Wallet** into the MYBOON app. This allows users to create a wallet using just their FaceID, TouchID, or device passkey—no seed phrases required.

## Prerequisites

- `@lazorkit/wallet` installed
- `@solana/web3.js` for blockchain interaction

## 1. The `useLazorkitWallet` Hook

Lazorkit provides a React hook that manages the entire lifecycle of the passkey wallet.

```typescript
import { useWallet as useLazorkitWallet } from "@lazorkit/wallet";

// Inside your component
const { connect, isConnecting, isConnected } = useLazorkitWallet();
```

## 2. Creating the Connect UI

We created a user-friendly UI in `PasskeySection.tsx` that emphasizes the benefits: passing "No seed phrase" and "Ready in 2 seconds".

### Key Implementation Details

1. **Triggering Connection**:
   We call the `connect()` function when the user clicks the "Connect with Passkey" button. This automatically triggers the browser's native WebAuthn dialog (FaceID/TouchID).

   ```typescript
   const handleConnect = async () => {
     try {
       // Opens native browser passkey prompt
       await connect(); 
       // Connection successful!
       onSuccess();
     } catch (err) {
       // Handle errors (e.g. user cancelled)
     }
   };
   ```

2. **Handling User Cancellations**:
   It's important to gracefully handle when a user cancels the biometric prompt. We check error messages to avoid showing scary "Failed" alerts for simple cancellations.

   ```typescript
   // Check if it's just a cancellation
   if (!err.message.includes("cancel") && !err.message.includes("closed")) {
      setError("Connection failed. Try again.");
   }
   ```

3. **Visual Feedback**:
   We use icons (Fingerprint, FaceID) to make it clear this is *not* a standard crypto wallet connection.

## 3. Why This Matters

By using Lazorkit, we bypass the biggest hurdle in crypto onboarding: **Wallet Installation**.
The user never leaves the page. They don't need a Chrome extension. They just scan their face, and they have a Solana wallet.
