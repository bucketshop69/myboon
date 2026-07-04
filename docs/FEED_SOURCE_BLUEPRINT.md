# Feed Source Blueprint

Status: current source onboarding blueprint
Scope: how to add a new source connector to the myboon intelligence pipeline

## Purpose

This document is the practical handoff for any agent or developer adding a new
source connector.

The product shape is entity-first:

```text
source connector
  -> candidate observations
  -> source-aware researcher
  -> entity manager / entity memories
  -> editor draft
  -> publisher
  -> published_narratives / API
```

A connector should not become its own mini feed. It only finds useful signals
and passes them into the shared memory and publishing pipeline.

## Core Rule

Every source has different raw data, but every source must obey the same stage
ownership:

```text
Collector: what changed, where did it come from, why flag it?
Researcher: what context and evidence did we gather?
Entity manager: which durable entity memory should this update?
Editor draft: is there a useful narrative from recent memory?
Publisher: expose approved drafts as public narrative rows.
```

More connectors should create more candidate observations and stronger entity
memory. They should not automatically create more feed cards.

## Source Onboarding Flow

Build one complete lane before expanding the source:

```text
1. Pick the first useful signal lane.
2. Write candidate observations.
3. Run source-aware research.
4. Verify entity memory updates.
5. Verify editor drafts can be generated from those memories.
6. Verify publisher writes `published_narratives`.
7. Inspect the public API/read path.
8. Only then add more lanes, more sources, or PM2 automation.
```

Do not start by modeling every possible object from a source. Start with the
smallest lane that can produce a real memory and, eventually, a real narrative.

## Stage 1: Source Connector

The connector is the source filter.

Its job is to answer:

```text
What changed?
Why might it matter?
What proof do we have?
Which entity might this belong to?
Should the researcher look at it?
```

It emits candidate observations, not feed posts.

Minimum candidate shape:

```text
source
source_area
candidate_type
source_object_id / slug / url / asset / address / mint
observed_at
title
entity_hints
what_changed
why_flagged
score
score_breakdown
metrics
evidence_refs
raw_payload / source_context
status = pending_research
```

Examples:

```text
Polymarket -> market slug, odds move, volume move, liquidity/activity change
Hyperliquid -> asset, candle move, funding change, cross-venue context
News/site -> URL, headline, source, published time, visible text, entities
X/social -> post URL, account, text, engagement, linked entities
Wallet -> address, transfer, asset, venue, historical behavior
Token -> mint, price move, liquidity, holders, pool context
```

The connector should not:

- write final copy
- decide final publish quality
- call the publisher
- create durable entities directly
- run broad research unless that is part of source extraction

## Stage 2: Researcher

The researcher enriches candidate observations.

Its job is to answer:

```text
What is this candidate really about?
What context is missing from the raw observation?
What evidence or receipts did we find?
What should the entity manager be able to remember?
```

Research does not always mean web search. The right research depends on the
source:

```text
Polymarket -> market rules, parent event, sibling markets, source context, web context when useful
Perps -> price/funding move, venue comparison, recent catalyst search when useful
News/site -> article extraction, claim extraction, source URL, related links
X/social -> post context, author/account context, links, related discourse
Wallet -> wallet history, counterparties, prior behavior
```

Minimum research output shape:

```text
candidate_id
source
source_area
source_object_id
title
research_summary
research_notes
evidence_links
source_context
related_context
observed_entities
entity_hints
memory_candidates
raw_research_payload
status = pending_entity
```

The researcher should not:

- judge whether something deserves the feed
- write final feed copy
- create a narrative angle
- reject useful evidence because it is not publishable
- force every candidate into an entity if it is just noise

The researcher can run reflection loops to improve retrieval, but the stored
output should be research evidence and context, not verdicts.

## Stage 3: Entity Manager

The entity manager is the durable memory layer.

Its job is to answer:

```text
Which primary entity does this research belong to?
Does this update an existing entity or require a new durable entity?
What memory/timeline item should be attached to that entity?
What evidence supports this memory?
```

Entity manager output should be shaped around:

```text
entity
entity_memory
source evidence
timeline context
source/research provenance
```

The important product rule:

```text
The source is not the entity.
```

For example, a Polymarket market about Ethereum hitting $3,000 should usually
update the `ethereum` entity, not create a separate entity for that market. A
news article about Circle's Arc blockchain should update `arc` or `circle`
depending on the actual subject, not create a source-specific article entity.

The entity manager should not:

- create entities for every mention
- treat planner guesses as observed facts
- create Polymarket/news/source-specific entities when a primary entity exists
- write public feed output

## Stage 4: Editor Draft

The editor draft stage works from entity memory, not directly from source rows.

Its job is to answer:

```text
Given recent memory for this entity, is there a useful draftable narrative?
What changed compared with previous memory and previous published narratives?
What title, angle, summary, and body would be useful to a market-aware reader?
Should this become a draft, watch item, or need more research?
```

Minimum editor draft shape:

```text
entity_id
entity_slug
action = draft_post | watch | needs_more_research
status = drafted | watch | needs_more_research
title
angle
summary
body
source_memory_ids
evidence
reasoning / notes
```

The editor draft should write readable draft content. It should avoid internal
pipeline language in the user-facing body.

The editor draft should not:

- publish directly
- invent facts that are not in memory/evidence
- expose raw research rows as the public object
- require every entity update to become a draft

## Stage 5: Publisher

The publisher is deterministic and lightweight.

Its job is to turn eligible editor drafts into public narrative rows:

```text
editor_drafts(status = drafted, action = draft_post)
  -> published_narratives
  -> entity_published_history
  -> editor_drafts(status = published)
```

The publisher should not call an LLM, run new research, or re-decide the story.
It should preserve the approved draft fields and provenance.

Minimum published narrative shape:

```text
title
content_small
content_full
entity_id
entity_slug
source
source_area
actions
status = published
published_at
```

Actions are optional and source-specific, but should point to inspectable
objects:

```text
Polymarket -> { type: "predict", slug }
Perps      -> { type: "perps", asset, venue }
Article    -> { type: "link", url }
Token      -> { type: "token", mint }
Wallet     -> { type: "wallet", address }
```

## Shared Rules

Each stage should have:

```text
clear inbox
clear outbox
status transitions
retry safety
source/research provenance
bounded payloads
preview/no-write mode when useful
tests for the handoff contract
```

Keep source-specific complexity inside the connector or source researcher.
The entity manager, editor draft, publisher, and API should stay source-aware
but not source-owned.

## Source-Specific Versus Shared

Source-specific:

- API clients and scraping logic
- raw fetch/extraction method
- signal scoring
- metrics
- source object identifiers
- evidence refs
- source-specific researcher prompts/tools
- source-specific actions

Shared:

- candidate observation concept
- research packet concept
- entity memory concept
- editor draft concept
- published narrative concept
- status transitions
- provenance discipline
- final `published_narratives` output
- feed/API read path

## News / Website Connector Notes

For a news or website source, prefer structured extraction first:

```text
RSS / Atom / API / sitemap / page metadata
```

Use Playwright when the page is dynamic, gated by client rendering, or only
usable visually. Screenshot analysis can be useful for discovery, but the
connector should still preserve inspectable URLs and extracted text wherever
possible.

First candidate lane:

```text
Input: curated source URL list
Observation: new headline/article/card
Evidence: source URL, screenshot path if used, visible text, source name, timestamp
Entity hints: headline entities, tickers, protocols, venues, people, countries
Candidate trigger: new item from trusted source or repeated topic across sources
```

The news connector should not immediately become a generic crawler. Start with
a small curated list of sources and prove one complete pipeline path.

## Done Criteria For A New Connector

A connector is not done when it fetches data. It is done when one real item has
passed through the shared pipeline:

```text
1. Candidate row exists.
2. Research row exists.
3. Entity memory row exists.
4. Editor draft row exists, or a clear watch/needs_more_research row exists.
5. Published narrative row exists when the draft is publishable.
6. Public API can read the published narrative.
7. Logs show the process can run repeatedly without duplicating obvious work.
```

For overnight checks, inspect:

```text
candidate count
research success/failure count
entity memory count and entity quality
editor draft action distribution
published narrative count
duplicate or repeated entity issues
payload size / prompt size growth
```

## Agent Handoff Checklist

Before assigning an agent to a new source, give it:

```text
1. This blueprint.
2. The source-specific issue link.
3. The exact first lane to build.
4. The source URLs/API docs.
5. Existing reference connector folders.
6. Required no-write preview command.
7. Required DB smoke test.
8. Instruction not to commit or push unless explicitly asked.
```

The agent should come back with questions before implementation if the first
lane, candidate trigger, or target handoff table is unclear.
