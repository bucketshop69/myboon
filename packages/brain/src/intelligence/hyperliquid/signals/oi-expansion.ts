export interface HyperliquidOiExpansionPoint {
  asset: string
  observedAt: string
  openInterestUsd: number | null
  markPrice?: number | null
  midPrice?: number | null
  oraclePrice?: number | null
}

export interface HyperliquidOiExpansionOptions {
  minOpenInterestUsd?: number
  minOiIncreaseUsd?: number
  minOiIncreasePct?: number
  requirePriceConfirmation?: boolean
  minPriceIncreasePct?: number
}

export interface HyperliquidOiExpansionFinding {
  id: string
  type: 'oi_expansion'
  asset: string
  startOpenInterestUsd: number
  endOpenInterestUsd: number
  oiDeltaUsd: number
  oiDeltaPct: number
  startPriceUsd: number | null
  endPriceUsd: number | null
  priceDeltaPct: number | null
  timeRange: {
    start: string
    end: string
    days: number
  }
  reason: string
  priorityHint: number
  storyKey: string
}

interface ValidOiPoint extends HyperliquidOiExpansionPoint {
  openInterestUsd: number
}

interface ResolvedOptions {
  minOpenInterestUsd: number
  minOiIncreaseUsd: number
  minOiIncreasePct: number
  requirePriceConfirmation: boolean
  minPriceIncreasePct: number
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  minOpenInterestUsd: 25_000_000,
  minOiIncreaseUsd: 10_000_000,
  minOiIncreasePct: 0.25,
  requirePriceConfirmation: false,
  minPriceIncreasePct: 0,
}

function resolveOptions(options: HyperliquidOiExpansionOptions = {}): ResolvedOptions {
  return {
    minOpenInterestUsd: options.minOpenInterestUsd ?? DEFAULT_OPTIONS.minOpenInterestUsd,
    minOiIncreaseUsd: options.minOiIncreaseUsd ?? DEFAULT_OPTIONS.minOiIncreaseUsd,
    minOiIncreasePct: options.minOiIncreasePct ?? DEFAULT_OPTIONS.minOiIncreasePct,
    requirePriceConfirmation: options.requirePriceConfirmation ?? DEFAULT_OPTIONS.requirePriceConfirmation,
    minPriceIncreasePct: options.minPriceIncreasePct ?? DEFAULT_OPTIONS.minPriceIncreasePct,
  }
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function hasValidOpenInterest(point: HyperliquidOiExpansionPoint): point is ValidOiPoint {
  return isPositiveFinite(point.openInterestUsd)
}

function price(point: HyperliquidOiExpansionPoint): number | null {
  if (isPositiveFinite(point.markPrice)) return point.markPrice
  if (isPositiveFinite(point.midPrice)) return point.midPrice
  if (isPositiveFinite(point.oraclePrice)) return point.oraclePrice
  return null
}

function groupByAsset(points: HyperliquidOiExpansionPoint[]): Map<string, HyperliquidOiExpansionPoint[]> {
  const grouped = new Map<string, HyperliquidOiExpansionPoint[]>()
  for (const point of points) {
    const asset = point.asset.trim()
    if (!asset) continue
    grouped.set(asset, [...(grouped.get(asset) ?? []), point])
  }
  return grouped
}

function storyKey(asset: string): string {
  return ['hyperliquid', 'oi-expansion', normalizePart(asset)].join(':')
}

function timeRangeDays(start: string, end: string): number {
  const elapsedMs = new Date(end).getTime() - new Date(start).getTime()
  return round(Math.max(0, elapsedMs) / 86_400_000, 2)
}

function money(value: number): string {
  if (value >= 1_000_000_000) return `$${round(value / 1_000_000_000, 1)}B`
  if (value >= 1_000_000) return `$${round(value / 1_000_000, 1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function priorityHint(endOpenInterestUsd: number, oiDeltaUsd: number, oiDeltaPct: number, priceDeltaPct: number | null): number {
  const sizeBoost = endOpenInterestUsd >= 100_000_000 ? 1 : 0
  const deltaBoost = oiDeltaUsd >= 25_000_000 ? 1 : 0
  const pctBoost = oiDeltaPct >= 0.5 ? 1 : 0
  const priceBoost = priceDeltaPct != null && priceDeltaPct >= 0 ? 1 : 0
  return Math.min(9, 5 + sizeBoost + deltaBoost + pctBoost + priceBoost)
}

function reason(asset: string, oiDeltaUsd: number, oiDeltaPct: number, days: number, priceDeltaPct: number | null): string {
  const oiText = `${money(oiDeltaUsd)} (${round(oiDeltaPct * 100, 1)}%)`
  const windowText = days > 0 ? `${days}d` : 'the supplied window'
  if (priceDeltaPct == null) {
    return `${asset} open interest expanded by ${oiText} over ${windowText}.`
  }
  const priceText = `${round(priceDeltaPct * 100, 1)}%`
  return `${asset} open interest expanded by ${oiText} over ${windowText} while price moved ${priceText}.`
}

export function detectHyperliquidOiExpansionFindings(
  points: HyperliquidOiExpansionPoint[],
  options?: HyperliquidOiExpansionOptions
): HyperliquidOiExpansionFinding[] {
  const resolved = resolveOptions(options)
  const findings: HyperliquidOiExpansionFinding[] = []

  for (const [asset, assetPoints] of groupByAsset(points)) {
    const validPoints = assetPoints
      .filter(hasValidOpenInterest)
      .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime())

    const start = validPoints[0]
    const end = validPoints.at(-1)
    if (!start || !end || start === end) continue

    const startOpenInterestUsd = start.openInterestUsd
    const endOpenInterestUsd = end.openInterestUsd
    const oiDeltaUsd = endOpenInterestUsd - startOpenInterestUsd
    const oiDeltaPct = oiDeltaUsd / startOpenInterestUsd
    if (endOpenInterestUsd < resolved.minOpenInterestUsd) continue
    if (oiDeltaUsd < resolved.minOiIncreaseUsd) continue
    if (oiDeltaPct < resolved.minOiIncreasePct) continue

    const startPriceUsd = price(start)
    const endPriceUsd = price(end)
    const priceDeltaPct = startPriceUsd != null && endPriceUsd != null
      ? (endPriceUsd - startPriceUsd) / startPriceUsd
      : null
    if (resolved.requirePriceConfirmation) {
      if (priceDeltaPct == null || priceDeltaPct < resolved.minPriceIncreasePct) continue
    }

    const days = timeRangeDays(start.observedAt, end.observedAt)
    const key = storyKey(asset)
    findings.push({
      id: `${key}:${end.observedAt}`,
      type: 'oi_expansion',
      asset,
      startOpenInterestUsd: round(startOpenInterestUsd),
      endOpenInterestUsd: round(endOpenInterestUsd),
      oiDeltaUsd: round(oiDeltaUsd),
      oiDeltaPct: round(oiDeltaPct, 4),
      startPriceUsd: startPriceUsd == null ? null : round(startPriceUsd, 6),
      endPriceUsd: endPriceUsd == null ? null : round(endPriceUsd, 6),
      priceDeltaPct: priceDeltaPct == null ? null : round(priceDeltaPct, 4),
      timeRange: {
        start: start.observedAt,
        end: end.observedAt,
        days,
      },
      reason: reason(asset, oiDeltaUsd, oiDeltaPct, days, priceDeltaPct),
      priorityHint: priorityHint(endOpenInterestUsd, oiDeltaUsd, oiDeltaPct, priceDeltaPct),
      storyKey: key,
    })
  }

  return findings.sort((a, b) => b.priorityHint - a.priorityHint || b.oiDeltaUsd - a.oiDeltaUsd)
}
