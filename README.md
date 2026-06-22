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
  collectors/     Feed V3 source pipelines — Data Engineer, Researcher, Editor, Publisher
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

### Run the Polymarket collector + researcher

```bash
cp packages/collectors/.env.example packages/collectors/.env
pnpm --dir packages/collectors polymarket:markets-data-engineer
pnpm --dir packages/collectors polymarket:researcher
```

For VPS process mode, set both `POLYMARKET_MARKETS_RUN_ONCE=0` and
`POLYMARKET_RESEARCHER_RUN_ONCE=0`, then start:

```bash
pm2 start ecosystem.config.cjs
```

This production cut intentionally runs only:

```text
Polymarket data collector -> polymarket_market_candidates
Polymarket researcher     -> polymarket_market_candidate_research
```

Editor, publisher, and entity-memory workers are downstream and are not part of
this collector/researcher rollout.

---

## Revenue

- **Prediction market actions** — Polymarket builder affiliate %
- **Perps / swap routes** — fee share
- **Feed API / intelligence** — x402 micropayments *(post-MVP)*

---

## Infrastructure

- **Runtime:** Node.js / TypeScript (ESM)
- **Database:** Supabase (Postgres)
- **LLM:** configurable CLI-agent runners for feed research/editor/publisher
- **Mobile:** Expo (React Native)
- **Monorepo:** pnpm workspaces
- **VPS:** API + feed collectors on US VPS

---

<p align="center">
  <sub>Built on Solana</sub>
</p>
