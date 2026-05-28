import type { HyperliquidFill } from '../client.js'
import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from '../research-lead-thresholds.js'
import type { HyperliquidPositionSnapshot } from '../types.js'
import {
  DAY_MS,
  money,
  normalizePart,
  round,
  walletLabel,
} from './shared.js'
import { rankHyperliquidResearchLeads } from './ranking.js'
import type {
  BuildHyperliquidWalletBehaviorResearchLeadsInput,
  HyperliquidResearchLead,
  HyperliquidResearchLeadStatus,
  WalletBehaviorLeadThresholds,
} from './types.js'

interface WalletAssetFlow {
  asset: string
  grossFlowUsd: number
  netDirectionalFlowUsd: number
  openLongUsd: number
  closeLongUsd: number
  openShortUsd: number
  closeShortUsd: number
  fillCount: number
  firstFillTime: number
  lastFillTime: number
}

function defaultWalletBehaviorThresholds(): WalletBehaviorLeadThresholds {
  const thresholds = HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.wallet
  return {
    minWalletConfidence: thresholds.minWalletConfidence,
    researchNotionalChangeUsd: thresholds.researchNotionalChangeUsd,
    watchNotionalChangeUsd: thresholds.watchNotionalChangeUsd,
    researchPositionNotionalUsd: thresholds.researchPositionNotionalUsd,
    watchPositionNotionalUsd: thresholds.watchPositionNotionalUsd,
    researchChangePct: thresholds.researchChangePct,
    watchChangePct: thresholds.watchChangePct,
  }
}

function walletFillDirection(fill: HyperliquidFill): 1 | -1 | null {
  if (/long/i.test(fill.dir)) return /close/i.test(fill.dir) ? -1 : 1
  if (/short/i.test(fill.dir)) return /close/i.test(fill.dir) ? 1 : -1
  if (/buy/i.test(fill.dir)) return 1
  if (/sell/i.test(fill.dir)) return -1
  return null
}

function currentPositionByAsset(positions: HyperliquidPositionSnapshot[]): Map<string, HyperliquidPositionSnapshot> {
  return new Map(positions.map((position) => [position.asset.toUpperCase(), position]))
}

function buildWalletAssetFlows(fills: HyperliquidFill[], nowMs: number, lookbackDays: number): WalletAssetFlow[] {
  const startMs = nowMs - lookbackDays * DAY_MS
  const byAsset = new Map<string, WalletAssetFlow>()

  for (const fill of fills) {
    if (fill.time < startMs || fill.time > nowMs) continue

    const asset = fill.coin.toUpperCase()
    const notionalUsd = fill.px * fill.sz
    const direction = walletFillDirection(fill)
    const current = byAsset.get(asset) ?? {
      asset,
      grossFlowUsd: 0,
      netDirectionalFlowUsd: 0,
      openLongUsd: 0,
      closeLongUsd: 0,
      openShortUsd: 0,
      closeShortUsd: 0,
      fillCount: 0,
      firstFillTime: fill.time,
      lastFillTime: fill.time,
    }

    current.grossFlowUsd += notionalUsd
    current.netDirectionalFlowUsd += (direction ?? 0) * notionalUsd
    current.fillCount += 1
    current.firstFillTime = Math.min(current.firstFillTime, fill.time)
    current.lastFillTime = Math.max(current.lastFillTime, fill.time)

    if (/long/i.test(fill.dir) && /close/i.test(fill.dir)) current.closeLongUsd += notionalUsd
    else if (/long/i.test(fill.dir)) current.openLongUsd += notionalUsd
    else if (/short/i.test(fill.dir) && /close/i.test(fill.dir)) current.closeShortUsd += notionalUsd
    else if (/short/i.test(fill.dir)) current.openShortUsd += notionalUsd

    byAsset.set(asset, current)
  }

  return [...byAsset.values()].sort((a, b) => Math.abs(b.netDirectionalFlowUsd) - Math.abs(a.netDirectionalFlowUsd))
}

function walletBehaviorAction(flow: WalletAssetFlow, position: HyperliquidPositionSnapshot | null): string {
  const flowSide = flow.netDirectionalFlowUsd >= 0 ? 'long-side' : 'short-side'
  if (!position) return `${flowSide} flow without current position`
  if (position.side === 'long' && flow.netDirectionalFlowUsd > 0) return 'adding to / building long exposure'
  if (position.side === 'short' && flow.netDirectionalFlowUsd < 0) return 'adding to / building short exposure'
  if (position.side === 'long' && flow.netDirectionalFlowUsd < 0) return 'reducing long exposure'
  if (position.side === 'short' && flow.netDirectionalFlowUsd > 0) return 'reducing short exposure'
  return 'mixed flow'
}

function walletBehaviorQuestions(asset: string, action: string): string[] {
  return [
    `Is this ${asset} wallet behavior aligned with price, funding, and volume right now?`,
    `Is the wallet ${action}, or is this part of a hedge/basis trade?`,
    `Did other trusted wallets make similar ${asset} moves in the same window?`,
    `Is there ${asset} news, social attention, or ecosystem activity explaining why this wallet is active?`,
  ]
}

function walletBehaviorStatus(
  input: BuildHyperliquidWalletBehaviorResearchLeadsInput,
  absNetFlowUsd: number,
  currentNotionalUsd: number,
  changePct: number,
  thresholds: WalletBehaviorLeadThresholds
): HyperliquidResearchLeadStatus {
  if (input.profile.classification !== 'directional_trader') return 'ignore'
  if (input.profile.confidence < thresholds.minWalletConfidence) return 'ignore'
  if (
    absNetFlowUsd >= thresholds.researchNotionalChangeUsd
    && currentNotionalUsd >= thresholds.researchPositionNotionalUsd
    && changePct >= thresholds.researchChangePct
  ) {
    return 'research'
  }
  if (
    absNetFlowUsd >= thresholds.watchNotionalChangeUsd
    || currentNotionalUsd >= thresholds.watchPositionNotionalUsd
  ) {
    return 'watch'
  }
  return 'ignore'
}

function walletBehaviorPriority(status: HyperliquidResearchLeadStatus, absNetFlowUsd: number, currentNotionalUsd: number, profileConfidence: number): number {
  if (status === 'ignore') return 1
  const statusBase = status === 'research' ? 5 : 3
  const flowBoost = absNetFlowUsd >= 10_000_000 ? 2.5 : absNetFlowUsd >= 1_000_000 ? 1.5 : absNetFlowUsd >= 250_000 ? 0.75 : 0
  const positionBoost = currentNotionalUsd >= 10_000_000 ? 1.5 : currentNotionalUsd >= 1_000_000 ? 1 : currentNotionalUsd >= 250_000 ? 0.5 : 0
  const confidenceBoost = profileConfidence >= 0.7 ? 1 : profileConfidence >= 0.55 ? 0.5 : 0
  return round(Math.min(10, statusBase + flowBoost + positionBoost + confidenceBoost), 2)
}

function buildWalletBehaviorLead(
  input: BuildHyperliquidWalletBehaviorResearchLeadsInput,
  flow: WalletAssetFlow,
  position: HyperliquidPositionSnapshot | null,
  thresholds: WalletBehaviorLeadThresholds
): HyperliquidResearchLead {
  const absNetFlowUsd = Math.abs(flow.netDirectionalFlowUsd)
  const currentNotionalUsd = position?.notionalUsd ?? 0
  const denominator = currentNotionalUsd > 0 ? currentNotionalUsd : absNetFlowUsd
  const changePct = denominator > 0 ? (absNetFlowUsd / denominator) * 100 : 0
  const status = walletBehaviorStatus(input, absNetFlowUsd, currentNotionalUsd, changePct, thresholds)
  const label = walletLabel(input.profile, input.wallet)
  const action = walletBehaviorAction(flow, position)
  const flowDirection = flow.netDirectionalFlowUsd >= 0 ? 'long-side' : 'short-side'
  const storyKey = `hyperliquid:research-lead:watchlist-wallet:${normalizePart(input.wallet)}:${normalizePart(flow.asset)}:${input.lookbackDays}d`
  const observedAt = new Date(flow.lastFillTime).toISOString()

  return {
    id: `${storyKey}:${observedAt}`,
    asset: flow.asset,
    lane: 'watchlist_wallet',
    status,
    priority: walletBehaviorPriority(status, absNetFlowUsd, currentNotionalUsd, input.profile.confidence),
    observedAt,
    storyKey,
    headline: status === 'research'
      ? `${flow.asset} wallet behavior: ${label} ${action}`
      : status === 'watch'
        ? `${flow.asset} wallet watch: ${label} ${action}`
        : `${flow.asset} wallet ignored: ${label} ${input.profile.classification}`,
    whatChanged: `${label} had ${money(absNetFlowUsd)} net ${flowDirection} flow and ${money(flow.grossFlowUsd)} gross ${flow.asset} fill volume over ${input.lookbackDays}d. Current ${flow.asset} exposure is ${position ? `${position.side} ${money(currentNotionalUsd)}` : '$0'}.`,
    whyInteresting: status === 'research'
      ? 'A wallet that passed the quality screen is making asset-specific directional flow large enough to become a research assignment.'
      : status === 'watch'
        ? 'The wallet behavior is visible, but it needs more size, stronger profile confidence, or confirmation from market lanes before becoming a primary lead.'
        : `The wallet behavior was not promoted because wallet quality/status is ${input.profile.classification}, confidence is ${input.profile.confidence}, or the move is below thresholds.`,
    suggestedResearchQuestions: status === 'ignore' ? [] : walletBehaviorQuestions(flow.asset, action),
    metrics: {
      wallet: input.wallet,
      walletLabel: label,
      walletClassification: input.profile.classification,
      walletConfidence: input.profile.confidence,
      lookbackDays: input.lookbackDays,
      netDirectionalFlowUsd: round(flow.netDirectionalFlowUsd),
      absNetDirectionalFlowUsd: round(absNetFlowUsd),
      grossFlowUsd: round(flow.grossFlowUsd),
      currentPositionSide: position?.side ?? 'flat',
      currentPositionNotionalUsd: round(currentNotionalUsd),
      changePct: round(changePct, 2),
      fillCount: flow.fillCount,
      openLongUsd: round(flow.openLongUsd),
      closeLongUsd: round(flow.closeLongUsd),
      openShortUsd: round(flow.openShortUsd),
      closeShortUsd: round(flow.closeShortUsd),
    },
    checks: [
      { name: 'wallet is directional', passed: input.profile.classification === 'directional_trader', value: input.profile.classification, threshold: 'directional_trader' },
      { name: 'wallet confidence', passed: input.profile.confidence >= thresholds.minWalletConfidence, value: String(input.profile.confidence), threshold: `>= ${thresholds.minWalletConfidence}` },
      { name: 'research net flow', passed: absNetFlowUsd >= thresholds.researchNotionalChangeUsd, value: money(absNetFlowUsd), threshold: `>= ${money(thresholds.researchNotionalChangeUsd)}` },
      { name: 'watch net flow', passed: absNetFlowUsd >= thresholds.watchNotionalChangeUsd, value: money(absNetFlowUsd), threshold: `>= ${money(thresholds.watchNotionalChangeUsd)}` },
      { name: 'research current position', passed: currentNotionalUsd >= thresholds.researchPositionNotionalUsd, value: money(currentNotionalUsd), threshold: `>= ${money(thresholds.researchPositionNotionalUsd)}` },
      { name: 'watch current position', passed: currentNotionalUsd >= thresholds.watchPositionNotionalUsd, value: money(currentNotionalUsd), threshold: `>= ${money(thresholds.watchPositionNotionalUsd)}` },
      { name: 'research change percent', passed: changePct >= thresholds.researchChangePct, value: `${round(changePct, 2)}%`, threshold: `>= ${thresholds.researchChangePct}%` },
      { name: 'watch change percent', passed: changePct >= thresholds.watchChangePct, value: `${round(changePct, 2)}%`, threshold: `>= ${thresholds.watchChangePct}%` },
    ],
    receipts: [
      {
        source: 'hyperliquid',
        sourceId: `${input.wallet}:userFillsByTime:${flow.firstFillTime}-${flow.lastFillTime}`,
        capturedAt: input.now,
        rawRef: 'userFillsByTime',
      },
      ...(position
        ? [{
          source: 'hyperliquid' as const,
          sourceId: `${input.wallet}:clearinghouseState:${flow.asset}`,
          capturedAt: position.observedAt,
          rawRef: 'clearinghouseState',
        }]
        : []),
      {
        source: 'internal',
        sourceId: `${input.wallet}:wallet-profile:${input.profile.classification}:${input.profile.confidence}`,
        capturedAt: input.now,
        rawRef: 'walletQualityProfile',
      },
    ],
    uncertainty: [
      'Wallet behavior can still be hedged on another venue or account.',
      'Fill flow over the lookback window is not the same thing as full position history.',
      'This lead should support asset research; it should not become a feed item by itself.',
    ],
    supportingLeadIds: [],
  }
}

export function buildHyperliquidWalletBehaviorResearchLeads(input: BuildHyperliquidWalletBehaviorResearchLeadsInput): HyperliquidResearchLead[] {
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []
  const thresholds = input.thresholds ?? defaultWalletBehaviorThresholds()
  const positionsByAsset = currentPositionByAsset(input.currentPositions)
  const leads = buildWalletAssetFlows(input.fills, nowMs, input.lookbackDays)
    .map((flow) => buildWalletBehaviorLead(input, flow, positionsByAsset.get(flow.asset) ?? null, thresholds))

  return rankHyperliquidResearchLeads(leads).slice(0, input.maxLeads ?? 10)
}
