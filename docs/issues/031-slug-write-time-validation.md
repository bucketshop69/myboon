# #031 — Slug Write-Time Validation + Fail Loud

## Problem

Signals are currently inserted with null or wrong slugs and the system discovers the problem downstream (2 days later, by reading raw DB values). Three silent failure modes were found:
- Supabase `.single()` returning wrong row when no match
- Gamma API response schema drift dropping the slug field
- Noise filter missing topic format variants

The fix we want: **if a signal cannot resolve its slug, it does not get inserted. Period.** No silent degradation.

## Goal

Every WHALE_BET and ODDS_SHIFT signal in the `signals` table has a valid, non-null `slug`. If resolution fails, the failure is loud (logged error, signal skipped with reason).

## Scope

- `packages/collectors/src/polymarket/user-tracker.ts`
- `packages/collectors/src/polymarket/stream.ts`
- `packages/collectors/src/polymarket/supabase.ts` (or shared signal insert util)

## Changes

### 1. `resolveMarket()` — strict mode

Current behaviour: returns `{ title: conditionId, slug: null }` on failure.

New behaviour:
- If `polymarket_tracked` has the market → return `{ title, slug }` (slug guaranteed non-null from this table)
- If not found → call Gamma API
- If Gamma returns a slug → return it
- If Gamma returns no slug → **log a warning and return null**
- Caller checks for null → **skips the signal insert entirely**, logs: `[user-tracker] Skipping WHALE_BET for ${conditionId} — slug unresolvable`

Never insert a signal with `slug: null` or `slug: undefined`.

### 2. Add `slug` as a top-level signal field

Currently slug is buried in `metadata`. Move it to the top level alongside `type`, `topic`, `weight`:

```ts
{
  source: 'POLYMARKET',
  type: 'WHALE_BET',
  topic,
  slug,          // top-level, NOT NULL
  weight,
  metadata: { ... }
}
```

Add `slug TEXT` column to the `signals` table if not present:
```sql
ALTER TABLE signals ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE INDEX IF NOT EXISTS idx_signals_slug ON signals(slug);
```

### 3. Validation util

Create `packages/collectors/src/polymarket/validate-signal.ts`:

```ts
export function validateSignal(signal: Signal): void {
  if (signal.type !== 'MARKET_DISCOVERED' && !signal.slug) {
    throw new Error(`Signal ${signal.type} for topic "${signal.topic}" has no slug — skipping`)
  }
}
```

Call this before every `supabase.from('signals').insert(signal)`.

### 4. Gamma API response — explicit field check

After `await res.json()`, validate the shape manually before using the fields. No new dependencies needed:

```ts
const markets = await res.json()
if (!Array.isArray(markets) || markets.length === 0) {
  return { title: conditionId, slug: null }
}
const m = markets[0]
const title: string = typeof m.question === 'string' ? m.question
  : typeof m.title === 'string' ? m.title
  : conditionId
const slug: string | null = typeof m.slug === 'string' ? m.slug : null
```

This replaces the current `GammaMarketLookup` interface cast which silently accepts missing fields.

## Acceptance Criteria

- [ ] No WHALE_BET or ODDS_SHIFT signal in `signals` table has `slug = null` after this change
- [ ] Unresolvable slugs are logged with `[collector] Skipping` prefix and skipped
- [ ] `slug` column exists on `signals` table and is populated by new inserts
- [ ] Verify via #036 slug flow checks on VPS
