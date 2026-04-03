# Solana Mobile Wallet Adapter (MWA) — Expo Integration

Reference for #063 wallet connect. This is the official Solana Mobile SDK used on the Seeker phone.

**Docs:** https://docs.solanamobile.com
**GitHub:** https://github.com/solana-mobile/mobile-wallet-adapter/tree/main/js/packages/mobile-wallet-adapter-protocol

---

## Why MWA over Phantom deep links

| | Phantom Deep Link | MWA (`@wallet-ui/react-native-web3js`) |
|---|---|---|
| Wallet support | Phantom only | Any MWA wallet (Phantom, Solflare, etc) |
| Sign message | Separate deep link call | `signMessage()` built in |
| Send transaction | Not supported | `signAndSendTransaction()` built in |
| Seeker native | No | Yes — this IS the Seeker SDK |
| Expo compatible | Yes (manual) | Yes (with custom dev build) |

---

## Installation

```bash
pnpm add @wallet-ui/react-native-web3js react-native-quick-crypto @solana/web3.js expo-dev-client
```

## Polyfill setup

`react-native-quick-crypto` provides the `crypto` module needed by `@solana/web3.js`.

**1. Create `polyfill.js` at project root:**

```js
// polyfill.js
import { install } from 'react-native-quick-crypto';
install();
```

**2. Create `index.js` entry point (polyfill MUST load first):**

```js
// index.js
import './polyfill';
import 'expo-router/entry';
```

**3. Update `package.json`:**

```json
{
  "main": "./index.js"
}
```

---

## Provider setup

Wrap app root (`_layout.tsx`) with `MobileWalletProvider`:

```tsx
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { clusterApiUrl } from '@solana/web3.js';

const chain = 'solana:mainnet-beta';
const endpoint = clusterApiUrl('mainnet-beta');
const identity = {
  name: 'myboon',
  uri: 'https://myboon.xyz',
  icon: 'favicon.png',
};

export default function Layout() {
  return (
    <MobileWalletProvider chain={chain} endpoint={endpoint} identity={identity}>
      <Slot />
    </MobileWalletProvider>
  );
}
```

### Provider props

| Prop | Type | Value |
|---|---|---|
| `chain` | string | `'solana:mainnet-beta'` or `'solana:devnet'` |
| `endpoint` | string | RPC URL (Helius or `clusterApiUrl()`) |
| `identity` | object | `{ name, uri, icon }` — shown to user during auth |

---

## Hook: `useMobileWallet()`

```tsx
import { useMobileWallet } from '@wallet-ui/react-native-web3js';

const {
  account,                // Connected wallet account (null if disconnected)
  connect,                // () => Promise<void> — opens wallet app for auth
  disconnect,             // () => Promise<void>
  signMessage,            // (message: Uint8Array) => Promise<Uint8Array>
  signIn,                 // (params) => Promise<void> — SIWS (Sign In With Solana)
  signAndSendTransaction, // (tx: Transaction) => Promise<string> — returns signature
  connection,             // Solana RPC Connection instance
} = useMobileWallet();
```

### Key properties

- `account.address` — base58 Solana public key (string)
- `connection` — ready-to-use `@solana/web3.js` Connection instance

---

## Usage patterns

### Connect / Disconnect

```tsx
function ConnectButton() {
  const { account, connect, disconnect } = useMobileWallet();

  if (account) {
    return <Button title="Disconnect" onPress={disconnect} />;
  }
  return <Button title="Connect Wallet" onPress={connect} />;
}
```

### Sign message (for Pacific order signing)

```tsx
const { signMessage } = useMobileWallet();

const handleSign = async () => {
  const message = 'Verify this message';
  const messageBytes = new TextEncoder().encode(message);
  const signature = await signMessage(messageBytes);
  // signature is Uint8Array — use for Pacific API auth
};
```

### Sign and send transaction

```tsx
const { account, signAndSendTransaction, connection } = useMobileWallet();

const handleSend = async () => {
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: new PublicKey(account.address),
  }).add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(account.address),
      toPubkey: new PublicKey(recipient),
      lamports: amount,
    })
  );
  const signature = await signAndSendTransaction(tx);
};
```

### Sign In With Solana (SIWS)

```tsx
const { account, signIn } = useMobileWallet();

await signIn({
  domain: 'myboon.xyz',
  statement: 'Sign in to myboon',
});
// account.address is now available
```

---

## Expo constraints

- **No Expo Go** — MWA uses Kotlin native modules, requires custom dev build
- Run with `expo run:android` (not `expo start`)
- Need `expo-dev-client` in dependencies
- Works with `expo-prebuild` — generates native Android project
- iOS: MWA is Android-only. For iOS, need separate approach (Phantom deep link fallback)

---

## How this maps to our issues

| Issue | MWA method used |
|---|---|
| #063 Wallet Connect | `connect()`, `disconnect()`, `account.address` |
| #068 Trade Orders (Pacific) | `signMessage()` — sign order payload for Pacific API |
| #066 Predict Orders (Polymarket) | Not directly — Polymarket needs Polygon signature (separate issue) |
| #054 Builder Code | `signMessage()` — approve builder code |

### Pacific signing with MWA

PacificClient currently takes a `Keypair` for signing. With MWA, we have `signMessage()` instead. The external signer interface:

```ts
// Modify PacificClient to accept:
interface ExternalSigner {
  publicKey: string;  // base58
  sign: (message: Uint8Array) => Promise<Uint8Array>;
}

// Wire it up:
const { account, signMessage } = useMobileWallet();

const signer: ExternalSigner = {
  publicKey: account.address,
  sign: signMessage,  // MWA handles the wallet interaction
};

const client = new PacificClient({ env: 'mainnet', signer });
```

---

## Seeker phone positioning

myboon debuts as a **Seeker-exclusive** app. The MWA SDK is native to Seeker — every Seeker ships with an MWA-compatible wallet pre-installed. This means:
- Zero friction wallet connect on Seeker (wallet is already there)
- `signMessage` + `signAndSendTransaction` work natively
- Can submit to Solana dApp Store (Seeker's app distribution)
- Non-Seeker Android devices work too (if user has Phantom/Solflare installed)
