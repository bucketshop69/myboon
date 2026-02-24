# PNL.fun ⚡

<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-9945FF?style=for-the-badge&logo=solana" alt="Solana Devnet" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Lazorkit-Passkey-green?style=for-the-badge" alt="Lazorkit Passkey" />
</p>

> **Paste a Solana transaction. See your P&L. Share it.**

PNL.fun is a trading terminal-style visualizer that transforms any Solana transaction signature into a beautiful, shareable gradient card displaying your Profit & Loss. It's a demonstration of the future of Solana UX — **Seedless Onboarding** and **Gasless Transactions** — powered by [Lazorkit](https://lazorkit.com).

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **Instant Onboarding** | Create a wallet in 2 seconds using FaceID/TouchID via Lazorkit passkeys — no seed phrases, no friction |
| **Shareable P&L Cards** | Auto-generated visually stunning gradient cards for your best (or worst) trades |
| **Gasless Transfers** | Move USDC without holding SOL — sponsored by the Lazorkit Paymaster |
| **Dual Wallet Support** | Works with both biometric wallets (Lazorkit) and traditional wallets (Phantom, Solflare) |
| **Gasless Raydium Swaps** | Swap tokens on Raydium without paying for gas fees |

---

## 🛠 Tech Stack

### Frontend
- **Framework:** Next.js 16 (React 19)
- **Styling:** Tailwind CSS 4 + Framer Motion
- **UI Components:** Radix UI (Dialog, Dropdown, Toast)
- **Icons:** Lucide React
- **Charts:** Lightweight Charts (TradingView)

### Blockchain & Wallet
- **Blockchain:** Solana (Devnet)
- **Wallet Adapters:** @solana/wallet-adapter-react
- **Passkey Auth:** @lazorkit/wallet
- **SPL Tokens:** @solana/spl-token
- **Web3:** @solana/web3.js

### DeFi Integrations
- **AMM:** Raydium SDK (@raydium-io/raydium-sdk-v2)
- **Token Swap:** Jupiter (planned)

### Developer Experience
- **Package Manager:** pnpm (workspaces)
- **Language:** TypeScript 5
- **Monorepo:** pnpm workspaces

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/bucketshop69/pnldotfun.git
cd pnldotfun

# Install dependencies
pnpm install
```

### Environment Configuration

The project comes pre-configured for **Solana Devnet** out of the box. No `.env` setup required for local development — we use public Devnet RPC endpoints.

Configuration is located in `apps/web/src/lib/config.ts`.

### Running the Application

```bash
# Start the web application
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 📁 Project Structure

```
pnldotfun/
├── apps/
│   ├── web/                 # Next.js 16 web application
│   │   └── src/
│   │       ├── components/
│   │       │   └── wallet/  # Wallet-related components
│   │       │       ├── PasskeySection.tsx    # Biometric login UI
│   │       │       ├── TransferForm.tsx       # Gasless USDC transfer
│   │       │       ├── SwapForm.tsx            # Raydium swap UI
│   │       │       ├── WalletButton.tsx        # Connect/disconnect button
│   │       │       ├── WalletDetailsModal.tsx  # Account details modal
│   │       │       └── WalletModal.tsx         # Wallet selection modal
│   │       ├── providers/
│   │       │   └── WalletProvider.tsx          # Lazorkit + Wallet Adapter setup
│   │       └── lib/
│   │           └── config.ts                   # RPC & network configuration
│   ├── hybrid-expo/       # React Native Expo app (experimental)
│   └── mcp/                # MCP server for AI agents
├── packages/
│   └── shared/             # Shared utilities and types
├── docs/
│   ├── tutorials/          # Implementation guides
│   │   ├── 01-passkey-wallet-setup.md
│   │   └── 02-gasless-transactions.md
│   └── issues/            # Technical specifications & PRDs
│       ├── 002_custom_wallet_modal.md
│       ├── 003_wallet_details_gasless_transfer.md
│       └── 004_gasless_raydium_swap.md
└── package.json            # pnpm workspace root
```

---

## 🔐 How It Works

### Provider Setup

The app wraps the application in `LazorkitProvider` alongside the standard Solana Wallet Adapter, enabling support for **both** biometric and traditional wallets:

```tsx
<LazorkitProvider 
  config={{
    rpcUrl: "https://api.devnet.solana.com",
    paymaster: { url: "..." }
  }}
>
  <WalletProvider>
    {children}
  </WalletProvider>
</LazorkitProvider>
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `PasskeySection.tsx` | Handles biometric login UI (FaceID/TouchID) |
| `TransferForm.tsx` | Demonstrates gasless USDC transfers via Lazorkit Paymaster |
| `SwapForm.tsx` | Raydium swap integration with gasless mode support |
| `WalletProvider.tsx` | SDK configuration and wallet state management |

---

## 📖 Documentation

We provide detailed implementation guides for every major feature:

### Tutorials
1. **[Passkey Authentication Implementation](./docs/tutorials/01-passkey-wallet-setup.md)** — Implementing "Connect with FaceID" using `useLazorkitWallet`
2. **[Gasless Transactions Guide](./docs/tutorials/02-gasless-transactions.md)** — Setting up Paymaster for sponsored USDC transfers

### Technical Specifications
- **[Custom Wallet Modal Design](./docs/issues/002_custom_wallet_modal.md)** — Premium unified modal supporting passkeys + traditional wallets
- **[Gasless Transfer Logic](./docs/issues/003_wallet_details_gasless_transfer.md)** — Technical breakdown of gasless transfer implementation
- **[Zero-Cost Swaps](./docs/issues/004_gasless_raydium_swap.md)** — Gasless Raydium swaps via Lazorkit Paymaster

---

## 🧪 Testing on Devnet

This project is verified working on **Solana Devnet**. To test:

1. Connect using a passkey (FaceID/TouchID) or traditional wallet
2. Request devnet SOL from a faucet
3. Get devnet USDC (mint: `4zMMC9srtajRiMRYn1hMyGkG8zhYGvdqiafmwK7Q5MX`)
4. Try gasless transfers and swaps

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

ISC License

---

<p align="center">
  <sub>Built with ⚡ on Solana • Powered by Lazorkit</sub>
</p>
