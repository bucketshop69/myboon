# V3 Feed

Status: design proposal
Scope: pseudo-technical architecture for the next feed intelligence iteration
Related: `docs/v3-market-source-collection-blueprint.md`, `docs/v3-source-blueprint-template.md`

## Why V3 Exists

The current intelligence work proved that a narrow source path can be scored, replayed, backtested, and published. That was useful, but the next version needs a clearer responsibility split before more data sources arrive.

The main issue is not that we need more collectors. The issue is that the current flow can make one layer do too many jobs:

```text
signals -> narrative drafts -> publisher -> published_narratives
```

V3 should introduce a more explicit middle layer:

```text
raw facts
  -> normalized facts
  -> classified events
  -> story candidates
  -> research packets
  -> lineup decisions
  -> writer output
  -> published narratives
  -> outcomes
```

The most important new object is the `ResearchPacket` or `StoryPacket`.

## Design Goal

V3 should make myboon a structured market intelligence feed where many facts can be gathered, grouped, researched, prioritized, and rendered without making the final writer responsible for discovery or verification.

Sources should answer:

> This happened, here is the trace.

The intelligence layer should answer:

> What is this about, is it part of a larger story, does it matter now, and what should we do with it?

The writer should answer:

> How should this approved packet be phrased for the chosen surface?

## Main Pipeline

### 1. Raw Fact Intake

Responsibility: fetch and preserve source observations.

Examples:

- wallet placed a trade
- odds moved
- funding flipped
- liquidity changed
- protocol event occurred
- scheduled catalyst moved closer
- headline or off-chain event was observed

Raw facts should be immutable and traceable.

```ts
interface RawFact {
  id: string
  source: string
  sourceKind: string
  observedAt: string
  receivedAt: string
  dedupeKey: string
  entityHints: Record<string, unknown>
  rawPayload: unknown
  trace: FactTrace
}
```

Collectors should write raw facts, not final publishable stories.

### 2. Normalization And Entity Resolution

Responsibility: turn source-specific facts into shared entities and fact types.

```ts
interface EntityRef {
  type: 'asset' | 'wallet' | 'market' | 'protocol' | 'team' | 'person' | 'country' | 'event'
  id: string
  canonicalName: string
  aliases?: string[]
}

interface NormalizedFact {
  id: string
  rawFactIds: string[]
  factType: string
  observedAt: string
  entities: EntityRef[]
  metrics: Record<string, number | string | boolean | null>
  labels: string[]
  sourceReliability: number
  trace: FactTrace[]
}
```

This is where different references to the same underlying subject can become related without being collapsed incorrectly.

Example:

- `BTC`
- `bitcoin`
- `BTC-PERP`
- a prediction market about BTC

These are related entities, not necessarily the same entity.

### 3. Feature Extraction

Responsibility: compute deterministic measurements.

No LLM should be needed here.

Examples:

- odds delta over time windows
- funding percentile
- open interest delta
- wallet position delta
- liquidity depth change
- volume z-score
- novelty versus recent history
- time to event
- contradiction between venues

```ts
interface FeatureSnapshot {
  id: string
  normalizedFactIds: string[]
  entityRefs: EntityRef[]
  computedAt: string
  featureVersion: number
  features: Record<string, number | string | boolean | null>
}
```

### 4. Event Classification

Responsibility: classify what happened in a source-neutral way.

Source should remain metadata. The main event kind should describe the market event.

Example event kinds:

- `odds.repricing`
- `flow.large_position`
- `flow.accumulation`
- `flow.exit`
- `liquidity.thinning`
- `liquidity.expansion`
- `perps.funding_extreme`
- `perps.crowding`
- `wallet.repeat_action`
- `news.catalyst_reaction`
- `sports.live_repricing`
- `market.resolution`
- `macro.regime_shift`

```ts
interface ClassifiedEvent {
  id: string
  eventKind: string
  source: string
  entityRefs: EntityRef[]
  direction: 'up' | 'down' | 'neutral' | 'unknown'
  magnitude: number
  confidence: number
  urgency: number
  novelty: number
  ruleId: string
  scoringVersion: number
  featureSnapshotIds: string[]
}
```

### 5. Segment Routing

Responsibility: decide how the system should understand the event.

V3 should split concepts that are currently easy to mix together:

```text
source        where the fact came from
segment       why a user may care
archetype     what kind of story it is
surface       where it should appear
tone          how it should sound
```

This means sources are not user-facing segments by default. A source is an evidence origin; a segment is the editorial interpretation.

Examples:

```text
source: hyperliquid
eventKind: wallet.large_position
segment: Smart Money
archetype: contrarian_position

source: hyperliquid
eventKind: perps.funding_extreme
segment: Crowded Trade
archetype: crowded_trade

source: polymarket
eventKind: wallet.repeat_action
segment: Smart Money
archetype: smart_money_position

source: polymarket + web_research
eventKind: odds.repricing + catalyst_confirmation
segment: Receipt Check
archetype: catalyst_reaction

source: options_market
eventKind: options.skew_shift
segment: Crowded Trade
archetype: positioning_imbalance
```

The reusable source blueprint should therefore define how a source emits facts and classified events, not which final segment it owns. Segment routing happens after facts are normalized and classified.

Example segments:

- Smart Money
- Breaking Tape
- Crowded Trade
- Catalyst Watch
- Receipt Check
- Protocol Watch
- Market Autopsy
- Thread Update
- Deep Dossier

Example archetypes:

- `breaking_move`
- `smart_money_position`
- `cross_market_divergence`
- `crowded_trade`
- `catalyst_reaction`
- `deadline_watch`
- `liquidity_risk`
- `resolution_update`
- `trend_followthrough`
- `contrarian_signal`

### 6. Story Clustering

Responsibility: group related events into possible stories.

A single fact does not always deserve publication. The story assembler should ask:

- Is this new?
- Is this an update to an existing story?
- Does this confirm or contradict another event?
- Is there enough context to publish?
- Is this only noise from one venue?
- Has myboon already covered this too recently?

```ts
interface StoryCandidate {
  id: string
  storyKey: string
  segment: string
  archetype: string
  entityRefs: EntityRef[]
  eventIds: string[]
  thesis: string
  whyNow: string
  evidenceSummary: string
  contradictionSummary?: string
  noveltyScore: number
  urgencyScore: number
  confidenceScore: number
  publishabilityScore: number
  suppressReasons: string[]
}
```

`storyKey` is critical. It prevents the feed from publishing multiple versions of the same story.

Example story keys:

```text
wallet-0xabc-market-trump-election-repeat-long
btc-upside-odds-repricing
btc-perps-funding-crowding
solana-meme-liquidity-drain
fed-cut-odds-collapse
```

### 7. Research Packet Assembly

Responsibility: gather all information needed before the writer sees the story.

This is the core V3 object.

```ts
interface ResearchPacket {
  id: string
  storyCandidateId: string
  storyKey: string
  threadId?: string
  segment: string
  archetype: string
  status: 'new' | 'update' | 'developing' | 'recap' | 'killed'

  headlineClaim: string
  thesis: string
  whyNow: string
  whatChanged: string

  entities: EntityRef[]
  facts: PacketFact[]
  priorCoverage: PriorCoverage[]
  counterEvidence: PacketFact[]

  materiality: MaterialityScore
  freshness: number
  confidence: number
  uncertainty: string[]

  recommendedActions: RecommendedAction[]
  successCriteria: OutcomeCriterion[]
  editorialConstraints: string[]
}

interface PacketFact {
  id: string
  claim: string
  observedAt: string
  factType: string
  receipt: {
    sourceType: 'tx' | 'api_snapshot' | 'url' | 'market_snapshot' | 'internal_observation'
    source: string
    capturedAt: string
    rawRef?: string
  }
  values: Record<string, number | string | boolean | null>
  confidence: number
}
```

A research packet should answer:

- What happened?
- What changed?
- Why might it matter?
- What evidence supports it?
- What weakens it?
- What did we already say?
- Is this a new story or an update?
- What should the user be able to do next?
- What would make the story right, wrong, stale, or resolved?

### 8. Editorial Decision

Responsibility: choose the output path.

```ts
interface EditorialDecision {
  packetId: string
  decision: 'publish' | 'update' | 'hold' | 'merge' | 'suppress' | 'escalate'
  surface: 'feed_card' | 'thread' | 'push_alert' | 'daily_report' | 'market_detail' | 'none'
  priority: number
  reason: string
  expiresAt?: string
}
```

Suppression should be first-class.

Suppress or hold when:

- duplicate with no material update
- stale
- weakly sourced
- too low liquidity
- confidence is low
- story has no useful context
- market or source looks noisy
- topic is over-covered
- evidence does not support the claim

### 9. Writer And Critic

Responsibility: render an approved packet.

The writer may:

- choose phrasing
- compress for the target surface
- create the final headline/body
- apply the right tone
- include approved actions

The writer may not:

- create new facts
- invent causality
- calculate new deltas
- change confidence or materiality
- attach unapproved actions
- upgrade uncertainty into certainty

The critic should check:

- unsupported claims
- overstated causality
- duplicate risk
- stale evidence
- missing receipt coverage
- invalid action links
- bad format or tone

### 10. Published Narrative

Responsibility: final immutable user-facing artifact.

`published_narratives` should store the rendered output and references to the packet, thread, evidence, versions, and success criteria. It should not be the main place where research or editorial reasoning happens.

### 11. Outcome Loop

Responsibility: measure whether the system was useful.

Every packet should freeze success criteria before publication.

Example criteria:

- odds moved further
- market resolved as expected
- funding reverted
- liquidity recovered or worsened
- volume followed through
- thread update became necessary
- user engagement beat baseline
- alert was timely
- story was later invalidated

## Thread And Update Rules

Each packet should decide whether it is:

- a new story
- an update
- a duplicate
- a recap
- stale
- killed

Rules:

- same story with no material change: suppress
- same story with material numeric change: thread update
- same actor with different market or thesis: new story with fatigue penalty
- same catalyst with new confirmation or contradiction: thread update
- resolved or invalidated story: publish resolution or close thread

Material changes can include:

- odds moved another threshold amount
- position size changed meaningfully
- liquidity moved by a large multiple
- funding crossed a threshold
- new catalyst arrived
- counter-evidence appeared
- market resolved

## Example Lifecycle

Raw facts:

```text
1. Wallet 0xabc bought YES once at 29c.
2. The same wallet bought YES again at 31c.
3. Market odds moved from 22c to 31c.
4. Liquidity above 65c thinned.
```

Pipeline:

```text
RawFact
  -> NormalizedFact: wallet action, odds move, liquidity move
  -> FeatureSnapshot: repeat action, entry prices, time gap, odds delta, liquidity delta
  -> ClassifiedEvent: wallet.repeat_action + odds.repricing
  -> StoryCandidate: "wallet doubled down into a repricing"
  -> ResearchPacket: all trades, prices, receipts, prior coverage, uncertainty
  -> EditorialDecision: publish as Smart Money feed card or thread update
  -> Writer: final card
  -> PublishedNarrative: immutable output
  -> Outcome: check follow-through or invalidation
```

Possible rendered output:

```text
Wallet doubled down into the move.

0xabc bought YES twice, first at 29c and again at 31c.
The market had already repriced +9 pts.
```

The rendered text is short because the packet underneath is complete.

## V3 Implementation Direction

V3 can evolve the current system in place.

1. Keep existing collectors, but start treating them as fact providers.
2. Keep current `signals` as a compatibility bridge while new objects are introduced.
3. Add generic contracts for `RawFact`, `NormalizedFact`, `ClassifiedEvent`, `StoryCandidate`, and `ResearchPacket`.
4. Build one path end-to-end first, likely a wallet or market activity path that already exists.
5. Replace slug-only grouping with `storyKey`, entity, and archetype grouping.
6. Feed approved packets into the current publisher graph rather than asking the writer to infer too much.
7. Store packet ids, thread ids, evidence refs, versions, and success criteria on published output.
8. Measure outcomes by segment and archetype, not only by source.

## First V3 Product Slice

The first implemented live slice is Polymarket wallet-repeat:

```txt
collector-created WHALE_BET / ODDS_SHIFT signals
-> ResearchPacket
-> EditorialDecision
-> packet-backed writer output
-> narratives
-> published_narratives
-> feed/API visibility through existing published_narratives readers
```

The live command is:

```bash
pnpm --filter @myboon/brain intelligence:polymarket:v3-live
```

This is different from shadow replay. Shadow replay measures old data. The live command consumes fresh unprocessed Polymarket signals and writes feed artifacts.

## Source Blueprints

Each new data source should get a source blueprint before implementation. The first completed blueprint is Polymarket:

- [`docs/v3-source-blueprint-template.md`](v3-source-blueprint-template.md)
- [`docs/v3-polymarket-source-blueprint.md`](v3-polymarket-source-blueprint.md)

A source blueprint should define:

- what can wake research up
- which inputs are seeds versus material triggers
- raw facts emitted by the source
- normalized fact mapping
- classified event mapping
- possible editorial segments
- suppress/hold/update/publish defaults
- gaps in current collection
- how the source teaches the reusable onboarding template

At minimum, each source blueprint should include:

```text
Source Role
Current Inputs / APIs
Seeds Versus Material Triggers
Trigger Mapping
Event Vocabulary
Decision Matrix
First Vertical Slice
Gaps / Follow-Up Issues
```

## Open Design Decisions

- Should `ResearchPacket` be stored in a new table or as an extension of existing `narratives`?
- What is the minimum packet required before a story can be published?
- Which fields are deterministic and which are LLM-assisted?
- What is the first source path to migrate into V3?
- How should entity resolution be represented across assets, wallets, markets, protocols, and events?
- What is the publishing cadence and editorial budget per day?
- Which segments should exist at launch, and which should wait?

## V3 Success Criteria

V3 is successful when:

- source-specific data can become shared facts
- facts can be grouped into story candidates
- story candidates can become complete research packets
- writers only write from approved packets
- published items include evidence references
- duplicate stories become thread updates or suppressions
- outcomes can be evaluated by story, segment, and archetype
- the feed feels timely, grounded, and useful instead of noisy
