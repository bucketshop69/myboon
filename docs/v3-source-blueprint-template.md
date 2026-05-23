# V3 Source Blueprint Template

Status: reusable implementation template
Milestone: V3 Feed Intelligence
Derived from: Polymarket V3 source work
Related issues: #181, #182, #183, #184, #185, #186, #187

## Purpose

Use this template before adding any new feed data source.

The goal is to make every source enter V3 the same way:

```text
source facts
  -> normalized facts
  -> classified events
  -> story candidates
  -> research packets
  -> editorial decisions
  -> writer output
  -> published narratives
  -> outcomes
```

A source is an evidence origin. It is not a segment.

Examples:

| Source Fact | Possible Segment | Why |
| --- | --- | --- |
| Hyperliquid wallet increases BTC long | Smart Money | actor behavior may matter |
| Hyperliquid funding reaches extreme | Crowded Trade | market positioning may be one-sided |
| Polymarket wallet repeats a YES buy | Smart Money | actor repeated exposure on same market |
| Polymarket odds move plus web confirmation | Receipt Check | market repriced around external evidence |
| Options skew shifts sharply | Crowded Trade | volatility market shows positioning imbalance |

## Required Source Blueprint Sections

Every source issue should include these sections.

### 1. Source Role

Define what evidence the source provides.

Also define what the source should never decide.

Examples:

- A collector may say: wallet `0xabc` bought `BTC-PERP` long at this time.
- A collector may not say: this is a publishable Smart Money story.
- A source adapter may normalize a funding snapshot.
- A source adapter may not invent a catalyst or user-facing narrative.

### 2. Current Inputs / APIs

List every input path:

- APIs
- streams
- tables
- files
- watchlists
- credentials
- current collectors
- current scripts

For each input, state whether it is already implemented, partially implemented, or new.

### 3. Seeds Versus Material Triggers

Split starting points into two groups.

Seeds expand or maintain the watch universe. They should not publish by default.

Material triggers indicate that something may have changed enough to research.

| Input | Seed Or Material | Why |
| --- | --- | --- |
| pinned market | seed | tells us what to watch |
| tracked wallet list | seed | tells us which actor may matter later |
| wallet repeat action | material | behavior changed |
| funding extreme | material | market structure changed |
| deadline approaching | material only with context | time alone is not always a story |

### 4. Raw Fact Types

Define immutable source observations.

Each raw fact needs:

- source
- source kind
- observed time
- received time
- dedupe key
- raw payload reference
- trace or receipt

Do not put final editorial decisions in raw facts.

### 5. Normalized Fact Mapping

Map source-specific payloads into shared fact types.

Examples:

- `wallet.trade`
- `wallet.position`
- `market.snapshot`
- `odds.snapshot`
- `funding.snapshot`
- `open_interest.snapshot`
- `liquidity.snapshot`
- `event.schedule`
- `protocol.event`
- `catalyst.fact`

Each normalized fact should carry entity refs, values, labels, and trace.

### 6. Classified Event Mapping

Classify events in source-neutral language.

Examples:

- `wallet.repeat_action`
- `flow.large_position`
- `flow.accumulation`
- `flow.exit`
- `odds.repricing`
- `perps.funding_extreme`
- `perps.crowding`
- `liquidity.thinning`
- `liquidity.expansion`
- `news.catalyst_reaction`
- `cross_source.confirmation`
- `cross_source.contradiction`

Source name can remain metadata, but the event kind should describe what happened.

### 7. Segment Routing Rules

Define which classified events can route to which segments.

Do not assign one segment to the whole source.

| Event Kind | Possible Segments | Routing Notes |
| --- | --- | --- |
| `wallet.repeat_action` | Smart Money, Thread Update | actor repeats material behavior |
| `perps.funding_extreme` | Crowded Trade, Breaking Tape | positioning or liquidation risk |
| `odds.repricing` | Breaking Tape, Receipt Check | depends on catalyst and context |
| `protocol.event` | Protocol Watch, Receipt Check | depends on severity and evidence |

### 8. Story Key Strategy

Define stable story keys before publishing anything.

A story key should be specific enough to prevent duplicate cards but broad enough to allow thread updates.

Examples:

```text
polymarket:wallet-repeat:{wallet}:{market}:{outcome}:{direction}
hyperliquid:wallet-position:{wallet}:{asset}:{direction}
hyperliquid:funding-extreme:{asset}:{direction}:{window}
options:skew-shift:{asset}:{expiryBucket}:{direction}
web:catalyst:{entity}:{eventType}:{date}
```

Each source blueprint must state:

- key parts
- normalization rules
- when a new key is created
- when an existing key becomes a thread update
- how `coveredThrough` / `materialChangeAfter` is tracked

### 9. Research Packet Requirements

Define the minimum packet for the first vertical slice.

At minimum:

- `storyKey`
- segment
- archetype
- headline claim
- thesis
- why now
- what changed
- entities
- receipt-backed facts
- counter-evidence if available
- materiality
- freshness
- confidence
- uncertainty
- recommended actions
- success criteria
- editorial constraints

The writer should not need to discover facts.

### 10. Editorial Decision Matrix

Every source needs default rules for:

- publish
- update
- hold
- suppress
- merge
- escalate

Template:

| Trigger Family | Default Decision | Publish Conditions | Hold Conditions | Suppress Conditions | Thread / Update Conditions |
| --- | --- | --- | --- | --- | --- |
| seed input | hold | only with material paired evidence | no material change | irrelevant or duplicate | context for future thread |
| actor action | hold or publish | fresh, material, receipt-backed | missing context | noisy, stale, weak trace | same story key changes materially |
| market structure | hold or publish | threshold breach with context | weak baseline | low liquidity, duplicate | worsening or reversal updates thread |
| external catalyst | hold or publish | source confirms market move | weak source | untrusted or stale | confirmation/contradiction updates thread |

### 11. Replay And Shadow Mode

Each source must have a way to run without publishing.

Replay should:

- accept legacy/current rows as input
- produce packets and editorial decisions
- avoid writer calls by default
- avoid database mutation by default
- write an artifact
- report decision counts
- report selected and baseline outcomes where possible
- use deterministic replay keys for same fetched rows and options
- support a fixed replay clock when running from CLI

### 12. Outcome Criteria

Define success criteria by archetype before publication.

Examples:

| Archetype | Example Success Criteria |
| --- | --- |
| wallet repeat action | odds follow-through within 24h, final resolution if available |
| crowded trade | funding/price reversion, liquidation follow-through |
| catalyst reaction | market confirms or reverts after external fact |
| liquidity risk | spread/depth worsens or recovers |
| protocol event | user funds, TVL, volume, or exploit status changes |

## New Source Issue Checklist

Use this checklist when creating issues for any new source.

- [ ] Link to `docs/feed vision.md`.
- [ ] Link to `docs/v3 feed.md`.
- [ ] Link to this template.
- [ ] State the source role and what it must not decide.
- [ ] List current APIs/tables/files/collectors.
- [ ] Split seeds from material triggers.
- [ ] Define raw fact types.
- [ ] Define normalized fact mapping.
- [ ] Define classified event mapping.
- [ ] Define possible segments and routing rules.
- [ ] Define story key format and thread/update rules.
- [ ] Define first vertical slice.
- [ ] Define minimum `ResearchPacket`.
- [ ] Define editorial decision matrix.
- [ ] Define writer boundary.
- [ ] Define replay/shadow-mode command or fixture path.
- [ ] Define acceptance tests.
- [ ] Define outcome criteria.
- [ ] Mark out of scope clearly.

## Issue Breakdown Pattern

For a new source, use the Polymarket issue sequence as the default milestone shape.

1. Source blueprint and starting triggers: define the source role, seeds, material triggers, event vocabulary, and first vertical slice.
2. First vertical slice: implement the narrowest path from source rows to a `ResearchPacket`.
3. Contracts and validation: add or extend packet contracts, runtime validators, and fixtures.
4. Story keys and decisions: implement dedupe, suppress, hold, publish, update, and thread rules.
5. Writer handoff: ensure approved packets can become packet-backed writer input and reject unsupported writer output.
6. Replay and shadow mode: add deterministic replay, read-only artifact output, decision counts, and outcome examples.
7. Source blueprint update: record what the implementation taught the reusable template.

Do not open a broad "add source" issue without splitting these responsibilities.

## Definition Of Done For A Source Slice

A source slice is complete only when:

- contracts compile
- packet validation passes for happy and unhappy paths
- story keys are stable
- duplicate or already-covered stories suppress
- material changes become updates
- missing receipts or unresolved entities hold
- noisy or low-quality cases suppress
- approved packet writer input works
- unsupported writer output is rejected
- replay/shadow mode writes an artifact
- replay does not call the writer or mutate publisher tables
- outcome criteria are frozen before publish/replay evaluation
- docs name remaining source-specific gaps

## Test Expectations For Every Source

Each source should ship with tests at four layers.

### Unit

- source payload to raw/normalized fact
- direction inference
- numeric parsing and bounds
- story key stability
- deterministic feature extraction
- suppress/hold/update/publish rules

### Integration

- legacy/current source rows to `ResearchPacket`
- packet validation
- approved packet to writer input
- unsupported writer claims rejected
- no live publisher mutation in shadow mode

### Replay

- deterministic replay key for same input and options
- decision counts
- hit/miss/inconclusive examples where outcome criteria exist
- artifact writing
- fixed replay clock or stable derived clock

### Regression Fixtures

- happy-path publish candidate
- missing receipt hold
- unresolved entity hold
- duplicate suppress
- material thread update
- noisy/low-quality suppress
- malformed source payload ignored or held

## Completed Example: Polymarket

Polymarket is the first completed V3 source example.

Reference files:

- `docs/v3-polymarket-source-blueprint.md`
- `packages/brain/src/intelligence/v3/contracts.ts`
- `packages/brain/src/intelligence/v3/packet-validator.ts`
- `packages/brain/src/intelligence/v3/editorial-decision.ts`
- `packages/brain/src/intelligence/v3/wallet-repeat-research.ts`
- `packages/brain/src/intelligence/v3/packet-writer.ts`
- `packages/brain/src/intelligence/v3/wallet-repeat-replay.ts`
- `packages/brain/src/run-polymarket-wallet-repeat-shadow.ts`

Implemented issue coverage:

- #181 Polymarket source blueprint and starting triggers
- #182 wallet-repeat ResearchPacket vertical slice
- #183 ResearchPacket contracts and validation
- #184 story keys, dedupe, suppress, and thread decisions
- #185 writer consumes approved ResearchPackets
- #186 replay, shadow mode, and acceptance tests
- #187 reusable source blueprint documentation

Polymarket proves the reusable path:

```text
legacy WHALE_BET / future raw fact
  -> wallet trade seed
  -> grouped wallet-repeat packet
  -> editorial decision
  -> approved packet writer input
  -> shadow replay artifact
```

The first slice is intentionally narrow. Future Polymarket slices should reuse the same pattern for odds repricing, crowding, deadline watch, market resolution, and external catalyst confirmation.
