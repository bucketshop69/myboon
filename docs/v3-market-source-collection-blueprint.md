# V3 Market Source Collection Blueprint

Status: working blueprint
Scope: reusable collection thesis for perps, prediction markets, options, on-chain venues, and similar market data sources
Related: `docs/feed vision.md`, `docs/v3 feed.md`, `docs/v3-source-blueprint-template.md`

## Purpose

This document explains what myboon needs from any market source before that source can become useful to the V3 feed.

It is not a Hyperliquid integration guide. It is not a perps trading UI checklist. It is the collection thesis:

```text
source data
  -> observable facts
  -> deterministic lead candidates
  -> collection_leads
  -> researcher
  -> research_packets
  -> editor decision
  -> writer
  -> published_narratives
```

The collector does not need to produce a finished story. It needs to produce a useful lead.

A useful lead says:

> Something changed here. Here is the evidence. Here is why a researcher should look.

## Core Thesis

myboon is not trying to mirror every venue screen.

The feed is trying to notice market events that are easy to miss:

- price moving unusually
- volume expanding
- leverage building
- open interest changing
- funding becoming one-sided
- wallets or actors changing behavior
- liquidity getting better or worse
- one venue disagreeing with another
- a catalyst causing measurable market reaction

Every new source must therefore answer three questions:

1. What facts can this source prove?
2. What changes can we detect from those facts?
3. Which changes are strong enough to hand to a researcher?

If a source cannot answer those questions yet, it can still be integrated as a watch source, but it should not be treated as feed-ready.

## Source Versus Segment

A source is where evidence comes from.

Examples:

- a perps venue
- a prediction market
- an options venue
- an on-chain DEX
- a wallet index
- a protocol API
- a news or catalyst source

A segment is why the user may care.

Examples:

- Smart Money
- Crowded Trade
- Breaking Tape
- Catalyst Watch
- Receipt Check
- Protocol Watch
- Market Autopsy
- Thread Update

Do not make the source own the segment.

The same perps venue can produce Smart Money, Crowded Trade, Breaking Tape, and Market Autopsy leads. The same Smart Money segment can come from perps wallets, prediction market wallets, on-chain token accumulation, or protocol treasury behavior.

## What A Collector Owns

Collectors own observation, measurement, and lead creation.

Collectors should do:

- fetch source data
- preserve raw receipts or raw references
- normalize entities where possible
- compute deterministic measurements
- compare measurements against thresholds
- emit lead candidates
- explain pass/fail checks
- write artifacts for inspection
- optionally persist leads into `collection_leads`

Collectors should not do:

- write finished feed copy
- decide the final editorial segment alone
- invent off-source context
- claim causality without evidence
- publish directly to `published_narratives`
- hide weak results just because they are not publishable

The collector's job is to create research inputs, not polished content.

Those research inputs should also identify the entities they touch. A lead about
HYPE funding, NEAR volume, or a watched BTC wallet should make it easy for the
researcher to open the relevant entity book and update the running thesis.

## Required Collection Contract

Every market source should eventually emit a lead object with this shape, even if the source-specific code uses its own internal types:

```text
lead id
source
lane
asset/entity
status: research | watch | ignore
priority
observed time
story key
headline
what changed
why interesting
suggested research questions
metrics
checks
receipts
uncertainty
supporting lead ids
raw lead payload
```

The most important fields are not the headline. They are:

- `whatChanged`: the measured change
- `checks`: why it passed or failed
- `receipts`: where the data came from
- `uncertainty`: what the collector does not know yet

That is what lets a researcher trust or reject the lead.

## Collection Lanes

These lanes are reusable across perps and similar market sources.

Not every source can support every lane on day one. That is fine. The source blueprint should explicitly say which lanes are supported, partially supported, or unavailable.

### 1. Price Momentum

Question:

> Did the asset or market move enough to deserve attention?

Useful inputs:

- current price
- historical price candles
- recent close
- prior close
- volume context
- market status

Example lead:

```text
NEAR moved +14% over 7d while volume expanded.
Research whether this is catalyst-driven, market-wide beta, or isolated flow.
```

Good checks:

- minimum absolute move
- minimum liquidity or volume
- enough historical candles
- not stale
- not duplicate of an existing story

### 2. Volume Expansion

Question:

> Is activity materially higher than its own baseline?

Useful inputs:

- recent volume
- average volume over a prior window
- volume by venue if available
- trade count if available
- price move during the same window

Example lead:

```text
Asset volume is 1.8x its 7d baseline with price up 6%.
Research what changed in attention or positioning.
```

Good checks:

- minimum recent volume
- spike multiple versus baseline
- enough baseline days
- price context
- venue quality

### 3. Funding Pressure

Question:

> Is one side paying materially to hold exposure?

Useful inputs:

- funding history
- latest funding
- average funding
- tail funding
- share of positive or negative samples
- funding flip

Example lead:

```text
Funding stayed positive for most of the week.
Research whether longs are crowded or whether demand is justified by a catalyst.
```

Good checks:

- enough funding samples
- average funding threshold
- tail funding threshold
- sustained positive or negative share
- recent flip or acceleration

### 4. Open Interest Expansion

Question:

> Is leverage building behind the move?

Useful inputs:

- current open interest
- historical open interest snapshots
- price over the same window
- volume over the same window

Example lead:

```text
Open interest rose while price also rose.
Research whether new leverage is chasing the move.
```

Good checks:

- OI delta percentage
- OI dollar delta
- minimum current OI
- matching price window
- enough historical snapshots

Important rule:

If the source does not provide historical OI, the first implementation should store OI snapshots over time. Do not fake historical OI from current OI.

### 5. Price And OI Divergence

Question:

> Are price and leverage telling different stories?

Useful inputs:

- price history
- OI history
- volume
- funding

Example leads:

```text
Price up, OI down: move may be spot-led, short covering, or leverage leaving.
Price down, OI up: shorts may be pressing or longs may be trapped.
Price flat, OI up: positioning is building before a move.
```

Good checks:

- price delta threshold
- OI delta threshold
- enough time separation
- enough market size
- related funding context if available

### 6. Wallet Or Actor Behavior

Question:

> Did a watched actor do something material?

Useful inputs:

- watched wallet list
- leaderboard or public actor list
- deposit-derived wallet discovery
- fills or orders
- current positions
- collateral changes
- actor labels or identity
- wallet quality profile

Example lead:

```text
A directional wallet increased BTC long exposure by $57M in 7d.
Research whether this wallet has a track record or is part of broader positioning.
```

Good checks:

- wallet quality classification
- notional position change
- current position size
- repeated action
- directional behavior versus market-making behavior
- source of wallet: manual, leaderboard, deposit, known entity

Important rule:

Wallet behavior is usually supporting evidence. It becomes a lead only when the wallet quality and notional change are strong enough.

### 7. Liquidity And Market Quality

Question:

> Did the market become easier or harder to trade?

Useful inputs:

- spread
- order book depth
- available liquidity
- slippage estimates
- active markets
- liquidation or risk state where available

Example lead:

```text
Liquidity thinned while price moved sharply.
Research whether the move is fragile or venue-specific.
```

Good checks:

- spread widening
- depth reduction
- volume-adjusted liquidity
- sustained versus one-tick change
- venue outage or degraded API status

### 8. Cross-Source Confirmation Or Contradiction

Question:

> Are multiple sources pointing to the same story, or disagreeing?

Useful inputs:

- leads from more than one source or lane
- shared entity mapping
- compatible time windows
- comparable direction

Example leads:

```text
Perps funding is crowded long while prediction market odds also repriced upward.
Research whether this is one story or two unrelated moves.
```

Good checks:

- at least two independent supporting facts
- shared entity
- compatible time window
- directional agreement or meaningful contradiction
- no circular evidence

Important rule:

Do not start an integration with this lane. Cross-source leads only become useful after individual lanes produce understandable leads.

## Seed Inputs Versus Material Triggers

Every source has seeds and triggers.

Seeds tell us what to watch. Triggers tell us something changed.

| Input | Type | How To Treat It |
| --- | --- | --- |
| manual asset list | seed | watch these markets first |
| manual wallet list | seed | profile and monitor these actors |
| leaderboard wallets | seed | useful but noisy; require quality checks |
| large deposits | seed | add to watchlist, then observe behavior |
| price move | material trigger | can create price momentum lead |
| volume spike | material trigger | can create volume lead |
| funding extreme | material trigger | can create crowding lead |
| OI expansion | material trigger | can create leverage lead |
| wallet position change | material trigger | can create actor behavior lead if wallet quality passes |

A seed alone should not become a feed item.

Example:

```text
Wallet deposited $200K -> seed.
Same wallet later builds a $4M directional long -> material trigger.
```

## Minimum Viable Source Integration

A new market source should not start by trying to support every lane.

The minimum useful integration is:

1. One working data fetch path.
2. One deterministic lane.
3. A local artifact with top leads and failed checks.
4. A stable story key.
5. A clear statement of missing data.
6. Optional `collection_leads` persistence.

Example:

```text
New perps venue v0:
  fetch daily candles
  calculate price and volume changes
  emit price_momentum and volume_expansion leads
  write artifact
  print top 20 research/watch/ignore candidates
```

That is enough to judge whether the source can produce useful leads.

## Data Inventory Checklist

Before writing detectors, fill this out for the source.

| Data Need | Available? | Historical? | Required For |
| --- | --- | --- | --- |
| market list | yes/no | current only/history | asset universe |
| price candles | yes/no | history depth | price momentum |
| volume | yes/no | history depth | volume expansion |
| funding | yes/no | history depth | funding pressure |
| open interest | yes/no | history depth | OI expansion, price/OI divergence |
| trades/fills | yes/no | history depth | wallet behavior, flow |
| positions | yes/no | current/history | wallet behavior |
| deposits/withdrawals | yes/no | history depth | wallet discovery |
| order book/depth | yes/no | history depth | liquidity quality |
| actor labels | yes/no | current/history | wallet quality |
| public receipts | yes/no | stable refs | researcher trust |

If historical data is missing, decide whether to:

- store snapshots going forward
- use a trusted external provider
- mark the lane unavailable
- keep the source in exploration mode

## Thresholds And Configuration

Thresholds should live in a centralized configuration file for each source or source family.

The config should make these values visible:

- minimum volume
- spike multiples
- price move thresholds
- funding thresholds
- OI thresholds
- wallet notional thresholds
- wallet quality thresholds
- lookback windows
- minimum sample counts
- max assets or wallets per run

Early thresholds should be research-friendly, not publication-strict.

The first goal is to see candidates and learn what feels meaningful. Later we can tighten thresholds for production.

## Background Execution Shape

Collectors should run as one-shot commands.

That means a background scheduler can run them safely:

```text
start command
  -> load config
  -> fetch data
  -> compute leads
  -> write artifact
  -> optionally persist collection_leads
  -> exit
```

The command should be safe to run repeatedly.

Required behavior:

- idempotent story keys
- deterministic lead IDs where possible
- no direct `published_narratives` writes
- clear logs
- artifact path in output
- run status if persistence is enabled
- failure recorded if persistence is enabled

The background runner can be cron, VPS scheduler, Supabase cron, a queue worker, or another orchestrator. The collector itself should not care.

## Persistence Boundary

V3 collection persistence should use this boundary:

```text
collection_runs
  one row per collector execution

collection_leads
  one row per lead candidate

research packets
  created later by researcher

published_narratives
  created only after editorial/writer approval
```

Collectors may write to `collection_leads`.

Collectors must not write directly to `published_narratives`.

That keeps the product honest: collection is not publishing.

## What A Good Artifact Shows

Every local or shadow run should produce a JSON artifact and console summary that a human can inspect.

It should show:

- source
- run time
- assets or wallets checked
- data windows
- lane summaries
- top research leads
- top watch leads
- ignored examples with failed checks
- missing data notes
- artifact path
- persistence status

The user should be able to answer:

> What data did we fetch? What filter did we apply? Why did this become or not become a lead?

If that is not visible, the collector is too abstract.

## Research Handoff

A researcher should receive leads, not raw venue dumps.

For each lead, the researcher should know:

- what changed
- why it might matter
- which entity is involved
- what facts support it
- what questions to investigate next
- what uncertainty remains
- whether this is new or an update to an existing story

The researcher can then add:

- external context
- historical background
- social or news confirmation
- prior myboon coverage
- counter-evidence
- materiality judgment
- recommended editorial decision

Only after this should the writer produce feed copy.

## Local JSON Handoff

The local-first V3 handoff is:

```text
collector
  -> collection-leads/pending/*.json
  -> researcher
  -> research-packets/*.json
  -> entity-books/*.json
  -> entity-notes/*.jsonl
```

The collector writes complete JSON files atomically. The researcher reads pending
lead batches, writes packet/book/note files, then moves the input batch to
`collection-leads/processed`. Failed batches move to `collection-leads/failed`.

On VPS, point both jobs at the same root:

```bash
V3_LOCAL_DATA_DIR=/var/lib/myboon/v3
```

This keeps the collector/researcher boundary visible while the V3 database shape
is still being designed.

## When A Source Is Ready For V3

A source is collection-ready when:

- at least one lane produces understandable leads
- leads include pass/fail checks
- raw receipts or source references exist
- thresholds are visible and tunable
- local artifacts are inspectable
- one-shot background execution works
- persistence can write to `collection_leads`
- the source documents unavailable lanes honestly

A source is research-ready when:

- researchers can consume `collection_leads`
- leads include enough questions and context to investigate
- duplicates are controlled by story keys
- prior coverage can be checked
- uncertainty is explicit

A source is feed-ready when:

- research packets exist
- editorial decisions exist
- writer output is generated from approved packets
- published output links back to evidence
- outcomes can be reviewed later

## Anti-Patterns

Avoid these:

- starting with six lanes before one lane produces useful examples
- treating source integration as finished because the API works
- making wallet tracking the whole product
- publishing weak threshold crossings
- hiding ignored candidates
- using source names as user-facing segments
- inventing historical data that was not collected
- letting the writer discover facts
- writing directly from collector to `published_narratives`

## Integration Issue Template

When starting a new market source, create an issue or doc with:

```text
Source:
Why this source matters:
Supported lanes:
Unavailable lanes:
Data inventory:
Seed inputs:
Material triggers:
Threshold config:
First artifact command:
Expected lead examples:
Persistence plan:
Research handoff:
Done when:
```

The first milestone should be:

> One lane produces leads that a human can inspect and understand.

Everything after that should build from visible examples.
