# #059 — crypto_god: Pacific Perps Broadcaster

## Problem

`fomo_master` covers prediction market whale bets. `sports_broadcaster` covers match odds.
Neither touches perps. Pacific Protocol emits `LIQUIDATION_CASCADE`, `OI_SURGE`, and
`FUNDING_SPIKE` signals (issue #058) — but nothing reads them or turns them into content.

**Gap:** A $4M liquidation cascade on Pacific goes unnoticed. No post, no signal-to-content
pipeline. The `crypto` content type exists in the taxonomy (#049) but has zero producers.

## Goal

Build `crypto_god` — a broadcaster that reads Pacific signals and posts punchy perp market
intelligence to X. Same graph pattern as `fomo_master` (`rank → write → broadcast →
resolve → save`), same PM2 cron pattern, different signals and voice.

1. `LIQUIDATION_CASCADE` → post about who got wiped and how much
2. `FUNDING_SPIKE` → post about crowded trades paying unsustainable funding
3. `OI_SURGE` → post about large positioning entering a market

**Outcome:** `x_posts` table gets `agent_type: 'crypto_god'` drafts after each Pacific signal
batch. Human reviews and approves before posting.

## Dependencies

- Blocked by: #058 (Pacific collectors — provides signals)
- Builds on: #047, #048 (fomo_master pattern — reuse graph structure exactly)
- None (no new DB tables needed — reuses `x_posts` + `signals`)

## Scope

- `packages/brain/src/crypto-god.ts` — Runner: fetch signals, enrich, format, invoke graph
- `packages/brain/src/graphs/crypto-god-graph.ts` — LangGraph: rank → write → broadcast → resolve → save
- `packages/brain/src/run-crypto-god.ts` — PM2 entry point
- `ecosystem.config.cjs` — Add `myboon-crypto-god` PM2 process (hourly cron)

## Changes

### 1. Graph — `packages/brain/src/graphs/crypto-god-graph.ts`

Same structure as `fomo-master-graph.ts`. Reuse `extractJson`, `PendingDraft`, `DraftPost`,
`BroadcastReview`, `XPostRow` types verbatim. The only differences are the prompts and the
`FormattedSignal` shape.

**Signal archetypes** (first match wins — written into each `PendingDraft`):

| Priority | Archetype | Condition |
|----------|-----------|-----------|
| 1 | `WIPEOUT` | `signal.type === 'LIQUIDATION_CASCADE'` |
| 2 | `CROWDED` | `signal.type === 'FUNDING_SPIKE'` |
| 3 | `POSITIONING` | `signal.type === 'OI_SURGE'` |

Archetype travels through the graph exactly as in fomo_master — attached by `writeNode`
from signal data (not from LLM), dedup key is `{symbol}:{archetype}`.

**`RANKER_SYSTEM_PROMPT`:**
```
You are the editorial director for a crypto intelligence X account covering perp markets.
From a batch of Pacific Protocol signals, pick the 1-3 most compelling stories.

Ranking criteria (in order):
1. Size — largest USD value liquidated or OI change (most visceral)
2. Velocity — happened fastest (most urgency)
3. Corroboration — funding spike AND OI surge on same symbol = bigger story
4. Symbol tier — BTC/ETH over altcoins for same signal strength

Return JSON:
{
  "picks": [{ "signal_id": "S1", "rank": 1, "reasoning": "..." }],
  "why_skipped": { "S2": "reason" }
}
Include why_skipped for every signal not picked.
```

**`WRITER_SYSTEM_PROMPT`:**
```
You are the writer for a crypto intelligence X account covering perp markets.
Your audience: on-chain traders, perp degens, people who want to know what's moving
before it hits the timeline. You write observations, not alerts.

[Voice]
Observational. Not hype. 4-5 lines. Each line earns its place.
Build tension through facts. The final line is the implication.
The reader should finish thinking "huh" — not "okay, so what."

[Archetypes — first match wins from signal data]
1. WIPEOUT: signal type is LIQUIDATION_CASCADE
2. CROWDED: signal type is FUNDING_SPIKE
3. POSITIONING: signal type is OI_SURGE

[Playbook — study the structure, not just the words]

--- WIPEOUT (LIQUIDATION_CASCADE) ---
Lead: the size. Then the speed. Then what it means.

GOOD:
$4.2M in BTC longs just got wiped on Pacific.
Price dropped 8.2% in 2 hours. OI fell 15.8% in the same window.
That's not organic selling — that's stop losses eating stop losses.
The cascade usually ends when it runs out of margin to liquidate.

GOOD:
ETH OI on Pacific just dropped $1.8M in a single 2-hour window.
Price up 6%. So it wasn't longs — shorts just got cleared out.
Now OI is lower and price is higher. Less resistance from here.

BAD:
"BTC longs were liquidated on Pacific as price fell." [Data, no weight.]

--- CROWDED (FUNDING_SPIKE) ---
Lead: the rate. Then what it costs. Then the tension.

GOOD:
BTC perp funding on Pacific: 0.015%/hr. That's 131% annualized.
Longs are paying shorts every 8 hours just to hold the position.
At some point, the carry cost kills the trade before the thesis plays out.
The market has been crowded here before. It didn't end well.

GOOD:
ETH funding just hit 0.012%/hr on Pacific — 105% annualized.
Every 8 hours, longs pay shorts. That's a slow tax on conviction.
When the funding stays this high, one of two things happens:
price moves to flush the longs, or the longs give up and close.

BAD:
"ETH funding rate is elevated on Pacific at 0.012%/hr." [No story.]

--- POSITIONING (OI_SURGE) ---
Lead: the size entering. Then the speed. Then the question it raises.

GOOD:
ETH open interest on Pacific up $400K in 2 hours. That's a 33% increase.
New margin entering a market this fast usually has a view.
Nobody moves $400K into a perp position without a reason.

GOOD:
SOL OI on Pacific just jumped 28% in one 2-hour window.
$320K in fresh margin, one direction.
This market just got a lot more interesting.

BAD:
"SOL open interest increased on Pacific." [Nothing to think about.]

[Hard rules]
- 4-5 lines. No more.
- No hashtags
- Max 1 emoji if it adds urgency (🚨 ⚡) — never 🚀🔥
- NEVER write "Full context in the feed." or any CTA
- NEVER be vague — use actual numbers from the signal metadata
- Do NOT invent data not present in the signal block

Return JSON:
{
  "drafts": [
    {
      "signal_id": "uuid",
      "archetype": "WIPEOUT | CROWDED | POSITIONING",
      "draft_text": "...",
      "reasoning": "why this archetype, what you led with"
    }
  ]
}
```

**`BROADCASTER_SYSTEM_PROMPT`** — identical structure to fomo_master's broadcaster.
Duplicate detection: angle fingerprint `{symbol}:{archetype}`. Only `status='posted'`
counts toward frequency limits. Hard reject same `{symbol}:{archetype}` posted in last 24h.

Soft reject triggers (crypto-specific):
- No specific USD amount or percentage in the post
- Funding rate mentioned without annualized context
- Tone is hype-y ("explosive", "moon", "insane")

### 2. Runner — `packages/brain/src/crypto-god.ts`

```ts
export async function runCryptoGod(): Promise<void>
```

**Step 1** — fetch consumed signal_ids from recent x_posts (last 4h, `agent_type: 'crypto_god'`)

**Step 2** — fetch Pacific signals from last 4h:
```ts
const { data: signals } = await supabase
  .from('signals')
  .select('*')
  .eq('source', 'PACIFIC')
  .in('type', ['LIQUIDATION_CASCADE', 'OI_SURGE', 'FUNDING_SPIKE'])
  .gte('weight', 6)
  .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
```

**Step 3** — dedup: filter consumed IDs, then cluster by `symbol` — one representative
per symbol (highest weight, tiebreaker: most recent). Attach `cluster_context` if
multiple signals hit the same symbol.

**Step 4** — enrich: for each representative, fetch live Pacific price:
```ts
const prices = await pacificClient.getPrices()
const livePrice = prices.find(p => p.symbol === signal.metadata.symbol)
// Attach: livePrice.mark, livePrice.funding, livePrice.open_interest
```

**Step 5** — `formatSignalBlock()`: produces a plaintext block for each signal:
```
SIGNAL: LIQUIDATION_CASCADE on BTC
OI drop: $4.2M (15.8%) | Price move: -8.2% | Side liquidated: long
Current mark: $87,000 | Current OI: $22.4M | Current funding: 0.0003%/hr
Signal weight: 9 | Detected: 2026-04-02T14:00:00Z
```

**Step 6** — fetch x_posts timelines (7d full, posted only) — identical to fomo_master

**Step 7** — invoke `cryptoGodGraph`

**Step 8** — write `why_skipped` back to `signals.skip_reasoning`

**`saveNode`** appends `https://pacifica.fi` to approved drafts (not per-market URL —
Pacific doesn't have per-market share URLs). Saves with `agent_type: 'crypto_god'`.

### 3. PM2 entry point — `packages/brain/src/run-crypto-god.ts`

```ts
import 'dotenv/config'
import { runCryptoGod } from './crypto-god.js'

runCryptoGod()
  .then(() => { console.log('[crypto_god] Run complete.'); process.exit(0) })
  .catch((err: unknown) => { console.error('[crypto_god] Fatal error:', err); process.exit(1) })
```

### 4. PM2 config — `ecosystem.config.cjs`

Add after `myboon-fomo-master`:
```js
{
  name: 'myboon-crypto-god',
  script: './packages/brain/src/run-crypto-god.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx/esm',
  cron_restart: '30 * * * *',   // offset 30min from fomo_master to spread LLM load
  autorestart: false,
  watch: false,
  env: { NODE_ENV: 'production' },
},
```

## Testing

A test harness is included at `packages/brain/src/test-crypto-god.ts`.
It seeds all 3 signal types with realistic Pacific data (BTC liquidation $3.6M,
ETH funding 131% annualized, SOL OI +30%) then runs the full pipeline and prints results.

```bash
# Full pipeline test — seeds signals, runs graph, prints x_posts, cleans up
pnpm --filter @myboon/brain run crypto-god:test

# Keep seeded signals in DB for manual inspection
KEEP_SEEDS=1 pnpm --filter @myboon/brain run crypto-god:test

# Run the broadcaster standalone (requires real Pacific signals in DB)
pnpm --filter @myboon/brain run crypto-god:start
```

Watch for JSON parse errors in the output — the `extractJson` fallback handles most
LLM formatting issues but log any unrecovered failures for prompt tuning.

## Acceptance Criteria

- [ ] `pnpm --filter @myboon/brain run crypto-god:test` completes without crashing
- [ ] `x_posts` table gets rows with `agent_type = 'crypto_god'` and `status = 'draft'` after a run
- [ ] `WIPEOUT` draft leads with USD liquidation amount in the first line
- [ ] `CROWDED` draft includes annualized funding rate (not just raw rate)
- [ ] `POSITIONING` draft leads with USD OI increase and percentage
- [ ] Broadcaster hard-rejects a `WIPEOUT` post if same `{symbol}:WIPEOUT` was posted in last 24h
- [ ] `why_skipped` written back to `signals.skip_reasoning` for all un-picked signals
- [ ] PM2 `myboon-crypto-god` starts cleanly: `pm2 start ecosystem.config.cjs --only myboon-crypto-god`
- [ ] Run completes with `[crypto_god] Run complete.` when no new signals present (no crash)
- [ ] `https://pacifica.fi` appended to approved draft_text in DB
