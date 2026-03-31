# #049 — Content Layer Architecture: Type Taxonomy + Agent Routing

## Why This Exists

This is the **reference PRD** for the content creation layer. Every agent that writes
content for the Feed or X should derive its design from this document. The goal is to
lock the architecture before the Colosseum hackathon (April 4) so content agents don't
need to be redesigned mid-sprint.

Two things in scope here:
1. Expand `content_type` enum to cover all planned content categories
2. Define the routing table: which agent handles which content type, in which pipeline

Everything else (sports-specific prompts, broadcaster implementation) lives in subsequent
issues that reference this one.

## The Two Pipelines

myboon runs two parallel content pipelines from the same signal source:

```
                     ┌─── Feed Pipeline ───────────────────────────────────┐
                     │                                                       │
Signals ──► Analyst ─┤                                                       ├─► Feed API ─► App
                     │  narratives (draft) ──► Publisher ──► published_narr. │
                     │                                                       │
                     └─── X Pipeline ──────────────────────────────────────┐│
                                                                             ││
           Signals (high-weight direct) ──► Broadcasters ──► x_posts (draft)││
           published_narr. ──► Influencer ──► x_posts (draft) ──────────────┘│
                                                                              │
                                                          Human reviews ──────┘
                                                          before posting
```

**Feed pipeline** (bread and butter): Signals → Analyst → Narratives → Publisher →
`published_narratives` → Feed API → app Feed tab. This is the product. High-quality,
long-form, analytical.

**X pipeline** (distribution): Two paths:
- `fomo_master` / broadcasters: reads signals directly, bypasses narrative layer. Fast,
  punchy, real-time. Whale alerts, market momentum. (~280 chars)
- `influencer`: reads `published_narratives`, distills them for X. Slower, more considered.
  Extends the reach of the Feed content to X audience.

These pipelines are SEPARATE. A piece of content is written differently for Feed vs X.
Same underlying signal, different frame, different length, different job to be done.

## Content Type Taxonomy

Content types flow from signal all the way to `published_narratives` and `x_posts`.
Every agent in both pipelines should be aware of the content type of what it's handling.

| Type | Description | Feed job | X job |
|------|-------------|----------|-------|
| `fomo` | Whale bet, unusual conviction, single large position | Show the bet, what it means for the market | Punchy alert: "$50K against consensus" |
| `signal` | Multi-wallet consensus, pattern forming across actors | Trend framing: "Smart money has been..." | Slow build narrative: "3rd wallet this week" |
| `sports` | Match prediction markets, team odds movement, tournament arcs | Match preview with odds + team form context | Momentum post: "United struggling, market knows it" |
| `macro` | Geopolitics, elections, central bank decisions | Thesis piece: what the bettors see that MSM doesn't | Authority frame: "Contrarian position forming on Iran" |
| `news` | Real-world event with immediate market reaction | Event + odds reaction in one card | Factual hook, then market response |
| `crypto` | Token prices, DEX flows, perp positioning | On-chain narrative (future — needs on-chain collector) | (future) |

**Current enum** in `publisher-types.ts`: `'fomo' | 'signal' | 'news'`

**Target enum** after this issue: `'fomo' | 'signal' | 'sports' | 'macro' | 'news' | 'crypto'`

### How content_type is detected

Detection happens at **analyst output time**. The analyst classifies each cluster it writes
based on the signals in that cluster. Rules (in order):

| Detection rule | content_type |
|---------------|-------------|
| Cluster slugs match `ucl-*`, `epl-*`, `nba-*`, `nfl-*`, sports team names | `sports` |
| Cluster signals are all from same wallet(s) placing large single bets | `fomo` |
| Cluster signals show multiple wallets converging on same market | `signal` |
| Cluster topic references geopolitics, elections, central bank, trade war | `macro` |
| Cluster topic references a specific news event (not a prediction market itself) | `news` |
| Default | `fomo` |

The analyst writes this to `narratives.content_type`. The publisher reads it and routes
accordingly. The influencer reads it from `published_narratives.content_type`.

Sports slug patterns: `ucl-*`, `epl-*`, `nba-*`, `nfl-*`. The slug is already in the
signal at collection time (`signals.slug`). The analyst can detect sports by checking
`signal.slug` pattern OR `signal.topic` for team names.

## Agent Routing Table

### Feed Pipeline

| Agent | Reads | Sports path | Macro path | Fomo path |
|-------|-------|-------------|------------|-----------|
| `narrative-analyst` | `signals` (all types) | Sports cluster → narrative with `content_type='sports'`; prompt emphasizes match context over wallet tracking | Geo cluster → narrative with `content_type='macro'`; prompt emphasizes thesis over bet size | Whale cluster → `content_type='fomo'`; prompt emphasizes conviction and position size |
| `publisher` | `narratives (draft)` | Sports narrative → Feed card with match framing, team form, odds story | Macro narrative → Feed card with thesis, what smart money sees | Fomo narrative → Feed card with bet details, wallet context |
| Feed API | `published_narratives` | Sports card: `GET /predict/sports/:sport/:slug` for predict block | Macro card: `GET /predict/markets/:slug` for predict block | Fomo card: wallet profile link |

### X Pipeline

| Agent | Reads | Content type handled |
|-------|-------|---------------------|
| `fomo_master` | `signals` (WHALE_BET, weight ≥ 8) | `fomo` — whale alerts. Cialdini frames per #048 |
| `sports_broadcaster` *(new — #050)* | `signals` (ODDS_SHIFT + MARKET_DISCOVERED, sports slugs) | `sports` — market momentum + match context |
| `macro_broadcaster` *(future — #051)* | `signals` (geopolitics, election, macro slugs) | `macro` — contrarian thesis, smart money intelligence |
| `influencer` | `published_narratives` (all types) | All — but prompt varies per `content_type` |

## Influencer Prompt Routing

The influencer is the X agent that handles ALL content types (it reads `published_narratives`
which are already typed). It needs a routing table built into its system prompt:

| content_type | Influencer voice | Lead formula | CTA |
|-------------|-----------------|--------------|-----|
| `fomo` | Punchy, numbers-first | "$X on [market]. [wallet context]." | None (standalone) |
| `signal` | Trend frame | "Smart money has been [direction] on [topic]." | "Full context in the feed." |
| `sports` | Match preview voice | "[Team] at [odds]% with [streak/form context]." | "Full context in the feed." |
| `macro` | Analytical, authoritative | "The market is pricing [event] differently than the news." | "Full context in the feed." |
| `news` | Factual hook first | "[Event happened]. Prediction markets [reacted how]." | "Full context in the feed." |

Note: `fomo` posts never have a CTA because they stand alone (no deeper content in feed
for that specific bet). All others reference the feed because there IS a published narrative.

## Feed Card Rendering Per Content Type

The Feed API and mobile app already have different card templates via `actions` and `tags`.
What's missing is the NARRATIVE layer — how each content_type produces different
`content_small` and `content_full` fields.

| content_type | content_small pattern | content_full adds |
|-------------|----------------------|-------------------|
| `fomo` | Lead: specific wallet bet with amount and direction | Full wallet analysis, market context |
| `signal` | Lead: trend across multiple actors | All wallets, timeline, convergence analysis |
| `sports` | Lead: match + current odds + team form hook | Match context, historical form, what the market is pricing |
| `macro` | Lead: smart money thesis, contrarian position | Full geopolitical/macro context, all signal clusters |
| `news` | Lead: what happened + immediate market reaction | Event background, market before/after |

## DB Changes

```sql
-- Expand content_type CHECK constraint (no data migration needed — new values only)
ALTER TABLE published_narratives
  DROP CONSTRAINT IF EXISTS published_narratives_content_type_check;

ALTER TABLE published_narratives
  ADD CONSTRAINT published_narratives_content_type_check
  CHECK (content_type IN ('fomo', 'signal', 'sports', 'macro', 'news', 'crypto'));

-- x_posts: same expansion for content_type if it has a constraint
-- (x_posts uses agent_type for routing, not content_type — no change needed there)
```

## Future Content Types

| Type | Needs | When |
|------|-------|------|
| `crypto` | On-chain collector (Nansen DEX flows, perp OI, token netflow) stable | After Nansen on-chain collector (#042 follow-up) |
| `macro` broadcaster | Dedicated broadcaster vs relying on influencer | After fomo_master + sports_broadcaster stable |

## Dependencies

- Blocks: #050 (sports pipeline), future macro broadcaster
- Builds on: #043 (content_type on published_narratives), #047 (fomo_master), #048 (persuasion layer)
- No new packages required

## Acceptance Criteria

- [ ] `ContentType` in `publisher-types.ts` expanded to `'fomo' | 'signal' | 'sports' | 'macro' | 'news' | 'crypto'`
- [ ] DB constraint on `published_narratives.content_type` expanded to match
- [ ] Analyst system prompt updated to include content_type classification rules (sports slug detection, wallet vs trend vs macro vs news)
- [ ] Publisher system prompt receives `content_type` context and adapts `content_small` lead formula accordingly
- [ ] Influencer system prompt includes routing table: content_type → voice + lead formula + CTA rule
- [ ] Spot check: a sports narrative has `content_type='sports'` in DB
- [ ] Spot check: a geopolitics whale narrative has `content_type='macro'` or `content_type='fomo'` (not default)
- [ ] No BC: existing `fomo | signal | news` values still valid, no data migration needed
