export type HyperliquidFundingPressureType =
  | 'strong_positive_funding'
  | 'strong_negative_funding'
  | 'funding_flip'
  | 'sustained_crowding'

export type HyperliquidFundingPressureDirection =
  | 'long_crowded'
  | 'short_crowded'
  | 'negative_to_positive'
  | 'positive_to_negative'

export interface HyperliquidFundingPoint {
  asset?: string
  fundingRate: number | null
  observedAt: string
}

export interface HyperliquidFundingPressureOptions {
  now?: string
  windowDays?: number
  minSampleCount?: number
  absoluteFundingThreshold?: number
  averageFundingThreshold?: number
  sustainedSampleShare?: number
}

export interface HyperliquidFundingPressureFinding {
  id: string
  asset: string
  type: HyperliquidFundingPressureType
  direction: HyperliquidFundingPressureDirection
  avgFunding: number
  maxFunding: number
  minFunding: number
  sampleCount: number
  positiveSampleShare: number
  negativeSampleShare: number
  startTime: string
  endTime: string
  reason: string
  priorityHint: number
  storyKey: string
}

export const DEFAULT_HYPERLIQUID_FUNDING_PRESSURE_OPTIONS = {
  windowDays: 7,
  minSampleCount: 24,
  absoluteFundingThreshold: 0.0001,
  averageFundingThreshold: 0.00005,
  sustainedSampleShare: 0.7,
} as const

interface FundingStats {
  asset: string
  points: NormalizedFundingPoint[]
  avgFunding: number
  maxFunding: number
  minFunding: number
  positiveSampleShare: number
  negativeSampleShare: number
  firstHalfAvg: number
  secondHalfAvg: number
}

interface NormalizedFundingPoint {
  asset: string
  fundingRate: number
  observedAt: string
}

function round(value: number, decimals = 6): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function priorityFromMagnitude(avgFunding: number, tailFunding: number, threshold: number, sustained = false): number {
  const avgMultiple = Math.abs(avgFunding) / threshold
  const tailMultiple = Math.abs(tailFunding) / threshold
  const base = sustained ? 7 : 6
  const boost = avgMultiple >= 2 || tailMultiple >= 4 ? 2 : avgMultiple >= 1.5 || tailMultiple >= 2 ? 1 : 0
  return Math.min(9, base + boost)
}

function storyKey(asset: string, type: HyperliquidFundingPressureType): string {
  return ['hyperliquid', 'funding-pressure', normalizePart(asset), type].join(':')
}

function findingId(asset: string, type: HyperliquidFundingPressureType, endTime: string): string {
  return `${storyKey(asset, type)}:${endTime}`
}

function formatFunding(value: number): string {
  return `${round(value * 10_000, 2)} bps`
}

function reasonForFinding(
  type: HyperliquidFundingPressureType,
  direction: HyperliquidFundingPressureDirection,
  stats: FundingStats
): string {
  if (type === 'funding_flip') {
    const from = direction === 'negative_to_positive' ? 'negative' : 'positive'
    const to = direction === 'negative_to_positive' ? 'positive' : 'negative'
    return `${stats.asset} funding flipped from ${from} to ${to}; first-half average ${formatFunding(stats.firstHalfAvg)} and second-half average ${formatFunding(stats.secondHalfAvg)}.`
  }

  const side = direction === 'long_crowded' ? 'longs' : 'shorts'
  if (type === 'sustained_crowding') {
    const share = direction === 'long_crowded' ? stats.positiveSampleShare : stats.negativeSampleShare
    return `${stats.asset} funding stayed ${direction === 'long_crowded' ? 'positive' : 'negative'} in ${Math.round(share * 100)}% of samples, signaling sustained ${side} crowding.`
  }

  const tail = type === 'strong_positive_funding' ? stats.maxFunding : stats.minFunding
  return `${stats.asset} printed ${type === 'strong_positive_funding' ? 'strong positive' : 'strong negative'} funding; average ${formatFunding(stats.avgFunding)} with a ${formatFunding(tail)} tail.`
}

function statsForAsset(asset: string, rawPoints: HyperliquidFundingPoint[], options: Required<HyperliquidFundingPressureOptions>): FundingStats | null {
  const observedTimes = rawPoints
    .map((point) => new Date(point.observedAt).getTime())
    .filter((observedMs) => Number.isFinite(observedMs))
  const endMs = options.now ? new Date(options.now).getTime() : Math.max(...observedTimes)
  if (!Number.isFinite(endMs)) return null

  const startMs = endMs - options.windowDays * 24 * 3_600_000
  const points = rawPoints
    .flatMap((point): NormalizedFundingPoint[] => {
      const observedMs = new Date(point.observedAt).getTime()
      if (!Number.isFinite(observedMs)) return []
      if (observedMs < startMs || observedMs > endMs) return []
      if (typeof point.fundingRate !== 'number' || !Number.isFinite(point.fundingRate)) return []
      return [{ asset: point.asset ?? asset, fundingRate: point.fundingRate, observedAt: point.observedAt }]
    })
    .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime())

  if (points.length < options.minSampleCount) return null

  const values = points.map((point) => point.fundingRate)
  const splitAt = Math.max(1, Math.floor(values.length / 2))
  const firstHalf = values.slice(0, splitAt)
  const secondHalf = values.slice(splitAt)

  return {
    asset,
    points,
    avgFunding: average(values),
    maxFunding: Math.max(...values),
    minFunding: Math.min(...values),
    positiveSampleShare: values.filter((value) => value > 0).length / values.length,
    negativeSampleShare: values.filter((value) => value < 0).length / values.length,
    firstHalfAvg: average(firstHalf),
    secondHalfAvg: average(secondHalf.length > 0 ? secondHalf : firstHalf),
  }
}

function buildFinding(
  type: HyperliquidFundingPressureType,
  direction: HyperliquidFundingPressureDirection,
  stats: FundingStats,
  options: Required<HyperliquidFundingPressureOptions>
): HyperliquidFundingPressureFinding {
  const startTime = stats.points[0].observedAt
  const endTime = stats.points.at(-1)?.observedAt ?? startTime
  const tailFunding = direction === 'short_crowded' || direction === 'positive_to_negative' ? stats.minFunding : stats.maxFunding

  return {
    id: findingId(stats.asset, type, endTime),
    asset: stats.asset,
    type,
    direction,
    avgFunding: round(stats.avgFunding),
    maxFunding: round(stats.maxFunding),
    minFunding: round(stats.minFunding),
    sampleCount: stats.points.length,
    positiveSampleShare: round(stats.positiveSampleShare, 4),
    negativeSampleShare: round(stats.negativeSampleShare, 4),
    startTime,
    endTime,
    reason: reasonForFinding(type, direction, stats),
    priorityHint: type === 'funding_flip'
      ? priorityFromMagnitude(stats.secondHalfAvg, tailFunding, options.averageFundingThreshold)
      : priorityFromMagnitude(stats.avgFunding, tailFunding, options.averageFundingThreshold, type === 'sustained_crowding'),
    storyKey: storyKey(stats.asset, type),
  }
}

export function detectHyperliquidFundingPressureFindings(
  fundingByAsset: Record<string, HyperliquidFundingPoint[]>,
  inputOptions: HyperliquidFundingPressureOptions = {}
): HyperliquidFundingPressureFinding[] {
  const options: Required<HyperliquidFundingPressureOptions> = {
    now: inputOptions.now ?? '',
    windowDays: inputOptions.windowDays ?? DEFAULT_HYPERLIQUID_FUNDING_PRESSURE_OPTIONS.windowDays,
    minSampleCount: inputOptions.minSampleCount ?? DEFAULT_HYPERLIQUID_FUNDING_PRESSURE_OPTIONS.minSampleCount,
    absoluteFundingThreshold: inputOptions.absoluteFundingThreshold ?? DEFAULT_HYPERLIQUID_FUNDING_PRESSURE_OPTIONS.absoluteFundingThreshold,
    averageFundingThreshold: inputOptions.averageFundingThreshold ?? DEFAULT_HYPERLIQUID_FUNDING_PRESSURE_OPTIONS.averageFundingThreshold,
    sustainedSampleShare: inputOptions.sustainedSampleShare ?? DEFAULT_HYPERLIQUID_FUNDING_PRESSURE_OPTIONS.sustainedSampleShare,
  }

  const findings: HyperliquidFundingPressureFinding[] = []

  for (const [asset, rawPoints] of Object.entries(fundingByAsset)) {
    if (rawPoints.length === 0) continue
    const stats = statsForAsset(asset, rawPoints, options)
    if (!stats) continue

    if (stats.avgFunding >= options.averageFundingThreshold && stats.maxFunding >= options.absoluteFundingThreshold) {
      findings.push(buildFinding('strong_positive_funding', 'long_crowded', stats, options))
    }

    if (stats.avgFunding <= -options.averageFundingThreshold && stats.minFunding <= -options.absoluteFundingThreshold) {
      findings.push(buildFinding('strong_negative_funding', 'short_crowded', stats, options))
    }

    if (
      stats.positiveSampleShare >= options.sustainedSampleShare &&
      stats.avgFunding >= options.averageFundingThreshold &&
      stats.maxFunding >= options.absoluteFundingThreshold
    ) {
      findings.push(buildFinding('sustained_crowding', 'long_crowded', stats, options))
    }

    if (
      stats.negativeSampleShare >= options.sustainedSampleShare &&
      stats.avgFunding <= -options.averageFundingThreshold &&
      stats.minFunding <= -options.absoluteFundingThreshold
    ) {
      findings.push(buildFinding('sustained_crowding', 'short_crowded', stats, options))
    }

    if (
      stats.firstHalfAvg <= -options.averageFundingThreshold &&
      stats.secondHalfAvg >= options.averageFundingThreshold &&
      stats.minFunding <= -options.absoluteFundingThreshold &&
      stats.maxFunding >= options.absoluteFundingThreshold
    ) {
      findings.push(buildFinding('funding_flip', 'negative_to_positive', stats, options))
    }

    if (
      stats.firstHalfAvg >= options.averageFundingThreshold &&
      stats.secondHalfAvg <= -options.averageFundingThreshold &&
      stats.maxFunding >= options.absoluteFundingThreshold &&
      stats.minFunding <= -options.absoluteFundingThreshold
    ) {
      findings.push(buildFinding('funding_flip', 'positive_to_negative', stats, options))
    }
  }

  return findings.sort((a, b) => b.priorityHint - a.priorityHint || a.asset.localeCompare(b.asset) || a.type.localeCompare(b.type))
}
