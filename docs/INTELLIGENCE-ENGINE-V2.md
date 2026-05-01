# myboon Intelligence Engine v2

Status: draft implementation design  
Issue: #123  
V1 source: Polymarket

## Why this exists

The current architecture has useful collectors and narrative agents, but the next version needs to be measurable before it becomes larger. The v2 engine should prove one narrow vertical slice before adding more perps venues, wallet data, options data, or meme coin intelligence.

The v1 goal is not “add more data”. The v1 goal is:

> replay Polymarket history, classify deterministic signals, score them, generate narrative candidates, and measure whether they beat a trivial baseline.

## Pipeline

```text
RawEvent
  → FeatureSnapshot
  → ClassifiedSignal
  → NarrativeCandidate
  → PublishedNarrative
  → NarrativeOutcome
```

LLMs are allowed at the narrative generation/editing layer only. They should not calculate funding deltas, odds movement, wallet accumulation, dedupe, freshness, or confidence math.

## V1 Polymarket source path

### Raw events

Polymarket v1 should start with raw events such as:

- market metadata snapshot
- odds/price snapshot
- volume/liquidity snapshot
- large trade / whale activity event, where available
- market resolution event

Collectors should preserve raw payloads and source trace. They should not emit “important signal” enums directly.

### Features

Feature extraction should derive deterministic fields from raw events:

- yes/no price
- odds delta over configured windows
- volume delta
- liquidity delta
- market age
- time to close
- resolution status
- source freshness

### Classified signals

Signal classification happens after features exist. V1 Polymarket signal candidates:

- `polymarket.odds_shift`
- `polymarket.volume_spike`
- `polymarket.liquidity_expansion`
- `polymarket.large_trade`
- `polymarket.resolution`

Each classification must record the rule and scoring version used.

## Schema versioning policy

Use monotonic integer versions for machine contracts:

- `schemaVersion: 1`, `2`, `3`, etc.
- `scoringVersion: 1`, `2`, `3`, etc.
- `editorVersion` for LLM narrative/editor behavior

Published narratives and outcomes are frozen with the versions used at publish time. New scoring versions can replay old raw data into new backtest runs, but historical published records should not be silently mutated.

## Success criteria policy

A narrative/outcome must store its success criteria at publish time.

Example:

```json
{
  "kind": "odds_move",
  "direction": "up",
  "targetDelta": 0.08,
  "windowHours": 24
}
```

This prevents old narratives being judged against newer threshold definitions.

## V1 scoring

V1 scoring can be hand-tuned, but it must be explicit and versioned.

Required fields:

- confidence
- urgency
- freshness
- source reliability
- signal weight
- dedupe priority
- narrative score

Initial guidance:

- confidence: likelihood the signal has follow-through
- urgency: how time-sensitive it is
- freshness: age-adjusted decay from source timestamp
- source reliability: static/source-specific score until enough outcomes exist
- signal weight: strength of the deterministic feature move
- dedupe priority: ordering when multiple candidates describe the same market
- narrative score: composite used to rank feed candidates

## Baseline

V1 must compare against at least one trivial baseline:

1. random candidate selection from the same eligible pool, or
2. largest raw odds delta over the same window

The engine should not be expanded to other sources until the Polymarket slice is compared against baseline.

## Backtest success metric

Product-complete for v1 means:

> At least one Polymarket narrative/signal type over ≥30 days shows hit rate measurably above baseline, with confidence intervals reported.

If it does not beat baseline, that is still useful. It means we should adjust scoring/thesis before adding more sources.

## Real-time semantics

For the first source path, document:

- polling vs streaming
- acceptable lag
- event ordering
- duplicate handling
- retry behavior
- backpressure behavior
- stale data handling

V1 default: polling is acceptable if timestamps and dedupe keys are stable.

## Action model dependency

Before API/action-router work, create an ADR deciding whether myboon is:

- Publisher mode: feed + alerts + deep links to venues
- Executor mode: in-app signing/execution across venues

This decision changes API shape, auth, custody/risk assumptions, and frontend flows.
