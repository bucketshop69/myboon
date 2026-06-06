# Feed Source Blueprint

Status: V0 blueprint from the Polymarket markets implementation
Scope: how to add a new source to the Feed V3 pipeline

## Purpose

This document is the practical blueprint for adding a new feed source.

The Polymarket markets pipeline proved the first full V3 cycle:

```text
Data Engineer -> Researcher -> Editor -> Publisher -> published_narratives
```

Future sources should follow the same stage ownership, but not copy
Polymarket-specific details word for word. A new source may have different
APIs, metrics, helper tools, and evidence types. The common part is the
handoff discipline between stages.

## V2 To V3 Change

V2 worked because it reduced noise, but it depended too much on manually
chosen inputs like pinned wallets and watched slugs.

V3 should keep the same editorial focus while making source onboarding
repeatable:

```text
more sources -> more candidate observations -> same editorial test -> fewer,
better feed items
```

The goal is not to publish more just because the system watches more. The goal
is to find stronger evidence from more places.

## Source Onboarding Flow

Every new source should be built as one complete cycle before expanding it:

```text
1. Data Engineer
2. Researcher
3. Editor
4. Publisher
5. Final feed/API read path
```

Do not start by building every possible lane. Pick one useful lane, run it to a
published feed item, inspect the result, then expand.

## Stage 1: Data Engineer

The Data Engineer is the source filter.

Its job is to answer:

```text
What changed?
Why might it matter?
What proof do we have?
Should the Researcher look at it?
```

It should emit candidate observations, not feed items.

Minimum candidate shape:

```text
source
area
candidate_type
source_object_id / slug / url / asset / wallet / mint
title
observed_at
what_changed
why_flagged
score
score_breakdown
metrics
evidence_refs
status = pending_research
```

Source-specific examples:

- Polymarket: market slug, odds movement, volume movement, activity spike.
- Hyperliquid: asset, funding, open interest, liquidation, volume, candle move.
- Articles: URL, author/source, claims, links, publication time.
- Solana tokens: mint, pool, liquidity, holders, volume, price movement.
- Wallets: address, asset, transfer, venue, historical behavior.

The Data Engineer should not:

- run deep research
- write final copy
- decide final publish/reject
- call the Publisher
- create durable identities by default

## Stage 2: Researcher

The Researcher enriches candidate observations so the Editor can make a better
decision.

Its job is to answer:

```text
What is this really about?
What context is missing from the raw source observation?
What evidence confirms, contradicts, or weakens the signal?
What uncertainty should the Editor know?
```

Research does not always mean web search. The right tools depend on the
candidate:

- market/event candidates may need web/news/search context
- wallet candidates may need wallet history
- token candidates may need liquidity, holder, and pool context
- perp candidates may need funding/OI/venue comparison
- article candidates may need claim extraction and source reliability checks

Minimum research shape:

```text
candidate_id
source
area
source_object_id / slug / url / asset / wallet / mint
title
research_mode
summary
notes
key_findings
evidence_links
related_context
uncertainty
editor_notes
status = pending_editor
```

The Researcher should not:

- decide whether the feed should publish
- write final feed copy
- force every candidate into a narrative
- repeat recently completed research without a new delta

## Stage 3: Editor

The Editor is the judgment layer.

Its job is to answer:

```text
Should the user see this?
Is there a useful angle?
Is the evidence strong enough?
Is this new compared with recent decisions?
Does it need more research?
```

The Editor may group multiple research rows into one decision when they are
really about the same topic, event, asset, actor, or narrative.

Minimum editor decision shape:

```text
source
area
research_ids
decision = publish | reject | needs_more_research
status = pending_publisher | rejected | needs_more_research
angle
why_this_matters
reasoning
reason_codes
evidence_quality = strong | medium | weak
primary_topic
related_topics
topic_confidence
publisher_notes
follow_up_questions
research_instructions
```

The Editor should not:

- write final feed copy
- publish directly
- require a perfect identity before publishing
- auto-create identities
- force at least one publish per run

Rejected and held decisions matter. They are how the system learns what it
ignored and why.

## Stage 4: Publisher

The Publisher is the final copy layer.

Its job is to turn approved editor decisions into feed-native output:

```text
content_small
content_full
reasoning
tags
priority
actions
content_type
```

All sources should eventually write to the same final table:

```text
published_narratives
```

The Publisher should write only from approved Editor decisions and linked
research. It should not run new research or re-decide whether a story deserves
coverage.

Minimum final provenance:

```text
source
area
editor_decision_id
research_ids
primary_topic
```

Actions are source-specific but must point to inspectable objects:

```text
Polymarket -> { type: "predict", slug }
Perps      -> { type: "perps", asset }
Article    -> { type: "link", url }
Token      -> { type: "token", mint }
Wallet     -> { type: "wallet", address }
```

The Publisher should pick up the Editor's voice and dialect from the editor
brief. For V0, this can be inferred from source, area, topic, evidence quality,
angle, and publisher notes. Later, it can become an explicit shared field.

## Shared Rules

Each stage should have a clear inbox and outbox.

Each stage should be runnable independently.

Each stage should preserve reasoning, not just output.

Each stage should be safe to retry.

Each stage should update status so the next stage knows what to pick up.

Each stage should keep source-specific complexity inside that stage's adapter
instead of leaking it into the whole pipeline.

## Source-Specific Versus Shared

Source-specific:

- API clients
- raw fetch logic
- scoring math
- metrics
- evidence refs
- helper tools
- source object identifiers
- source-specific action shape

Shared:

- stage ownership
- candidate/research/editor/publisher handoff concepts
- statuses
- reasoning discipline
- editor decision values
- final `published_narratives` output
- final feed/API read path

## Current Polymarket Reference

The first reference implementation is Polymarket markets:

```text
#190 Data Engineer
#191 Researcher
#192 Editor
#193 Publisher
```

Source packet:

```text
docs/sources/polymarket-markets.md
```

Important lesson from #190:

Do not append raw snapshots forever just because data is available. The Data
Engineer should maintain useful latest state and emit meaningful candidates.

Important lesson from #191:

Research should enrich candidates without becoming the Editor.

Important lesson from #192:

The Editor can group related rows and reject aggressively. This is how more
inputs avoid becoming more noise.

Important lesson from #193:

The final output should go into the shared `published_narratives` table, with
lightweight provenance back to the editor and research rows.

## V0 Gap To Remember

FEED.md describes identity memory as the durable center of the final system.

The Polymarket V0 cycle intentionally uses provenance only:

```text
source + area + editor_decision_id + research_ids + primary_topic
```

This is enough to prove the source pipeline. Durable identity memory should be
added after the first source path is understandable and stable.

## New Source Checklist

Before implementing a new source, answer:

```text
What is the first source lane?
What raw objects does it watch?
What makes an observation candidate-worthy?
What score explains that decision?
What does the Researcher need to know?
What tools does research need?
What does the Editor receive?
What counts as publish/reject/needs_more_research?
What action should the final feed item expose?
How does the source write into published_narratives?
What should be measured after an overnight run?
```

Then build only one complete path to a published feed item.
