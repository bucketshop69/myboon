# myboon Architecture

Status: Feed V3 architecture

## Product Shape

myboon is a mobile market intelligence feed with action surfaces.

The feed is the primary product surface. Prediction markets, perps, swaps, and
wallet views exist because the feed gives users useful context and something
inspectable to act on.

## Feed V3 Pipeline

The active feed architecture is:

```text
source-specific Data Engineer
  -> candidate observations
  -> Researcher
  -> editor-ready research
  -> Editor
  -> publish/reject/needs_more_research decision
  -> Publisher
  -> published_narratives
  -> API / mobile feed
```

The first implemented source is Polymarket markets.

## Source Blueprint

Every new source should follow the same four-stage handoff:

```text
Data Engineer -> Researcher -> Editor -> Publisher
```

Each stage owns a different question:

- Data Engineer: what changed and why might it matter?
- Researcher: what context makes the editor smarter?
- Editor: should the user see this?
- Publisher: how should approved material appear in the feed?

For the full source onboarding checklist, see
[`FEED_SOURCE_BLUEPRINT.md`](FEED_SOURCE_BLUEPRINT.md).

## Current Polymarket V0

The Polymarket V0 implementation lives in:

```text
packages/collectors/src/polymarket/
```

Runners:

```bash
pnpm --dir packages/collectors polymarket:markets-data-engineer
pnpm --dir packages/collectors polymarket:researcher
pnpm --dir packages/collectors polymarket:editor
pnpm --dir packages/collectors polymarket:publisher
```

Current V0 tables:

```text
polymarket_market_watchlist
polymarket_market_candidates
polymarket_market_candidate_research
polymarket_market_editor_decisions
published_narratives
```

`published_narratives` is the shared final table for the feed.

## API Layer

`packages/api` is the Hono API server.

Feed endpoints:

```text
GET /narratives
GET /narratives/:id
```

These read from `published_narratives`.

Prediction market, perps, and wallet/action endpoints remain in the API layer
because the mobile app needs one backend surface for action data.

## Mobile App

`apps/hybrid-expo` is the mobile app.

The feed screen reads:

```text
GET /narratives
GET /narratives/:id
```

Feed items can expose actions such as:

```text
{ type: "predict", slug }
{ type: "perps", asset }
```

Future source actions can add token, wallet, article, or venue-specific action
objects while still publishing through `published_narratives`.

## Supporting Packages

`packages/shared`

Reusable source/API clients such as Polymarket and Pacific.

`packages/tx-parser`

Solana transaction parsing. Not part of the active Polymarket V0 path, but
useful for future wallet, token, and Meteora data sources.

`packages/entity-memory`

Early entity memory module. Not part of Polymarket V0 yet. Identity memory
should be integrated after the source pipeline remains understandable.

## Retired V2 Path

The old V2 path has been removed from the active repo:

```text
signals -> narratives -> brain publisher
```

V3 no longer treats `signals` as the universal source inbox or `narratives` as
the editor/publisher handoff. Each source now owns a clear Data Engineer,
Researcher, Editor, and Publisher path, ending in `published_narratives`.
