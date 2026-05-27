export interface HyperliquidVolumePoint {
  asset: string
  volumeUsd: number | null
  observedAt: string
  windowStart?: string | null
  windowEnd?: string | null
}

export interface HyperliquidVolumeSpikeOptions {
  baselineWindowMs?: number
  minBaselinePoints?: number
  minSpikeMultiple?: number
  minRecentVolumeUsd?: number
}

export interface HyperliquidVolumeSpikeFinding {
  asset: string
  recentVolumeUsd: number
  baselineVolumeUsd: number
  spikeMultiple: number
  timeRange: {
    baselineStart: string
    baselineEnd: string
    recentStart: string
    recentEnd: string
  }
  reason: string
  priorityHint: number
  storyKey: string
}

const DEFAULT_BASELINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_MIN_BASELINE_POINTS = 3
const DEFAULT_MIN_SPIKE_MULTIPLE = 2
const DEFAULT_MIN_RECENT_VOLUME_USD = 1_000_000

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function storyKey(asset: string): string {
  return ['hyperliquid', 'volume-spike', normalizePart(asset)].join(':')
}

function isUsableVolumePoint(point: HyperliquidVolumePoint): boolean {
  const observedTime = Date.parse(point.observedAt)
  return Number.isFinite(observedTime) && point.asset.trim().length > 0 && point.volumeUsd != null && point.volumeUsd >= 0
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function priorityHint(spikeMultiple: number, recentVolumeUsd: number): number {
  const multipleBoost = spikeMultiple >= 5 ? 2 : spikeMultiple >= 3 ? 1 : 0
  const sizeBoost = recentVolumeUsd >= 100_000_000 ? 2 : recentVolumeUsd >= 25_000_000 ? 1 : 0
  return Math.min(9, 6 + multipleBoost + sizeBoost)
}

function money(value: number): string {
  if (value >= 1_000_000_000) return `$${round(value / 1_000_000_000, 1)}B`
  if (value >= 1_000_000) return `$${round(value / 1_000_000, 1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function byAsset(points: HyperliquidVolumePoint[]): Map<string, HyperliquidVolumePoint[]> {
  const grouped = new Map<string, HyperliquidVolumePoint[]>()
  for (const point of points) {
    if (!isUsableVolumePoint(point)) continue
    const asset = point.asset.trim().toUpperCase()
    grouped.set(asset, [...(grouped.get(asset) ?? []), { ...point, asset }])
  }
  return grouped
}

export function detectHyperliquidVolumeSpikes(
  points: HyperliquidVolumePoint[],
  options: HyperliquidVolumeSpikeOptions = {}
): HyperliquidVolumeSpikeFinding[] {
  const baselineWindowMs = options.baselineWindowMs ?? DEFAULT_BASELINE_WINDOW_MS
  const minBaselinePoints = options.minBaselinePoints ?? DEFAULT_MIN_BASELINE_POINTS
  const minSpikeMultiple = options.minSpikeMultiple ?? DEFAULT_MIN_SPIKE_MULTIPLE
  const minRecentVolumeUsd = options.minRecentVolumeUsd ?? DEFAULT_MIN_RECENT_VOLUME_USD
  const findings: HyperliquidVolumeSpikeFinding[] = []

  for (const [asset, assetPoints] of byAsset(points)) {
    const sorted = [...assetPoints].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
    const recent = sorted[sorted.length - 1]
    const recentTime = Date.parse(recent.observedAt)
    const baselineStartTime = recentTime - baselineWindowMs
    const baseline = sorted.filter((point) => {
      const observedTime = Date.parse(point.observedAt)
      return observedTime >= baselineStartTime && observedTime < recentTime
    })

    if (baseline.length < minBaselinePoints) continue
    if (recent.volumeUsd == null || recent.volumeUsd < minRecentVolumeUsd) continue

    const baselineVolumeUsd = average(baseline.map((point) => point.volumeUsd ?? 0))
    if (baselineVolumeUsd <= 0) continue

    const spikeMultiple = recent.volumeUsd / baselineVolumeUsd
    if (spikeMultiple < minSpikeMultiple) continue

    const roundedBaseline = round(baselineVolumeUsd)
    const roundedMultiple = round(spikeMultiple)
    findings.push({
      asset,
      recentVolumeUsd: round(recent.volumeUsd),
      baselineVolumeUsd: roundedBaseline,
      spikeMultiple: roundedMultiple,
      timeRange: {
        baselineStart: new Date(baselineStartTime).toISOString(),
        baselineEnd: baseline[baseline.length - 1].observedAt,
        recentStart: recent.windowStart ?? recent.observedAt,
        recentEnd: recent.windowEnd ?? recent.observedAt,
      },
      reason: `${asset} volume is ${roundedMultiple}x its 7-day baseline (${money(recent.volumeUsd)} vs ${money(roundedBaseline)}).`,
      priorityHint: priorityHint(spikeMultiple, recent.volumeUsd),
      storyKey: storyKey(asset),
    })
  }

  return findings.sort((a, b) => b.priorityHint - a.priorityHint || b.spikeMultiple - a.spikeMultiple || a.asset.localeCompare(b.asset))
}
