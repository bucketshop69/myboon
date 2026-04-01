# Backlog #002 — Sports Broadcaster Phase 3: Post-Match Close-Out

## Context

Phase 3 is the third post in the sports broadcaster lifecycle (`kickoff + 6h` to `kickoff + 12h`).
Phase 1 (preview) and Phase 2 (live) are shipped in #050.

## What Phase 3 Does

Fires once per match after the live window closes. Closes the loop:
- Who did the market have right?
- What price did bettors get?
- Did the contrarian call pay off?

Example voice:
> "Man Utd won away at Bournemouth. They were 34% going in.
> The $18K that backed the away side at that price collected.
> The market was wrong. The bettors weren't."

## Trigger

`agent_type = 'sports_broadcaster_post_match'`, window: `kickoff + 6h → kickoff + 12h`

Already stubbed in `sports-broadcaster.ts` — `detectPhase()` returns `'post_match'` in this window
and `hasPostedPhase()` deduplicates via `slug` column.

## What's Missing

### 1. Result inference

Phase 3 needs to know who won. Two options:

**Option A — Polymarket resolution (preferred):**
After a match ends, the winning outcome market resolves to `outcomePrices[0] = "1"` (100%).
Query odds for all 3 outcome slugs — whichever is at 1.0 is the winner.

```ts
const winner = outcomes.find(o => o.live_odds === 1.0)
// winner.label = 'home' | 'away' | 'draw'
```

**Option B — Inference from near-1.0 odds:**
Markets sometimes settle at 0.98+ before official resolution. Use `>= 0.95` threshold
to infer winner earlier.

### 2. POST_MATCH writer prompt

The writer already has a POST_MATCH voice stub in `sports-broadcaster-graph.ts`.
Needs the result (`winner.label` mapped to team name from `entry.match`) injected
into `formatted_text` so the LLM knows who won.

Add to `formatMatchBlock()`:
```ts
if (phase === 'post_match' && winner) {
  lines.push(`\nResult: ${winnerName} won`)
}
```

### 3. Broadcaster hard-reject guard

Already in place: broadcaster rejects POST_MATCH posts where match hasn't reached
`kickoff + 6h`. No change needed.

## Acceptance Criteria

- [ ] Phase 3 fires once per match in `kickoff + 6h → kickoff + 12h` window
- [ ] Result correctly inferred from resolved Polymarket odds
- [ ] POST_MATCH post leads with result + what the market priced them at
- [ ] Dedup via `slug` + `agent_type = 'sports_broadcaster_post_match'`
- [ ] e2e test: inject fixture with kickoff = now - 8h, verify post_match post generated

## Dependencies

- #050 Phase 1 + Phase 2 shipped ✅
- Polymarket odds must be resolved (market at 1.0) — happens within ~2h of final whistle
- No new DB tables or migrations needed
