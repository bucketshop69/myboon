# #033 — Market Context Builder (Pre-Aggregate Before Analyst)

## Problem

The narrative analyst currently receives a flat list of signal lines like:

```
[WHALE_BET] "Will Iran strike Israel?" [slug: will-iran-strike-israel] — 0x63ce bet $1,958 on YES (weight: 6)
[WHALE_BET] "Will Iran regime fall?" [slug: will-iran-regime-fall] — 0x63ce bet $3,980 on NO (weight: 8)
[ODDS_SHIFT] "Will Iran strike Israel?" [slug: will-iran-strike-israel] — yes_price 0.45 → 0.92 (weight: 4.7)
[MARKET_DISCOVERED] "Will Iran strike Israel?" — volume $25.1M (weight: 1)
```

The LLM has to figure out which signals belong to the same market, infer the price trajectory, and guess what the volume delta means. This is data engineering work, not editorial work. It wastes tokens and produces errors.

## Goal

Before the analyst runs, a **Context Builder** (pure TypeScript, zero LLM) groups signals by market and pre-computes a structured `MarketContext` block per market. The analyst receives one structured block per active market, not a flat list of signals.

## Scope

- New file: `packages/brain/src/context-builder.ts`
- Modified: `packages/brain/src/narrative-analyst.ts` — use context blocks instead of raw signal lines

## The MarketContext Shape

```ts
interface MarketContext {
  slug: string
  title: string
  currentYes: number
  currentNo: number
  priceShift24h: number         // e.g. +0.47 means yes went from 0.45 to 0.92
  volume: number
  recentBets: Array<{
    wallet: string
    amount: number
    side: string
    outcome: string
    timestamp: string
  }>
  aggregates: {
    totalWhaleVolume: number     // sum of all WHALE_BET amounts in window
    netOutcome: string           // 'YES-heavy' | 'NO-heavy' | 'split'
    uniqueWallets: number
    largestBet: number
    hasOddsShift: boolean
    oddsShiftSize: number | null // e.g. 0.47 if ODDS_SHIFT fired
  }
}
```

## How It Works

1. Query `signals` table for last N minutes (same window analyst already uses)
2. Group signals by `slug` (after #031, slug is guaranteed on every signal)
3. For each slug group, join against `polymarket_tracked` to get `yes_price`, `no_price`, `volume`
4. Compute aggregates in code
5. Return `MarketContext[]` sorted by signal density (most active markets first)

## What the Analyst Prompt Looks Like After This

Instead of 15 flat lines, analyst receives:

```json
[
  {
    "slug": "will-iran-strike-israel",
    "title": "Will Iran strike Israel by end of March?",
    "currentYes": 0.92,
    "currentNo": 0.08,
    "priceShift24h": +0.47,
    "volume": 25100000,
    "recentBets": [
      { "wallet": "0x63ce...", "amount": 1958, "side": "buy", "outcome": "YES", "timestamp": "..." }
    ],
    "aggregates": {
      "totalWhaleVolume": 5938,
      "netOutcome": "YES-heavy",
      "uniqueWallets": 1,
      "largestBet": 3980,
      "hasOddsShift": true,
      "oddsShiftSize": 0.47
    }
  }
]
```

The LLM's job is now purely: "Is this interesting? What does it mean? Write the card."

## Analyst Prompt Update

Replace `formatSignalLine()` calls with a single JSON block passed in the user message. Update system prompt to reflect new input format. Remove instruction to extract slugs from text (slugs are now in the structured input).

## Acceptance Criteria

- [ ] `buildMarketContexts()` returns correct groupings and aggregates
- [ ] Analyst no longer uses `formatSignalLine()` — receives JSON context instead
- [ ] `extractSlugs()` is removed from analyst (slugs come from context input directly)
- [ ] Analyst prompt token count is lower than before (structured JSON vs repeated text lines)
- [ ] Verify via #036 slug flow checks on VPS after deployment
