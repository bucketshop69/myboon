# #043 — Content Pipeline: Critic Agent and Influencer Brain

## Problem

Two gaps in the content pipeline:

1. **Publisher has no self-review.** It writes `content_small`, `content_full`, and picks slugs in a single LLM pass with a manual `for` loop. Result: every card has the same tone ("A wallet placed..."), slug count is not enforced (UI renders max 3 but narratives emit 5+), and no story arc awareness — the 4th Iran update reads as standalone. The reflection pattern (generate → critique → revise) cannot be expressed cleanly in the current imperative loop.

2. **No distribution channel.** Published narratives sit in the DB and reach users only through the app Feed. The X account is idle. The influencer brain (Layer 3) has never been implemented. Without X posts there is no growth flywheel.

Issues #037 and #041 are superseded by this issue.

## Goal

1. Migrate publisher and influencer to LangGraph `StateGraph` — reflection pattern (publisher → critic → conditional revise loop) expressed as a proper graph, not a manual `for` loop
2. Critic agent node enforces tone variety, slug cap, and story arc awareness before inserting to DB
3. `content_type` field added to `published_narratives` — classifies every narrative as `fomo | signal | news`
4. Influencer brain reads published narratives and writes X post drafts to `x_posts` table for human review

## Dependencies

- Blocks: #038 (feed content types UI — needs `content_type` column, deferred to backlog)
- None (standalone — runs in parallel with #042)

## Scope

- `packages/brain/package.json` — add `@langchain/langgraph` dependency
- `packages/brain/src/graphs/publisher-graph.ts` — new file, LangGraph publisher + critic graph
- `packages/brain/src/graphs/influencer-graph.ts` — new file, LangGraph influencer graph
- `packages/brain/src/publisher.ts` — replace manual tool loop with `publisherGraph.invoke()`
- `packages/brain/src/publisher-tools/supabase.tools.ts` — new file, `get_tag_history` tool
- `packages/brain/src/types.ts` — add `content_type` to `PublishedOutput`
- `packages/brain/src/influencer.ts` — new file, runner that invokes influencer graph
- `packages/brain/src/run-influencer.ts` — new file, runner script
- `packages/brain/package.json` — add `influencer:start` script
- `ecosystem.config.cjs` — add `myboon-influencer` process
- DB migration — `content_type` column on `published_narratives` + `x_posts` table

## DB Migration

Run manually via Supabase SQL editor:

```sql
-- Critic: content_type on published_narratives
ALTER TABLE published_narratives
ADD COLUMN content_type TEXT NOT NULL DEFAULT 'fomo'
CHECK (content_type IN ('fomo', 'signal', 'news'));

-- Influencer: x_posts table
CREATE TABLE IF NOT EXISTS x_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  narrative_id  UUID REFERENCES published_narratives(id),
  draft_text    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'approved', 'posted', 'rejected')),
  post_url      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX x_posts_status_idx ON x_posts(status);
CREATE INDEX x_posts_narrative_id_idx ON x_posts(narrative_id);
```

## Changes

### 1. Install LangGraph

```json
// packages/brain/package.json — add to dependencies
"@langchain/langgraph": "^0.2.0"
```

No LangChain model wrapper needed. `callMinimax()` in `publisher.ts` stays unchanged — LangGraph nodes call it directly.

---

### 2. Add `content_type` to `PublishedOutput`

`packages/brain/src/types.ts`:

```ts
export type ContentType = 'fomo' | 'signal' | 'news'

export interface PublishedOutput {
  content_small: string
  content_full: string
  reasoning: string
  tags: string[]
  priority: number
  publisher_score: number
  actions: NarrativeAction[]
  content_type: ContentType  // NEW
}

export interface CriticOutput {
  verdict: 'approve' | 'revise' | 'reject'
  issues: string[]
  revised_content_small: string | null
}
```

Publisher system prompt must instruct the LLM to classify:

- `fomo` — lead is a specific whale bet or unusual position ("Wallet X placed $50K on...")
- `signal` — lead is a pattern across multiple actors ("Smart money has been consistently buying NO on...")
- `news` — lead is a real-world event with market context ("After Sporting CP's comeback win, odds shifted...")

---

### 3. `get_tag_history` tool (`packages/brain/src/publisher-tools/supabase.tools.ts`)

```ts
import { createClient } from '@supabase/supabase-js'
import type { ResearchTool } from '../research/types/mcp.js'

export function createPublisherSupabaseTools(supabaseUrl: string, supabaseKey: string): ResearchTool<any>[] {
  const supabase = createClient(supabaseUrl, supabaseKey)

  return [
    {
      name: 'get_tag_history',
      description:
        'Fetch recent published narratives matching any of the given topic tags. Call this before writing when you identify a topic tag from the narrative signals. Use the results to understand what angle has already been covered — do not repeat the same framing. If this is the 4th UCL card today, find a fresh angle or recommend rejection.',
      inputSchema: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Topic tags to search (e.g. ["iran", "geopolitics"])',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 5, max 10)',
          },
        },
        required: ['tags'],
        additionalProperties: false,
      },
      async execute(args: { tags: string[]; limit?: number }) {
        const cap = Math.min(args.limit ?? 5, 10)
        const { data } = await supabase
          .from('published_narratives')
          .select('id, content_small, tags, content_type, created_at')
          .overlaps('tags', args.tags)
          .order('created_at', { ascending: false })
          .limit(cap)
        return data ?? []
      },
    },
  ]
}
```

---

### 4. Publisher graph (`packages/brain/src/graphs/publisher-graph.ts`)

Replace the manual `for` loop in `publisher.ts` with a LangGraph `StateGraph`. Nodes call `callMinimax()` directly — no LangChain model wrapper.

```ts
import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import type { PublishedOutput, CriticOutput } from '../types.js'
import type { Narrative } from '../types.js'

const MAX_REVISIONS = 2

// State annotation
const PublisherState = Annotation.Root({
  narrative:     Annotation<Narrative>,
  draft:         Annotation<PublishedOutput | null>({ reducer: (_, b) => b, default: () => null }),
  tag_history:   Annotation<unknown[]>({ reducer: (_, b) => b, default: () => [] }),
  critic:        Annotation<CriticOutput | null>({ reducer: (_, b) => b, default: () => null }),
  attempts:      Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
})

// Node: run publisher LLM loop (existing callMinimax tool loop, unchanged)
async function publisherNode(state: typeof PublisherState.State) {
  const draft = await runPublisherLLM(state.narrative, state.tag_history, state.critic)
  return { draft, attempts: 1 }
}

// Node: run critic LLM call (single lightweight call, no tool loop)
async function criticNode(state: typeof PublisherState.State) {
  const critic = await runCriticLLM(state.draft!, state.tag_history)
  return { critic }
}

// Conditional edge: route after critic verdict
function routeAfterCritic(state: typeof PublisherState.State): 'revise' | 'done' {
  if (state.critic?.verdict === 'approve') return 'done'
  if (state.critic?.verdict === 'reject') return 'done'
  if (state.attempts >= MAX_REVISIONS) return 'done'  // cap revisions
  return 'revise'
}

export const publisherGraph = new StateGraph(PublisherState)
  .addNode('publisher', publisherNode)
  .addNode('critic',    criticNode)
  .addEdge(START,       'publisher')
  .addEdge('publisher', 'critic')
  .addConditionalEdges('critic', routeAfterCritic, {
    revise: 'publisher',
    done:   END,
  })
  .compile()
```

**`runPublisherLLM`** is the existing tool-calling loop extracted from `publisher.ts` (unchanged logic — `callMinimax`, tool execution, JSON parsing). It receives `tag_history` and the previous `critic` output so the LLM can see what was rejected and why.

**`runCriticLLM`** is a single `callMinimax` call with no tools:

```ts
async function runCriticLLM(
  draft: PublishedOutput,
  tagHistory: unknown[]
): Promise<CriticOutput> {
  const response = await callMinimax(
    [{ role: 'user', content: JSON.stringify({ draft, tag_history: tagHistory }) }],
    [],  // no tools
    CRITIC_SYSTEM_PROMPT,
    { max_tokens: 512, temperature: 0.1 }
  )
  return JSON.parse(extractText(response)) as CriticOutput
}
```

**Critic system prompt (exact text):**

```text
You are a feed quality critic. Review the publisher's draft and return a JSON object with exactly this shape:
{
  "verdict": "approve" | "revise" | "reject",
  "issues": string[],
  "revised_content_small": string | null
}

Check for these problems:
1. Slug count > 3 → issues: ["Too many slugs — trim to max 3"]
2. content_type is "fomo" AND the last 3 published items for these tags are also "fomo" → issues: ["FOMO saturation — reframe as signal or find a different angle"]
3. content_small repeats the same angle already in tag_history → issues: ["Duplicate angle — reference prior coverage or reject"]
4. content_small starts with "A wallet" or "A tracked wallet" → issues: ["Lead variety needed — do not open with 'A wallet'"]

If verdict is "revise", provide revised_content_small. If verdict is "approve" or "reject", set revised_content_small to null.
Only return the JSON object — no other text.
```

**After graph completes**, caller reads final state and handles verdict:

- `approve` or max revisions hit → apply slug cap, insert `draft` to DB
- `reject` → skip insert, log `[publisher] Critic rejected narrative ${narrativeId}: ${issues.join(', ')}`

---

### 5. Slug cap enforcement (code-level, post-graph)

In `publisher.ts` after `publisherGraph.invoke()`, before DB insert:

```ts
const cappedActions = [
  ...finalState.draft.actions.filter(a => a.type === 'predict').slice(0, 3),
  ...finalState.draft.actions.filter(a => a.type === 'perps'),
]
insertPayload.actions = cappedActions
```

---

### 6. Influencer graph (`packages/brain/src/graphs/influencer-graph.ts`)

Simpler linear graph — no reflection loop needed.

```ts
import { Annotation, StateGraph, END, START } from '@langchain/langgraph'

const InfluencerState = Annotation.Root({
  narrative:  Annotation<PublishedNarrative>,
  draft_text: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
})

async function generateNode(state: typeof InfluencerState.State) {
  const output = await runInfluencerLLM(state.narrative)
  const trimmed = output.draft_text.slice(0, 280)
  return { draft_text: trimmed }
}

async function saveNode(state: typeof InfluencerState.State) {
  await supabase.from('x_posts').insert({
    narrative_id: state.narrative.id,
    draft_text:   state.draft_text!,
    status:       'draft',
  })
  console.log(`[influencer] Draft created for narrative ${state.narrative.id}`)
  return {}
}

export const influencerGraph = new StateGraph(InfluencerState)
  .addNode('generate', generateNode)
  .addNode('save',     saveNode)
  .addEdge(START,      'generate')
  .addEdge('generate', 'save')
  .addEdge('save',      END)
  .compile()
```

**Influencer system prompt (exact text):**

```text
You are a sharp financial intelligence writer for X (Twitter). Write a single post draft for the narrative provided.

Rules:
- Maximum 280 characters (enforced in code — do not worry about counting)
- No hashtags
- No emojis unless content_type is "fomo" or "sports" tag present (max 1)
- Lead with the insight, not the source ("$120K across UCL knockout markets" not "We tracked a whale...")
- End with soft CTA if space allows: "Full context in the feed."
- content_type "fomo" → punchy, specific numbers, urgency
- content_type "signal" → trend framing ("Smart money has been...")
- content_type "news" → factual hook, then market reaction

Return JSON: { "draft_text": string, "reasoning": string }
```

---

### 7. Influencer runner (`packages/brain/src/influencer.ts`)

```ts
async function runInfluencer(): Promise<void> {
  const { data: narratives } = await supabase
    .from('published_narratives')
    .select('id, content_small, content_full, tags, content_type, actions')
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
    .not('id', 'in', `(select narrative_id from x_posts)`)

  if (!narratives?.length) {
    console.log('[influencer] No new narratives to process')
    return
  }

  for (const narrative of narratives) {
    await influencerGraph.invoke({ narrative })
  }
}
```

---

### 8. Runner script and PM2

`packages/brain/src/run-influencer.ts` — same pattern as `run-analyst.ts` and `run-publisher.ts`. Runs once and exits.

Add to `ecosystem.config.cjs`:

```js
{
  name: 'myboon-influencer',
  script: './packages/brain/src/run-influencer.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx/esm',
  cron_restart: '0 */2 * * *',
  autorestart: false,
  watch: false,
  env: { NODE_ENV: 'production' }
}
```

Add to `packages/brain/package.json` scripts:

```json
"influencer:start": "tsx src/run-influencer.ts"
```

## Acceptance Criteria

- [ ] `@langchain/langgraph` installed in `packages/brain`
- [ ] `packages/brain/src/graphs/publisher-graph.ts` exports `publisherGraph`
- [ ] `packages/brain/src/graphs/influencer-graph.ts` exports `influencerGraph`
- [ ] `content_type` column exists on `published_narratives` with CHECK constraint
- [ ] Every new published narrative has `content_type` set to `fomo`, `signal`, or `news` — not the default
- [ ] No published narrative has more than 3 `predict` actions (verify: `select id, jsonb_array_length(actions) from published_narratives order by created_at desc limit 20`)
- [ ] Publisher logs show graph traversal: `[publisher] Critic verdict: revise` or `approve` or `reject` per narrative
- [ ] When critic returns `revise`, publisher re-runs and graph loops back — visible in logs as two `[publisher] Tool call:` sequences for the same narrative
- [ ] `get_tag_history` tool returns `content_type` in results
- [ ] Running publisher on a batch of 10 UCL narratives produces no more than 2 cards with `content_small` starting with "A wallet"
- [ ] `x_posts` table exists in Supabase
- [ ] `pnpm --filter @myboon/brain influencer:start` runs without error
- [ ] After a publisher run produces new narratives, influencer creates one draft per narrative in `x_posts`
- [ ] No draft in `x_posts` exceeds 280 characters
- [ ] Narratives that already have an `x_posts` entry are not processed again (idempotent)
- [ ] PM2 process `myboon-influencer` starts cleanly via `pm2 start ecosystem.config.cjs`
