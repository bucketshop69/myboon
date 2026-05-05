# myboon Intelligence Engine v2

Status: implementation vertical slice / validation pass
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

Runtime validation lives in `packages/brain/src/intelligence/schemas.ts`. Backtest artifacts validate `BacktestRunSummary` and `NarrativeOutcome` before writing JSON, so schema drift fails fast instead of silently corrupting evidence. Durable outcome row mapping lives in `packages/brain/src/intelligence/outcomes.ts` and targets the `narrative_outcomes` table added by migration `037-intelligence-v2-metadata.sql`.

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

Concrete Polymarket v1 semantics:

| Source path | Mode | Interval / lag | Ordering key | Dedupe key | Retry / backpressure | Stale handling | Cursor state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ODDS_SHIFT` legacy replay | Supabase historical replay | Backtest query window; no realtime promise | `signals.created_at` asc per slug | legacy signal `id` | paged reads, bounded by `POLYMARKET_BACKTEST_MAX_ROWS` | candidates without a full evaluation window become inconclusive/excluded | query window + artifact params |
| `WHALE_BET` user tracker | Polling | `POLL_INTERVAL_MS` currently 5m; acceptable lag <= one poll + API latency | `metadata.activityTimestamp` preferred, DB `created_at` fallback | future raw-event key should include source, wallet, condition/slug, timestamp, side, outcome, amount | sequential per tracked wallet; fetch/insert errors logged and next poll retries | backtest excludes bets without elapsed evaluation window; realtime should skip/flag stale activity outside watch window | current in-memory `lastSeen`, needs durable cursor before scale-out |
| `WHALE_BET` match watcher | Polling during match watch window | 5m loop while fixture is in watch window | trade `timestamp` per condition/slug | future raw-event key should include source, condition, trade id/timestamp, side, outcome, amount | sequential fixture loop; fetch/insert errors logged and next poll retries | watch-window bounded; future classifier should emit stale/illiquid warning instead of narrating old trades | current in-memory `lastSeen`, needs durable cursor before multi-process deployment |

Prod note: current collectors still write legacy `signals` rows directly. For #123 this is documented as proxy mode; before horizontal scaling, collectors should persist `RawEvent` rows with durable cursor/upsert semantics, then classify into signals from that auditable raw layer.

## Action model decision

ADR: [`docs/adr/0001-publisher-vs-executor.md`](adr/0001-publisher-vs-executor.md)

Decision: **publisher mode** for Intelligence Engine v2. V1 actions are feed/alert/deep-link actions only. No in-app execution, signing, custody, or order routing belongs in this validation slice. Executor mode requires a separate accepted ADR after the Polymarket signal quality gate is proven.

## Current v1 backtest scaffold

Implemented first vertical slice:

- source: existing Supabase `signals` rows where `source = POLYMARKET` and `type = ODDS_SHIFT`
- classifier: converts legacy odds-shift rows into `ClassifiedSignal`
- evaluator: checks whether odds continue in the same direction by the publish-time threshold within the configured window
- baseline: largest raw odds delta over the same candidate pool
- runner: `pnpm --filter @myboon/brain intelligence:polymarket:backtest`
- artifacts: each run writes full params, summary, selected outcomes, baseline outcomes, and examples to `packages/brain/artifacts/intelligence-backtests/*.json`
- override artifact path with `POLYMARKET_BACKTEST_OUTPUT=/path/to/result.json`

Default criteria:

- continuation delta: `0.03`
- window: `24h`
- selected set: top `30%` by v1 confidence score
- max rows: `5000` unless `POLYMARKET_BACKTEST_MAX_ROWS` is set

Latest acceptance ODDS_SHIFT run used `POLYMARKET_BACKTEST_DAYS=35 POLYMARKET_BACKTEST_MAX_ROWS=100000`. It processed 50,908 raw rows and produced 50,423 conclusive candidates over an actual 32.80-day candidate window. Selected hit rate was 68.47% vs 50.33% largest-raw-delta baseline, with 95% Wilson interval 67.72%-69.20%. Artifact: `packages/brain/artifacts/intelligence-backtests/backtest-polymarket.odds_shift-1777891475535.json`.

## Current whale/user backtest scaffold

Implemented second proxy slice:

- source: existing Supabase `signals` rows where `source = POLYMARKET` and `type = WHALE_BET`
- classifier: converts user-tracker and match-watcher rows into `polymarket.large_trade` classified signals
- direction: BUY YES / SELL NO => up; BUY NO / SELL YES => down; non-YES/NO sports/outcome slugs are treated as outcome-specific YES markets
- evaluator: checks whether the slug's YES odds continue in the inferred direction within the configured window
- baseline: largest trade amount over the same conclusive candidate pool
- runner: `pnpm --filter @myboon/brain intelligence:polymarket:whale-backtest`

Latest acceptance WHALE_BET proxy run used `POLYMARKET_BACKTEST_DAYS=35 POLYMARKET_WHALE_BACKTEST_MAX_ROWS=50000 POLYMARKET_BACKTEST_MAX_ODDS_ROWS=100000`. It processed 50,000 whale rows and 50,923 odds rows, produced 1,293 conclusive candidates over an actual 30.02-day candidate window, and scored 66.67% selected hit rate vs 55.56% largest-trade baseline, with 95% Wilson interval 53.36%-77.76%. Artifact: `packages/brain/artifacts/intelligence-backtests/backtest-polymarket.whale_bet-1777891560255.json`.

Important caveat: historical WHALE_BET rows mostly used DB `created_at` as the bet time, not the Polymarket activity timestamp, so this is not final proof. The collectors now persist `metadata.activityTimestamp` for future WHALE_BET rows; the backtest prefers that timestamp when present.

Both current slices are still proxy backtests: they use existing event signals rather than durable raw market/trade snapshots and evaluate continuation, not final market resolution. However, #123 now has a measured >=30d Polymarket vertical slice that beats baseline with Wilson confidence intervals, plus a second whale/user proxy slice that also beats baseline over >=30d after timestamp fixes.
