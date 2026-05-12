# Dome API — Polymarket & Kalshi Without Geo-Restrictions

## What Is Dome

Dome is a unified API layer over Polymarket and Kalshi. It provides real-time prices,
historical candlesticks, wallet analytics, order flow, and cross-platform market matching —
without the geo-restrictions that block the native Polymarket Gamma API from non-US IPs.

- **Docs:** https://docs.domeapi.io
- **SDK (TS):** https://github.com/kurushdubash/dome-sdk-ts
- **Dashboard / API key:** https://dashboard.domeapi.io
- **Discord:** https://discord.gg/fKAbjNAbkt

## Setup

```bash
npm install @dome-api/sdk
```

Add to `.env`:

```text
DOME_API_KEY=your-key-here
```

```ts
import { DomeClient } from '@dome-api/sdk'

const dome = new DomeClient({ apiKey: process.env.DOME_API_KEY })
```

## Rate Limits

| Tier       | QPS | Per 10s |
|------------|-----|---------|
| Free       | 10  | 100     |
| Dev        | 100 | 500     |
| Pro        | 300 | 3000    |
| Enterprise | custom | custom |

---

## What It Covers

| Capability | Description |
|---|---|
| Market prices | Real-time YES/NO price by token ID or slug |
| Historical OHLCV | Candlestick data for any market |
| Event / market discovery | Browse and filter markets by tag, category, date, activity |
| Wallet analytics | Trader PnL, position history, win rates, order flow |
| Order tracking | Live order book and recent fills |
| Cross-platform matching | Polymarket ↔ Kalshi market pairs for the same question |

---

## Polymarket Data Model

Every event returned by Dome has this shape:

```ts
{
  id: string
  slug: string                 // stable identifier — use this everywhere
  title: string                // human-readable event name
  endDate: string              // for sports = kickoff; generally = resolution deadline
  negRisk: boolean             // true = mutually exclusive outcomes (e.g. home/draw/away)
  active: boolean
  closed: boolean
  liquidity: number            // total USD liquidity across all outcome markets
  volume24hr: number
  markets: Market[]            // one Market per outcome
}

// Each outcome market:
{
  id: string
  slug: string                 // outcome-specific slug
  question: string             // "Will X happen?"
  outcomePrices: string[]      // ["0.34", "0.66"] = [YES%, NO%]
  clobTokenIds: string[]       // [0] = YES token, [1] = NO token (needed for order book)
  liquidity: string
  volume: string
  endDate: string
  groupItemTitle: string       // short label for this outcome (e.g. team name)
}
```

---

## Core Patterns

### Get live price for a market

```ts
const price = await dome.polymarket.markets.getMarketPrice({
  token_id: market.clobTokenIds[0],  // YES token
})
// price.price = current YES probability as a decimal (e.g. 0.34 = 34%)
```

### Fetch markets by category tag

```ts
const events = await dome.polymarket.events.list({
  tag_slug: 'politics',   // politics, crypto, sports, ucl, epl, macro, etc.
  active: true,
  closed: false,
})
```

### Fetch a specific market by slug

```ts
const market = await dome.polymarket.markets.getBySlug({ slug: 'some-slug' })
const yesProb = parseFloat(market.outcomePrices[0])
```

### Get OHLCV (price history)

```ts
const candles = await dome.polymarket.markets.getOhlcv({
  market_id: market.id,
  resolution: '1h',      // 1m, 5m, 1h, 1d
})
```

### Wallet analytics

```ts
// PnL and win rate for a bettor
const pnl = await dome.polymarket.wallets.getPnl({ address: '0x...' })

// All trades by a wallet
const trades = await dome.polymarket.wallets.getTrades({ address: '0x...' })

// Current positions held
const positions = await dome.polymarket.wallets.getPositions({ address: '0x...' })
```

### Order book

```ts
const book = await dome.polymarket.markets.getOrderBook({
  token_id: market.clobTokenIds[0],
})
```

### Cross-platform matching

```ts
// Find the Kalshi equivalent of a Polymarket market
const match = await dome.markets.getCrossMatch({ polymarket_slug: 'will-btc-hit-100k' })
```

---

## Filtering for Specific Market Types

### Mutually exclusive outcome markets (negRisk)

When `negRisk: true`, all markets in the event are mutually exclusive outcomes — the full
probability distribution adds to 1. This is the structure for match results, election outcomes,
multiple-choice questions.

```ts
const threeWayEvents = events.filter(e =>
  e.negRisk === true &&
  !e.title.includes(' - ')  // excludes sub-market variants ("- Halftime Result", etc.)
)

// Within a negRisk event, find outcomes by slug suffix pattern:
const draw  = markets.find(m => m.slug.endsWith('-draw'))
const teams = markets.filter(m => !m.slug.endsWith('-draw'))
```

### High-activity markets

```ts
const hotMarkets = events
  .filter(e => e.volume24hr > 50_000)
  .sort((a, b) => b.volume24hr - a.volume24hr)
```

---

## Slug Conventions

Polymarket slugs are hierarchical. The event slug is the stable anchor; outcome slugs
append a team/result code:

```
{sport}-{home_code}-{away_code}-{YYYY}-{MM}-{DD}          ← event slug
{sport}-{home_code}-{away_code}-{YYYY}-{MM}-{DD}-{code}   ← outcome slug

ucl-rma1-bay1-2026-04-07          event slug
ucl-rma1-bay1-2026-04-07-rma1     Real Madrid win
ucl-rma1-bay1-2026-04-07-bay1     Bayern win
ucl-rma1-bay1-2026-04-07-draw     Draw
```

Derive an event slug from any of its outcome slugs:

```ts
const eventSlug = outcomeSlug.slice(0, outcomeSlug.lastIndexOf('-'))
```

---

## Integration Opportunities in pnldotfun

### 1. Replace direct Gamma API calls (immediate)

Any live market odds needed by collectors, APIs, or analyst tools should use Dome instead of
calling `gamma-api.polymarket.com` directly. On a non-US VPS Gamma can silently fail.

Affected files:
- `packages/brain/src/analyst-tools/polymarket.tools.ts` — `get_market_snapshot` tool

### 2. Market discovery for collectors

Currently the Polymarket collector discovers markets via WebSocket subscription to a known
list. Dome's events endpoint can replace / augment this — run a daily sweep per category tag,
diff against `polymarket_tracked` table, register new markets automatically.

File: `packages/collectors/src/polymarket/discovery.ts` (does not exist yet)

### 3. Bettor wallet analytics

Dome's wallet endpoints cover Polymarket-specific activity and PnL natively. If wallet
credibility becomes part of Feed scoring, prefer Dome as the primary source and reserve
other providers for labels that Dome does not provide.

Potential: call Dome wallet analytics as primary, fall back to Nansen for on-chain labelling
(fund / smart trader / degen) which Dome doesn't provide.

### 4. OHLCV for analyst brain

The narrative analyst currently has no access to price history — it only sees snapshot odds.
Dome OHLCV gives the analyst a 7d price chart per market, enabling observations like
"odds shifted 18 points in the last 24h" as a signal in its own right.

New tool: `get_market_ohlcv` in `packages/brain/src/analyst-tools/polymarket.tools.ts`

### 5. Cross-platform narratives

Dome's Polymarket ↔ Kalshi matching means the analyst can compare market consensus across
platforms for the same question — a divergence between the two is itself a signal worth posting.

---

## Reference

- Full endpoint index: https://docs.domeapi.io/llms.txt
- Related tutorial: `docs/tutorials/06-nansen-cli.md` — on-chain wallet intelligence (complements Dome's Polymarket-native analytics)
- Related issue: `docs/issues/050-sports-content-pipeline.md` — first live use of Dome in the project
