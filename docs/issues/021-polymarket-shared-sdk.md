# Issue 021 — Polymarket Shared SDK (`packages/shared`)

## Goal

Extract all Polymarket API logic from `packages/collectors` into a proper shared SDK at `packages/shared/src/polymarket/`. Collectors and brain both import from there — no duplicated fetch logic anywhere.

---

## Problem

`packages/collectors/src/polymarket/client.ts` contains all Polymarket API logic inline. The brain will also need to call Polymarket APIs (for tool calling during analysis). Duplicating this logic is wrong — it must live in one shared place.

---

## What to Build

### `packages/shared/src/polymarket/`

**`client.ts`** — Pure API client, no side effects, no Supabase, no env vars at module level. Instantiated with config.

```ts
export interface PolymarketClientConfig {
  gammaApiUrl?: string   // default: https://gamma-api.polymarket.com
  clobApiUrl?: string    // default: https://clob.polymarket.com
}

export class PolymarketClient {
  constructor(config?: PolymarketClientConfig)

  // Fetch top N active markets by volume (filters expired)
  getTopMarkets(limit?: number): Promise<Market[]>

  // Fetch a single market by slug
  getMarketBySlug(slug: string): Promise<Market | null>

  // Fetch a market by conditionId (for whale bet resolution)
  getMarketByConditionId(conditionId: string): Promise<Market | null>

  // Fetch current yes/no prices from CLOB order book
  getOrderBook(tokenId: string): Promise<{ bestBid: number; bestAsk: number } | null>

  // Fetch a market snapshot: market info + current odds
  getMarketSnapshot(slug: string): Promise<MarketSnapshot | null>
}
```

**`types.ts`** — All Polymarket types (move from collectors):
```ts
export interface Market { ... }         // same as current types.ts
export interface GammaEvent { ... }
export interface GammaMarket { ... }
export interface MarketSnapshot {
  market: Market
  yesPrice: number   // 0-1
  noPrice: number    // 0-1
  fetchedAt: string  // ISO timestamp
}
```

**`index.ts`** — Re-exports `PolymarketClient`, all types

---

## Package Config Changes

### `packages/shared/package.json`
- Rename `"name"` to `"@pnldotfun/shared"`
- Add `"type": "module"`
- Add `"exports"` pointing to `dist/index.js`
- Add build script: `"build": "tsc -p tsconfig.json"`
- Add tsx devDependency

### `packages/shared/tsconfig.json`
- Set `outDir`, `rootDir`, `declaration`, `declarationMap` to match other packages

---

## Collector Refactor

Update `packages/collectors` to import from `@pnldotfun/shared`:

- Delete `packages/collectors/src/polymarket/client.ts`
- Delete `packages/collectors/src/polymarket/types.ts`
- Update `discovery.ts`, `stream.ts`, `user-tracker.ts` to import `PolymarketClient` and types from `@pnldotfun/shared`
- Add `@pnldotfun/shared` as a workspace dependency in `packages/collectors/package.json`
- The Supabase client stays in collectors — it's collector-specific

---

## What Does NOT Move

- Supabase client — stays in collectors (collector concern)
- `pinned.json` / `tracked-users.json` — stay in collectors (config files)
- WebSocket stream logic — stays in collectors (runtime process concern)
- Signal writing logic — stays in collectors

---

## Out of Scope

- Do not add Supabase to shared
- Do not add env var loading to shared — caller passes config
- Do not change brain yet (that's issue 022)

---

## Acceptance Criteria

- [ ] `packages/shared` exports `PolymarketClient` and all types
- [ ] `packages/collectors` has zero inline Polymarket fetch logic
- [ ] `pnpm run dev` in collectors still works without errors
- [ ] No secrets in shared package — it's config-injected
- [ ] Reviewer subagent passes before commit
