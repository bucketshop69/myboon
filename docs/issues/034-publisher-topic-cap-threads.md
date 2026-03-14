# #034 — Publisher Topic Cap + Thread Linking

## Problem

The publisher currently has no memory of what it published today. It can publish 12 cards about Iran in one day because it only deduplicates by checking if the exact same `content_small` was published recently. Each new angle on the same story creates a new standalone card.

This produces a feed that looks repetitive and low-quality. A user opening the app sees the same topic dominating the entire screen.

## Goal

1. **Topic cap** — max 7 cards per topic tag per day. Publisher checks before inserting. (Prediction markets move fast — 7 allows genuine story updates without flooding.)
2. **Thread linking** — if a card about the same market was published today, the new card links to the same thread instead of being standalone.
3. **`thread_id` and `tags` columns** on `published_narratives` to support both — run migrations manually via SQL editor.

## Scope

- `packages/brain/src/publisher.ts`
- `packages/brain/src/publisher-tools/supabase.tools.ts`
- `packages/api/src/index.ts` — expose `thread_id` and `tags` in `GET /narratives`

## Changes

### 1. Tags in PublishedOutput

LLM is asked to produce `tags: string[]` alongside `content_small`, `content_full`, etc. Tags are short topic labels: `['BTC', 'crypto']`, `['Iran', 'geopolitics']`, `['Trump', 'US-politics']`.

Update publisher system prompt to require tags. Update `PublishedOutput` interface:

```ts
interface PublishedOutput {
  content_small: string
  content_full: string
  reasoning: string
  tags: string[]
  actions: NarrativeAction[]
}
```

### 2. Topic cap check (code, before LLM runs)

Before running the LLM for a narrative, check if publishing is blocked:

```ts
async function isTopicCapped(tags: string[]): Promise<boolean> {
  // Count published cards in last 24h that share any tag
  const { count } = await supabase
    .from('published_narratives')
    .select('id', { count: 'exact', head: true })
    .overlaps('tags', tags)
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())

  return (count ?? 0) >= 3
}
```

If capped → skip narrative entirely, log `[publisher] Topic capped for tags [${tags.join(', ')}] — skipping`.

Note: tags are not available before the LLM runs. Use the narrative's `key_signals` or analyst-provided tags (if analyst adds tags in #033). Alternatively, run a cheap topic classifier pass before the full publisher LLM call.

Simple approach for now: the analyst already writes `topic` and `category` on the narrative. Use those as the cap key. Full tag support can be added when analyst emits tags.

### 3. Thread linking (code, after LLM runs)

After LLM produces output, before inserting:

```ts
async function findExistingThread(slugs: string[]): Promise<string | null> {
  if (!slugs.length) return null

  // Look for a published card in last 24h that shares any of these market slugs
  const { data } = await supabase
    .from('published_narratives')
    .select('id, thread_id, actions')
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())
    .limit(20)

  for (const row of data ?? []) {
    const rowSlugs = (row.actions ?? [])
      .filter((a: any) => a.type === 'predict')
      .map((a: any) => a.slug)

    const overlap = slugs.some((s) => rowSlugs.includes(s))
    if (overlap) {
      // Return the existing thread_id, or create one from the first match
      return row.thread_id ?? row.id
    }
  }

  return null
}
```

On insert:

- If `thread_id` found → use it (this card is an update to an existing thread)
- If no `thread_id` → this is a new standalone card (thread_id = null)

### 4. API update

`GET /narratives` select includes `thread_id` and `tags`.

## Acceptance Criteria

- [ ] `thread_id` and `tags` columns exist on `published_narratives` (run migration manually)
- [ ] Publisher never publishes more than 7 cards per topic per day
- [ ] Cards about the same market on the same day share a `thread_id`
- [ ] `GET /narratives` response includes `thread_id` and `tags`
