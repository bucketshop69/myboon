# VISION: myboon

## What Is myboon?

**myboon** is a mobile-first Solana market intelligence app.

It helps users understand why markets are moving, what changed, and where the
relevant action is, without forcing them to piece context together from X,
Telegram, Discord, YouTube, Instagram, dashboards, news, and trading apps.

The product starts with a feed. The feed watches market signals, turns them into
clear context, builds durable entity memory, and connects timely context to
action inside the same mobile experience.

```text
Market moves -> myboon explains what changed -> user can act from the app
```

## The Problem

Users do not lack information. They lack useful context at the right time.

Most market participants already gather information from many places:

- X and Telegram for fast reactions
- Discord groups for community chatter
- YouTube, Shorts, and Instagram for simplified narratives
- dashboards for price, volume, funding, and on-chain activity
- trading apps for execution

The issue is that this workflow is fragmented.

One surface shows that an asset is up 24 percent. Another hints that privacy
projects are moving. A dashboard shows volume or open interest. Someone on X
posts a wallet move. By the time a normal user understands why the market is
moving, the move may already be crowded or the context may be stale.

Execution is also disconnected from understanding. A user may see a narrative,
but still has to figure out which venue, asset, market, route, wallet, and app
to use next.

myboon exists to close that gap.

## The Vision

The long-term vision is a market intelligence layer for mobile crypto users.

myboon should feel like opening one app and immediately knowing:

- what moved
- why people care
- what evidence supports the story
- whether it is new, stale, crowded, or still developing
- where the related action is happening

The product should not be a generic crypto news app. It should not be a raw
dashboard. It should not be another trading terminal squeezed onto a phone.

It should be a mobile feed that turns scattered market signals into useful,
timely, evidence-backed context. Under the surface, the feed should also build a
curated memory of entities, claims, catalysts, relationships, and open questions
so future research does not start from zero.

## Starting Point

The starting point is a market intelligence feed for Solana and crypto-native
users.

The feed gathers signals from sources such as:

- prediction markets
- on-chain activity
- perps data
- wallet activity
- liquidity and volume changes
- social and news context
- scheduled catalysts and market events

Those signals are processed into research memory and, when useful now, feed
items that answer:

- what happened?
- why does it matter now?
- what changed from before?
- what are the receipts?
- what should the user watch next?
- what action surface is relevant, if any?

The first user is not "everyone." The first user is a mobile-first market
participant who already follows crypto narratives, but does not want to live
inside five different apps to understand and act on them.

## Product Shape

myboon is built around three connected surfaces.

### Feed

The feed is the main product surface.

It turns raw market movement into short, useful narratives. Each item should
have a reason to exist: a price move, odds shift, wallet action, funding change,
news catalyst, on-chain event, or developing story.

The feed should be fast, but speed alone is not the promise. The promise is
earlier context and better signal selection than a user can assemble manually.
Not every researched signal needs to become a feed item. Unpublished research
can still strengthen the entity graph that makes later feed items and agent
answers better.

### Markets And Actions

When a feed item points to something actionable, the user should be able to move
from context to action without leaving the app.

Near-term action surfaces include:

- prediction markets
- perps
- swaps
- wallet and position views

The action layer exists because the feed earns trust. Trading, swaps, and market
views are not the moat by themselves. The moat is knowing what matters and why.

### Wallet Context

Wallet context is still useful, but it is no longer the whole product.

Over time, myboon can become more personalized by understanding what a user
owns, follows, trades, or cares about. That can make alerts and feed ranking
more relevant.

This should be treated as an expansion of the market intelligence layer, not the
starting point of the product.

## Why Mobile

Crypto information often starts on social surfaces, but most users live on
their phones.

Solana also has a real mobile ecosystem forming around Seeker and mobile wallet
flows. A consumer-facing Solana product should not assume that users want to sit
at a web dashboard all day.

myboon should feel native to a phone:

- quick to open
- easy to scan
- simple to act from
- useful even when the user has only a minute

The goal is not to shrink a desktop terminal. The goal is to design the market
intelligence workflow around mobile behavior from the start.

## How The System Works

The intelligence layer should be built as a pipeline, not a single prompt.

```text
raw facts
  -> normalized signals
  -> classified events
  -> story candidates
  -> research packets
  -> entity / claim / relationship memory
  -> feed decisions
  -> published narratives
  -> outcome review
```

Each layer has a job.

- Collectors fetch and preserve facts.
- Normalization turns source-specific data into shared entities and event types.
- Scoring decides urgency, novelty, confidence, and materiality.
- Research packets gather evidence, context, claims, relationships, and open
  questions before anything is written.
- Entity memory preserves what the system learned, even when a signal is not
  publishable yet.
- Publisher agents decide what should reach the feed.
- The mobile app renders the final feed and action surfaces.

This matters because the feed should be grounded in receipts. The app can sound
simple, but the system underneath should know why a story exists.

## Current Build Direction

The current build focuses on getting from prototype to public beta.

Near-term priorities:

- improve feed quality
- add more data collectors
- strengthen AI agent and inference workflows
- make published feed items more evidence-backed
- improve the mobile experience
- connect feed items to useful action surfaces
- prepare for Seeker/mobile distribution

The initial collectors and product surfaces are already in motion. The work now
is to make the intelligence layer sharper, reduce noise, and make the app useful
enough that early users return for the feed.

## What Makes myboon Different

Most products in this space focus on one layer:

- news apps explain but do not let users act
- dashboards show data but leave interpretation to the user
- trading apps let users execute but do not explain why something is moving
- social feeds are fast but noisy
- portfolio apps show what a user owns but not what changed in the market

myboon combines the missing loop:

```text
signal -> context -> action -> position tracking
```

The core bet is that users will value a mobile product that notices important
market movement, explains it clearly, and connects it to action. The deeper moat
is the entity memory created while doing that work: a curated history of what
myboon learned about assets, protocols, venues, wallets, actors, claims, and
catalysts over time.

## Business Model

The near-term business model follows user activity.

Potential revenue paths:

- builder or affiliate revenue from prediction market actions
- swap routing or partner fees
- perps venue fee share
- premium alerts, watchlists, or feed filters
- paid market intelligence APIs in the future, powered by curated entity memory

Ads are possible later, but they should not be the core assumption. The first
business model should come from helping users act on useful market context.

## Future Expansion

Once the feed is useful and users trust it, myboon can expand into:

- personalized feed ranking based on wallet holdings and interests
- wallet-aware alerts
- deeper on-chain wallet intelligence
- multi-wallet views
- agent-to-agent or x402 intelligence APIs
- queryable entity memory for assets, protocols, venues, actors, and catalysts
- public research feeds for DAOs, teams, and market communities

These are future paths. The immediate priority is simple:

Build the best mobile market intelligence feed for Solana users.

## Success Metrics

myboon should be judged by whether the feed is useful.

Important metrics:

- feed retention: do users come back?
- feed quality: do users save, share, open, or act on items?
- action-through rate: do feed items lead to market views, swaps, trades, or
  prediction actions?
- signal accuracy: did the feed item correctly identify what changed?
- freshness: did the user see context before it became obvious everywhere?
- noise suppression: did the system avoid publishing weak or stale items?
- beta feedback: do early users describe the feed as useful without prompting?

The goal is not to publish more. The goal is to publish better.

## References

- **Repo:** <https://github.com/bucketshop69/myboon>
- **Website:** <https://www.myboon.tech/>
- **X:** <https://x.com/myboonapp>

---

*Last updated: May 27, 2026*
