import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from '../research-lead-thresholds.js'
import {
  candleVolumeUsd,
  DAY_MS,
  HOUR_MS,
  money,
  normalizePart,
  round,
} from './shared.js'
import type {
  BuildHyperliquidPriceMomentumResearchLeadsInput,
  HyperliquidResearchLead,
  HyperliquidResearchLeadStatus,
  PriceMomentumLeadThresholds,
} from './types.js'

function defaultPriceMomentumThresholds(): PriceMomentumLeadThresholds {
  const thresholds = HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.priceMomentum
  return {
    minBaselineCandles: thresholds.minBaselineCandles,
    minRecentVolumeUsd: thresholds.minRecentVolumeUsd,
    researchMovePct1d: thresholds.researchMovePct1d,
    watchMovePct1d: thresholds.watchMovePct1d,
    researchMovePct7d: thresholds.researchMovePct7d,
    watchMovePct7d: thresholds.watchMovePct7d,
    researchMovePct30d: thresholds.researchMovePct30d,
    watchMovePct30d: thresholds.watchMovePct30d,
  }
}

function moveThreshold(days: number, kind: 'research' | 'watch', thresholds: PriceMomentumLeadThresholds): number {
  if (days >= 30) return kind === 'research' ? thresholds.researchMovePct30d : thresholds.watchMovePct30d
  if (days >= 7) return kind === 'research' ? thresholds.researchMovePct7d : thresholds.watchMovePct7d
  return kind === 'research' ? thresholds.researchMovePct1d : thresholds.watchMovePct1d
}

function priceMomentumPriority(status: HyperliquidResearchLeadStatus, absMovePct: number, recentVolumeUsd: number, days: number): number {
  if (status === 'ignore') return 1
  const statusBase = status === 'research' ? 5 : 3
  const moveBoost = Math.min(3, absMovePct / (days >= 30 ? 8 : days >= 7 ? 5 : 3))
  const sizeBoost = recentVolumeUsd >= 100_000_000 ? 1.5 : recentVolumeUsd >= 10_000_000 ? 1 : 0.25
  return round(Math.min(10, statusBase + moveBoost + sizeBoost), 2)
}

function priceMomentumQuestions(asset: string, priceMovePct: number): string[] {
  const directionQuestion = priceMovePct < 0
    ? `Did ${asset} sell off because of liquidation, sector weakness, news, or positioning unwind?`
    : `Did ${asset} rally because of catalyst, sector strength, short covering, or fresh positioning?`

  return [
    directionQuestion,
    'Did volume expand with the price move?',
    'Did funding become one-sided after the move?',
    'Did watched wallets react to the move?',
    `Is there ${asset} news, ecosystem activity, or social attention explaining why price moved now?`,
  ]
}

function buildPriceMomentumLeadForWindow(
  input: BuildHyperliquidPriceMomentumResearchLeadsInput,
  nowMs: number,
  days: number,
  thresholds: PriceMomentumLeadThresholds
): HyperliquidResearchLead {
  const normalizedAsset = input.asset.trim().toUpperCase()
  const closedCandles = input.candles
    .filter((candle) => candle.endTime <= nowMs - HOUR_MS)
    .sort((a, b) => a.endTime - b.endTime)
  const recent = closedCandles.at(-1) ?? null
  const recentEndMs = recent?.endTime ?? nowMs
  const targetStartMs = recentEndMs - days * DAY_MS
  const candidates = recent
    ? closedCandles.filter((candle) => candle.endTime <= targetStartMs && candle.endTime < recent.endTime)
    : []
  const start = candidates.at(-1) ?? null
  const baselineCandles = recent
    ? closedCandles.filter((candle) => candle.endTime < recent.endTime && candle.endTime >= recent.endTime - Math.max(days, thresholds.minBaselineCandles) * DAY_MS)
    : []
  const recentVolumeUsd = recent ? candleVolumeUsd(recent) : 0
  const startClose = start?.close ?? 0
  const recentClose = recent?.close ?? 0
  const priceMovePct = startClose > 0 ? ((recentClose - startClose) / startClose) * 100 : 0
  const absMovePct = Math.abs(priceMovePct)
  const researchMoveThreshold = moveThreshold(days, 'research', thresholds)
  const watchMoveThreshold = moveThreshold(days, 'watch', thresholds)
  const baselineCheck = baselineCandles.length >= thresholds.minBaselineCandles
  const volumeCheck = recentVolumeUsd >= thresholds.minRecentVolumeUsd
  const researchMoveCheck = absMovePct >= researchMoveThreshold
  const watchMoveCheck = absMovePct >= watchMoveThreshold
  const status: HyperliquidResearchLeadStatus = Boolean(recent && start) && baselineCheck && volumeCheck && researchMoveCheck
    ? 'research'
    : Boolean(recent && start) && baselineCheck && volumeCheck && watchMoveCheck
      ? 'watch'
      : 'ignore'
  const move = priceMovePct >= 0 ? `up ${round(priceMovePct)}%` : `down ${Math.abs(round(priceMovePct))}%`
  const headlinePrefix = status === 'research'
    ? `${normalizedAsset} price move`
    : status === 'watch'
      ? `${normalizedAsset} price watch`
      : `${normalizedAsset} price quiet`
  const observedAt = recent ? new Date(recent.endTime).toISOString() : input.now
  const storyKey = `hyperliquid:research-lead:price-momentum:${normalizePart(normalizedAsset)}:${days}d`

  return {
    id: `${storyKey}:${observedAt}`,
    asset: normalizedAsset,
    lane: 'price_momentum',
    status,
    priority: priceMomentumPriority(status, absMovePct, recentVolumeUsd, days),
    observedAt,
    storyKey,
    headline: `${headlinePrefix}: ${move} over ${days}d`,
    whatChanged: recent && start
      ? `${normalizedAsset} moved from ${round(startClose, 6)} to ${round(recentClose, 6)} over ${days}d, a ${move} move. Latest daily Hyperliquid volume was ${money(recentVolumeUsd)}.`
      : `Not enough closed daily candles were available to evaluate ${normalizedAsset} price momentum over ${days}d.`,
    whyInteresting: status === 'research'
      ? 'A large price move is the simplest market lead: something repriced enough that a researcher should look for the cause, confirmation, and positioning context.'
      : status === 'watch'
        ? 'The asset moved enough to keep on the desk, but it needs stronger magnitude or supporting context before becoming a primary research assignment.'
        : 'This lane ran, but the price move did not clear the minimum research or watch filters.',
    suggestedResearchQuestions: status === 'ignore' ? [] : priceMomentumQuestions(normalizedAsset, priceMovePct),
    metrics: {
      windowDays: days,
      startClose: round(startClose, 6),
      recentClose: round(recentClose, 6),
      priceMovePct: round(priceMovePct, 3),
      absPriceMovePct: round(absMovePct, 3),
      recentVolumeUsd: round(recentVolumeUsd),
      baselineCandles: baselineCandles.length,
      researchMoveThresholdPct: researchMoveThreshold,
      watchMoveThresholdPct: watchMoveThreshold,
    },
    checks: [
      { name: 'has comparison candle', passed: Boolean(start), value: start ? new Date(start.endTime).toISOString() : 'missing', threshold: `${days}d lookback candle` },
      { name: 'enough baseline candles', passed: baselineCheck, value: String(baselineCandles.length), threshold: `>= ${thresholds.minBaselineCandles}` },
      { name: 'large enough recent volume', passed: volumeCheck, value: money(recentVolumeUsd), threshold: `>= ${money(thresholds.minRecentVolumeUsd)}` },
      { name: 'research price move', passed: researchMoveCheck, value: `${round(absMovePct, 2)}%`, threshold: `>= ${researchMoveThreshold}%` },
      { name: 'watch price move', passed: watchMoveCheck, value: `${round(absMovePct, 2)}%`, threshold: `>= ${watchMoveThreshold}%` },
    ],
    receipts: recent
      ? [{
        source: 'hyperliquid',
        sourceId: `${normalizedAsset}:candleSnapshot:1d:${start?.startTime ?? 'missing'}-${recent.endTime}`,
        capturedAt: input.now,
        rawRef: 'candleSnapshot',
      }]
      : [],
    uncertainty: [
      'Price movement alone does not explain why the move happened.',
      'Daily candles can hide intraday spikes, wick reversals, and liquidation timing.',
      'This lead needs volume, funding, wallet, OI, and external context before it becomes a feed packet.',
    ],
    supportingLeadIds: [],
  }
}

export function buildHyperliquidPriceMomentumResearchLeads(input: BuildHyperliquidPriceMomentumResearchLeadsInput): HyperliquidResearchLead[] {
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []
  const windowsDays = input.windowsDays ?? [...HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.priceMomentum.windowsDays]
  const thresholds = input.thresholds ?? defaultPriceMomentumThresholds()

  return windowsDays
    .filter((days) => Number.isFinite(days) && days > 0)
    .map((days) => buildPriceMomentumLeadForWindow(input, nowMs, days, thresholds))
}
