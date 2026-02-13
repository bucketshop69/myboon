# pnldotfun

pnldotfun is a Solana wallet-intelligence pipeline.

It ingests wallet activity, classifies high-signal transactions with LLMs, runs targeted research on unknown tokens, and stores memory for downstream decisioning.

## Current Architecture

- `packages/tx-parser`: transaction fetch/parse/stream pipeline
- `packages/brain`: classifier + research orchestrator (MiniMax)
- `packages/entity-memory`: entity/research memory layer (MVP in-memory + SQL migrations)
- `apps/web`: frontend app

Reference docs:
- `docs/VISION.md`
- `docs/issues/013-transaction-streaming.md`
- `docs/issues/014-token-memory-schema.md`
- `docs/issues/015-research-agent.md`
- `docs/issues/016-classifier-brain.md`
- `docs/issues/018-wire-classifier-to-minimax.md`

## Prerequisites

- Node.js 20+
- pnpm 10+

## Setup

```bash
pnpm install
cp .env.example .env
```

Recommended `.env` values:

```bash
# Required for tx fetch/stream
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY

# Demo wallet
EXAMPLE_WALLET=7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C

# Brain models
CLASSIFIER_MODEL=MiniMax-M2.5-lightning
RESEARCHER_MODEL=MiniMax-M2.5

# Required for classifier/research LLM calls
MINIMAX_API_KEY=your_minimax_key

# Optional, if your Jupiter tier requires it
JUPITER_API_KEY=your_jupiter_key
```

## Run

### 1) Transaction stream only

```bash
pnpm stream:start
# or
pnpm --filter @pnldotfun/tx-parser stream:start
```

### 2) Full brain pipeline (stream -> classifier -> research)

```bash
pnpm --filter @pnldotfun/brain brain:start
```

### 3) Terminal showcase replay (best for demos)

```bash
pnpm --filter @pnldotfun/brain demo:replay -- --wallet 7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C --count 4 --batchSize 2 --delayMs 1000
```

### 4) Research smoke test

```bash
pnpm --filter @pnldotfun/brain research:smoke -- So11111111111111111111111111111111111111112
```

### 5) Frontend dev app

```bash
pnpm dev:web
```

## Tests

```bash
pnpm --filter @pnldotfun/tx-parser test
```

## Notes

- `entity-memory` is MVP mode right now (in-memory repositories with SQL migration scaffolding).
- Research data-source coverage in alpha is intentionally narrow (`get_token_metadata` via Jupiter Tokens V2).
- Never commit real API keys or private endpoints.
