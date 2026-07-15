import {
  dataApiFetch,
  gammaFetch,
  parseNullableNumber,
  parseStringArray,
} from './market-read.js'

export function isPositivePositionValue(position: unknown): boolean {
  if (!position || typeof position !== 'object') return false
  const value = parseNullableNumber((position as Record<string, unknown>).currentValue) ?? 0
  return value >= 0.01
}

export function positionIdentityKey(input: unknown): string | null {
  const record = asRecord(input)
  if (!record) return null
  const conditionId = typeof record.conditionId === 'string' ? record.conditionId.toLowerCase() : ''
  const asset = typeof record.asset === 'string' ? record.asset.toLowerCase() : ''
  const outcomeIndex = parseNullableNumber(record.outcomeIndex)
  if (!conditionId || !asset || outcomeIndex === null) return null
  return `${conditionId}:${outcomeIndex}:${asset}`
}

function positionCostBasis(position: Record<string, unknown>): number {
  const size = parseNullableNumber(position.size) ?? 0
  const avgPrice = parseNullableNumber(position.avgPrice) ?? 0
  const cashPnl = parseNullableNumber(position.cashPnl)
  const currentValue = parseNullableNumber(position.currentValue)
  const derivedFromPnl = cashPnl !== null && currentValue !== null ? currentValue - cashPnl : null
  const directCost = size * avgPrice
  const cost = derivedFromPnl !== null && derivedFromPnl > 0 ? derivedFromPnl : directCost
  return Math.round(Math.max(cost, 0) * 100) / 100
}

export function redeemableLossToClosedPosition(raw: unknown): unknown | null {
  const position = asRecord(raw)
  if (!position) return null
  if (!parseBoolean(position.redeemable)) return null
  if (isPositivePositionValue(position)) return null

  const cost = positionCostBasis(position)
  const cashPnl = parseNullableNumber(position.cashPnl)
  const realizedPnl = cashPnl !== null ? Math.round(cashPnl * 100) / 100 : -cost
  const timestamp = parseNullableNumber(position.timestamp)
    ?? (typeof position.endDate === 'string' ? Math.floor(Date.parse(position.endDate) / 1000) : null)
    ?? 0

  return {
    proxyWallet: position.proxyWallet,
    asset: position.asset,
    conditionId: position.conditionId,
    avgPrice: position.avgPrice,
    totalBought: cost,
    realizedPnl,
    curPrice: parseNullableNumber(position.curPrice) ?? 0,
    timestamp,
    title: position.title,
    slug: position.slug,
    icon: position.icon ?? null,
    eventSlug: position.eventSlug ?? position.slug,
    outcome: position.outcome,
    outcomeIndex: position.outcomeIndex,
    oppositeOutcome: position.oppositeOutcome ?? '',
    oppositeAsset: position.oppositeAsset ?? '',
    endDate: position.endDate ?? null,
    settledSource: 'zero_value_redeemable',
  }
}

export function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? input as Record<string, unknown> : null
}

function parseBoolean(input: unknown): boolean {
  return input === true || input === 'true'
}

type ActivityFallbackGroup = {
  proxyWallet: string
  asset: string
  conditionId: string
  totalSize: number
  totalUsdc: number
  timestamp: number
  title: string
  slug: string
  icon: string | null
  eventSlug: string
  outcome: string
  outcomeIndex: number
}

type ActivityCostBasis = {
  totalSize: number
  totalUsdc: number
}

function activityDedupeKey(input: unknown): string {
  const activity = asRecord(input)
  if (!activity) return JSON.stringify(input)
  return [
    activity.transactionHash,
    activity.type,
    activity.side,
    activity.conditionId,
    activity.asset,
    activity.outcomeIndex,
    activity.size,
    activity.usdcSize,
    activity.price,
    activity.timestamp,
  ].join(':')
}

export function dedupeActivity(input: unknown[]): unknown[] {
  const seen = new Set<string>()
  const deduped: unknown[] = []
  for (const item of input) {
    const key = activityDedupeKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

function activityCostBasisKey(input: {
  asset?: unknown
  conditionId?: unknown
  outcomeIndex?: unknown
}): string | null {
  const asset = typeof input.asset === 'string' ? input.asset.toLowerCase() : ''
  const conditionId = typeof input.conditionId === 'string' ? input.conditionId.toLowerCase() : ''
  const outcomeIndex = parseNullableNumber(input.outcomeIndex)
  if (!asset || !conditionId || outcomeIndex === null) return null
  return `${conditionId}:${outcomeIndex}:${asset}`
}

function buildActivityCostBasis(activity: unknown[]): Map<string, ActivityCostBasis> {
  const basis = new Map<string, ActivityCostBasis>()
  const seenTrades = new Set<string>()

  for (const raw of activity) {
    const trade = asRecord(raw)
    if (!trade) continue
    if (trade.type !== 'TRADE' || trade.side !== 'BUY') continue

    const key = activityCostBasisKey(trade)
    const size = parseNullableNumber(trade.size) ?? parseNullableNumber(trade.amount) ?? 0
    const usdcSize = parseNullableNumber(trade.usdcSize) ?? 0
    if (!key || size <= 0 || usdcSize <= 0) continue

    const dedupeKey = [
      trade.transactionHash,
      trade.asset,
      trade.conditionId,
      trade.outcomeIndex,
      size,
      usdcSize,
      trade.price,
    ].join(':')
    if (seenTrades.has(dedupeKey)) continue
    seenTrades.add(dedupeKey)

    const existing = basis.get(key)
    if (existing) {
      existing.totalSize += size
      existing.totalUsdc += usdcSize
    } else {
      basis.set(key, { totalSize: size, totalUsdc: usdcSize })
    }
  }

  return basis
}

export function hydrateMissingPositionCostBasis(positions: unknown[], activity: unknown[]): unknown[] {
  if (positions.length === 0 || activity.length === 0) return positions

  const basis = buildActivityCostBasis(activity)
  if (basis.size === 0) return positions

  return positions.map((raw) => {
    const position = asRecord(raw)
    if (!position) return raw

    const key = activityCostBasisKey(position)
    const costBasis = key ? basis.get(key) : undefined
    if (!costBasis || costBasis.totalSize <= 0 || costBasis.totalUsdc <= 0) return raw

    const avgPrice = parseNullableNumber(position.avgPrice) ?? 0
    const size = parseNullableNumber(position.size) ?? 0
    const existingCost = avgPrice * size
    if (avgPrice > 0 && existingCost > 0) return raw

    const hydratedAvgPrice = Math.round((costBasis.totalUsdc / costBasis.totalSize) * 100) / 100
    const currentValue = parseNullableNumber(position.currentValue)
    const hydrated: Record<string, unknown> = {
      ...position,
      avgPrice: hydratedAvgPrice,
    }

    if (currentValue !== null) {
      const cost = hydratedAvgPrice * size
      hydrated.cashPnl = Math.round((currentValue - cost) * 100) / 100
      hydrated.percentPnl = cost > 0 ? Math.round(((currentValue - cost) / cost) * 10_000) / 100 : position.percentPnl
    }

    return hydrated
  })
}

async function fetchGammaMarketsForSlug(slug: string): Promise<Record<string, unknown>[]> {
  const eventRes = await gammaFetch(`events?slug=${encodeURIComponent(slug)}`)
  if (eventRes.ok) {
    const body = await eventRes.json() as unknown
    if (Array.isArray(body)) {
      const markets = body.flatMap((event) => {
        const record = asRecord(event)
        return Array.isArray(record?.markets) ? record.markets : []
      })
      if (markets.length > 0) return markets.filter((market): market is Record<string, unknown> => !!asRecord(market))
    }
  }

  const marketRes = await gammaFetch(`markets?slug=${encodeURIComponent(slug)}`)
  if (!marketRes.ok) return []
  const body = await marketRes.json() as unknown
  return Array.isArray(body) ? body.filter((market): market is Record<string, unknown> => !!asRecord(market)) : []
}

export async function buildClosedPositionsFromActivity(address: string): Promise<unknown[]> {
  const activityRes = await dataApiFetch(
    `activity?user=${encodeURIComponent(address)}&limit=500&sortBy=TIMESTAMP&sortDirection=DESC`
  )
  if (!activityRes.ok) return []

  const body = await activityRes.json() as unknown
  if (!Array.isArray(body)) return []

  const seenTrades = new Set<string>()
  const groups = new Map<string, ActivityFallbackGroup>()

  for (const raw of body) {
    const activity = asRecord(raw)
    if (!activity) continue
    if (activity.type !== 'TRADE' || activity.side !== 'BUY') continue

    const slug = typeof activity.slug === 'string' ? activity.slug : null
    const conditionId = typeof activity.conditionId === 'string' ? activity.conditionId : null
    const asset = typeof activity.asset === 'string' ? activity.asset : ''
    const size = parseNullableNumber(activity.size) ?? parseNullableNumber(activity.amount) ?? 0
    const usdcSize = parseNullableNumber(activity.usdcSize) ?? 0
    const outcomeIndex = parseNullableNumber(activity.outcomeIndex)
    const timestamp = parseNullableNumber(activity.timestamp) ?? 0

    if (!slug || !conditionId || outcomeIndex === null || size <= 0 || usdcSize <= 0 || timestamp <= 0) continue

    const dedupeKey = [
      activity.transactionHash,
      asset,
      conditionId,
      outcomeIndex,
      size,
      usdcSize,
      activity.price,
    ].join(':')
    if (seenTrades.has(dedupeKey)) continue
    seenTrades.add(dedupeKey)

    const groupKey = `${conditionId}:${outcomeIndex}:${asset}`
    const existing = groups.get(groupKey)
    if (existing) {
      existing.totalSize += size
      existing.totalUsdc += usdcSize
      existing.timestamp = Math.max(existing.timestamp, timestamp)
      continue
    }

    groups.set(groupKey, {
      proxyWallet: typeof activity.proxyWallet === 'string' ? activity.proxyWallet : address,
      asset,
      conditionId,
      totalSize: size,
      totalUsdc: usdcSize,
      timestamp,
      title: typeof activity.title === 'string' ? activity.title : slug,
      slug,
      icon: typeof activity.icon === 'string' ? activity.icon : null,
      eventSlug: typeof activity.eventSlug === 'string' ? activity.eventSlug : slug,
      outcome: typeof activity.outcome === 'string' ? activity.outcome : 'Yes',
      outcomeIndex,
    })
  }

  const marketsBySlug = new Map<string, Record<string, unknown>[]>()
  await Promise.all([...new Set([...groups.values()].map((group) => group.slug))].map(async (slug) => {
    try {
      marketsBySlug.set(slug, await fetchGammaMarketsForSlug(slug))
    } catch (err) {
      console.warn(`[api] Activity fallback market lookup failed for ${slug}:`, err instanceof Error ? err.message : err)
      marketsBySlug.set(slug, [])
    }
  }))

  const closedPositions: unknown[] = []
  for (const group of groups.values()) {
    const markets = marketsBySlug.get(group.slug) ?? []
    const market = markets.find((candidate) => candidate.conditionId === group.conditionId)
      ?? markets.find((candidate) => candidate.slug === group.slug)
    if (!market || !parseBoolean(market.closed)) continue

    const outcomePrices = parseStringArray(market.outcomePrices)
    const outcomes = parseStringArray(market.outcomes)
    const finalPrice = parseNullableNumber(outcomePrices[group.outcomeIndex])
    if (finalPrice === null) continue

    // The current app renders closed winners as "Collected"; avoid implying a payout
    // was collected when we only know about raw trade activity.
    if (finalPrice >= 0.99) continue

    const payout = 0
    const totalBought = Math.round(group.totalUsdc * 100) / 100
    const realizedPnl = Math.round((payout - group.totalUsdc) * 100) / 100

    closedPositions.push({
      proxyWallet: group.proxyWallet,
      asset: group.asset,
      conditionId: group.conditionId,
      avgPrice: group.totalSize > 0 ? Math.round((group.totalUsdc / group.totalSize) * 100) / 100 : 0,
      totalBought,
      realizedPnl,
      curPrice: finalPrice,
      timestamp: group.timestamp,
      title: group.title,
      slug: group.slug,
      icon: group.icon,
      eventSlug: group.eventSlug,
      outcome: group.outcome,
      outcomeIndex: group.outcomeIndex,
      oppositeOutcome: outcomes.find((_, index) => index !== group.outcomeIndex) ?? '',
      oppositeAsset: '',
      endDate: typeof market.endDate === 'string' ? market.endDate : null,
      fallbackSource: 'activity',
    })
  }

  return closedPositions.sort((a, b) => {
    const left = parseNullableNumber(asRecord(a)?.timestamp) ?? 0
    const right = parseNullableNumber(asRecord(b)?.timestamp) ?? 0
    return right - left
  })
}
