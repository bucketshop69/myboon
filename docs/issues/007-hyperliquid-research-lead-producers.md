# #007 - Hyperliquid Research Lead Producers

## Problem

V3 feed work has been mixing two different goals: detecting interesting market activity and publishing final feed narratives. This makes the system hard to reason about because early signal lanes are judged by whether they produce polished feed items, when their first job should be to produce research leads.

The current Hyperliquid work has useful detector pieces:

- funding pressure detection
- volume spike detection
- watchlist wallet replay
- OI expansion detection
- price + OI divergence detection
- cross-signal story combination

But these pieces do not yet share one clear output shape that says:

```text
Something changed here.
This is why it may be worth researching.
These are the receipts and metrics.
These are the questions the next research layer should answer.
```

Without that lead-producing layer, the pipeline jumps too quickly from raw market data to would-be feed content. The result is technically working code that can still feel abstract, backend-heavy, or content-poor.

## Goal

1. Define a shared Hyperliquid `ResearchLead` contract that all six lanes can emit.
2. Convert each available Hyperliquid lane into a lead producer that can output `research`, `watch`, or `ignore` leads with concrete metrics and failed checks.
3. Produce a local artifact that a researcher or writer can inspect to decide what assets deserve follow-up research before any feed publication is attempted.

## Dependencies

- None (standalone)

## Scope

- `packages/brain/src/intelligence/hyperliquid/research-leads.ts` - add shared lead types, helpers, ranking, and artifact contracts.
- `packages/brain/src/intelligence/hyperliquid/signals/volume-spike.ts` - preserve detector behavior and expose enough metrics for volume research leads.
- `packages/brain/src/intelligence/hyperliquid/signals/funding-pressure.ts` - preserve detector behavior and expose enough metrics for funding research leads.
- `packages/brain/src/intelligence/hyperliquid/signals/watchlist-wallet.ts` - map wallet findings into supporting research leads instead of treating them as standalone feed items by default.
- `packages/brain/src/intelligence/hyperliquid/wallet-profile.ts` - profile Hyperliquid wallets before trusting wallet activity as a lead source.
- `packages/brain/config/hyperliquid-wallet-watchlist.json` - keep manual, leaderboard, and deposit-sourced wallet entries separate.
- `packages/brain/src/run-hyperliquid-wallet-profiles.ts` - emit local wallet-quality artifacts before wallet leads are produced.
- `packages/brain/src/run-hyperliquid-wallet-behavior.ts` - analyze one wallet or the local wallet list and emit wallet behavior research leads.
- `packages/brain/src/intelligence/hyperliquid/signals/oi-expansion.ts` - map OI findings into research leads when historical OI input is available.
- `packages/brain/src/intelligence/hyperliquid/signals/price-oi-divergence.ts` - map price/OI divergence findings into research leads when historical OI input is available.
- `packages/brain/src/intelligence/hyperliquid/signals/cross-signal-story.ts` - use normalized leads as input for asset-level synthesis after individual lanes work.
- `packages/brain/src/run-hyperliquid-funding-volume-explore.ts` - evolve or replace this exploration runner so it emits ranked research leads, not only funding/volume diagnostics.
- `packages/brain/src/run-hyperliquid-signal-backtest.ts` - keep the six-lane backtest, but make its output explain lead production separately from publishable stories.
- `packages/brain/src/intelligence/hyperliquid/research-leads.test.ts` - add focused tests for lead ranking, statuses, required fields, and lane mappings.
- `docs/issues/007-hyperliquid-research-lead-producers.md` - document this implementation issue.

## Changes

### 1. Add a shared ResearchLead contract

Create `packages/brain/src/intelligence/hyperliquid/research-leads.ts`.

The lead object should be the first stable output of the six-lane system:

```ts
export type HyperliquidResearchLeadLane =
  | 'volume_spike'
  | 'funding_pressure'
  | 'oi_expansion'
  | 'price_oi_divergence'
  | 'watchlist_wallet'
  | 'cross_signal'

export type HyperliquidResearchLeadStatus = 'research' | 'watch' | 'ignore'

export interface HyperliquidResearchLeadCheck {
  name: string
  passed: boolean
  value: string
  threshold: string
}

export interface HyperliquidResearchLeadReceipt {
  source: 'hyperliquid' | 'the_graph_token_api' | 'internal'
  sourceId: string
  capturedAt: string
  rawRef?: string
}

export interface HyperliquidResearchLead {
  id: string
  asset: string
  lane: HyperliquidResearchLeadLane
  status: HyperliquidResearchLeadStatus
  priority: number
  observedAt: string
  storyKey: string
  headline: string
  whatChanged: string
  whyInteresting: string
  suggestedResearchQuestions: string[]
  metrics: Record<string, number | string | boolean | null>
  checks: HyperliquidResearchLeadCheck[]
  receipts: HyperliquidResearchLeadReceipt[]
  uncertainty: string[]
  supportingLeadIds: string[]
}
```

Rules:

- `research` means a human or downstream research layer should inspect this now.
- `watch` means useful context, but not enough yet.
- `ignore` means the lane ran and found no useful lead.
- `headline`, `whatChanged`, and `whyInteresting` must be readable without opening code.
- `suggestedResearchQuestions` should guide the next layer, not pretend to be the final story.

### 2. Build the six lane producers

Each lane should become a function that returns `HyperliquidResearchLead[]`.

Use this shape:

```ts
export function buildHyperliquidVolumeResearchLeads(input: {
  asset: string
  candles: HyperliquidCandle[]
  now: string
  windows: number[]
  thresholds: VolumeLeadThresholds
}): HyperliquidResearchLead[]
```

Create equivalent lead builders for:

1. `volume_spike`
2. `funding_pressure`
3. `oi_expansion`
4. `price_oi_divergence`
5. `watchlist_wallet`
6. `cross_signal`

Expected lane behavior:

- Volume should answer: "Where is attention suddenly showing up?"
- Funding should answer: "Is one side paying enough to suggest crowding?"
- OI should answer: "Is leverage building?"
- Price/OI divergence should answer: "Are price and positioning disagreeing?"
- Wallet should answer: "Are watched actors adding useful context?"
- Cross-signal should answer: "Do multiple leads point to the same asset or thesis?"

### 3. Make lead output research-friendly

The runner output should be designed for a researcher or writer to inspect.

For an asset like NEAR, the output should read like:

```json
{
  "asset": "NEAR",
  "lane": "volume_spike",
  "status": "research",
  "headline": "NEAR volume spike: 5.34x baseline, price down 8%",
  "whatChanged": "Latest daily volume was $175.2M versus a $32.8M 30-day baseline.",
  "whyInteresting": "Large volume with a sharp price drop suggests attention, unwind, liquidation, catalyst reaction, or sector rotation.",
  "suggestedResearchQuestions": [
    "Did funding flip or become extreme during the move?",
    "Did OI rise or fall during the selloff?",
    "Are large wallets shorting NEAR or buying the dip?",
    "Is there NEAR ecosystem news or social attention explaining the move?"
  ]
}
```

This output is not a feed item. It is a lead for research.

### 4. Separate lead production from publication

Keep the final feed pipeline separate:

```text
raw Hyperliquid data
-> lane-specific research leads
-> asset-level lead synthesis
-> research packet
-> editorial decision
-> writer
-> published_narratives
```

Do not write these leads to `published_narratives`.

The first artifact should be local JSON under:

```text
packages/brain/artifacts/hyperliquid-signals/
```

The artifact should include:

```ts
export interface HyperliquidResearchLeadArtifact {
  kind: 'hyperliquid.research-leads'
  generatedAt: string
  assets: string[]
  windows: number[]
  leads: HyperliquidResearchLead[]
  laneSummaries: Record<HyperliquidResearchLeadLane, {
    research: number
    watch: number
    ignore: number
  }>
}
```

### 5. Keep OI lanes honest about missing data

OI expansion and price/OI divergence are important, but they require historical OI.

If historical OI is not configured, the lane should emit an explicit `ignore` or `watch` diagnostic lead such as:

```text
Historical OI unavailable for NEAR, so OI expansion could not be evaluated.
```

Do not silently produce zero without explaining why.

### 6. Make cross-signal synthesis wait for useful leads

Cross-signal should not try to invent a story from empty or weak inputs.

It should only synthesize when at least two useful leads exist for the same asset, for example:

```text
NEAR has both a volume spike and funding pressure watch.
Research question: is this a crowded selloff or a spot-driven repricing?
```

For now, cross-signal output can remain a research lead. It does not need to become a `ResearchPacket` or feed card in this issue.

### 7. Add wallet-source and wallet-quality checks

Wallets should enter the Hyperliquid system through explicit sources:

1. Manual watchlist wallets supplied by us.
2. Public leaderboard wallets, when enabled for exploration.
3. Deposit-sourced wallets, once a large-deposit source adapter exists.

These sources should not be mixed with Polymarket/Supabase wallet lists.

Before wallet behavior becomes a research lead, run a wallet profile step that answers:

```text
Is this wallet directional enough to trust, or is it a market-maker/noisy/managed account?
```

Current wallet quality checks include:

- current long/short exposure
- assets traded
- fills per day
- fill-window volume
- volume-to-equity ratio when leaderboard data exists
- round-trip/churn share
- small-fill share
- maker-style fill share when `crossed` is available
- directional concentration
- Hyperliquid `userRole`
- large deposit count/value for known wallets

Large deposit watch threshold starts at:

```text
$500,000
```

Important limitation: official Hyperliquid wallet APIs can check ledger/deposit activity for a known wallet, but global discovery of unknown large depositors needs a separate source adapter.

### 8. Add isolated wallet behavior analysis

Wallet behavior should be callable for one address at a time:

```bash
pnpm --filter @myboon/brain intelligence:hyperliquid:wallet-behavior -- 0x...
```

The behavior layer should:

1. Fetch `userFillsByTime`, current `clearinghouseState`, ledger updates, and `userRole`.
2. Build the wallet quality profile first.
3. Group fills by asset over the lookback window.
4. Calculate net directional flow, gross flow, current exposure, fill count, and open/close long/short volume.
5. Emit `watchlist_wallet` research leads only when the wallet is directional enough to trust.
6. Keep noisy, managed, or low-confidence wallets visible as ignored/context leads instead of promoting them.

Example output from the first local run:

```text
watchlist_wallet:
  research: 6
  watch: 9
  ignore: 10

Top lead:
BTC wallet behavior: 0x92ea...50e9 adding to / building long exposure
0x92ea...50e9 had $96.5M net long-side flow and $96.5M gross BTC fill volume over 14d.
Current BTC exposure is long $93.2M.
```

The behavior layer is still a lead producer, not a story writer. Its output should help a researcher decide which asset/wallet pair deserves investigation.

## Acceptance Criteria

- [ ] A shared `HyperliquidResearchLead` contract exists and is used by Hyperliquid lead-producing code.
- [ ] The runner can emit ranked research leads for all six lanes: volume, funding, OI, price/OI divergence, wallet, and cross-signal.
- [ ] Lead output clearly distinguishes `research`, `watch`, and `ignore`.
- [ ] Every non-empty lead includes `headline`, `whatChanged`, `whyInteresting`, `suggestedResearchQuestions`, `metrics`, and `checks`.
- [ ] OI-related lanes explain missing historical OI instead of failing silently.
- [ ] Wallet leads are treated as context/support unless their own checks make them strong enough to research.
- [x] Manual Hyperliquid wallet list is stored locally, separate from Polymarket/Supabase wallets.
- [x] Wallet profile runner emits `directional_trader`, `possible_market_maker`, `possible_hedged_or_basis_trader`, `vault_or_managed_account`, `too_noisy`, or `insufficient_data`.
- [x] Wallet behavior can be run for one explicit wallet address or for the local watchlist.
- [x] Wallet behavior emits `watchlist_wallet` research/watch/ignore leads gated by wallet quality.
- [ ] Deposit-sourced wallet discovery can add wallets that deposit at least $500K.
- [ ] Cross-signal leads only appear when multiple lane leads support the same asset or thesis.
- [ ] Running the local command writes a JSON artifact under `packages/brain/artifacts/hyperliquid-signals/`.
- [ ] The JSON artifact is readable enough that a researcher can choose the top assets to investigate without reading source code.
- [x] Exploration runs stay local by default; Supabase writes only happen when `HYPERLIQUID_COLLECTION_LEADS_WRITE=1` or `COLLECTION_LEADS_WRITE=1` is set.
- [x] Opt-in persistence writes collector output to `collection_runs` and `collection_leads`, not `published_narratives`.
- [ ] Tests cover lead ranking, lane summary counts, missing OI behavior, and at least one volume-led example like NEAR.
