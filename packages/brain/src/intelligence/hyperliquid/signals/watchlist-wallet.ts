import {
  buildHyperliquidResearchBrief,
  detectHyperliquidPositionFindings,
  runHyperliquidMechanicalGate,
  type HyperliquidResearchOptions,
} from '../research.js'
import type {
  HyperliquidFindingType,
  HyperliquidMarketSnapshot,
  HyperliquidPositionSnapshot,
  HyperliquidResearchBrief,
  HyperliquidWatchlistEntry,
} from '../types.js'

export const WATCHLIST_WALLET_SIGNAL_LANE = 'hyperliquid.watchlist_wallet' as const

export type WatchlistWalletSignalKind =
  | 'watchlist_wallet.opened'
  | 'watchlist_wallet.added'
  | 'watchlist_wallet.reduced'
  | 'watchlist_wallet.closed'
  | 'watchlist_wallet.flipped'

export type WatchlistWalletSignalStatus = 'candidate' | 'suppressed'

export interface WatchlistWalletSignalFilters {
  minPositionUsd: number
  minChangeUsd: number
  minChangePct: number
  dedupeBy: 'wallet_asset'
}

export interface WatchlistWalletSignalFinding {
  id: string
  lane: typeof WATCHLIST_WALLET_SIGNAL_LANE
  kind: WatchlistWalletSignalKind
  source: 'hyperliquid'
  status: WatchlistWalletSignalStatus
  suppressReasons: string[]
  wallet: string
  walletLabel: string
  asset: string
  action: HyperliquidFindingType
  direction: 'long' | 'short' | 'flat' | 'flipped'
  before: HyperliquidResearchBrief['before']
  after: HyperliquidResearchBrief['after']
  notionalDeltaUsd: number
  notionalDeltaPct: number | null
  storyKey: string
  dedupeKey: string
  dedupeGroup: string
  observedAt: string
  createdAt: string
  priorityHint: number
  suggestedAngle: string
  whyItMayMatter: string
  evidenceSummary: string
  receipts: HyperliquidResearchBrief['receipts']
  filters: WatchlistWalletSignalFilters
  brief: HyperliquidResearchBrief
}

export interface NormalizeWatchlistWalletBriefOptions extends HyperliquidResearchOptions {
  seenStoryKeys?: Set<string>
}

export interface DetectWatchlistWalletSignalOptions extends NormalizeWatchlistWalletBriefOptions {}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function signalKind(finding: HyperliquidFindingType): WatchlistWalletSignalKind {
  return `watchlist_wallet.${finding}` as WatchlistWalletSignalKind
}

function signalDirection(brief: HyperliquidResearchBrief): WatchlistWalletSignalFinding['direction'] {
  if (brief.finding === 'flipped') return 'flipped'
  return brief.after.side ?? brief.before.side ?? 'flat'
}

function dedupeGroup(brief: HyperliquidResearchBrief): string {
  return `hyperliquid:watchlist-wallet:${brief.wallet.toLowerCase()}:${brief.asset.toLowerCase()}`
}

function evidenceSummary(brief: HyperliquidResearchBrief): string {
  return `${brief.walletLabel} ${brief.finding} ${brief.asset}: ${brief.before.notionalUsd} USD -> ${brief.after.notionalUsd} USD over ${brief.timeWindow}.`
}

function filters(options: HyperliquidResearchOptions): WatchlistWalletSignalFilters {
  return {
    minPositionUsd: options.minPositionUsd,
    minChangeUsd: options.minChangeUsd,
    minChangePct: options.minChangePct,
    dedupeBy: 'wallet_asset',
  }
}

function normalizeOne(
  brief: HyperliquidResearchBrief,
  options: NormalizeWatchlistWalletBriefOptions,
  seenStoryKeys: Set<string>
): WatchlistWalletSignalFinding {
  const gate = runHyperliquidMechanicalGate(brief, {
    ...options,
    duplicateStoryKeys: options.duplicateStoryKeys,
  })
  const duplicateInBatch = seenStoryKeys.has(brief.storyKey)
  const suppressReasons = [
    ...gate.reasons,
    ...(duplicateInBatch ? ['duplicate wallet+asset signal in batch'] : []),
  ]
  const status: WatchlistWalletSignalStatus = suppressReasons.length === 0 ? 'candidate' : 'suppressed'

  if (status === 'candidate') {
    seenStoryKeys.add(brief.storyKey)
  }

  const notionalDeltaUsd = round(brief.after.notionalUsd - brief.before.notionalUsd, 2)
  const notionalDeltaPct = brief.before.notionalUsd > 0
    ? round(notionalDeltaUsd / brief.before.notionalUsd, 4)
    : null

  return {
    id: `signal:${brief.storyKey}:${brief.finding}:${brief.createdAt}`,
    lane: WATCHLIST_WALLET_SIGNAL_LANE,
    kind: signalKind(brief.finding),
    source: 'hyperliquid',
    status,
    suppressReasons,
    wallet: brief.wallet,
    walletLabel: brief.walletLabel,
    asset: brief.asset,
    action: brief.finding,
    direction: signalDirection(brief),
    before: brief.before,
    after: brief.after,
    notionalDeltaUsd,
    notionalDeltaPct,
    storyKey: brief.storyKey,
    dedupeKey: brief.dedupeKey,
    dedupeGroup: dedupeGroup(brief),
    observedAt: brief.createdAt,
    createdAt: options.now,
    priorityHint: brief.priorityHint,
    suggestedAngle: brief.suggestedAngle,
    whyItMayMatter: brief.whyItMayMatter,
    evidenceSummary: evidenceSummary(brief),
    receipts: brief.receipts,
    filters: filters(options),
    brief,
  }
}

export function normalizeWatchlistWalletBriefs(
  briefs: HyperliquidResearchBrief[],
  options: NormalizeWatchlistWalletBriefOptions
): WatchlistWalletSignalFinding[] {
  const seenStoryKeys = options.seenStoryKeys ?? new Set<string>()
  return briefs.map((brief) => normalizeOne(brief, options, seenStoryKeys))
}

function marketByAsset(snapshots: HyperliquidMarketSnapshot[]): Map<string, HyperliquidMarketSnapshot> {
  return new Map(snapshots.map((snapshot) => [snapshot.asset, snapshot]))
}

export function detectWatchlistWalletSignals(
  watch: HyperliquidWatchlistEntry,
  previous: HyperliquidPositionSnapshot[],
  current: HyperliquidPositionSnapshot[],
  marketSnapshots: HyperliquidMarketSnapshot[] | Map<string, HyperliquidMarketSnapshot>,
  options: DetectWatchlistWalletSignalOptions
): WatchlistWalletSignalFinding[] {
  const markets = marketSnapshots instanceof Map ? marketSnapshots : marketByAsset(marketSnapshots)
  const effectiveOptions = {
    ...options,
    minPositionUsd: watch.minPositionUsd ?? options.minPositionUsd,
  }
  const findings = detectHyperliquidPositionFindings(watch, previous, current, markets, effectiveOptions)
  const briefs = findings.map((finding) => buildHyperliquidResearchBrief(finding, finding.observedAt))
  return normalizeWatchlistWalletBriefs(briefs, effectiveOptions)
}
