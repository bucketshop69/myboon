# #041 — X Content Agent (Influencer Brain)

## Problem

Published narratives sit in the DB and reach users only through the app Feed. There is no distribution channel. The X account is idle. The influencer brain (Layer 3 in the architecture) has never been implemented.

Without X posts, the app has no growth flywheel — no way to pull new users in from outside.

## Goal

1. Influencer brain reads published narratives and writes X post drafts
2. Drafts are saved to `x_posts` table with `status = 'draft'`
3. Human reviews and approves manually before any post goes live (no auto-posting in this phase)
4. Target: 5–10 post drafts per day, triggered after each publisher run

## Dependencies

- Blocked by: #037 (influencer should be aware of `content_type` to vary post style)

## Scope

- `packages/brain/src/influencer.ts` — new file, Layer 3 agent
- `packages/brain/src/run-influencer.ts` — runner script
- `packages/brain/package.json` — add `influencer:start` script
- `ecosystem.config.cjs` — add `myboon-influencer` process
- DB migration — `x_posts` table

## DB Migration

Run manually via Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS x_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  narrative_id    UUID REFERENCES published_narratives(id),
  draft_text      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted', 'rejected')),
  post_url        TEXT,                          -- filled after posting
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX x_posts_status_idx ON x_posts(status);
CREATE INDEX x_posts_narrative_id_idx ON x_posts(narrative_id);
```

## Changes

### 1. Influencer system prompt

The influencer reads a published narrative and writes an X post. Style rules:

- Max 280 characters (enforced in code after LLM output)
- No hashtags — they look spammy
- No emojis unless the narrative is sports/fomo (1 max)
- Lead with the insight, not the source ("$120K across UCL knockout markets" not "We tracked a whale...")
- End with a soft CTA if space allows: "Full context in the feed."
- `content_type = 'fomo'` → punchy, specific numbers, urgency
- `content_type = 'signal'` → trend framing, "Smart money has been..."
- `content_type = 'news'` → factual hook, market reaction

### 2. `influencer.ts` agent

```ts
interface InfluencerOutput {
  draft_text: string
  reasoning: string
}

async function runInfluencer(): Promise<void> {
  // 1. Fetch published narratives from last 4h that have no x_post yet
  const narratives = await fetchUnpostedNarratives()

  if (!narratives.length) {
    console.log('[influencer] No new narratives to process')
    return
  }

  for (const narrative of narratives) {
    const output = await generateDraft(narrative)
    if (!output) continue

    // Enforce 280 char limit hard
    const trimmed = output.draft_text.slice(0, 280)

    await supabase.from('x_posts').insert({
      narrative_id: narrative.id,
      draft_text: trimmed,
      status: 'draft',
    })

    console.log(`[influencer] Draft created for narrative ${narrative.id}`)
  }
}
```

`fetchUnpostedNarratives`: select from `published_narratives` where `created_at > now() - interval '4h'` and `id NOT IN (select narrative_id from x_posts)`. Returns `id`, `content_small`, `content_full`, `tags`, `content_type`, `actions`.

### 3. Runner script

`run-influencer.ts` — same pattern as `run-analyst.ts` and `run-publisher.ts`. Runs once and exits. PM2 schedules it.

### 4. PM2 config

Add to `ecosystem.config.cjs`:

```js
{
  name: 'myboon-influencer',
  script: './packages/brain/src/run-influencer.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx/esm',
  cron_restart: '0 */2 * * *',   // every 2h, offset from analyst/publisher
  autorestart: false,
  watch: false,
  env: { NODE_ENV: 'production' }
}
```

### 5. Brain package.json

```json
"influencer:start": "tsx src/run-influencer.ts"
```

## Acceptance Criteria

- [ ] `x_posts` table exists in Supabase
- [ ] `pnpm --filter @myboon/brain influencer:start` runs without error
- [ ] After a publisher run produces new narratives, influencer creates one draft per narrative
- [ ] No draft exceeds 280 characters
- [ ] Drafts with `status = 'draft'` are queryable via Supabase dashboard for manual review
- [ ] PM2 process `myboon-influencer` starts and runs on schedule
- [ ] Narratives that already have an x_post are not processed again (idempotent)
