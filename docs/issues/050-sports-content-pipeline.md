# #050 — Sports Content Pipeline: Three-Phase Sports Broadcaster

## Problem

Sports prediction markets (UCL, EPL) generate signals that are being swallowed by
fomo_master — which writes wallet-tracking posts about them. That's the wrong framing.
"Wallet 0x123 bet $8K on Man Utd" is noise. The story is the market odds.

Sports also has a known schedule. fomo_master is purely reactive (processes whatever
came in the last 4h). Sports content can be proactive: we know Arsenal vs Leverkusen
kicks off at 8pm, so we can post a preview at T-6h, monitor smart money live, and
close the loop after the final whistle.

**Three problems to fix:**

1. fomo_master is eating sports WHALE_BETs and writing them as whale alerts
2. No pre-match context posts exist — we know the schedule, we're just not using it
3. No post-match close-out — who did the market call right?

## Signal Reality (from actual DB)

Sports signals are **exclusively WHALE_BET** type. No ODDS_SHIFT signals exist for
sports slugs — the WebSocket stream doesn't track sports markets. This means:

- Sports broadcaster reads `WHALE_BET` signals on calendar slugs for enrichment
- Odds story comes from live Polymarket API call at runtime
- fomo_master must be updated to skip sports slugs (currently overlapping)

## Goal

1. **fomo_master filter**: exclude sports slugs from fomo_master processing
2. **Match-aware collector**: subscribe to calendar slugs from T-24h, write trades as signals
3. **Sports broadcaster** (`sports_broadcaster`): calendar-driven, three-phase X agent
4. **Narrative analyst**: suppress `content_type='sports'` before influencer — sports broadcaster is the only posting path for sports content

## Dependencies

- Builds on: #049 (`content_type='sports'` enum — already shipped)
- Parallel to: #048 (fomo_master voice — independent files)
- Related: #047 (fomo_master pattern — sports_broadcaster follows same LangGraph shape)
- Scope: EPL and UCL only. NBA has different slug structure — future issue.

---

## Sports Calendar

The sports_broadcaster is calendar-driven. The calendar is the control mechanism —
it decides what matches to cover and when. The collector is completely separate.

### `packages/brain/src/sports-calendar.json`

```json
[
  {
    "match": "Bournemouth vs Manchester United",
    "sport": "epl",
    "kickoff": "2026-04-05T14:00:00Z",
    "slugs": {
      "home": "epl-bou-mun-2026-04-05-bou",
      "away": "epl-bou-mun-2026-04-05-mun",
      "draw": "epl-bou-mun-2026-04-05-draw"
    }
  },
  {
    "match": "Arsenal vs Real Madrid",
    "sport": "ucl",
    "kickoff": "2026-04-08T19:00:00Z",
    "slugs": {
      "home": "ucl-ars-rma-2026-04-08-ars",
      "away": "ucl-ars-rma-2026-04-08-rma",
      "draw": "ucl-ars-rma-2026-04-08-draw"
    }
  }
]
```

**You maintain this file.** Add upcoming fixtures manually before each gameweek.
No auto-discovery, no dependency on the collector or `polymarket_tracked`.

The runner reads this file at startup. If a match isn't in the calendar, it won't
be covered. That's intentional — controlled coverage over reactive noise.

### Why not `polymarket_tracked`?

- `polymarket_tracked` is what the collector happened to discover. That's a different
  concern — feeding signals, not scheduling coverage.
- `end_date` in Polymarket is the resolution deadline, not kickoff time. Unreliable
  for phase detection.
- The calendar gives you exact kickoff times and explicit outcome slug mapping.
- Clean separation: collector owns signals, calendar owns schedule.

---

## Three-Phase Match Lifecycle

```
Phase 1 — Preview (kickoff - 26h to kickoff - 2h)
  Trigger: calendar entry enters preview window AND no preview post exists for this match
  Source: calendar kickoff time + live Polymarket odds (API call)
  Content: where does the money sit going into this match?
  Voice: analytical setup — odds level, which way volume is moving, what it implies
  Frequency: 1 post per match

Phase 2 — Live (kickoff to kickoff + 6h)
  Trigger: calendar entry is in live window AND WHALE_BET signals exist for calendar slugs
  Source: WHALE_BET signals written by match-aware collector + live odds
  Content: smart money moving during the match
  Voice: "18K went on Man Utd at 34% with 30 min left. Either conviction or desperation."
  Frequency: 1 post per match during live window
  Note: 6h window covers 90min EPL + 120min UCL extra time + penalties with buffer

Phase 3 — Post-match (kickoff + 6h to kickoff + 12h)
  Trigger: calendar entry has passed live window AND no post_match post exists
  Source: any WHALE_BET signals from the match window + live (final) odds
  Content: who did the market have right? close the loop.
  Voice: "United won. The market had them at 34%. The contrarian call paid off."
  Frequency: 1 post per match, once
```

The runner checks all three phases on every hourly run. A single match will produce
at most 3 posts across its lifecycle.

---

## Architecture

### Files

**New:**
- `packages/brain/src/sports-calendar.json` — curated match list (you maintain)
- `packages/brain/src/graphs/sports-broadcaster-graph.ts` — LangGraph
- `packages/brain/src/sports-broadcaster.ts` — runner
- `packages/brain/src/run-sports-broadcaster.ts` — PM2 entry

**Changed:**
- `packages/brain/src/fomo-master.ts` — add sports slug exclusion filter
- `packages/brain/src/narrative-analyst.ts` — suppress `content_type='sports'` before influencer routing
- `packages/collectors/src/index.ts` — extend Polymarket collector to subscribe to calendar slugs from T-24h
- `ecosystem.config.cjs` — add `myboon-sports-broadcaster` process

### DB migration

One new column on `x_posts`:

```sql
ALTER TABLE x_posts ADD COLUMN slug text;
```

- `slug` is nullable — existing fomo_master rows stay valid
- Sports broadcaster writes the calendar key (e.g. `"epl-bou-mun-2026-04-05"`) on every save
- Dedup query: `agent_type = 'sports_broadcaster_preview' AND slug = '...'`
- Phase encoded in `agent_type`: `sports_broadcaster_preview`, `sports_broadcaster_live`, `sports_broadcaster_post_match`
- Uses existing `signals` table (WHALE_BET on calendar slugs, populated by match-aware collector from T-24h)

---

## Runner Logic

```
sports-broadcaster.ts (runs hourly via PM2 cron):

const calendar = loadCalendar()  // sports-calendar.json
const now = new Date()

// Step 1: match-aware collection
// For every match with kickoff within the next 24h, ensure the Polymarket
// collector is subscribing to those slugs and writing trades as WHALE_BET /
// ODDS_SHIFT signals into the signals table. This seeds Phase 2 data.
for each entry in calendar where kickoff - now <= 24h:
  ensureCollectorWatching(entry.slugs)  // idempotent — noop if already subscribed

// Step 2: phase detection + posting
for each entry in calendar:
  compute phase based on kickoff time vs now
  derive slug key from entry (e.g. "epl-bou-mun-2026-04-05")
  check x_posts: WHERE agent_type = 'sports_broadcaster_{phase}' AND slug = key
  if not posted:
    enrich: live odds for all outcome slugs (Gamma API)
    if phase === 'live' or 'post_match':
      fetch WHALE_BET signals for these slugs from signals table
    format match block
    queue for graph

invoke graph once with all queued matches (ranked → written → broadcast → saved)
```

No `polymarket_tracked` query. No dependency on collector schedule.

---

## Formatted Match Block (input to LLM)

```
PHASE: PREVIEW | LIVE | POST_MATCH
MATCH: Bournemouth vs Manchester United (EPL)
Kickoff: 2026-04-05 14:00 UTC (~18h away)

Outcomes (live odds):
  Bournemouth win:    40%
  Draw:               26%
  Manchester United:  34%

Volume (7d): 18 bets, 12 wallets, $62K total

Whale activity (last 4h):
  $18K on Man Utd (away win) — 2 wallets
  $4K on Draw — 1 wallet
```

Match title comes directly from `calendar.match`. No slug decoding needed.
Outcome labels are defined in the calendar `slugs` object keys (`home`, `away`, `draw`).

---

## Writer Node — Phase-Aware Voice

```
PREVIEW:
  "Bournemouth hosting Man Utd on Saturday. United priced at 34% away —
   the market has them as underdogs on the road. $22K moved on this
   fixture in the last 48h, weighted toward the home side.
   The smart money isn't backing the name here."

LIVE:
  "$18K went on Man Utd at 34% with kickoff 90 min away.
   Two wallets, coordinated timing. Either late conviction
   or someone knows something about the team news."

POST_MATCH:
  "Man Utd won away at Bournemouth. They were 34% going in.
   The $18K that backed the away side at that price collected.
   The market was wrong. The bettors weren't."
```

**Rules:**

- No wallet addresses in any phase
- Lead with odds % and match context
- No hashtags, max 1 emoji (⚽ 🏀)
- Sports posts stand alone — no "Full context in the feed." CTA
- Return JSON: `{ "drafts": [{ "match": "...", "phase": "...", "archetype": "MOMENTUM|CONTRARIAN|VOLUME_SURGE|RESULT", "draft_text": "...", "reasoning": "..." }] }`

---

## Broadcaster Node

Same `chief_broadcaster` pattern as fomo_master. Key rules:

- Hard reject: same match + same phase already posted (`agent_type` + `slug` check)
- Hard reject: POST_MATCH for a match that hasn't reached kickoff + 6h yet
- Frequency: max 3 posts per match total (1 per phase)
- Timeline: filtered to `sports_broadcaster_*` agent_types only

---

## fomo_master Filter

One change in `packages/brain/src/fomo-master.ts` — after fetching WHALE_BET signals,
filter out sports slugs:

```ts
const SPORTS_SLUG = /^(ucl|epl|nba|nfl|la-liga)-/
const signals = rawSignals.filter(s => !SPORTS_SLUG.test(s.metadata?.slug ?? ''))
```

Sports WHALE_BETs go to sports_broadcaster. Everything else stays in fomo_master.

---

## Narrative Analyst — Sports Suppression

Sports content must NOT flow through the influencer path. The sports broadcaster is
the only posting path for EPL/UCL content.

Change in `narrative-analyst.ts`: after clustering, before saving narratives, filter
out any cluster with `content_type === 'sports'`:

```ts
const filtered = clusters.filter(c => c.content_type !== 'sports')
// only filtered clusters proceed to narratives table insert
```

This prevents duplicate posts where both the influencer and the sports broadcaster
write about the same match.

---

## PM2 Config

```js
{
  name: 'myboon-sports-broadcaster',
  script: './packages/brain/src/run-sports-broadcaster.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx/esm',
  cron_restart: '0 * * * *',
  autorestart: false,
  watch: false,
  env: { NODE_ENV: 'production' }
}
```

---

## Interface: CalendarEntry + FormattedMatchSignal

```ts
export interface CalendarEntry {
  match: string                        // "Bournemouth vs Manchester United"
  sport: 'epl' | 'ucl'
  kickoff: string                      // ISO timestamp
  slugs: {
    home: string
    away: string
    draw?: string                      // not all sports have draws
  }
}

export interface FormattedMatchSignal {
  entry: CalendarEntry
  phase: 'preview' | 'live' | 'post_match'
  outcomes: Array<{
    label: string                      // "home" | "away" | "draw"
    slug: string
    live_odds: number | null
  }>
  market_history: {
    bet_count: number
    distinct_wallets: number
    total_volume: number
  }
  recent_whale_activity: Array<{
    slug: string
    amount: number
    side: string
  }>
  kickoff_hint: string                 // "~18h away" | "Live now" | "Ended 2h ago"
  formatted_text: string
}
```

---

## Acceptance Criteria

### Calendar

- [ ] `sports-calendar.json` exists with at least one upcoming EPL/UCL fixture
- [ ] Runner loads and parses calendar correctly
- [ ] Runner computes correct phase based on `kickoff` field

### fomo_master filter

- [ ] Sports slugs are excluded from fomo_master WHALE_BET processing
- [ ] Non-sports signals unaffected

### DB migration

- [ ] `x_posts` has `slug text` nullable column
- [ ] Sports broadcaster writes `slug` on every save

### Match-aware collector

- [ ] Polymarket collector subscribes to calendar slugs when kickoff <= 24h away
- [ ] Trades from those slugs written as WHALE_BET / ODDS_SHIFT signals to `signals` table
- [ ] `ensureCollectorWatching()` is idempotent (no duplicate subscriptions)

### Sports broadcaster

- [ ] Phase 1 posts when kickoff is 2–26h away and no preview exists for that `slug`
- [ ] Phase 2 posts when in live window (kickoff to kickoff+6h) and WHALE_BET signals exist
- [ ] Phase 3 posts after kickoff+6h and no post_match post exists for that `slug`
- [ ] Writer uses correct phase voice (PREVIEW / LIVE / POST_MATCH)
- [ ] Writer never uses wallet addresses
- [ ] Broadcaster enforces 1 post per phase per match (dedup via `agent_type` + `slug`)
- [ ] Posts saved with `agent_type='sports_broadcaster_preview|live|post_match'`
- [ ] PM2 process starts cleanly

### Narrative analyst suppression

- [ ] `content_type: 'sports'` clusters filtered out before narratives table insert
- [ ] No sports content reaches influencer path

### Integration

- [ ] Sports WHALE_BET not processed by fomo_master
- [ ] fomo_master and sports_broadcaster x_posts timelines stay separate
- [ ] No duplicate posts for same match from both broadcaster and influencer

---

## Future

- NBA support — different slug structure, different outcome model (no draw)
- Auto-suggest calendar entries from Polymarket discovery (semi-automated, human approves)
- Macro broadcaster (#051) — same three-phase concept adapted for geopolitics events
