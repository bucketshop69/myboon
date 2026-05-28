import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from '../research-lead-thresholds.js'
import {
  average,
  candleVolumeUsd,
  DAY_MS,
  HOUR_MS,
  money,
  normalizePart,
  round,
} from './shared.js'
import type {
  BuildHyperliquidVolumeResearchLeadsInput,
  HyperliquidResearchLead,
  HyperliquidResearchLeadStatus,
  VolumeLeadThresholds,
} from './types.js'

function defaultVolumeThresholds(): VolumeLeadThresholds {
  const thresholds = HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.volume
  return {
    minBaselineDays: thresholds.minBaselineDays,
    minRecentVolumeUsd: thresholds.minRecentVolumeUsd,
    researchSpikeMultiple7d: thresholds.researchSpikeMultiple7d,
    researchSpikeMultiple30d: thresholds.researchSpikeMultiple30d,
    watchSpikeMultiple7d: thresholds.watchSpikeMultiple7d,
    watchSpikeMultiple30d: thresholds.watchSpikeMultiple30d,
    minAbsPriceMovePct: thresholds.minAbsPriceMovePct,
  }
}

function spikeThreshold(days: number, kind: 'research' | 'watch', thresholds: VolumeLeadThresholds): number {
  if (days >= 30) return kind === 'research' ? thresholds.researchSpikeMultiple30d : thresholds.watchSpikeMultiple30d
  return kind === 'research' ? thresholds.researchSpikeMultiple7d : thresholds.watchSpikeMultiple7d
}

function volumePriority(status: HyperliquidResearchLeadStatus, spikeMultiple: number, recentVolumeUsd: number, absPriceMovePct: number): number {
  if (status === 'ignore') return 1
  const statusBase = status === 'research' ? 5 : 3
  const spikeBoost = Math.min(3, spikeMultiple)
  const sizeBoost = recentVolumeUsd >= 100_000_000 ? 1.5 : recentVolumeUsd >= 10_000_000 ? 1 : 0.25
  const priceBoost = absPriceMovePct >= 10 ? 1.5 : absPriceMovePct >= 5 ? 1 : absPriceMovePct >= 2 ? 0.5 : 0
  return round(Math.min(10, statusBase + spikeBoost + sizeBoost + priceBoost), 2)
}

function volumeQuestions(asset: string, priceMovePct: number): string[] {
  const directionQuestion = priceMovePct < 0
    ? `Did ${asset} sell off on rising OI, liquidation flow, or a catalyst reaction?`
    : `Did ${asset} move up on fresh leverage, spot demand, or a catalyst reaction?`

  return [
    directionQuestion,
    'Did funding flip or become extreme during the move?',
    'Did open interest rise or fall while volume expanded?',
    'Are watched wallets adding exposure, reducing exposure, or taking the other side?',
    `Is there ${asset} ecosystem news, social attention, or sector movement explaining the activity?`,
  ]
}

function buildVolumeLeadForWindow(
  input: BuildHyperliquidVolumeResearchLeadsInput,
  nowMs: number,
  days: number,
  thresholds: VolumeLeadThresholds
): HyperliquidResearchLead {
  const normalizedAsset = input.asset.trim().toUpperCase()
  const closedCandles = input.candles
    .filter((candle) => candle.endTime <= nowMs - HOUR_MS)
    .sort((a, b) => a.endTime - b.endTime)
  const recent = closedCandles.at(-1) ?? null
  const baselineStartMs = nowMs - days * DAY_MS
  const baseline = recent
    ? closedCandles.filter((candle) => candle.endTime >= baselineStartMs && candle.endTime < recent.endTime)
    : []
  const recentVolumeUsd = recent ? candleVolumeUsd(recent) : 0
  const baselineAverageVolumeUsd = average(baseline.map(candleVolumeUsd))
  const spikeMultiple = baselineAverageVolumeUsd > 0 ? recentVolumeUsd / baselineAverageVolumeUsd : 0
  const previousClose = baseline.at(-1)?.close ?? recent?.open ?? 0
  const recentClose = recent?.close ?? 0
  const priceMovePct = previousClose > 0 ? ((recentClose - previousClose) / previousClose) * 100 : 0
  const absPriceMovePct = Math.abs(priceMovePct)
  const researchSpikeThreshold = spikeThreshold(days, 'research', thresholds)
  const watchSpikeThreshold = spikeThreshold(days, 'watch', thresholds)
  const baselineCheck = baseline.length >= thresholds.minBaselineDays
  const recentVolumeCheck = recentVolumeUsd >= thresholds.minRecentVolumeUsd
  const researchSpikeCheck = spikeMultiple >= researchSpikeThreshold
  const watchSpikeCheck = spikeMultiple >= watchSpikeThreshold
  const priceMoveCheck = absPriceMovePct >= thresholds.minAbsPriceMovePct
  const status: HyperliquidResearchLeadStatus = baselineCheck && recentVolumeCheck && researchSpikeCheck
    ? 'research'
    : baselineCheck && recentVolumeCheck && watchSpikeCheck
      ? 'watch'
      : 'ignore'
  const move = priceMovePct >= 0 ? `up ${round(priceMovePct)}%` : `down ${Math.abs(round(priceMovePct))}%`
  const storyKey = `hyperliquid:research-lead:volume-spike:${normalizePart(normalizedAsset)}:${days}d`
  const observedAt = recent ? new Date(recent.endTime).toISOString() : input.now
  const headlinePrefix = status === 'research'
    ? `${normalizedAsset} volume spike`
    : status === 'watch'
      ? `${normalizedAsset} volume watch`
      : `${normalizedAsset} volume quiet`

  return {
    id: `${storyKey}:${observedAt}`,
    asset: normalizedAsset,
    lane: 'volume_spike',
    status,
    priority: volumePriority(status, spikeMultiple, recentVolumeUsd, absPriceMovePct),
    observedAt,
    storyKey,
    headline: `${headlinePrefix}: ${round(spikeMultiple)}x ${days}d baseline, price ${move}`,
    whatChanged: recent
      ? `Latest daily Hyperliquid volume was ${money(recentVolumeUsd)} versus a ${money(baselineAverageVolumeUsd)} ${days}d baseline. Price was ${move} on the latest closed daily candle.`
      : `No closed daily candle was available for ${normalizedAsset}, so volume could not be evaluated.`,
    whyInteresting: status === 'research'
      ? 'A clear volume expansion is an attention signal. It can point to fresh positioning, liquidation, catalyst reaction, or sector rotation before the final story is known.'
      : status === 'watch'
        ? 'There is visible activity, but it needs either a stronger volume multiple or better confirmation before becoming a primary research assignment.'
        : 'This lane ran, but the latest volume did not clear the minimum research or watch filters.',
    suggestedResearchQuestions: status === 'ignore' ? [] : volumeQuestions(normalizedAsset, priceMovePct),
    metrics: {
      windowDays: days,
      recentVolumeUsd: round(recentVolumeUsd),
      baselineAverageVolumeUsd: round(baselineAverageVolumeUsd),
      spikeMultiple: round(spikeMultiple, 3),
      baselineDays: baseline.length,
      recentClose: round(recentClose, 6),
      priceMovePct: round(priceMovePct, 3),
      minRecentVolumeUsd: thresholds.minRecentVolumeUsd,
      researchSpikeThreshold,
      watchSpikeThreshold,
    },
    checks: [
      { name: 'enough baseline days', passed: baselineCheck, value: String(baseline.length), threshold: `>= ${thresholds.minBaselineDays}` },
      { name: 'large enough recent volume', passed: recentVolumeCheck, value: money(recentVolumeUsd), threshold: `>= ${money(thresholds.minRecentVolumeUsd)}` },
      { name: 'research spike multiple', passed: researchSpikeCheck, value: `${round(spikeMultiple, 2)}x`, threshold: `>= ${researchSpikeThreshold}x` },
      { name: 'watch spike multiple', passed: watchSpikeCheck, value: `${round(spikeMultiple, 2)}x`, threshold: `>= ${watchSpikeThreshold}x` },
      { name: 'price move context', passed: priceMoveCheck, value: `${round(absPriceMovePct, 2)}%`, threshold: `>= ${thresholds.minAbsPriceMovePct}%` },
    ],
    receipts: recent
      ? [{
        source: 'hyperliquid',
        sourceId: `${normalizedAsset}:candleSnapshot:1d:${recent.startTime}-${recent.endTime}`,
        capturedAt: input.now,
        rawRef: 'candleSnapshot',
      }]
      : [],
    uncertainty: [
      'Volume alone does not explain causality.',
      'Daily candles can hide intraday reversals or liquidation clusters.',
      'This lead needs funding, OI, wallet, and external context before it becomes a feed packet.',
    ],
    supportingLeadIds: [],
  }
}

export function buildHyperliquidVolumeResearchLeads(input: BuildHyperliquidVolumeResearchLeadsInput): HyperliquidResearchLead[] {
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []
  const windowsDays = input.windowsDays ?? [...HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.volume.windowsDays]
  const thresholds = input.thresholds ?? defaultVolumeThresholds()

  return windowsDays
    .filter((days) => Number.isFinite(days) && days > 0)
    .map((days) => buildVolumeLeadForWindow(input, nowMs, days, thresholds))
}
