# myboon

> **A news feed for markets. Take action on everything you read.**

myboon watches prediction markets, on-chain activity, and perps data around the clock — then tells you what's moving and lets you trade it right there. No app-switching, no tab-hopping. You read it, you trade it.

---

## How it works

```
Markets move  →  AI picks it up  →  You see it in your feed  →  You trade it
```

Whale drops $500K on a Polymarket bet. Funding rate spikes on BTC perps. Odds shift on an EPL match. myboon catches it, writes the story, and puts the market one tap away.

---

## The app

| Tab | What you do |
|-----|-------------|
| **Feed** | See what's moving — live, auto-updated, 24/7 |
| **Predict** | Bet on Polymarket — geopolitics, crypto, sports |
| **Trade** | Trade perps via Pacific |
| **Swap** | Token swaps via Jupiter *(coming soon)* |

The Feed is the front door. Everything else is the action you take after reading it.

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
  api/            API server (Hono) — Feed + Predict + Trade endpoints
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

- **Predict** — Polymarket builder affiliate %
- **Trade / Swap** — fee share
- **Feed API** — x402 micropayments *(post-MVP)*

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
