export type HyperliquidPriceOiDivergenceClassification =
  | 'leverage_momentum'
  | 'pressure_building'
  | 'short_covering'
  | 'unwind'

export interface HyperliquidPriceOiPoint {
  asset: string
  timestamp: string
  price: number
  openInterestUsd: number
}

export interface HyperliquidPriceOiDivergenceOptions {
  now?: string
  windowDays?: number
  minPriceMovePct?: number
  minOpenInterestMovePct?: number
  minOpenInterestDeltaUsd?: number
}

export interface HyperliquidPriceOiDivergenceFinding {
  asset: string
  classification: HyperliquidPriceOiDivergenceClassification
  deltas: {
    priceStart: number
    priceEnd: number
    priceDelta: number
    priceDeltaPct: number
    openInterestStartUsd: number
    openInterestEndUsd: number
    openInterestDeltaUsd: number
    openInterestDeltaPct: number
  }
  timeRange: {
    start: string
    end: string
    days: number
  }
  reason: string
  priorityHint: number
  storyKey: string
}

interface NormalizedPoint extends HyperliquidPriceOiPoint {
  asset: string
  timeMs: number
}

const defaultOptions = {
  windowDays: 7,
  minPriceMovePct: 0.02,
  minOpenInterestMovePct: 0.05,
  minOpenInterestDeltaUsd: 10_000_000,
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase()
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function normalizePoint(point: HyperliquidPriceOiPoint): NormalizedPoint | null {
  const asset = normalizeAsset(point.asset)
  const timeMs = new Date(point.timestamp).getTime()
  if (!asset || !Number.isFinite(timeMs)) return null
  if (!isPositiveFinite(point.price) || !isPositiveFinite(point.openInterestUsd)) return null
  return { ...point, asset, timeMs }
}

function groupByAsset(points: NormalizedPoint[]): Map<string, NormalizedPoint[]> {
  const groups = new Map<string, NormalizedPoint[]>()
  for (const point of points) {
    const group = groups.get(point.asset) ?? []
    group.push(point)
    groups.set(point.asset, group)
  }
  return groups
}

function resolveEndTime(points: NormalizedPoint[], now?: string): number {
  if (now) {
    const parsed = new Date(now).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return Math.max(...points.map((point) => point.timeMs))
}

function classify(priceDeltaPct: number, openInterestDeltaPct: number): HyperliquidPriceOiDivergenceClassification {
  if (priceDeltaPct > 0 && openInterestDeltaPct > 0) return 'leverage_momentum'
  if (priceDeltaPct < 0 && openInterestDeltaPct > 0) return 'pressure_building'
  if (priceDeltaPct > 0 && openInterestDeltaPct < 0) return 'short_covering'
  return 'unwind'
}

function classificationLabel(classification: HyperliquidPriceOiDivergenceClassification): string {
  if (classification === 'leverage_momentum') return 'leverage momentum / fresh positioning'
  if (classification === 'pressure_building') return 'short build or long defense / pressure building'
  if (classification === 'short_covering') return 'squeeze or short covering'
  return 'unwind / de-risking'
}

function directionText(deltaPct: number): string {
  return deltaPct > 0 ? 'up' : 'down'
}

function pctText(value: number): string {
  return `${round(Math.abs(value) * 100, 2)}%`
}

function moneyText(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${round(abs / 1_000_000_000, 2)}B`
  if (abs >= 1_000_000) return `$${round(abs / 1_000_000, 1)}M`
  if (abs >= 1_000) return `$${round(abs / 1_000, 1)}K`
  return `$${round(abs, 0)}`
}

function reason(
  asset: string,
  classification: HyperliquidPriceOiDivergenceClassification,
  priceDeltaPct: number,
  openInterestDeltaPct: number,
  openInterestDeltaUsd: number,
  days: number
): string {
  return `${asset} price moved ${directionText(priceDeltaPct)} ${pctText(priceDeltaPct)} while open interest moved ${directionText(openInterestDeltaPct)} ${pctText(openInterestDeltaPct)} (${moneyText(openInterestDeltaUsd)}) over ${round(days, 1)} days, pointing to ${classificationLabel(classification)}.`
}

function priorityHint(
  classification: HyperliquidPriceOiDivergenceClassification,
  priceDeltaPct: number,
  openInterestDeltaPct: number,
  openInterestDeltaUsd: number
): number {
  const base = classification === 'pressure_building'
    ? 7
    : classification === 'leverage_momentum'
      ? 6
      : classification === 'short_covering'
        ? 6
        : 5
  const pctBoost = Math.abs(priceDeltaPct) >= 0.08 || Math.abs(openInterestDeltaPct) >= 0.15 ? 1 : 0
  const usdBoost = Math.abs(openInterestDeltaUsd) >= 100_000_000 ? 1 : 0
  return Math.min(9, base + pctBoost + usdBoost)
}

function storyKey(asset: string, classification: HyperliquidPriceOiDivergenceClassification): string {
  return ['hyperliquid', 'price-oi-divergence', normalizePart(asset), normalizePart(classification)].join(':')
}

export function detectHyperliquidPriceOiDivergences(
  points: HyperliquidPriceOiPoint[],
  options: HyperliquidPriceOiDivergenceOptions = {}
): HyperliquidPriceOiDivergenceFinding[] {
  const normalized = points.map(normalizePoint).filter((point): point is NormalizedPoint => Boolean(point))
  if (normalized.length === 0) return []

  const windowDays = options.windowDays ?? defaultOptions.windowDays
  const minPriceMovePct = options.minPriceMovePct ?? defaultOptions.minPriceMovePct
  const minOpenInterestMovePct = options.minOpenInterestMovePct ?? defaultOptions.minOpenInterestMovePct
  const minOpenInterestDeltaUsd = options.minOpenInterestDeltaUsd ?? defaultOptions.minOpenInterestDeltaUsd
  const endTime = resolveEndTime(normalized, options.now)
  const startTime = endTime - windowDays * 24 * 60 * 60 * 1000
  const inWindow = normalized.filter((point) => point.timeMs >= startTime && point.timeMs <= endTime)
  const findings: HyperliquidPriceOiDivergenceFinding[] = []

  for (const [asset, assetPoints] of groupByAsset(inWindow)) {
    const sorted = assetPoints.sort((a, b) => a.timeMs - b.timeMs)
    const first = sorted[0]
    const last = sorted.at(-1)
    if (!first || !last || first.timeMs === last.timeMs) continue

    const priceDelta = last.price - first.price
    const priceDeltaPct = priceDelta / first.price
    const openInterestDeltaUsd = last.openInterestUsd - first.openInterestUsd
    const openInterestDeltaPct = openInterestDeltaUsd / first.openInterestUsd
    if (Math.abs(priceDeltaPct) < minPriceMovePct) continue
    if (Math.abs(openInterestDeltaPct) < minOpenInterestMovePct) continue
    if (Math.abs(openInterestDeltaUsd) < minOpenInterestDeltaUsd) continue

    const classification = classify(priceDeltaPct, openInterestDeltaPct)
    const days = (last.timeMs - first.timeMs) / (24 * 60 * 60 * 1000)
    findings.push({
      asset,
      classification,
      deltas: {
        priceStart: round(first.price, 6),
        priceEnd: round(last.price, 6),
        priceDelta: round(priceDelta, 6),
        priceDeltaPct: round(priceDeltaPct),
        openInterestStartUsd: round(first.openInterestUsd, 2),
        openInterestEndUsd: round(last.openInterestUsd, 2),
        openInterestDeltaUsd: round(openInterestDeltaUsd, 2),
        openInterestDeltaPct: round(openInterestDeltaPct),
      },
      timeRange: {
        start: first.timestamp,
        end: last.timestamp,
        days: round(days, 2),
      },
      reason: reason(asset, classification, priceDeltaPct, openInterestDeltaPct, openInterestDeltaUsd, days),
      priorityHint: priorityHint(classification, priceDeltaPct, openInterestDeltaPct, openInterestDeltaUsd),
      storyKey: storyKey(asset, classification),
    })
  }

  return findings.sort((a, b) => b.priorityHint - a.priorityHint || Math.abs(b.deltas.openInterestDeltaUsd) - Math.abs(a.deltas.openInterestDeltaUsd))
}
