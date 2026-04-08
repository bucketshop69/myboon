# 10 — Solana Kit Migration Reference

> Reference for migrating from `@solana/web3.js` v1.x to `@solana/kit` (formerly web3.js 2.0).
> Source: [awesome-solana-ai](https://github.com/solana-foundation/awesome-solana-ai),
> [solana-kit-skill](https://github.com/sendaifun/skills/tree/main/skills/solana-kit),
> [solana-kit-migration-skill](https://github.com/sendaifun/skills/tree/main/skills/solana-kit-migration)

---

## What is @solana/kit?

A complete rewrite of the Solana JavaScript SDK by Anza (released Dec 2024 as `@solana/web3.js@2.0.0`, later renamed to `@solana/kit`).

| Metric | web3.js v1 | @solana/kit | Improvement |
|--------|------------|-------------|-------------|
| Keypair Generation | ~50ms | ~5ms | **10x faster** |
| Transaction Signing | ~20ms | ~2ms | **10x faster** |
| Bundle Size | 311KB | 226KB | **26% smaller** |
| Confirmation Latency | ~400ms | ~200ms | **~200ms faster** |

Key design differences:
- **Tree-shakeable**: Only ship code you use
- **Zero dependencies**: No third-party packages
- **Functional design**: Composable functions, no classes
- **Native Ed25519**: Uses browser/runtime Web Crypto APIs
- **TypeScript-first**: Full type safety with branded types

---

## Our Codebase: Current web3.js v1 Usage

### packages/tx-parser (heaviest user — 14 files)

All 14 `.ts` files import types/classes from `@solana/web3.js`:

| Import | Files | Usage |
|--------|-------|-------|
| `ParsedTransactionWithMeta` (type) | 10 files | Core type for parsed tx data |
| `ParsedMessageAccount` (type) | 2 files | Account key types |
| `ParsedInstruction` (type) | 1 file | Instruction parsing |
| `PartiallyDecodedInstruction` (type) | 1 file | Instruction parsing |
| `TokenBalance` (type) | 2 files | Pre/post token balances |
| `PublicKey` (class) | 2 files | Address comparisons, `.toString()` |
| `Connection` (class) | 2 files | RPC calls in `rpc.ts` + `inspect-dlmm.ts` |

**Key observation**: tx-parser is 90% type imports. Only `rpc.ts` and `inspect-dlmm.ts` use runtime classes (`Connection`, `PublicKey`).

### packages/shared (1 file)

`src/pacific/client.ts` imports `Keypair` from `@solana/web3.js` for Pacific Protocol signing.

### apps/hybrid-expo (1 file)

`features/perps/perps.api.ts` imports `PublicKey` and `TransactionInstruction` for on-chain deposit/withdrawal transactions.

### Summary

| Package | Runtime imports | Type-only imports | Difficulty |
|---------|----------------|-------------------|------------|
| tx-parser | 2 files (`Connection`, `PublicKey`) | 12 files | Low — mostly types |
| shared | 1 file (`Keypair`) | 0 | Low |
| hybrid-expo | 1 file (`PublicKey`, `TransactionInstruction`) | 0 | Medium — wallet adapter interop |

---

## API Migration Reference

### 1. Connection → RPC

```typescript
// v1
import { Connection } from '@solana/web3.js';
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const slot = await connection.getSlot();
const balance = await connection.getBalance(publicKey);

// Kit
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
const rpc = createSolanaRpc('https://api.devnet.solana.com');
const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.devnet.solana.com');
const slot = await rpc.getSlot().send();           // note: .send() required
const balance = await rpc.getBalance(address).send();
```

### 2. Keypair → KeyPairSigner

```typescript
// v1
import { Keypair } from '@solana/web3.js';
const keypair = Keypair.generate();
const fromSecret = Keypair.fromSecretKey(secretKey);
console.log(keypair.publicKey.toString());

// Kit
import { generateKeyPairSigner, createKeyPairSignerFromBytes } from '@solana/kit';
const signer = await generateKeyPairSigner();              // async!
const fromSecret = await createKeyPairSignerFromBytes(secretKey);  // async!
console.log(signer.address);  // branded string, no .toString()
```

### 3. PublicKey → Address

```typescript
// v1
import { PublicKey } from '@solana/web3.js';
const pubkey = new PublicKey('11111111111111111111111111111111');
if (pubkey.equals(otherPubkey)) { ... }
const str = pubkey.toString();

// Kit
import { address } from '@solana/kit';
const addr = address('11111111111111111111111111111111');
if (addr === otherAddr) { ... }  // just string comparison
// addr is already a string (branded type Address)
```

### 4. Transaction Building

```typescript
// v1
import { Transaction, SystemProgram } from '@solana/web3.js';
const tx = new Transaction();
tx.add(SystemProgram.transfer({
  fromPubkey: sender.publicKey,
  toPubkey: recipient.publicKey,
  lamports: 1_000_000_000,
}));
tx.recentBlockhash = blockhash;
tx.feePayer = sender.publicKey;

// Kit — functional composition with pipe
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';

const tx = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayer(sender.address, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstruction(
    getTransferSolInstruction({
      amount: lamports(1_000_000_000n),  // BigInt!
      destination: recipient.address,
      source: sender,
    }),
    tx
  ),
);
```

### 5. Signing & Sending

```typescript
// v1
const signed = await connection.sendTransaction(tx, [sender]);
// or
tx.sign(sender);
const sig = await connection.sendRawTransaction(tx.serialize());

// Kit
import {
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from '@solana/kit';

const signedTx = await signTransactionMessageWithSigners(tx);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
await sendAndConfirm(signedTx, { commitment: 'confirmed' });
const sig = getSignatureFromTransaction(signedTx);
```

### 6. Fetching Accounts

```typescript
// v1
const accountInfo = await connection.getAccountInfo(publicKey);
if (accountInfo) {
  console.log(accountInfo.lamports);
  console.log(accountInfo.data);
}

// Kit
import { fetchEncodedAccount, assertAccountExists } from '@solana/kit';
const account = await fetchEncodedAccount(rpc, address);
if (account.exists) {
  console.log(account.lamports);
  console.log(account.data);
  console.log(account.programAddress); // was 'owner' in v1
}
```

---

## Interop: @solana/compat

For gradual migration or when Anchor/third-party SDKs still require v1 types:

```typescript
import {
  fromLegacyPublicKey,
  fromLegacyKeypair,
  fromVersionedTransaction,
  fromLegacyTransactionInstruction,
} from '@solana/compat';

// v1 PublicKey → Kit Address
const addr = fromLegacyPublicKey(legacyPublicKey);

// v1 Keypair → Kit CryptoKeyPair (async!)
const keyPair = await fromLegacyKeypair(legacyKeypair);

// v1 VersionedTransaction → Kit Transaction
const kitTx = fromVersionedTransaction(legacyVersionedTx);

// v1 TransactionInstruction → Kit IInstruction
const kitIx = fromLegacyTransactionInstruction(legacyInstruction);
```

> **Note**: Compat converts FROM v1 TO Kit. Reverse direction requires manual construction.

---

## Edge Cases & Gotchas

### 1. BigInt everywhere
Kit uses native BigInt for all numeric values (lamports, amounts, slots).
```typescript
// v1: number
const lamports = 1_000_000_000;

// Kit: bigint
const lamports = 1_000_000_000n;
// or
import { lamports } from '@solana/kit';
const amount = lamports(1_000_000_000n);
```

### 2. Async keypair generation
Web Crypto API is async — `generateKeyPairSigner()` returns a Promise.
```typescript
// v1: sync
const kp = Keypair.generate();

// Kit: async
const signer = await generateKeyPairSigner();
```

### 3. RPC .send() is required
Kit uses lazy RPC calls — must call `.send()` to execute.
```typescript
// v1
const balance = await connection.getBalance(pubkey);

// Kit — forgetting .send() returns a pending request, not the value
const balance = await rpc.getBalance(address).send();
```

### 4. PublicKey vs Address
Kit addresses are branded strings, not class instances.
```typescript
// v1: class-based comparison
pubkey1.equals(pubkey2)
pubkey.toBase58()

// Kit: string comparison
address1 === address2
// address is already a base58 string
```

### 5. Anchor stays on v1
Anchor (through v0.31) requires `@solana/web3.js` v1. Use `@solana/compat` as bridge.
Keep v1 for any Anchor interactions until Anchor v0.32+ ships with Kit-native support.

### 6. Subscriptions use AsyncIterators
```typescript
// v1: callback-based
const id = connection.onAccountChange(pubkey, (info) => { ... });
connection.removeAccountChangeListener(id);

// Kit: async iterator with AbortController
const abortController = new AbortController();
const notifications = await rpcSubscriptions
  .accountNotifications(address, { commitment: 'confirmed' })
  .subscribe({ abortSignal: abortController.signal });

for await (const notification of notifications) {
  console.log(notification);
}
// To unsubscribe:
abortController.abort();
```

### 7. ParsedTransactionWithMeta type
This type doesn't exist in Kit. Kit uses raw/encoded transaction types.
If you need parsed transactions (like our tx-parser), keep using v1 for
`connection.getParsedTransaction()` or use `@solana/compat`.

### 8. Token program interactions
```typescript
// v1: @solana/spl-token
import { transfer } from '@solana/spl-token';

// Kit: @solana-program/token
import { getTransferInstruction } from '@solana-program/token';
```

---

## Package Reference

### Core

| Package | Purpose |
|---------|---------|
| `@solana/kit` | Everything below in one import |
| `@solana/rpc` | RPC client |
| `@solana/rpc-subscriptions` | WebSocket subscriptions |
| `@solana/signers` | Signing interfaces |
| `@solana/addresses` | Address utilities |
| `@solana/keys` | Key generation |
| `@solana/transactions` | Transaction compilation |
| `@solana/transaction-messages` | Message building |
| `@solana/accounts` | Account fetching |
| `@solana/codecs` | Data encoding/decoding |
| `@solana/errors` | Error handling |
| `@solana/compat` | v1 ↔ Kit interop bridge |

### Program packages (replace @solana/spl-*)

| Package | Replaces |
|---------|----------|
| `@solana-program/system` | `SystemProgram` from web3.js |
| `@solana-program/token` | `@solana/spl-token` |
| `@solana-program/token-2022` | `@solana/spl-token` (extensions) |
| `@solana-program/memo` | `@solana/spl-memo` |
| `@solana-program/compute-budget` | `ComputeBudgetProgram` from web3.js |
| `@solana-program/address-lookup-table` | ALT instructions from web3.js |

---

## Common Patterns

### Helper: Send & Confirm

```typescript
import {
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from '@solana/kit';
import type {
  CompilableTransactionMessage,
  TransactionMessageWithBlockhashLifetime,
  Commitment,
  Rpc,
  RpcSubscriptions,
} from '@solana/kit';

function createTransactionSender(rpc: Rpc, rpcSubscriptions: RpcSubscriptions) {
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  return async (
    txMessage: CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime,
    commitment: Commitment = 'confirmed',
  ) => {
    const signedTx = await signTransactionMessageWithSigners(txMessage);
    await sendAndConfirm(signedTx, { commitment });
    return getSignatureFromTransaction(signedTx);
  };
}
```

### Helper: Reusable Transaction Builder

```typescript
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
} from '@solana/kit';
import type { Address, IInstruction, Rpc } from '@solana/kit';

async function buildTransaction(
  rpc: Rpc,
  feePayer: Address,
  instructions: IInstruction[],
) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  return pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );
}
```

### Helper: Add Compute Budget

```typescript
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';

const computeInstructions = [
  getSetComputeUnitLimitInstruction({ units: 200_000 }),
  getSetComputeUnitPriceInstruction({ microLamports: 1000n }),
];

const tx = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayer(payer.address, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
  (tx) => prependTransactionMessageInstructions(computeInstructions, tx),
  (tx) => appendTransactionMessageInstruction(mainInstruction, tx),
);
```

---

## Migration Strategy for pnldotfun

### Recommended: Hybrid (gradual)

**Why not full migration now:**
- `tx-parser` depends heavily on `ParsedTransactionWithMeta` — no Kit equivalent
- `@coral-xyz/anchor` (if we add it) still requires v1
- Mobile wallet adapter (`@solana/wallet-adapter-react`) still uses v1 types

**Phase 1 — New code uses Kit (now)**
- `packages/api` RPC calls (e.g. `solanaRpc()` in holdings endpoint) → `createSolanaRpc()`
- New mobile features → Kit + `@solana/compat` for wallet adapter bridge
- Install `@solana/compat` for bridge layer

**Phase 2 — Shared/perps migration (when ready)**
- `packages/shared/src/pacific/client.ts`: `Keypair` → `createKeyPairSignerFromBytes()`
- `apps/hybrid-expo/features/perps/perps.api.ts`: `PublicKey`, `TransactionInstruction` → Kit equivalents via compat

**Phase 3 — tx-parser (wait)**
- Depends on Kit getting `getParsedTransaction()` support or an equivalent
- 12 files are type-only imports — will change automatically when the runtime types change
- Only `rpc.ts` and `inspect-dlmm.ts` need real code changes

**Do not migrate:**
- Any file that interacts with Anchor until Anchor v0.32+
- Wallet adapter code until `@solana/wallet-adapter-react` supports Kit natively

---

## Resources

- [Official Kit docs](https://www.solanakit.com/docs)
- [Kit GitHub](https://github.com/anza-xyz/kit)
- [Kit examples](https://github.com/anza-xyz/kit/tree/main/examples)
- [Triton blog — Kit introduction](https://blog.triton.one/intro-to-the-new-solana-kit-formerly-web3-js-2/)
- [awesome-solana-ai](https://github.com/solana-foundation/awesome-solana-ai) — skills index
- [solana-kit-skill](https://github.com/sendaifun/skills/tree/main/skills/solana-kit) — full API reference
- [solana-kit-migration-skill](https://github.com/sendaifun/skills/tree/main/skills/solana-kit-migration) — migration patterns
- [@solana/compat](https://www.npmjs.com/package/@solana/compat) — interop bridge
