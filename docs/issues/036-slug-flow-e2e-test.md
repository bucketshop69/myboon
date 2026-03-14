# #036 — Slug Flow End-to-End Test

## Purpose

Before shipping any of #031–#035, verify that slugs are flowing correctly at every stage of the pipeline on the VPS. Run these queries manually on the VPS against live Supabase. If any check fails, stop and fix it before proceeding.

This is not a unit test file. These are manual DB + API checks to run in order.

---

## Stage 1 — Signals have slugs

Query the last 20 signals of each type and check slug coverage.

```sql
-- WHALE_BET slug coverage
SELECT
  id,
  topic,
  metadata->>'slug' AS slug,
  metadata->>'marketId' AS market_id,
  created_at
FROM signals
WHERE type = 'WHALE_BET'
ORDER BY created_at DESC
LIMIT 20;
```

**Pass:** Every row has a non-null, non-empty `slug`.
**Fail:** Any row has `slug = null` or `slug = 'will-joe-biden-get-coronavirus...'` (wrong Biden slug).

```sql
-- ODDS_SHIFT slug coverage
SELECT
  id,
  topic,
  metadata->>'slug' AS slug,
  metadata->>'marketId' AS market_id,
  created_at
FROM signals
WHERE type = 'ODDS_SHIFT'
ORDER BY created_at DESC
LIMIT 20;
```

**Pass:** Every row has a non-null slug.

```sql
-- How many signals have null slug (should be 0 after #031)
SELECT type, COUNT(*) AS total, COUNT(metadata->>'slug') AS with_slug
FROM signals
WHERE created_at > NOW() - INTERVAL '24h'
GROUP BY type;
```

**Pass:** `with_slug = total` for WHALE_BET and ODDS_SHIFT.

---

## Stage 2 — Polymarket tracked has the markets those slugs reference

For any slug found in Stage 1, verify it exists in `polymarket_tracked`:

```sql
-- Pick a slug from Stage 1 and check it
SELECT slug, title, yes_price, updated_at
FROM polymarket_tracked
WHERE slug = '<paste-slug-from-stage-1>';
```

**Pass:** Row exists, `updated_at` is recent (within last 2h from discovery run).
**Fail:** Row missing — means the slug came from Gamma API fallback only. Market is not tracked for price streaming.

---

## Stage 3 — Narratives have slugs populated

```sql
-- Check narratives produced in last 24h
SELECT
  id,
  title,
  slugs,
  score,
  status,
  created_at
FROM narratives
WHERE created_at > NOW() - INTERVAL '24h'
ORDER BY created_at DESC
LIMIT 10;
```

**Pass:** `slugs` array is non-empty on at least half the narratives. `score >= 7` on all (filter is active).
**Fail:** All `slugs = '{}'` — means extractSlugs() is not finding `[slug: xxx]` patterns in key_signals. Check what the analyst is actually writing in key_signals.

```sql
-- Dig into key_signals for a narrative with empty slugs
SELECT id, title, key_signals, slugs
FROM narratives
WHERE slugs = '{}'
ORDER BY created_at DESC
LIMIT 3;
```

Look at `key_signals`. If the patterns exist but slugs are empty, the regex in `extractSlugs()` is broken.
If the patterns don't exist at all, the analyst system prompt needs to be updated to instruct it to write `[slug: xxx]` tags.

---

## Stage 4 — Published narratives have actions

```sql
-- Check published narratives produced in last 24h
SELECT
  id,
  content_small,
  actions,
  created_at
FROM published_narratives
WHERE created_at > NOW() - INTERVAL '24h'
ORDER BY created_at DESC
LIMIT 10;
```

**Pass:** `actions` array contains at least one `{ type: 'predict', slug: '...' }` entry per narrative where a slug was available.
**Fail:** `actions = '[]'` — check if `narrative.slugs` was empty at publisher time (Stage 3 issue) or if publisher is not building predict actions from slugs.

```sql
-- Count narratives with and without actions
SELECT
  CASE WHEN jsonb_array_length(actions) > 0 THEN 'has_actions' ELSE 'no_actions' END AS status,
  COUNT(*)
FROM published_narratives
WHERE created_at > NOW() - INTERVAL '24h'
GROUP BY 1;
```

**Pass:** `has_actions` count > `no_actions` count.

---

## Stage 5 — API returns actions

Hit the live API on VPS:

```bash
curl https://<your-api-domain>/narratives | jq '.[0:3] | .[] | { id, content_small, actions }'
```

**Pass:** Each item has `actions` array. At least one item has `actions[0].slug` matching a known Polymarket slug.
**Fail:** `actions` missing from response — check `GET /narratives` select fields in `packages/api/src/index.ts`.

---

## Checklist Before Proceeding to #031–#035

- [ ] Stage 1: All WHALE_BET and ODDS_SHIFT signals have non-null slugs
- [ ] Stage 2: Slugs found in signals exist in `polymarket_tracked`
- [ ] Stage 3: Narratives have `slugs[]` populated
- [ ] Stage 4: Published narratives have `actions[]` with predict entries
- [ ] Stage 5: API returns `actions` on feed items

If all five pass → the slug pipeline is working. Proceed with the improvements in #031–#035.
If any fail → fix that stage first before implementing new features on top of a broken foundation.
