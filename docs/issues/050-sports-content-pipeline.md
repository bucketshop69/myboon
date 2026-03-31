# #050 — Sports Content Pipeline: Analyst Tuning + Sports Broadcaster

## Problem

Sports prediction markets (UCL, EPL) generate signals but the content they produce
is indistinguishable from geopolitics content. The analyst treats an EPL match the same
as an Iran regime collapse market: both get wallet-tracking framing, both miss the
story that makes sports content valuable.

Sports content has a different job:
- **Not**: "Wallet 0x123 bet $8K on Man Utd vs Nottingham"
- **Yes**: "Man Utd at 34% for this fixture. They've lost 4 straight. The market isn't
   buying the manager's confidence."

The odds ARE the story. The wallet is noise. This is the opposite of fomo_master.

Additionally, the sports broadcaster for X doesn't exist. Sports X posts currently go
through the generic influencer (if a sports narrative is published), which produces
bland content because it's designed for wallet intelligence, not match storylines.

## Goal

1. **Sports analyst tuning**: add a sports prompt path in `narrative-analyst.ts` so sports
   signal clusters produce narratives with match context, team form, and market momentum
   framing instead of wallet-tracking framing.

2. **Sports broadcaster** (`sports_broadcaster`): new X agent that reads sports signals
   directly (ODDS_SHIFT + MARKET_DISCOVERED for sports slugs), enriches with live
   Polymarket odds, and writes punchy match preview / momentum posts.

3. **Sports influencer prompt path**: update influencer system prompt to handle
   `content_type='sports'` with match preview voice instead of wallet alert voice.

## Dependencies

- Builds on: #049 (content architecture — `content_type='sports'` enum + routing)
- Parallel to: #048 (fomo_master persuasion layer — independent, different files)
- Related: #047 (fomo_master architecture — sports_broadcaster follows same LangGraph pattern)
- No new data sources required — Polymarket CLOB/Gamma API already provides odds + volume

## Sports Content Model

### What makes a good sports feed card

The feed card (from `published_narratives`) should tell:
1. **The match** — who's playing, when (from market title)
2. **The odds story** — where is the market right now (YES/NO/draw prices)
3. **The form hook** — what context makes these odds interesting (losing streak, injury news IF detectable from market titles, volume surge)
4. **The market intelligence angle** — where is the smart money going (which outcome is seeing volume)

Example `content_small`:
> "Man United at 34% to win vs Nottingham. Market odds have dropped 12 points in 48h —
> volume is building on the draw and away side despite United being at home."

Example `content_full`:
> "Manchester United's current odds tell a story the BBC won't. At 34% YES for a home
> win, United are priced as significant underdogs at Old Trafford — unusual for a home
> fixture. The 12-point drop in YES price over the past 48 hours shows sustained market
> pressure, not a single whale bet. Across 4 wallets and $22K in volume this week, the
> pattern is consistent: smart money is fading United at home.
> 
> The market is pricing in something beyond recent form. The last 4 fixtures went:
> [market signals don't give us this — the odds movement is the data]. At 34%,
> the implied probability is roughly 1-in-3. If you think United wins, the market
> disagrees with you."

Note: sports content does NOT require external historical data in this phase. The
market title, current odds, volume, and odds movement (from ODDS_SHIFT signals) tell
the story. No web search tool required for the analyst.

### What makes a good sports X post

Sports X posts have different mechanics than fomo_master:
- fomo_master leads with the wallet (who bet what)
- sports_broadcaster leads with the market story (odds + context)

| fomo_master (whale) | sports_broadcaster (market) |
|--------------------|-----------------------------|
| "A wallet with 71% win rate just bet..." | "Manchester United at 34%. The market is fading them at home." |
| Authority/Curiosity Gap frame | Narrative/Momentum frame |
| Single bet is the news | Odds movement is the news |

---

## Scope

### New files
- `packages/brain/src/graphs/sports-broadcaster-graph.ts` — LangGraph for sports broadcaster
- `packages/brain/src/sports-broadcaster.ts` — runner
- `packages/brain/src/run-sports-broadcaster.ts` — PM2 entry

### Changed files
- `packages/brain/src/narrative-analyst.ts` — sports prompt path in analyst system prompt
- `packages/brain/src/graphs/influencer-graph.ts` — sports prompt path in influencer
- `packages/brain/src/publisher-types.ts` — content_type expanded (per #049)
- `ecosystem.config.cjs` — add `myboon-sports-broadcaster` process

### No new DB tables
- Uses existing `x_posts` with `agent_type='sports_broadcaster'`
- Uses existing `signals` table (ODDS_SHIFT + MARKET_DISCOVERED with sports slugs)
- Uses existing `published_narratives` with `content_type='sports'`

---

## Sports Signal Detection

Sports signals are identified by slug pattern. Detection rules (in priority order):

```
ucl-*       → UCL (UEFA Champions League)
epl-*       → EPL (English Premier League)
nba-*       → NBA (add to pinned.json when ready)
nfl-*       → NFL
la-liga-*   → La Liga
série-a-*   → Serie A
```

In `narrative-analyst.ts`: when building market context, check
`signal.slug?.match(/^(ucl|epl|nba|nfl|la-liga)-/)` OR
`signal.topic` contains team names (derived from market title). Tag the cluster as
`content_type: 'sports'` in analyst output.

In `sports-broadcaster.ts` runner: filter signals where
`signal.metadata?.slug?.match(/^(ucl|epl|nba|nfl|la-liga)-./)` OR
`signal.type === 'MARKET_DISCOVERED'` and slug matches sports patterns.

---

## Sports Analyst Prompt Path

Add sports detection to the analyst system prompt. When the analyst identifies a cluster
as sports-related (slug pattern + topic), it should:

1. Set `content_type: 'sports'` (new field in analyst output)
2. Lead `observation` with: odds level + which direction volume is moving
3. NOT lead with wallet addresses or bet amounts as primary hook
4. Include: which team/market is being bet, current odds from live tool call
5. Score: sports clusters scoring >= 7 should focus on market momentum, not unusual positions

**Prompt addition for analyst system prompt** (add after existing classification rules):

```
Sports content detection:
If a cluster's signals belong to sports prediction markets (slugs matching ucl-*, epl-*,
nba-*, nfl-* or topics containing team names), set content_type: "sports".

For sports clusters:
- Lead observation with the odds story: "The market prices [team] at X% for this fixture.
  [Volume direction] since [timeframe]."
- Do NOT lead with wallet addresses. Wallet data is supporting context, not the hook.
- The match or tournament context IS the narrative. Odds movement tells the story.
- Use live market tool to get current odds before writing observation.
- Score sports narratives on: odds movement size (big shift > small shift), volume
  concentration (few wallets = fomo, many = signal), match timing (imminent > distant).
```

---

## Sports Broadcaster Architecture

### System Flow

```
Runner (deterministic, no LLM):
  1. Detect sports signals: ODDS_SHIFT + MARKET_DISCOVERED (last 4h) with sports slugs
  2. Dedup: filter signal_ids already consumed in recent sports_broadcaster x_posts
  3. Cluster by market slug (same slug = same match — pick representative)
  4. Enrich each representative:
     - Live Polymarket odds (Gamma API — same as fomo_master)
     - 7d market history for this slug (volume, bet count, distinct wallets)
     - Odds movement: compute shift from signals (shift_from → shift_to)
  5. Format into plaintext match block
  6. Fetch posted_timeline (sports_broadcaster posts only, last 7d)
  7. Invoke graph
```

```
Graph (same LangGraph pattern as fomo_master):
  rank → write → broadcast → resolve → save
```

### Formatted Match Block (input to ranker)

```
MATCH: [market question / match title]
Market: [slug] | Current odds: [yes]% YES / [no]% NO
Volume (7d): [bet_count] bets, [distinct_wallets] wallets, [total_volume]
Odds movement: [shift_from]% → [shift_to]% in last [timeframe]
```

Example:
```
MATCH: "Will Manchester United win vs Nottingham Forest? (March 31)"
Market: epl-manchester-united-nottingham-march-31 | Current odds: 34% YES
Volume (7d): 12 bets, 8 wallets, $44K total
Odds movement: 46% → 34% in last 48h (12-point drop)
```

No Nansen profile needed — sports is about market movement, not wallet tracking.

### Ranker Node

Same structure as fomo_master ranker. Ranking criteria for sports:

1. **Odds movement size** — 15+ point shift in 48h is the strongest signal
2. **Volume concentration** — 2-3 wallets moving a market vs 15 = different stories
3. **Match timing** — match in <24h is time-sensitive
4. **Market size** — larger volume markets are more trustworthy signals

**Picks 1-2 sports stories per run** (vs 1-3 for fomo_master — sports has more repetition risk).

### Writer Node — Sports Voice

```
SPORTS_WRITER_SYSTEM_PROMPT:

You write X posts for a prediction market intelligence account covering sports.
Your audience follows prediction market odds, not just match results. They want to
know what the market knows that the sports media doesn't.

Lead with the odds story, not the wallet.

Archetypes:

MOMENTUM (odds moving fast in one direction):
"[Team] falling in [market]. Down 12 points in 48h — now at 34% to win at home.
The market is pricing in something the media hasn't caught yet."

CONTRARIAN (market going against expected favorite):
"Everyone expects [Team] to win. The market gives them 34%. At home.
That's the prediction market saying 'not so fast.'"

VOLUME SURGE (unusual betting activity):
"$44K moved on [match] in 48h. Usually this market stays quiet. Something changed."

TIME_SENSITIVE modifier (match in <24h):
Add "This resolves tonight." or "Kick-off in Xh." to any archetype.

Rules:
- Lead with odds % and direction. Always.
- No wallet addresses (sports is market story, not whale tracking)
- No hashtags
- Max 1 emoji: ⚽ 🏀 🏈 — only if it adds to the match identity
- Do NOT mention "prediction market" or "Polymarket" explicitly — just say "the market"
- NEVER write "Full context in the feed." (sports X posts stand alone)

Return JSON: { "drafts": [{ "signal_id": "...", "archetype": "MOMENTUM|CONTRARIAN|VOLUME_SURGE", "draft_text": "...", "reasoning": "..." }] }
```

### Broadcaster Node

Same `chief_broadcaster` logic as fomo_master. Key differences for sports:

- Duplicate check: `{slug}:{archetype}` for sports too
- Sports has stricter frequency: same match posted 2+ times = hard reject (matches resolve,
  no need for multiple posts on same fixture)
- Time sensitivity: if match has resolved, hard reject (stale content)
- Broadcaster receives `full_timeline` filtered to sports_broadcaster posts only
  (not mixed with fomo_master timeline — different audience context)

### Save Node

Same as fomo_master save. Insert with:
- `agent_type: 'sports_broadcaster'`
- `signal_ids: [signal_id]`
- `status: 'draft'`
- No Polymarket wallet URL (sports posts don't have a wallet to link)
- Optionally append Polymarket market URL: `\nhttps://polymarket.com/event/{slug}`
  (appended in code, not by LLM — same pattern as fomo_master)

---

## Sports Influencer Prompt Path

Update `INFLUENCER_SYSTEM_PROMPT` in `influencer-graph.ts`:

```
When content_type is 'sports':
- Lead with the match + current odds hook
- Include team form context if present in content_small/full
- Frame as: "[Team] at [X]%. The market [interpretation]."
- Max 1 sports emoji (⚽ 🏀 🏈)
- End with: "Full context in the feed." (the published narrative IS the full context)
- Do NOT use wallet language ("a wallet placed...") for sports content
```

---

## PM2 Config

```js
{
  name: 'myboon-sports-broadcaster',
  script: './packages/brain/src/run-sports-broadcaster.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx/esm',
  cron_restart: '0 */2 * * *',   // every 2h (matches are less frequent than whale bets)
  autorestart: false,
  watch: false,
  env: { NODE_ENV: 'production' }
}
```

Run it more frequently (hourly) when a major match is within 24h. Manual override via
`pm2 restart myboon-sports-broadcaster` is sufficient for hackathon phase.

---

## Interface: FormattedMatchSignal

```ts
export interface FormattedMatchSignal {
  id: string
  type: string
  weight: number
  metadata: Record<string, unknown>
  created_at: string
  live_odds: number | null          // current YES probability
  market_history: {
    bet_count: number
    distinct_wallets: number
    total_volume: number
  }
  odds_shift: {                     // computed from ODDS_SHIFT signals for this slug
    from: number | null
    to: number | null
    hours_ago: number | null
  } | null
  match_context: {                  // parsed from market question text
    match_title: string             // "Manchester United vs Nottingham Forest"
    sport: string                   // "epl" | "ucl" | etc.
    resolution_date: string | null  // "March 31" if parseable from question
  }
  formatted_text: string
}
```

No Nansen profile field — sports broadcaster doesn't track wallets.

---

## Acceptance Criteria

### Sports analyst tuning
- [ ] `content_type: 'sports'` is output by analyst for UCL/EPL signal clusters
- [ ] Sports narrative `observation` leads with odds level + direction, not wallet address
- [ ] Sports narrative `content_small` in published_narratives uses match framing
- [ ] `ContentType` enum includes `'sports'` in `publisher-types.ts`

### Sports broadcaster
- [ ] `packages/brain/src/graphs/sports-broadcaster-graph.ts` exports `sportsBroadcasterGraph`
- [ ] `packages/brain/src/sports-broadcaster.ts` runner detects sports slugs correctly
- [ ] Runner enriches with: live odds, 7d market history, odds shift from signals
- [ ] Formatted match block includes: match title, slug, current odds, volume, odds movement
- [ ] Ranker picks 1-2 sports stories per run (not more)
- [ ] Writer produces MOMENTUM / CONTRARIAN / VOLUME_SURGE archetype posts
- [ ] Writer never uses wallet addresses in sports posts
- [ ] Broadcaster rejects same match posted twice (frequency: 2 per slug per week max)
- [ ] Posts saved with `agent_type='sports_broadcaster'`
- [ ] PM2 process `myboon-sports-broadcaster` starts cleanly
- [ ] `pnpm --filter @myboon/brain sports-broadcaster:start` runs without error

### Sports influencer path
- [ ] `content_type='sports'` narratives produce X drafts with match + odds lead
- [ ] No wallet language ("a wallet placed...") in sports influencer output
- [ ] Sports emoji (⚽) appears only on sports posts

### Integration
- [ ] fomo_master and sports_broadcaster run independently without interfering
  (different signal filters, different x_posts agent_type, different broadcaster timelines)
- [ ] A sports signal (epl-*) is NOT picked up by fomo_master (it filters WHALE_BET weight ≥ 8 only, and sports ODDS_SHIFT signals have lower weights — verify this holds)

---

## Future: Macro Broadcaster (#051)

Following the same pattern as sports_broadcaster, a `macro_broadcaster` will handle:
- Signals: ODDS_SHIFT + WHALE_BET on geopolitics/election/macro slugs
- Enrichment: live odds + Nansen wallet context (macro has wallets worth tracking)
- Voice: authoritative thesis, contrarian position forming
- When: after sports_broadcaster is stable and hackathon SDK work is underway

The macro_broadcaster effectively replaces the generic influencer for geopolitics content.
The influencer becomes primarily a catch-all for content types without a dedicated broadcaster.
