# #047 — Specialized Broadcast Floor: Multi-Agent X Strategy

## Problem

The current "influencer" is a single generic agent that posts narratives to X. This is too narrow:

1. **No specialization** — Lookonchain-style whale alerts require a different voice than match previews or geopolitical analysis
2. **No editorial judgment** — Every published narrative becomes an X post, even if it's not X-worthy
3. **No proactive content** — Can't react to high-conviction signals before they become narratives
4. **No format variety** — Only produces single posts, no cross-agent coordination

The result: X account is a narrative RSS feed, not a growth channel.

## Goal

Replace the single "influencer" with a **specialized broadcast floor**:

| Agent | Scope | Voice | Writes to |
|-------|-------|-------|-----------|
| `fomo_master` | Whale alerts, high-conviction Polymarket bets | Punchy, urgent, Lookonchain-style | `x_posts` |
| `sports_analyst` | UCL/EPL match previews + bet stories | Informed, stats-aware | `x_posts` (Phase 3) |
| `macro_analyst` | Geopolitics, elections, macro | Measured, authoritative | `x_posts` (Phase 3) |
| `chief_broadcaster` | Inline reflection node — critiques every draft before saving | Senior editor, brand guardian | Updates `x_posts.status` |

**Backlog:**

- `crypto_analyst` — SPL token pumps, DEX flow, perp positioning (needs on-chain data sources)

## Dependencies

- Blocks: none
- Related: #043 (content pipeline)
- Related: #042 (Nansen layer — `nansen_bettor_profile` tool used by fomo_master)

---

## Scope

### Phase 1 (This Issue)

- `packages/brain/src/graphs/fomo-master-graph.ts` — fomo_master agent + broadcaster inline node + rewrite loop
- `packages/brain/src/fomo-master.ts` — runner that fetches signals and invokes the graph
- `packages/brain/src/run-fomo-master.ts` — PM2 entry point
- `packages/brain/package.json` — add `fomo-master:start` script
- `ecosystem.config.cjs` — add `myboon-fomo-master` process
- DB migration — 4 columns on `x_posts` (see below)

### Phase 2 (Backlog — crypto_analyst)

- Needs: Jupiter flow, perp OI, DEX volume data sources
- Build after on-chain Nansen collector is stable

### Phase 3 (Future)

- `sports_analyst` — needs match schedule strategy (Polymarket market data sufficient, no calendar table needed)
- `macro_analyst` — needs publisher critic loop stable first
- `chief_broadcaster` as standalone process — after all agents are stable

---

## DB Migration

Run manually via Supabase SQL editor:

```sql
-- Add agent attribution and signal tracking to x_posts
ALTER TABLE x_posts
  ADD COLUMN agent_type    TEXT NOT NULL DEFAULT 'influencer',
  ADD COLUMN signal_ids    UUID[],
  ADD COLUMN reviewed_at   TIMESTAMPTZ,
  ADD COLUMN reviewed_by   TEXT;  -- 'chief_broadcaster' or 'human'
```

**Notes:**

- `agent_type` is plain TEXT — no CHECK constraint. New agents just write their name.
- `signal_ids` — array of signal UUIDs this post consumed. Used by fomo_master to prevent reprocessing the same signals on the next run.
- Existing influencer rows backfill `agent_type = 'influencer'` via the DEFAULT.
- No `content_calendar` table — sports_analyst will query Polymarket directly for match data when built.

---

## Changes

### 1. fomo_master Graph (`packages/brain/src/graphs/fomo-master-graph.ts`)

**Purpose:** Lookonchain-style whale alerts — reads a batch of high-conviction WHALE_BET signals, picks the best 1-3 stories editorially, enriches with Nansen wallet context, writes punchy X drafts. `chief_broadcaster` reviews inline.

**Input:** Batch of `WHALE_BET` signals (weight ≥ 8, last 4h, not already in `x_posts.signal_ids`).

**Flow:**

```text
fetch signal batch
  → fomo_master LLM: pick best 1-3, call nansen_bettor_profile per pick, write drafts
  → broadcaster LLM: review draft(s) against last 7 days of x_posts timeline
    → if approved: save with status='draft'
    → if rejected: send feedback back to fomo_master for rewrite
    → max 3 rewrite attempts → if still rejected: save with status='rejected'
```

**fomo_master system prompt:**

```text
You are a fast, sharp financial intelligence account on X (Twitter).
Style: Lookonchain — specific numbers, wallet context, story-driven.

Rules:
- Lead with the number or the story: "$26K new wallet", "71% win rate bettor", "3rd bet this week"
- No hashtags, no threads (single post only)
- Emoji only if it adds urgency: 🚨 ⚡ 💰 (max 1 per post)
- Sound informed, not hype-y — you're a pro analyst, not a degen
- End with soft CTA if space: "Full context in the feed."

Examples:
🚨 New wallet "mzandres" dropped $26K on YES for US forces entering Iran by March 31.
   Odds sitting at 18%. High conviction, fresh account.
   Full context in the feed.

⚡ A wallet with a 71% Polymarket win rate just bet $14K on Trump tariff escalation.
   Third bet on this market this week — total exposure now $38K.

You will receive a batch of WHALE_BET signals. Use the nansen_bettor_profile tool
to enrich the best picks with wallet win rate context before writing.

Pick 1-3 of the most interesting stories from the batch. Return JSON:
{
  "posts": [
    { "draft_text": string, "reasoning": string, "signal_ids": string[] }
  ]
}
```

**broadcaster system prompt:**

```text
You are the chief broadcaster for a financial intelligence X account.
You review draft posts before they go live.

You will receive:
- The draft post(s) to review
- Last 7 days of x_posts history (all agents)

Reject if:
- Duplicate topic already covered well in the last 24h
- Topic has been posted 3+ times this week already
- Post is vague — no specific numbers or wallet context
- Tone is hype-y or unprofessional

Approve if the post adds genuine value and fits the account's timeline.

Return JSON:
{
  "decision": "approved" | "rejected",
  "reasoning": string,
  "feedback": string  // only if rejected — specific instructions for rewrite
}
```

**State annotation:**

```ts
const FomoState = Annotation.Root({
  signals: Annotation<SignalRow[]>,
  drafts: Annotation<DraftPost[] | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  broadcaster_feedback: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  attempt: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
  timeline: Annotation<XPostRow[]>,  // last 7 days, fetched once at run start
})
```

**Graph edges:**

```
START → generate → broadcast → (approved) → save → END
                             → (rejected, attempt < 3) → generate
                             → (rejected, attempt >= 3) → save_rejected → END
```

---

### 2. fomo_master Runner (`packages/brain/src/fomo-master.ts`)

```ts
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { fomoMasterGraph } from './graphs/fomo-master-graph.js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function runFomoMaster(): Promise<void> {
  console.log(`[fomo_master] Running at ${new Date().toISOString()}`)

  // Step 1: fetch signal IDs already consumed in recent x_posts
  const { data: recentPosts } = await supabase
    .from('x_posts')
    .select('signal_ids')
    .eq('agent_type', 'fomo_master')
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  const consumedIds = new Set<string>(
    (recentPosts ?? []).flatMap((p) => p.signal_ids ?? [])
  )

  // Step 2: fetch high-weight whale bets from last 4h
  const { data: signals, error } = await supabase
    .from('signals')
    .select('*')
    .eq('type', 'WHALE_BET')
    .gte('weight', 8)
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('[fomo_master] Failed to fetch signals:', error)
    return
  }

  const unprocessed = (signals ?? []).filter((s) => !consumedIds.has(s.id))

  if (!unprocessed.length) {
    console.log('[fomo_master] No new high-weight signals to process')
    return
  }

  console.log(`[fomo_master] Found ${unprocessed.length} signal(s) to process.`)

  // Step 3: fetch last 7 days of x_posts for broadcaster context
  const { data: timeline } = await supabase
    .from('x_posts')
    .select('draft_text, agent_type, status, created_at')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })

  // Step 4: invoke graph with full signal batch + timeline
  try {
    await fomoMasterGraph.invoke({ signals: unprocessed, timeline: timeline ?? [] })
  } catch (err) {
    console.error('[fomo_master] Graph error:', err)
  }

  console.log('[fomo_master] Done.')
}
```

---

### 3. Runner Script (`packages/brain/src/run-fomo-master.ts`)

```ts
import 'dotenv/config'
import { runFomoMaster } from './fomo-master.js'

runFomoMaster()
  .then(() => {
    console.log('[fomo_master] Run complete.')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[fomo_master] Fatal error:', err)
    process.exit(1)
  })
```

---

### 4. PM2 Config (`ecosystem.config.cjs`)

Add to apps array:

```js
{
  name: 'myboon-fomo-master',
  script: './packages/brain/src/run-fomo-master.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx/esm',
  cron_restart: '0 */1 * * *',  // every hour
  autorestart: false,
  watch: false,
  env: { NODE_ENV: 'production' },
}
```

---

### 5. Package.json Script

```json
"fomo-master:start": "tsx src/run-fomo-master.ts"
```

---

## Implementation Notes

### Signal type import

`Signal` is defined in `packages/collectors/src/polymarket/signal-types.ts` but not exported from the collectors package index. The graph should define a local `SignalRow` type (the Supabase DB row shape with `id`, `type`, `weight`, `metadata`, `created_at`) rather than importing from `@myboon/collectors`.

### Nansen tool use

fomo_master uses `nansen_bettor_profile` from `packages/brain/src/analyst-tools/nansen.tools.ts`. The `metadata.user` field on WHALE_BET signals contains the wallet address. Tool is already wired — just import and register.

### broadcaster inline

broadcaster is a node in the fomo_master graph, not a separate process. It receives the current draft(s) + the pre-fetched 7-day timeline from graph state. No separate DB query inside the node.

### PostgREST two-step pattern

All Supabase queries in the runner use two separate queries (fetch consumed IDs first, then filter in JS) — no raw SQL subqueries in PostgREST `.not()` calls.

---

## Acceptance Criteria

### Phase 1 (fomo_master + broadcaster)

- [ ] DB migration run — `agent_type`, `signal_ids`, `reviewed_at`, `reviewed_by` columns exist on `x_posts`
- [ ] `packages/brain/src/graphs/fomo-master-graph.ts` exports `fomoMasterGraph`
- [ ] `packages/brain/src/fomo-master.ts` exports `runFomoMaster`
- [ ] `packages/brain/src/run-fomo-master.ts` runs without error
- [ ] `pnpm --filter @myboon/brain fomo-master:start` runs without error
- [ ] fomo_master picks 1-3 posts from the signal batch (not one per signal)
- [ ] fomo_master calls `nansen_bettor_profile` for wallet context when address is available in signal metadata
- [ ] broadcaster reviews each draft against 7-day x_posts timeline before saving
- [ ] Broadcaster rejects route to rewrite loop — max 3 attempts
- [ ] After 3 failed attempts, draft saved with `status='rejected'`
- [ ] Approved drafts saved with `status='draft'`, `agent_type='fomo_master'`, `signal_ids` populated
- [ ] Next run excludes signals already in recent `x_posts.signal_ids` (no reprocessing)
- [ ] PM2 process `myboon-fomo-master` starts cleanly — `pm2 start ecosystem.config.cjs`
- [ ] Drafts follow style guide: no hashtags, max 1 emoji, lead with numbers/story

### Phase 2 (crypto_analyst — backlog)

- [ ] Data sources identified (Nansen on-chain collector stable)
- [ ] `crypto_analyst` graph created
- [ ] Integration tested

---

## Backlog Agents (Not Scoped Yet)

### crypto_analyst

Needs Nansen on-chain collector (Jupiter DEX trades, perp OI, token netflow) before building.

### sports_analyst

Needs: UCL/EPL market data from Polymarket (no separate calendar table — query Polymarket event screener directly for upcoming matches + odds).

### macro_analyst

Needs publisher critic loop stable. Reads `published_narratives`, decides what deserves X amplification beyond the feed.

### chief_broadcaster (standalone)

After all agents stable — becomes a separate scheduled process that reviews cross-agent draft queues in bulk. For now, broadcaster logic lives inline in each agent's graph.
