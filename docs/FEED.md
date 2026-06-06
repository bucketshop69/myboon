# myboon Feed

Status: foundation note (polymarket V0 pipeline: data-engineer + researcher + editor + publisher implemented)
Scope: source-agnostic design for the myboon feed

## What The Feed Is

The myboon feed is a 24-hour market intelligence channel.

It watches many sources, connects observations to durable market identities,
researches what changed, applies an editorial test, and publishes only when
there is something useful for the user.

The feed is not a raw data stream, a generic news app, or a collection of
source-specific feeds. It should help a serious market participant notice
something earlier or more clearly, then connect that context to something they
can inspect or act on.

## Core Principle

V3 should scale inputs without scaling noise.

More sources should create more candidate observations. They should not
automatically create more feed cards. A source can help the feed only when it
can produce useful evidence for a known identity and pass the editorial test.

## Mental Model

Think of the system like a live newsroom:

```text
source filters      -> field producers / assignment desk
identity memory     -> beat files
research            -> context production
editor              -> newsroom judgment
publisher           -> final script
feed                -> broadcast
```

The system is always asking:

```text
Is there something worth publishing here?
```

## Pipeline

The default feed path is:

```text
source-specific data filter
  -> candidate observation
  -> known identity match
  -> research and enrichment
  -> editor decision
  -> publisher
  -> published feed item
  -> memory update
```

Each source has its own filtering playbook, but every source emits the same
kind of candidate observation.

## Candidate Observation

A candidate observation is the shared object emitted by any source-specific
filter. It is not a feed item.

Minimum shape:

```text
source
observedAt
candidateType
identityHints
whatChanged
whyFlagged
evidence / receipts
metrics
freshness
uncertainty
```

The data filter's job is to say:

```text
This changed. It may matter. Here is the proof. Here are the identities it may
belong to.
```

It should not write final copy or decide that something is publishable.

## Identity Memory

The durable center of the feed is the identity book.

An identity is any subject we may want to ask:

```text
What did we already know, what changed now, and does this change matter?
```

Examples of identities:

- BTC
- Gold
- a meme coin
- a wallet
- a protocol
- a venue
- a liquidity pool
- a sports event
- a recurring market theme

Not every candidate becomes an identity. In the normal feed pipeline, if a
candidate cannot attach to a known identity, it is skipped.

New identity creation is a separate helper workflow, not part of the default
feed path.

## Identity Maturity

Identity maturity controls research depth and publish threshold.

```text
canonical identity
  -> lower research burden, still needs a fresh material change

watched identity
  -> medium research burden, needs useful delta against memory

emerging identity
  -> higher research burden, needs proof that it is real and not noise

rejected or noisy identity
  -> normally suppressed unless something extraordinary changes
```

The more the pipeline runs, the stronger the identity books become. Mature
identities should support faster and better decisions because the researcher can
compare new evidence against prior memory instead of starting from zero.

## Research

Research means:

```text
Given this candidate and identity, what extra context would make the editor
smarter?
```

Research does not always mean web search.

For a large asset move, research may check recent news, prior identity memory,
market structure, and cross-source context. For a wallet move, research may
focus on wallet history and prior behavior. For a meme coin, research may focus
on liquidity, holders, prior cycles, and risk flags.

Research should enrich the candidate. It should not decide final feed quality.

## Editorial Test

The editor decides whether something belongs in the feed.

The core editorial priority is:

```text
1. Help a serious market participant notice something earlier or more clearly.
2. Connect the user to something inspectable or actionable.
3. Add personality only after the evidence is strong.
```

Every editor decision should include both human-readable reasoning and
structured reason codes.

Example reason codes:

```text
duplicate
weak_evidence
stale
not_material
low_liquidity
untrusted_source
already_covered
needs_more_research
no_clear_feed_value
```

Rejected and held decisions are part of the intelligence. They should update
memory so the system learns what was ignored and why.

## Publishing

The feed publishes as soon as the automated pipeline has enough evidence,
research context, and editor approval.

Publishing is not delayed for a daily batch.

Minimum publish contract:

```text
known primary identity
concrete change
strong enough evidence / receipts
editor approval
```

The publisher writes from the approved researched brief. It should not invent
new facts, claims, motives, or actions.

## Helper Tools

Many capabilities will sit around the pipeline as helper tools.

Examples:

- identity creation
- wallet profiling
- wallet history
- web search
- article scraping
- X/source scraping
- sports and calendar context
- token and pool research
- dedupe checks
- source reliability checks

Tools can be used wherever they help. They are not the pipeline by themselves.
The final feed decision still belongs to the editor stage.

## Build Approach

The rebuild should start from documentation and then proceed one source at a
time.

For each source, take one complete cycle to publish:

```text
source filter
  -> candidate observation
  -> identity match
  -> research
  -> editor decision
  -> publisher
  -> feed item
  -> memory update
```

The first goal is not to add every source at once. The first goal is to prove
that the foundation stays understandable while each new source plugs into the
same feed design.
