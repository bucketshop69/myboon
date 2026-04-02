# Backlog #004 — Pacific Brain Integration (#055)

## What this is

The analyst agent (Feed narratives) currently reads only Polymarket signals. This makes the Feed blind to perps intelligence even though `crypto_god` is now posting about it on X.

This is **not covered by crypto_god** — `crypto_god` reads signals directly and writes X posts. The analyst reads signals and writes Feed narratives. Two separate pipelines, both need Pacific awareness.

## Work needed

### 1. `packages/brain/src/tools/get-pacific-snapshot.ts`

New analyst tool. Given a symbol, returns current mark price, funding rate (annualised), OI, 24h volume, and 24h change from Pacific REST.

```ts
export const getPacificSnapshot = tool({
  name: 'get_pacific_snapshot',
  description: 'Get live Pacific Protocol perp market data for a symbol',
  schema: z.object({ symbol: z.string() }),
  execute: async ({ symbol }) => { ... }
})
```

### 2. `packages/brain/src/analyst/analyst-prompt.ts`

Add Pacific signal interpretation section:
- `[source: PACIFIC]` prefix in `key_signals`
- Cross-market clustering logic: Pacific BTC funding spike + Polymarket "BTC > $100K" → single narrative
- Analyst decides clustering (no auto-cluster)

### 3. `packages/brain/src/analyst/pacific-context.ts`

Signal type → narrative angle mapping:
- `LIQUIDATION_CASCADE` → "forced exit / cascade risk"
- `FUNDING_SPIKE` → "crowded trade / carry cost pressure"
- `OI_SURGE` → "smart money positioning / conviction entering"

### 4. Analyst graph — fetch PACIFIC signals

```ts
// In analyst runner, expand source filter:
.in('source', ['POLYMARKET', 'PACIFIC'])
```

## Acceptance

- [ ] Analyst fetches both POLYMARKET and PACIFIC signals
- [ ] Narratives include Pacific `key_signals` with `[source: PACIFIC]` prefix
- [ ] Cross-market narratives cluster Pacific + Polymarket signals on same topic
- [ ] `get_pacific_snapshot("BTC")` tool callable from analyst graph

## Dependency

Requires `pacific_tracked` table + PM2 collector running (backlog #003) so real Pacific signals exist in `signals` table.
