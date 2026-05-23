# V3 Polymarket Source Blueprint

Status: source blueprint
Milestone: V3 Feed Intelligence
Related issue: #181

## Purpose

Polymarket is the first source that should run end-to-end through the V3 feed pipeline.

The goal is not to make a better Polymarket-only analyst. The goal is to define how one source becomes a reusable template for future sources.

```text
source facts
  -> normalized facts
  -> classified events
  -> story candidates
  -> research packets
  -> editorial decisions
  -> writer output
  -> published narratives
  -> outcomes
```

Polymarket is an evidence origin. It is not a user-facing segment. A Polymarket fact can become Smart Money, Breaking Tape, Receipt Check, Catalyst Watch, Market Autopsy, Thread Update, or another segment depending on what the fact means.

## Current Inputs

The current Polymarket system starts from:

- `packages/collectors/src/polymarket/pinned.json`
- top-volume market discovery in `discovery.ts`
- fixed tracked wallets in `tracked-users.json`
- sports calendar watch windows in `match-watcher.ts`
- markets already persisted in `polymarket_tracked`
- WebSocket odds changes in `stream.ts`

These are useful seeds, but they should not define the whole V3 universe.

## Seeds Versus Material Triggers

Seeds expand or maintain the watch universe. They should not publish by default.

Material triggers mean something changed. They may become classified events, story candidates, packets, thread updates, or suppressions.

| Trigger | Type | Raw Facts | Normalized Facts | Classified Events | Possible Segments | Current / Gap |
| --- | --- | --- | --- | --- | --- | --- |
| Curated pinned slug/event | Seed | market metadata, outcome list, end date, current odds, volume | `market.snapshot`, `odds.snapshot` | none by default; optional internal `market.watch_started` | none by default; later Catalyst Watch if near deadline | Current: `pinned.json`, `discovery.ts`. Gap: seed reason/category/priority. |
| Top-volume market discovery | Seed | market metadata, volume, odds, token ids | `market.snapshot`, `odds.snapshot` | optional internal `market.discovery` | none unless paired with movement | Current: `discovery.ts`. Gap: distinguish tracking seed from publishable discovery. |
| Tracked wallet list | Seed | wallet address, label, historical stats | `wallet.profile` | none by default | Smart Money only after action | Current: `tracked-users.json`, `user-tracker.ts`. Gap: label provenance, durable cursor. |
| Sports fixture watch window | Seed unless paired with action or deadline | fixture, kickoff, slugs, watch window | `event.schedule`, `market.snapshot` | internal `catalyst.upcoming` only when surfaced intentionally | Catalyst Watch only when material | Current: `match-watcher.ts`, sports calendar. Gap: fixture entity model. |
| New market appears | Seed unless paired with topicality, liquidity, or fast activity | market metadata, volume, odds | `market.snapshot`, `odds.snapshot` | internal `market.new_listing` or suppress | Catalyst Watch, Breaking Tape only when topical/liquid | Current: `MARKET_DISCOVERED`. Gap: default should often suppress. |
| Odds move beyond threshold | Material | odds before/after, observed time, market id, slug | `odds.snapshot` | `odds.repricing` | Breaking Tape, Receipt Check, Thread Update | Current: `ODDS_SHIFT` in `stream.ts`. Gap: durable raw odds snapshots, liquidity context. |
| Volume surge | Material | current volume, baseline, delta | `volume.snapshot` | `volume.spike` | Breaking Tape, Crowded Trade, Catalyst Watch | Current: `VOLUME_SURGE` in `discovery.ts`. Gap: better baseline windows. |
| Liquidity change / thinning | Material | order book depth, spread, depth bands | `liquidity.snapshot` | `liquidity.thinning`, `liquidity.expansion` | Crowded Trade, Receipt Check | Gap: not collected beyond best bid/ask. |
| Large tracked-wallet bet | Material | wallet, market, side, outcome, amount, trade price, timestamp | `wallet.trade` | `flow.large_position` | Smart Money, Receipt Check, Thread Update | Current: `WHALE_BET` in `user-tracker.ts`. Gap: raw trade fact, durable cursor. |
| Large untracked sports-market bet | Material | wallet, fixture market, side, outcome, amount, timestamp | `wallet.trade`, `event.schedule` | `flow.large_position`, `sports.live_repricing` when paired with odds movement | Smart Money, Breaking Tape, Catalyst Watch | Current: `match-watcher.ts`. Gap: wallet identity confidence. |
| Repeat wallet action | Material, derived | multiple large trade facts for same wallet/market/outcome | `wallet.trade` group | `wallet.repeat_action`, `flow.accumulation` | Smart Money, Thread Update | Partial: whale signals exist. Gap: explicit repeat classifier and story key. |
| Same-market multi-wallet pile-in | Material, derived | multiple trade facts, wallet count, volume by side/outcome | `wallet.trade` group | `flow.crowding`, `flow.accumulation` | Crowded Trade, Breaking Tape | Gap: aggregation layer. |
| Market closing soon | Material only with liquidity/topic context | end date, current odds, volume, unresolved status | `event.schedule`, `market.snapshot`, `odds.snapshot` | `catalyst.deadline_approaching` | Catalyst Watch | Current: `MARKET_CLOSING` in `discovery.ts`. Gap: suppress stale/low-volume markets. |
| Market resolution | Material | resolved outcome, final status, prior packets/signals | `market.resolution` | `market.resolution` | Market Autopsy, Thread Update, Receipt Check | Partial: resolution processing updates wallet stats. Gap: explicit raw resolution event. |
| Odds move around external catalyst | Material, cross-source | odds repricing plus URL/headline/schedule fact | `odds.snapshot`, external `catalyst.fact` | `news.catalyst_reaction`, `cross_source.confirmation`, `cross_source.contradiction` | Receipt Check, Breaking Tape | Gap: external evidence source is not wired yet. |

## Preferred V3 Event Names

Legacy names may remain as compatibility inputs, but V3 should classify into source-neutral event names where possible.

Preferred event names:

- `market.watch_started`
- `market.discovery`
- `market.new_listing`
- `odds.repricing`
- `volume.spike`
- `liquidity.thinning`
- `liquidity.expansion`
- `flow.large_position`
- `flow.accumulation`
- `wallet.repeat_action`
- `flow.crowding`
- `catalyst.upcoming`
- `catalyst.deadline_approaching`
- `market.resolution`
- `sports.live_repricing`
- `news.catalyst_reaction`
- `cross_source.confirmation`
- `cross_source.contradiction`

Legacy compatibility names:

- `MARKET_DISCOVERED`
- `ODDS_SHIFT`
- `WHALE_BET`
- `VOLUME_SURGE`
- `MARKET_CLOSING`

## First Implementation Slice

The first V3 slice should be wallet repeat / double-down behavior.

```text
legacy WHALE_BET / future RawFact
  -> normalized wallet trade fact
  -> deterministic repeat-action features
  -> wallet.repeat_action classified event
  -> story candidate keyed by wallet + market + outcome + direction
  -> ResearchPacket
  -> EditorialDecision
  -> writer
  -> published_narratives
```

Candidate story key:

```text
polymarket:wallet-repeat:{wallet}:{conditionId-or-slug}:{outcome}:{direction}
```

This slice is narrow enough to test, but it exercises the whole V3 responsibility split:

- seeds start research
- adjacent facts are gathered
- repeat action is deterministic
- packet is assembled before writing
- suppress/hold/update/publish are explicit
- writer is constrained to the packet

## Polymarket Decision Matrix

Material triggers are not automatically publishable. They move into story assembly, then an editorial decision chooses the surface.

| Trigger Family | Default Decision | Publish Conditions | Hold Conditions | Suppress Conditions | Thread / Update Conditions |
| --- | --- | --- | --- | --- | --- |
| Curated/top market seed | hold as watch context | only if paired with material odds, volume, liquidity, lifecycle, or actor movement | no material change yet | expired, illiquid, irrelevant, duplicate seed | becomes context for future thread |
| Odds repricing | hold or publish candidate | fresh, liquid enough, meaningful delta, receipt-backed before/after odds | missing liquidity or story context | stale, tiny move, noisy market, duplicate | same story key with new material move |
| Wallet large position | hold or publish candidate | amount/risk-adjusted size is meaningful, market resolves, receipt-backed wallet/market/side | missing slug, market snapshot, or odds context | low amount, penny-pickup, noisy market, stale | same wallet/market/side adds or exits materially |
| Repeat wallet action | publish candidate | same wallet/market/outcome repeats inside window with material size or odds context | missing one receipt or odds context | duplicate/no material delta, stale, weak source trace | further material trade becomes thread update |
| Volume / liquidity change | hold or publish candidate | large delta versus baseline and useful market context | baseline unclear | low liquidity, bad baseline, duplicate | worsening/reversal becomes thread update |
| Deadline / lifecycle | hold or publish candidate | approaching resolution with meaningful market activity or prior thread | no user-relevant angle yet | stale, low-volume, already covered | resolution or major odds move updates thread |
| Resolution | publish candidate or update | resolves a prior story, surprising outcome, or closes a watched market | missing prior context | irrelevant low-signal market | closes thread or publishes autopsy |

`update` is a first-class editorial decision when a packet belongs to an existing thread and contains a material change. `merge` is reserved for combining packets before publication.

For wallet-repeat threads, materiality must be evaluated against the prior thread coverage window, not against every fact in the replayed packet. The implementation should carry a `coveredThrough` / `materialChangeAfter` timestamp for each story key. Facts observed at or before that timestamp are context; facts after it decide whether the packet becomes an `update` or is suppressed as already covered.

## Shadow Replay

The wallet-repeat slice can run without publishing:

```bash
pnpm --filter @myboon/brain intelligence:polymarket:wallet-repeat-shadow
```

This command reads legacy `WHALE_BET` and `ODDS_SHIFT` rows, builds V3 `ResearchPacket` objects, applies editorial decisions, evaluates odds follow-through from frozen success criteria, and writes an artifact under `packages/brain/artifacts/intelligence-backtests/` unless `POLYMARKET_WALLET_REPEAT_SHADOW_OUTPUT` is set.

For repeatable CLI artifacts, set `POLYMARKET_WALLET_REPEAT_REPLAY_NOW`. If it is not set, the command uses the latest fetched signal timestamp as the replay clock so the same fetched rows produce the same replay key.

Shadow replay is intentionally read-only. It does not call the writer, insert into `published_narratives`, or mutate legacy `signals`.

## Fresh V3 Live Path

The first product pipeline now runs from fresh collector output to the feed:

```bash
pnpm --filter @myboon/collectors start
pnpm --filter @myboon/brain intelligence:polymarket:v3-live
```

Flow:

```txt
fresh Polymarket collectors
-> unprocessed POLYMARKET WHALE_BET / ODDS_SHIFT signals
-> wallet-repeat ResearchPacket
-> EditorialDecision publish/update/hold/suppress
-> packet-backed writer
-> narratives row
-> published_narratives row
-> signals marked processed
```

The live runner is `packages/brain/src/run-polymarket-v3-live.ts`. The testable core is `packages/brain/src/intelligence/v3/polymarket-live-pipeline.ts`.

Important runtime controls:

- `POLYMARKET_V3_LIVE_RUN_ONCE=1` runs a single pass.
- `POLYMARKET_V3_LIVE_LOOKBACK_HOURS=24` controls the fresh signal window.
- `POLYMARKET_V3_LIVE_LIMIT=500` caps signals per pass.
- `POLYMARKET_V3_LIVE_MAX_PUBLICATIONS=3` caps feed writes per pass.
- `POLYMARKET_V3_LIVE_INCLUDE_PROCESSED=0` restricts context to unprocessed signals only. Default is to include processed recent signals so repeat/update detection can use the prior trades in the lookback window.
- `POLYMARKET_V3_LIVE_MARK_PROCESSED=0` leaves consumed signals unprocessed for inspection.

V3 feed rows use `published_narratives.packet_id`, `story_key`, `story_candidate_id`, and `evidence_refs` when migration `supabase/migrations/20260523_v3_feed_metadata.sql` has been applied. The runner falls back to legacy `published_narratives` columns if those metadata columns are not present, but duplicate/thread detection is weaker without `story_key`.

## Current Gaps To Address Later

- collectors still write legacy `signals`, now used as the compatibility intake for V3 live
- no durable raw fact table
- in-memory cursors in `user-tracker.ts` and `match-watcher.ts`
- no liquidity depth snapshots
- no external research source for catalyst confirmation
- repeat-action is the first V3 live vertical slice; broader Polymarket trigger families still need their own classifiers and story keys
- wallet-repeat thread rules exist for the first slice; cross-archetype thread policy still needs to be generalized

## Reusable Source Blueprint

Future sources should start from the shared template, then use this Polymarket file as the completed example:

- [`docs/v3-source-blueprint-template.md`](v3-source-blueprint-template.md)
