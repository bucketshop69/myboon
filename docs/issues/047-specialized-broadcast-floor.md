# #045 — Specialized Broadcast Floor: Multi-Agent X Strategy

## Problem

The current "influencer" is a single generic agent that posts narratives to X. This is too narrow:

1. **No specialization** — Lookonchain-style whale alerts require a different voice than match previews or geopolitical analysis
2. **No editorial judgment** — Every published narrative becomes a X post, even if it's not X-worthy
3. **No proactive content** — Can't post scheduled content (match day previews) or react to signals before they become narratives
4. **No format variety** — Only produces single posts, not threads or engagement-driven content

The result: X account is a narrative RSS feed, not a growth channel.

## Goal

Replace the single "influencer" with a **specialized broadcast floor**:

| Agent | Scope | Voice | Writes to |
|-------|-------|-------|-----------|
| `fomo_master` | Whale alerts, fast breaks | Punchy, urgent, emoji-optional | `x_posts` only |
| `sports_analyst` | UCL/EPL match previews + bet stories | Informed, stats-aware | `x_posts` + `published_narratives` (if feed-worthy) |
| `macro_analyst` | Geopolitics, elections, macro | Measured, authoritative | `x_posts` + `published_narratives` (if feed-worthy) |
| `chief_broadcaster` | Reflection layer — critiques all X posts before publishing | Senior editor, brand guardian | Updates `x_posts.status` to `approved` or `rejected` |

**Backlog:**
- `crypto_analyst` — SPL token pumps, DEX flow, perp positioning (needs more data sources)

## Dependencies

- Blocks: none
- Related: #043 (content pipeline — supersedes the generic "influencer" concept)
- Related: #042 (Nansen layer — provides whale data for `fomo_master`)

## Scope

### Phase 1 (This Issue)

- `packages/brain/src/graphs/fomo-master-graph.ts` — new file, fomo_master agent
- `packages/brain/src/fomo-master.ts` — runner that invokes fomo_master
- `packages/brain/src/run-fomo-master.ts` — new file, PM2 entry point
- `packages/brain/package.json` — add `fomo-master:start` script
- `ecosystem.config.cjs` — add `myboon-fomo-master` process
- DB migration — `content_calendar` table for scheduled posts

### Phase 2 (Backlog — crypto_analyst)

- `packages/brain/src/graphs/crypto-analyst-graph.ts` — new file
- `packages/brain/src/crypto-analyst.ts` — runner
- Data dependencies: Jupiter flow, perp OI, DEX volume

### Phase 3 (Future)

- `packages/brain/src/graphs/sports-analyst-graph.ts` — needs match schedule data
- `packages/brain/src/graphs/macro-analyst-graph.ts` — needs publisher stable first
- `packages/brain/src/graphs/chief-broadcaster-graph.ts` — reflection layer for all agents

## DB Migration

Run manually via Supabase SQL editor:

```sql
-- Content calendar for scheduled posts (match previews, event reminders)
CREATE TABLE IF NOT EXISTS content_calendar (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_for TIMESTAMPTZ NOT NULL,
  topic         TEXT NOT NULL,        -- "UCL Final: Real Madrid vs Liverpool"
  agent_type    TEXT NOT NULL,        -- "sports_analyst", "macro_analyst", etc.
  template      TEXT NOT NULL,        -- prompt template for the agent
  metadata      JSONB,                -- match_id, event_id, etc.
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'posted', 'skipped')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX content_calendar_scheduled_idx ON content_calendar(scheduled_for);
CREATE INDEX content_calendar_status_idx ON content_calendar(status);

-- Add agent_type to x_posts for attribution
ALTER TABLE x_posts
ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'influencer'
CHECK (agent_type IN ('influencer', 'fomo_master', 'sports_analyst', 'macro_analyst', 'crypto_analyst'));

-- Add chief_broadcaster review fields
ALTER TABLE x_posts
ADD COLUMN reviewed_at TIMESTAMPTZ,
ADD COLUMN reviewed_by TEXT;  -- 'chief_broadcaster' or 'human'
```

---

## Changes

### 1. fomo_master Agent (`packages/brain/src/graphs/fomo-master-graph.ts`)

**Purpose:** Lookonchain-style whale alerts — fast, punchy, X-native.

**Input:** `signals` table where `type = 'WHALE_BET'` AND `weight >= 8` (high-conviction bets).

**Output:** X post drafts to `x_posts` with `agent_type = 'fomo_master'`.

```ts
import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import { createClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from '../minimax.js'
import type { Signal } from '@myboon/collectors'

// --- fomo_master system prompt ---

const FOMO_MASTER_PROMPT = `You are a fast, sharp financial intelligence account on X (Twitter).
Your job: turn whale bets into punchy, urgent posts that stop the scroll.

Style rules:
- Lead with the number: "$120K", "74%", "3x" — not "A wallet"
- No fluff, no hashtags, no threads (single post only)
- Emoji only if it adds urgency: 🚨 ⚡ 💰 (max 1 per post)
- Sound informed, not hype-y — you're a pro, not a degen
- End with soft CTA if space: "Full context in the feed."

Examples:

🚨 $120K on YES (Iran conflict escalating)
   Odds jumped from 68% → 74% in 15min
   Full context in the feed.

⚡ Smart money loading on Man City -1.5
   $80K across 3 accounts in last hour
   Odds: 42% → 51%

Your turn. Return JSON: { "draft_text": string, "reasoning": string }`

// --- state annotation ---

const FomoState = Annotation.Root({
  signal: Annotation<Signal>,
  draft_text: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
})

// --- nodes ---

async function generateNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const output = await runFomoLLM(state.signal)
  const trimmed = output.draft_text.slice(0, 280)
  return { draft_text: trimmed }
}

async function saveNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const supabase = getSupabase()
  await supabase.from('x_posts').insert({
    narrative_id: null,  // fomo posts are signal-driven, not narrative-driven
    draft_text: state.draft_text!,
    status: 'draft',
    agent_type: 'fomo_master',
  })
  console.log(`[fomo_master] Draft created for signal ${state.signal.id}`)
  return {}
}

// --- graph ---

export const fomoMasterGraph = new StateGraph(FomoState)
  .addNode('generate', generateNode)
  .addNode('save', saveNode)
  .addEdge(START, 'generate')
  .addEdge('generate', 'save')
  .addEdge('save', END)
  .compile()
```

---

### 2. fomo_master Runner (`packages/brain/src/fomo-master.ts`)

```ts
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { fomoMasterGraph } from './graphs/fomo-master-graph.js'
import type { Signal } from '@myboon/collectors'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function runFomoMaster(): Promise<void> {
  console.log(`[fomo_master] Running at ${new Date().toISOString()}`)

  // Fetch high-weight whale bets from last 4h that don't have x_posts yet
  const { data: signals, error } = await supabase
    .from('signals')
    .select('*')
    .eq('type', 'WHALE_BET')
    .gte('weight', 8)
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
    .not('id', 'in', `(SELECT (metadata->>'signal_id')::uuid FROM x_posts WHERE agent_type = 'fomo_master' AND created_at > now() - interval '4 hours')`)

  if (error) {
    console.error('[fomo_master] Failed to fetch signals:', error)
    return
  }

  if (!signals?.length) {
    console.log('[fomo_master] No high-weight whale bets to process')
    return
  }

  console.log(`[fomo_master] Found ${signals.length} signal(s) to process.`)

  for (const signal of signals as Signal[]) {
    try {
      await fomoMasterGraph.invoke({ signal })
    } catch (err) {
      console.error(`[fomo_master] Failed to process signal ${signal.id}:`, err)
    }
  }

  console.log(`[fomo_master] Done — processed ${signals.length} signal(s).`)
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

## Acceptance Criteria

### Phase 1 (fomo_master)

- [ ] `content_calendar` table exists in Supabase
- [ ] `x_posts.agent_type` column exists with CHECK constraint
- [ ] `x_posts.reviewed_at` and `x_posts.reviewed_by` columns exist
- [ ] `packages/brain/src/graphs/fomo-master-graph.ts` exports `fomoMasterGraph`
- [ ] `packages/brain/src/fomo-master.ts` exports `runFomoMaster`
- [ ] `packages/brain/src/run-fomo-master.ts` runs without error
- [ ] `pnpm --filter @myboon/brain fomo-master:start` runs without error
- [ ] After running, `x_posts` table has drafts with `agent_type = 'fomo_master'`
- [ ] No duplicate fomo posts for the same signal within 4h window
- [ ] PM2 process `myboon-fomo-master` starts cleanly via `pm2 start ecosystem.config.cjs`
- [ ] Drafts follow the style guide: no hashtags, max 1 emoji, lead with numbers

### Phase 2 (crypto_analyst — backlog)

- [ ] Data sources identified (Jupiter, perp OI, etc.)
- [ ] `crypto_analyst` graph created
- [ ] Integration tested

---

## Backlog: crypto_analyst

**Scope:** SPL token pumps, DEX flow, perp positioning.

**Dependencies:**
- Jupiter trade data collector
- Perp OI collector (Drift, Pacific, Mango)
- DEX volume tracking

**When to build:** After Phase 1 is stable and we have the data sources.

---

## Future Agents (Not Yet Scoped)

### sports_analyst

**Needs:**
- Match schedule data (Polymarket market metadata or external API)
- Filter: UCL + EPL only (expandable later)
- Two post types: match previews + whale bet stories

### macro_analyst

**Needs:**
- Publisher-critic loop stable first
- Clear criteria for "feed-worthy vs X-only"
- Reads `published_narratives` and decides what deserves X amplification

### chief_broadcaster

**Purpose:** Reflection layer — reviews all X posts before they go out.

**Needs:**
- All other agents stable first
- Clear brand voice guidelines
- Can override agent decisions (approve/reject)

---

## Notes

- This issue **supersedes #043's generic "influencer" concept** — the influencer graph is replaced by specialized agents
- The `content_calendar` table enables scheduled content (match previews, event reminders)
- Each agent has a distinct voice and mandate — no generic "post this narrative" logic
- Human approval still required before posting (status = `draft` → `approved` → `posted`)
