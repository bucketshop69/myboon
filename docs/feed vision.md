# Feed Vision

Status: product direction
Scope: long-term feed identity and operating model

## Purpose

The feed is the main intelligence surface of myboon.

It should help users stay caught up with the market's live information layer: wallet moves, market repricing, liquidity changes, leverage buildup, protocol events, catalysts, and other facts that are easy to miss when they are scattered across many venues.

The product is not a raw dashboard and not a generic content feed. It is a structured intelligence feed that turns observed facts into useful, timely, evidence-backed stories.

## Product Thesis

Users do not only need more data. They need help understanding what is happening, why it may matter, and what changed since the last time they looked.

The feed should answer:

- What happened?
- Who or what is involved?
- Why is this worth noticing now?
- What evidence supports it?
- Is this a new story, an update, or noise?
- What should the user watch next?

The tone can be sharp and market-native, but the underlying system must be grounded in receipts. The feed can feel conversational, but the facts must be traceable.

## What We Are Building Toward

The long-term direction is an automated market intelligence layer.

It gathers facts from many places:

- wallet and actor behavior
- prediction markets
- perps and leverage data
- liquidity and DeFi events
- on-chain transfers, swaps, bridges, and LP activity
- protocol and governance events
- macro, sports, political, and other scheduled catalysts
- off-chain context where it can be verified or used as supporting context

These sources should not define the product. They are fact providers. The product value comes from assembling facts into coherent, useful, and timely feed items.

## What A Feed Item Should Be

A feed item should be a rendered output of a researched packet, not the place where research happens.

Before anything is published, the system should already know:

- the core claim
- the entities involved
- the observed facts
- the receipts for those facts
- the prior context
- the material change
- the confidence level
- the uncertainty
- the recommended surface: card, thread update, alert, report, or suppress

Only after that should a writer turn the packet into final user-facing language.

## Example Direction

Instead of publishing a loose statement like:

> A wallet doubled down on the long side.

The system should first assemble:

- wallet identity
- first position
- second position
- side and outcome
- first entry price
- second entry price
- current price
- market or asset
- source receipts
- time gap between actions
- whether this is actually a repeat action
- whether myboon already covered this story
- what changed enough to justify a new card or update

Then the final feed card can be short because the research packet underneath is complete.

## Responsibility Split

The feed should not rely on one component doing everything.

Recommended split:

```text
Data collectors
  fetch and preserve facts

Normalization and classification
  turn source-specific facts into shared event types

Story assembly
  group related facts into candidate stories

Research packet
  gather evidence, context, materiality, uncertainty, and actions

Editorial decision
  publish, hold, merge, suppress, or escalate

Writer
  render approved packets into feed, thread, alert, or report formats

Published output
  immutable user-facing artifact

Outcome loop
  evaluate whether the story was accurate, timely, useful, or noisy
```

## Principles

### Facts Before Language

The writer should not discover facts. The writer should only render an approved packet.

### Receipts Over Vibes

Every meaningful number, actor, market, and claim should trace back to a raw fact, source snapshot, transaction, API response, URL, or internal observation.

### Suppression Is A Feature

The system should be good at not publishing. Duplicate, stale, weakly sourced, low-liquidity, or non-material items should be held or killed.

### Threads Beat Repetition

If the same story develops, the feed should update the thread instead of publishing disconnected cards.

### Segments Are Not Sources

Sources provide facts. Segments describe why users should care.

This is a core V3 decision.

A data source is where evidence comes from:

- Polymarket
- Hyperliquid
- options markets
- on-chain data
- web research
- protocol data
- sports or macro data

A segment is the editorial meaning of the story:

- a wallet or actor did something notable
- a trade is getting crowded
- a market is repricing
- a catalyst is approaching
- a claim has receipts or contradictions
- a story resolved or failed

The same source can produce many segments. The same segment can also be built from many sources.

Examples:

- Hyperliquid wallet opens a contrarian BTC long -> Smart Money
- Hyperliquid funding becomes extreme -> Crowded Trade
- Polymarket wallet doubles down on one side -> Smart Money
- Polymarket odds move before a headline -> Receipt Check
- Options skew shifts heavily to calls -> Crowded Trade
- On-chain wallet accumulates a token -> Smart Money

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

### Published Output Is The Final Step

`published_narratives` should be the broadcast artifact. It should not be responsible for research, clustering, verification, or editorial decision-making.

## What Success Looks Like

The feed succeeds when users feel:

- they are caught up quickly
- important market activity is not slipping past them
- each card has a reason to exist
- the system remembers prior coverage
- updates feel connected rather than repetitive
- facts are easy to verify
- the product noticed something useful before they had to search for it

The target feeling is:

> Someone useful noticed this for me, gathered the receipts, and told me why it matters.
