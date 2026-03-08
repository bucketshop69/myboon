# pnldotfun — Architecture & Product Vision

## The Product

A mobile-first narrative intelligence app for on-chain traders and prediction market participants.

**Four tabs:**

| Tab | What | Revenue |
|-----|------|---------|
| Feed | Curated narrative intelligence — on-chain + Polymarket + Kalshi signals | x402 API for external consumers |
| Trade | Perps via Pacific SDK (Solana) | Fee share |
| Swap | Jupiter SPL token swap | Fee share |
| Predict | Polymarket via builder code | Affiliate % |

**X account** — auto-posts top narratives surfaced by the influencer brain. Distribution flywheel.

**The moat:** insights. Trade/Swap/Predict are commodities. The Feed is the differentiator — it tells users something they can't get anywhere else. Everything else exists because the Feed earns trust.

---

## Hackathon Plan (near-term)

Mobile app with Feed tab only. Trade/Swap/Predict locked or WIP. Clean demo story:
> "This feed is powered by on-chain signals + prediction market intelligence + a multi-agent brain."

---

## Data Architecture

```
Signal Sources                 Supabase                    Consumers
──────────────                 ────────                    ─────────
Polymarket collectors    →     signals table      →        Brain agents
  - discovery (2h REST)        narratives table   →        Feed API
  - stream (WebSocket)         (processed flag)   →        X posts
  - user tracker (5min)

On-chain stream (future) →     signals table
  - 90 wallet registry
  - tx-parser output

X API (future)           →     signals table
Kalshi (future)          →     signals table
```

**Signals table** — shared intake for all sources. Every collector writes same shape:

```
source: 'POLYMARKET' | 'ONCHAIN' | 'X' | 'KALSHI'
type:   'MARKET_DISCOVERED' | 'ODDS_SHIFT' | 'WHALE_BET' | ...
topic:  string (market question / token / event)
weight: 1-10
metadata: jsonb (source-specific fields)
processed: boolean (false = not yet read by analyst)
```

**Narratives table** — analyst output. Publisher reads this.

```
cluster:           string (narrative title)
observation:       string (analyst note)
score:             1-10
signal_count:      int
signals_snapshot:  jsonb
status:            'draft' | 'published' | 'rejected'
created_at:        timestamptz
```

---

## Brain Architecture

Three layers, each with planned redundancy (2 agents per layer for consensus):

```
Layer 1 — Analysts (runs every 15min)
  Reads: signals (processed=false)
  Does:  clusters signals into narratives, scores them
  Writes: narratives table (status='draft')
  Marks:  signals as processed=true

Layer 2 — Publishers (runs every 30min)
  Reads: narratives (status='draft')
  Does:  picks best 3-5, decides framing
  Writes: narratives (status='published')

Layer 3 — Influencers (runs every 2-4h)
  Reads: narratives (status='published')
  Does:  writes X post drafts (5-10/day)
  Writes: x_posts table (status='draft')
  Human approves before posting (initially)
```

**Current state:**
- Layer 1 (Analyst) ✅ — writes to Supabase `narratives` table (status=draft), uses tool calling to fetch live market odds mid-analysis
- Layer 2 (Publisher) ✅ — reads draft narratives (score >= 7), researches with Firecrawl + own DB check, scores each (>= 8 to publish), writes to `published_narratives`, marks narrative status, runs every 30min
- Layer 3 (Influencer) — not started (issue 024)

**Next:** Feed API (issue 025) — REST endpoint serving published narratives to mobile app.

**Multi-agent consensus plan (post-MVP):**

- 2 analysts both save → publisher only picks narratives flagged by both
- 2 publishers agree → goes live
- Reduces noise, increases confidence in what reaches prod

---

## Packages

```
packages/
  shared/           Shared SDK — PolymarketClient, types (imported by brain, collectors, apps)
  tx-parser/        Solana tx parsing — Jupiter, Meteora, SOL transfers
  brain/            All LLM agents — classifier, research, analyst (live), publisher (live)
  collectors/       Data ingestion scripts — Polymarket (live), X (planned), Kalshi (planned)
  entity-memory/    In-memory entity store (pre-persistence MVP)
```

---

## Infrastructure

- **Runtime:** Node.js / TypeScript (ESM)
- **Database:** Supabase (Postgres) — shared between VPS collectors and local brain
- **LLM:** MiniMax M2.5 via Anthropic-compatible API
- **Collectors run on:** US VPS (Polymarket geo-restricted)
- **Brain agents run on:** Local (dev) → VPS (prod)
- **Mobile:** Expo (React Native)
- **Monorepo:** pnpm workspaces

---

## Collector Details

### Polymarket Collector (`packages/collectors/src/polymarket/`)

- `discovery.ts` — fetches top 20 markets by volume every 2h, merges with `pinned.json`, filters expired
- `stream.ts` — WebSocket `/ws/market`, emits `ODDS_SHIFT` on >5% price move
- `user-tracker.ts` — polls 18 tracked whale addresses every 5min, emits `WHALE_BET` (min $50, weight scaled by amount, filters `updown` noise markets)
- `pinned.json` — hand-picked market slugs (Iran conflict cluster, etc.)
- `tracked-users.json` — 18 whale wallet addresses

### Filtering Rules

- Markets with `endDate` in the past → skipped
- `updown` slug pattern → noise, skipped
- Bet amount < $50 → skipped
- Bet weight: $50-499=4, $500-1999=6, $2000-9999=8, $10k+=10

---

## API Layer (planned)

- `GET /narratives` — top published narratives (free, limited)
- `GET /narratives/:id` — full narrative deep-dive (x402 gated)
- x402 micropayments on Solana

---

## X Account Strategy

- Influencer brain produces draft posts from published narratives
- Human approves manually to start
- Goal: 5-10 posts/day
- Posts link back to app Feed for full context

---

## Key Decisions Log

| Decision | Reasoning |
|----------|-----------|
| Supabase over local Postgres | Shared between VPS collectors and local brain without VPN |
| MiniMax over OpenAI | Cost — ~$0.54/month vs much higher |
| Collectors separate from brain | Different runtime concerns, brain is LLM-heavy, collectors are persistent network processes |
| CSV → Supabase for narratives | CSV was for testing only, narratives need to be queryable by API |
| Feed-only for hackathon | Differentiator is insights, not swap/trade which are commodities |
| Publisher brain before influencer | Single pipeline must work before adding consensus/redundancy |
