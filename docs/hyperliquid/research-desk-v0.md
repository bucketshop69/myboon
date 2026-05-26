# Hyperliquid Research Desk V0

This is the reset slice for the feed.

The product is not an asset feed. The product is a small research desk:

```txt
watched wallets
-> position snapshots
-> position-change findings
-> research briefs
-> editor decision
-> writer output
-> published_narratives
```

## What V0 Watches

V0 watches only selected Hyperliquid wallets.

Accepted beats:

- watched wallet opens a meaningful position
- watched wallet adds to an existing position
- watched wallet reduces or closes a meaningful position
- watched wallet flips direction
- funding/open-interest context supports the finding
- follow-ups happen through the same `story_key`

Explicitly excluded:

- liquidation-risk posts
- all-wallet scanning
- all-asset feeds
- leaderboards
- multi-source merging
- broad Polymarket-style narrative architecture

## Research Brief

The research output is a brief, not a post:

```txt
type:
asset:
wallet:
finding:
before:
after:
market context:
time window:
receipts:
why it may matter:
uncertainty:
suggested angle:
dedupe key:
story key:
priority hint:
```

Example:

```txt
type: wallet_position_change
asset: ETH
wallet: 0xabc...
finding: added
before: $420K short
after: $1.6M short
market context: funding positive, OI available
why it may matter: same-direction add can show conviction
uncertainty: wallet may be hedged elsewhere
suggested angle: ETH short double-down
```

Possible writer output:

```txt
ETH short got heavier.

A watched wallet increased its short from $420K to $1.6M in 35 minutes.
Not a new trade. A double-down.
```

## Mechanical Gates

Before AI sees anything, the system checks:

- wallet is active on `hyperliquid_watchlist`
- position is above minimum size
- change is meaningful enough
- before/after receipts exist when applicable
- recent duplicate story was not already published

AI editor only judges whether the approved brief is worth saying and how it should be framed.

## Runtime

Apply migration:

```bash
supabase/migrations/20260526_hyperliquid_research.sql
supabase/migrations/20260523_v3_feed_metadata.sql
```

Add watched wallets in `hyperliquid_watchlist`, or provide a comma-separated fallback:

```bash
HYPERLIQUID_WATCHLIST=0xabc...,0xdef...
```

Run:

```bash
pnpm --filter @myboon/brain intelligence:hyperliquid:research
```

Useful env vars:

```txt
HYPERLIQUID_RESEARCH_RUN_ONCE=1
HYPERLIQUID_RESEARCH_INTERVAL_MS=300000
HYPERLIQUID_MIN_POSITION_USD=100000
HYPERLIQUID_MIN_CHANGE_USD=50000
HYPERLIQUID_MIN_CHANGE_PCT=0.3
HYPERLIQUID_MAX_PUBLICATIONS=3
```

## Completion Criteria

V0 is complete when:

- a watched wallet can be loaded
- current Hyperliquid positions can be fetched
- snapshots are stored
- a meaningful position change is detected
- a research brief is created
- the editor returns publish/update/hold/ignore
- the writer creates a feed-ready post
- a row lands in `published_narratives`
- evidence refs point back to source snapshots
- rerunning does not duplicate the same recent story
