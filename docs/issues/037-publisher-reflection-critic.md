# #037 — Publisher Reflection / Critic Agent

## Problem

The publisher writes `content_small`, `content_full`, and picks slugs in a single LLM pass with no self-review. The result:

- Every card has the same emotional register ("hey look at this whale bet") — no variation in tone or framing
- Slug count is not enforced — narratives can emit 5+ slugs when the UI only renders 3
- Content doesn't reference the story arc — a new Iran narrative reads as standalone even if it's the 4th update in 18 days

## Goal

1. Add a critic pass after the publisher's first draft — the critic reviews tone, slug count, and story arc before the narrative is inserted to DB
2. Enforce max 3 slugs in publisher output (critic rejects or trims if exceeded)
3. Critic has awareness of `content_type` (`fomo | signal | news`) and flags if all recent output is the same type

## Dependencies

- Blocks: #039 (feed content types depend on `content_type` field added here)
- Related: #034 (topic cap — publisher already checks tag saturation before LLM runs)

## Scope

- `packages/brain/src/publisher.ts` — add critic loop after first LLM pass
- `packages/brain/src/publisher-tools/supabase.tools.ts` — `get_tag_history` tool (new)
- `packages/brain/src/types.ts` — add `content_type` to `PublishedOutput`

## Changes

### 1. Add `content_type` to PublishedOutput

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
  content_type: ContentType   // NEW
}
```

Publisher system prompt must instruct the LLM to classify its own output:
- `fomo` — lead is a specific whale bet or unusual position ("Wallet X placed $50K on...")
- `signal` — lead is a pattern or trend across multiple actors ("Smart money has been consistently buying NO on...")
- `news` — lead is a real-world event with market context ("After Sporting CP's comeback win, odds shifted...")

### 2. Add `get_tag_history` tool

New tool in `supabase.tools.ts` that returns the last N published narratives matching any of the given tags:

```ts
{
  name: 'get_tag_history',
  description: 'Fetch recent published narratives for a topic tag. Use before writing to understand the story arc and avoid repeating angles already covered.',
  input_schema: {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string' }, description: 'Topic tags to search (e.g. ["iran", "geopolitics"])' },
      limit: { type: 'number', description: 'Max results to return (default 5, max 10)' }
    },
    required: ['tags']
  }
}
```

Returns from `published_narratives`: `id`, `content_small`, `tags`, `content_type`, `created_at`. Ordered by `created_at DESC`. Limit capped at 10.

The publisher should call this tool before writing when it identifies a topic tag from the narrative's signals. Instructs the LLM: "Use this to understand what angle has already been covered. Do not repeat the same framing. If this is the 4th UCL card today, find a fresh angle or recommend rejection."

### 3. Critic pass after first draft

After the publisher LLM produces its first `PublishedOutput`, run a second lightweight LLM call (critic) with:

**Critic system prompt:**
```
You are a feed quality critic. Review the publisher's draft and return a JSON object:
{
  "verdict": "approve" | "revise" | "reject",
  "issues": string[],        // list of problems found (empty if approved)
  "revised_content_small": string | null  // rewrite if verdict=revise, else null
}

Check for:
1. Slug count > 3 → issues: ["Too many slugs — trim to max 3, keep the most relevant"]
2. content_type = fomo AND last 3 published items for these tags are also fomo → issues: ["FOMO saturation — reframe as signal or find a different angle"]
3. content_small repeats an angle already in tag_history → issues: ["Duplicate angle — reference prior coverage instead"]
4. content_small starts with "A wallet" or "A tracked wallet" more than 50% of recent cards do → issues: ["Lead variety needed — don't open with wallet again"]
```

**Critic input:** first draft `PublishedOutput` + `tag_history` results (already fetched by publisher tool call).

**On verdict:**
- `approve` → insert as normal
- `revise` → use `revised_content_small`, trim slugs to first 3, insert
- `reject` → skip insert, log `[publisher] Critic rejected narrative ${narrativeId}: ${issues.join(', ')}`

### 4. Slug cap enforcement (code-level, not just prompt)

After critic pass, before insert, hard-enforce in code:

```ts
const cappedActions = output.actions
  .filter(a => a.type === 'predict')
  .slice(0, 3)
  .concat(output.actions.filter(a => a.type === 'perps'))

insertPayload.actions = cappedActions
```

### 5. DB migration

Add `content_type` column to `published_narratives`:

```sql
ALTER TABLE published_narratives
ADD COLUMN content_type TEXT NOT NULL DEFAULT 'fomo'
CHECK (content_type IN ('fomo', 'signal', 'news'));
```

Run manually via Supabase SQL editor.

## Acceptance Criteria

- [ ] `content_type` column exists on `published_narratives`
- [ ] Every new published narrative has `content_type` set (not default)
- [ ] No published narrative has more than 3 `predict` actions
- [ ] Critic rejects or revises are logged at `[publisher]` level
- [ ] `get_tag_history` tool is callable from publisher and returns correct results
- [ ] Running publisher on a batch of 10 UCL narratives does not produce 8 cards with identical "A wallet placed..." leads
