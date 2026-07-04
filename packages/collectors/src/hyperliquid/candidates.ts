import { snapshotMetrics } from './normalization'
import type {
  HyperliquidCandidateDraft,
  HyperliquidCandidateTriggerType,
  HyperliquidCollectorOptions,
  HyperliquidMarketSnapshot,
} from './types'

export interface CandidateDetectionOptions {
  observedAt: string
  priceChange1hThresholdPct: number
  priceChange4hThresholdPct: number
  extremeFundingRateThreshold: number
  fundingMoveThreshold: number
  priceFundingMovePriceThresholdPct: number
  volumeSpikeThresholdPct: number
  weightedCandidateThreshold: number
  candidateDedupeHours: number
}

export const DEFAULT_CANDIDATE_OPTIONS: Omit<CandidateDetectionOptions, 'observedAt'> = {
  priceChange1hThresholdPct: 5,
  priceChange4hThresholdPct: 7,
  extremeFundingRateThreshold: 0.0005,
  fundingMoveThreshold: 0.00005,
  priceFundingMovePriceThresholdPct: 3,
  volumeSpikeThresholdPct: 100,
  weightedCandidateThreshold: 55,
  candidateDedupeHours: 4,
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function abs(value: number | null): number {
  return Math.abs(value ?? 0)
}

function formatPct(value: number | null): string {
  return `${round(value ?? 0, 2)}%`
}

function formatFunding(value: number | null): string {
  return value == null ? 'unknown' : round(value * 100, 4).toString() + '%'
}

function sign(value: number | null): -1 | 0 | 1 {
  if (value == null || value === 0) return 0
  return value > 0 ? 1 : -1
}

function candidateDedupeKey(
  snapshot: HyperliquidMarketSnapshot,
  triggerType: HyperliquidCandidateTriggerType,
  observedAt: string,
  dedupeHours: number
): string {
  const bucket = Math.floor(new Date(observedAt).getTime() / (dedupeHours * 3_600_000))
  return `hyperliquid:perps:${snapshot.symbol}:${triggerType}:${bucket}`
}

function scoreByRatio(ratio: number, base = 55): number {
  return round(clamp(base + Math.min(Math.max(ratio - 1, 0), 2) * 22.5), 2)
}

function makeCandidate(
  snapshot: HyperliquidMarketSnapshot,
  triggerType: HyperliquidCandidateTriggerType,
  triggerReason: string,
  score: number,
  options: CandidateDetectionOptions,
  priorMetricsSnapshot: Record<string, unknown> | null
): HyperliquidCandidateDraft {
  return {
    triggerType,
    triggerReason,
    score,
    metricsSnapshot: snapshotMetrics(snapshot),
    priorMetricsSnapshot,
    entityHint: snapshot.entityHint,
    status: 'pending_research',
    observedAt: options.observedAt,
    dedupeKey: candidateDedupeKey(snapshot, triggerType, options.observedAt, options.candidateDedupeHours),
  }
}

export function selectedCandidateOptions(
  partial: HyperliquidCollectorOptions,
  observedAt: string
): CandidateDetectionOptions {
  return {
    observedAt,
    priceChange1hThresholdPct: partial.priceChange1hThresholdPct ?? DEFAULT_CANDIDATE_OPTIONS.priceChange1hThresholdPct,
    priceChange4hThresholdPct: partial.priceChange4hThresholdPct ?? DEFAULT_CANDIDATE_OPTIONS.priceChange4hThresholdPct,
    extremeFundingRateThreshold: partial.extremeFundingRateThreshold ?? DEFAULT_CANDIDATE_OPTIONS.extremeFundingRateThreshold,
    fundingMoveThreshold: partial.fundingMoveThreshold ?? DEFAULT_CANDIDATE_OPTIONS.fundingMoveThreshold,
    priceFundingMovePriceThresholdPct: partial.priceFundingMovePriceThresholdPct ?? DEFAULT_CANDIDATE_OPTIONS.priceFundingMovePriceThresholdPct,
    volumeSpikeThresholdPct: partial.volumeSpikeThresholdPct ?? DEFAULT_CANDIDATE_OPTIONS.volumeSpikeThresholdPct,
    weightedCandidateThreshold: partial.weightedCandidateThreshold ?? DEFAULT_CANDIDATE_OPTIONS.weightedCandidateThreshold,
    candidateDedupeHours: partial.candidateDedupeHours ?? DEFAULT_CANDIDATE_OPTIONS.candidateDedupeHours,
  }
}

function metricNumber(metrics: Record<string, unknown> | null, key: string): number | null {
  if (!metrics) return null
  const value = metrics[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function detectCandidates(
  snapshot: HyperliquidMarketSnapshot,
  options: CandidateDetectionOptions,
  priorMetricsSnapshot: Record<string, unknown> | null = null
): HyperliquidCandidateDraft[] {
  const components: Record<string, number> = {}
  const reasons: string[] = []

  if (abs(snapshot.priceChange4hPct) >= options.priceChange4hThresholdPct) {
    components.priceChange4h = round(clamp(
      55 + Math.min((abs(snapshot.priceChange4hPct) / options.priceChange4hThresholdPct) - 1, 1) * 10,
      0,
      65
    ), 2)
    reasons.push(`4h price moved ${formatPct(snapshot.priceChange4hPct)}`)
  } else if (abs(snapshot.priceChange4hPct) >= options.priceFundingMovePriceThresholdPct) {
    components.priceChange4h = round(clamp(
      (abs(snapshot.priceChange4hPct) / options.priceChange4hThresholdPct) * 30,
      0,
      30
    ), 2)
    reasons.push(`4h price moved ${formatPct(snapshot.priceChange4hPct)}`)
  }

  if (abs(snapshot.priceChange1hPct) >= options.priceChange1hThresholdPct) {
    components.priceChange1h = round(clamp(
      (abs(snapshot.priceChange1hPct) / options.priceChange1hThresholdPct) * 8,
      0,
      8
    ), 2)
    reasons.push(`1h price moved ${formatPct(snapshot.priceChange1hPct)}`)
  }

  const fundingFlipChecks: Array<[boolean, number | null, string]> = [
    [snapshot.fundingFlipped1h, snapshot.fundingChange1h, '1h'],
    [snapshot.fundingFlipped4h, snapshot.fundingChange4h, '4h'],
    [snapshot.fundingFlipped24h, snapshot.fundingChange24h, '24h'],
  ]
  const meaningfulFundingFlips = fundingFlipChecks.filter(([, fundingChange]) => (
    abs(fundingChange) >= options.fundingMoveThreshold
  ))
  for (const [flipped, fundingChange, window] of meaningfulFundingFlips) {
    if (!flipped || abs(fundingChange) < options.fundingMoveThreshold) continue
    components.fundingFlip = Math.max(components.fundingFlip ?? 0, 18)
    reasons.push(`funding flipped ${snapshot.fundingDirection} over ${window} with ${formatFunding(fundingChange)} change`)
  }

  if (abs(snapshot.fundingRateCurrent) >= options.extremeFundingRateThreshold) {
    components.fundingExtreme = round(clamp(
      (abs(snapshot.fundingRateCurrent) / options.extremeFundingRateThreshold) * 16,
      0,
      16
    ), 2)
    reasons.push(`current funding is ${formatFunding(snapshot.fundingRateCurrent)}`)
  }

  const strongestFundingMove = Math.max(
    abs(snapshot.fundingChange1h),
    abs(snapshot.fundingChange4h),
    abs(snapshot.fundingChange24h)
  )
  const strongestPriceMove = Math.max(
    abs(snapshot.priceChange1hPct),
    abs(snapshot.priceChange4hPct)
  )
  if (strongestFundingMove >= options.fundingMoveThreshold) {
    components.fundingMove = round(clamp(
      (strongestFundingMove / options.fundingMoveThreshold) * 14,
      0,
      22
    ), 2)
    reasons.push(`funding changed by ${formatFunding(strongestFundingMove)}`)
  }

  if (
    strongestPriceMove >= options.priceFundingMovePriceThresholdPct
    && strongestFundingMove >= options.fundingMoveThreshold
  ) {
    components.priceFundingConfluence = 10
    reasons.push(`price and funding moved together`)
  }

  const strongestVolumeSpike = Math.max(
    snapshot.volumeChange1hPct ?? Number.NEGATIVE_INFINITY,
    snapshot.volumeChange4hPct ?? Number.NEGATIVE_INFINITY,
    snapshot.volumeChange24hPct ?? Number.NEGATIVE_INFINITY
  )
  if (Number.isFinite(strongestVolumeSpike) && strongestVolumeSpike >= options.volumeSpikeThresholdPct) {
    components.volumeConfirmation = round(clamp(
      (strongestVolumeSpike / options.volumeSpikeThresholdPct) * 4,
      0,
      8
    ), 2)
    reasons.push(`volume rose ${round(strongestVolumeSpike, 1)}%`)
  }

  const priorPrice4h = metricNumber(priorMetricsSnapshot, 'priceChange4hPct')
  if (
    sign(snapshot.priceChange4hPct) !== 0
    && sign(snapshot.priceChange4hPct) === sign(priorPrice4h)
    && abs(snapshot.priceChange4hPct) >= options.priceFundingMovePriceThresholdPct
    && abs(priorPrice4h) >= options.priceFundingMovePriceThresholdPct
  ) {
    components.continuation = 8
    reasons.push(`same-direction 4h move continued from prior evaluation`)
  }

  const hasPrimarySignal = Boolean(
    components.priceChange4h
    || components.fundingFlip
    || components.fundingExtreme
    || components.fundingMove
    || components.priceFundingConfluence
  )
  const score = round(clamp(Object.values(components).reduce((sum, value) => sum + value, 0)), 2)

  if (!hasPrimarySignal || score < options.weightedCandidateThreshold) return []

  const metrics = {
    ...snapshotMetrics(snapshot),
    candidateQuality: {
      score,
      threshold: options.weightedCandidateThreshold,
      components,
      reasons,
      volumeIsConfirmingOnly: true,
    },
  }

  return [{
    ...makeCandidate(
      snapshot,
      'weighted_market_signal',
      `${snapshot.symbol} weighted 4h market signal scored ${score}: ${reasons.join('; ')}.`,
      score,
      options,
      priorMetricsSnapshot
    ),
    metricsSnapshot: metrics,
  }]
}

export function dedupeCandidates(candidates: HyperliquidCandidateDraft[]): HyperliquidCandidateDraft[] {
  const byKey = new Map<string, HyperliquidCandidateDraft>()
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.dedupeKey)
    if (!existing || candidate.score > existing.score) byKey.set(candidate.dedupeKey, candidate)
  }
  return [...byKey.values()]
}
