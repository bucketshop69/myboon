# myboon

> **A news feed for markets. Take action on everything you read.**

myboon watches prediction markets, on-chain activity, and perps data around the clock, then turns the movement into a live market feed. Read the signal, open the market, and track the position from one Home canvas.

---

## How it works

```
Markets move  →  myboon explains the signal  →  you act from Markets  →  Wallet tracks the position
```

Whale drops $500K on a Polymarket bet. Funding rate spikes on BTC perps. Odds shift on an EPL match. myboon catches it, writes the story, and puts the market one tap away.

---

## The app

myboon opens into one scrolling Home canvas, not a row of disconnected tabs.

| Chapter | What happens |
|---------|--------------|
| **Feed** | Read the live narratives and signals moving markets |
| **Markets** | Act on the signal through prediction markets, perps, and future swap routes |
| **Wallet** | Track positions, balances, venues, and outcomes in one place |

Feed tells you what matters. Markets lets you act. Wallet shows what you own.

---

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full system design.

---

## Packages

```
apps/
  hybrid-expo/    Mobile app (Expo / React Native)
  web/            Landing page (Next.js 15)

packages/
  api/            API server (Hono) — Feed, markets, wallet/action data
  brain/          AI agents — narrative analyst, publisher, intelligence scoring
  collectors/     Data ingestion — Polymarket, Pacific
  shared/         Shared SDK — PolymarketClient, PacificClient, types
  tx-parser/      Solana transaction parsing
  entity-memory/  Entity store (pre-persistence)
```

---

## Getting started

### Prerequisites

- Node.js 18+
- pnpm

### Install

```bash
git clone https://github.com/bucketshop69/myboon.git
cd myboon
pnpm install
```

### Run the API

```bash
cp packages/api/.env.example packages/api/.env
# fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
pnpm --filter @myboon/api start
```

### Run the mobile app

```bash
cd apps/hybrid-expo
pnpm start
```

### Run the brain

```bash
cp packages/brain/.env.example packages/brain/.env
pnpm --filter @myboon/brain narrative:analyst
pnpm --filter @myboon/brain publisher
```

---

## Revenue

- **Prediction market actions** — Polymarket builder affiliate %
- **Perps / swap routes** — fee share
- **Feed API / intelligence** — x402 micropayments *(post-MVP)*

---

## Infrastructure

- **Runtime:** Node.js / TypeScript (ESM)
- **Database:** Supabase (Postgres)
- **LLM:** MiniMax M2.7 (Anthropic-compatible API)
- **Mobile:** Expo (React Native)
- **Monorepo:** pnpm workspaces
- **VPS:** Collectors + API + Brain on US VPS

---

<p align="center">
  <sub>Built on Solana</sub>
</p>
