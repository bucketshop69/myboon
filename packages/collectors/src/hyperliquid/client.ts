import type { HyperliquidMarketSnapshot, HyperliquidPositionSnapshot, HyperliquidPositionSide } from './types.js'

const DEFAULT_INFO_URL = 'https://api.hyperliquid.xyz/info'

interface HyperliquidClientOptions {
  infoUrl?: string
}

export interface HyperliquidFill {
  coin: string
  dir: string
  px: number
  sz: number
  time: number
  closedPnl: number | null
  hash: string | null
  oid: number | string | null
  crossed?: boolean | null
  raw: unknown
}

export interface HyperliquidCandle {
  coin: string
  interval: string
  startTime: number
  endTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  trades: number | null
  raw: unknown
}

export interface HyperliquidFundingPoint {
  coin: string
  time: number
  fundingRate: number
  premium: number | null
  raw: unknown
}

export interface HyperliquidLeaderboardRow {
  wallet: string
  displayName: string | null
  accountValueUsd: number | null
  dayVolumeUsd: number | null
  weekVolumeUsd: number | null
  monthVolumeUsd: number | null
  allTimeVolumeUsd: number | null
  raw: unknown
}

export interface HyperliquidLedgerUpdate {
  time: number
  hash: string | null
  type: string | null
  requestedUsd: number | null
  netWithdrawnUsd: number | null
  raw: unknown
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function positiveNumberOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 ? parsed : null
}

function sideFromSize(size: number): HyperliquidPositionSide | null {
  if (size > 0) return 'long'
  if (size < 0) return 'short'
  return null
}

function positionRaw(position: unknown): Record<string, unknown> {
  if (position && typeof position === 'object') return position as Record<string, unknown>
  return {}
}

function leverageValue(value: unknown): number | null {
  if (typeof value === 'number' || typeof value === 'string') return numberOrNull(value)
  if (value && typeof value === 'object') {
    return numberOrNull((value as { value?: unknown }).value)
  }
  return null
}

function parsePosition(wallet: string, rawAssetPosition: unknown, observedAt: string): HyperliquidPositionSnapshot | null {
  const assetPosition = positionRaw(rawAssetPosition)
  const raw = positionRaw(assetPosition.position ?? rawAssetPosition)
  const asset = typeof raw.coin === 'string' ? raw.coin : null
  const size = numberOrNull(raw.szi)
  if (!asset || size == null || size === 0) return null

  const side = sideFromSize(size)
  if (!side) return null

  const markPrice = positiveNumberOrNull(raw.markPx)
  const notionalFromValue = positiveNumberOrNull(raw.positionValue)
  const notionalFromMark = markPrice == null ? null : Math.abs(size) * markPrice

  return {
    wallet,
    asset,
    side,
    size: Math.abs(size),
    notionalUsd: notionalFromValue ?? notionalFromMark ?? 0,
    entryPrice: positiveNumberOrNull(raw.entryPx),
    markPrice,
    leverage: leverageValue(raw.leverage),
    unrealizedPnlUsd: numberOrNull(raw.unrealizedPnl),
    marginUsedUsd: positiveNumberOrNull(raw.marginUsed),
    observedAt,
    raw: rawAssetPosition,
  }
}

function marketName(meta: unknown, index: number): string | null {
  if (!meta || typeof meta !== 'object') return null
  const universe = (meta as { universe?: unknown }).universe
  if (!Array.isArray(universe)) return null
  const row = universe[index]
  if (!row || typeof row !== 'object') return null
  const name = (row as { name?: unknown }).name
  return typeof name === 'string' ? name : null
}

function parseMarketSnapshot(meta: unknown, ctx: unknown, index: number, observedAt: string): HyperliquidMarketSnapshot | null {
  const asset = marketName(meta, index)
  if (!asset || !ctx || typeof ctx !== 'object') return null
  const row = ctx as Record<string, unknown>
  return {
    asset,
    markPrice: positiveNumberOrNull(row.markPx),
    midPrice: positiveNumberOrNull(row.midPx),
    oraclePrice: positiveNumberOrNull(row.oraclePx),
    fundingRate: numberOrNull(row.funding),
    openInterestUsd: positiveNumberOrNull(row.openInterest),
    volume24hUsd: positiveNumberOrNull(row.dayNtlVlm),
    previousDayPrice: positiveNumberOrNull(row.prevDayPx),
    observedAt,
    raw: ctx,
  }
}

function parseFill(rawFill: unknown): HyperliquidFill | null {
  if (!rawFill || typeof rawFill !== 'object') return null
  const raw = rawFill as Record<string, unknown>
  const coin = typeof raw.coin === 'string' ? raw.coin : null
  const dir = typeof raw.dir === 'string' ? raw.dir : null
  const px = positiveNumberOrNull(raw.px)
  const sz = positiveNumberOrNull(raw.sz)
  const time = numberOrNull(raw.time)
  if (!coin || !dir || px == null || sz == null || time == null) return null
  return {
    coin,
    dir,
    px,
    sz,
    time,
    closedPnl: numberOrNull(raw.closedPnl),
    hash: typeof raw.hash === 'string' ? raw.hash : null,
    oid: typeof raw.oid === 'number' || typeof raw.oid === 'string' ? raw.oid : null,
    crossed: typeof raw.crossed === 'boolean' ? raw.crossed : null,
    raw: rawFill,
  }
}

function parseCandle(rawCandle: unknown): HyperliquidCandle | null {
  if (!rawCandle || typeof rawCandle !== 'object') return null
  const raw = rawCandle as Record<string, unknown>
  const coin = typeof raw.s === 'string' ? raw.s : null
  const interval = typeof raw.i === 'string' ? raw.i : null
  const startTime = numberOrNull(raw.t)
  const endTime = numberOrNull(raw.T)
  const open = positiveNumberOrNull(raw.o)
  const high = positiveNumberOrNull(raw.h)
  const low = positiveNumberOrNull(raw.l)
  const close = positiveNumberOrNull(raw.c)
  const volume = positiveNumberOrNull(raw.v)
  if (!coin || !interval || startTime == null || endTime == null || open == null || high == null || low == null || close == null || volume == null) return null
  return {
    coin,
    interval,
    startTime,
    endTime,
    open,
    high,
    low,
    close,
    volume,
    trades: numberOrNull(raw.n),
    raw: rawCandle,
  }
}

function parseFundingPoint(coin: string, rawPoint: unknown): HyperliquidFundingPoint | null {
  if (!rawPoint || typeof rawPoint !== 'object') return null
  const raw = rawPoint as Record<string, unknown>
  const time = numberOrNull(raw.time)
  const fundingRate = numberOrNull(raw.fundingRate)
  if (time == null || fundingRate == null) return null
  return {
    coin,
    time,
    fundingRate,
    premium: numberOrNull(raw.premium),
    raw: rawPoint,
  }
}

function leaderboardVolume(row: Record<string, unknown>, window: 'day' | 'week' | 'month' | 'allTime'): number | null {
  const performances = row.windowPerformances
  if (!Array.isArray(performances)) return null
  const match = performances.find((item) => {
    if (!item || typeof item !== 'object') return false
    return (item as { window?: unknown }).window === window
  })
  if (!match || typeof match !== 'object') return null
  return positiveNumberOrNull((match as { vlm?: unknown }).vlm)
}

function parseLedgerUpdate(rawUpdate: unknown): HyperliquidLedgerUpdate | null {
  if (!rawUpdate || typeof rawUpdate !== 'object') return null
  const raw = rawUpdate as Record<string, unknown>
  const time = numberOrNull(raw.time)
  if (time == null) return null
  const delta = raw.delta && typeof raw.delta === 'object'
    ? raw.delta as Record<string, unknown>
    : {}
  return {
    time,
    hash: typeof raw.hash === 'string' ? raw.hash : null,
    type: typeof delta.type === 'string' ? delta.type : null,
    requestedUsd: numberOrNull(delta.requestedUsd),
    netWithdrawnUsd: numberOrNull(delta.netWithdrawnUsd),
    raw: rawUpdate,
  }
}

export class HyperliquidInfoClient {
  private readonly infoUrl: string

  constructor(options: HyperliquidClientOptions = {}) {
    this.infoUrl = options.infoUrl ?? process.env.HYPERLIQUID_INFO_URL ?? DEFAULT_INFO_URL
  }

  private async post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`Hyperliquid info request failed: ${res.status} ${await res.text()}`)
    }
    return res.json() as Promise<T>
  }

  async fetchWalletPositions(wallet: string, observedAt: string): Promise<HyperliquidPositionSnapshot[]> {
    const data = await this.post<{ assetPositions?: unknown[] }>({
      type: 'clearinghouseState',
      user: wallet,
    })
    return (data.assetPositions ?? [])
      .map((position) => parsePosition(wallet, position, observedAt))
      .filter((position): position is HyperliquidPositionSnapshot => position != null)
  }

  async fetchUserRole(wallet: string): Promise<string | null> {
    const data = await this.post<unknown>({
      type: 'userRole',
      user: wallet,
    })
    if (typeof data === 'string') return data
    if (data && typeof data === 'object') {
      const role = (data as { role?: unknown }).role
      return typeof role === 'string' ? role : null
    }
    return null
  }

  async fetchMarketSnapshots(observedAt: string): Promise<HyperliquidMarketSnapshot[]> {
    const data = await this.post<unknown[]>({ type: 'metaAndAssetCtxs' })
    const meta = data[0]
    const contexts = Array.isArray(data[1]) ? data[1] : []
    return contexts
      .map((ctx, index) => parseMarketSnapshot(meta, ctx, index, observedAt))
      .filter((snapshot): snapshot is HyperliquidMarketSnapshot => snapshot != null)
  }

  async fetchUserFillsByTime(wallet: string, startTime: number, endTime: number): Promise<HyperliquidFill[]> {
    const fills: HyperliquidFill[] = []
    let cursor = startTime
    const seen = new Set<string>()

    while (cursor <= endTime) {
      const data = await this.post<unknown[]>({
        type: 'userFillsByTime',
        user: wallet,
        startTime: cursor,
        endTime,
        aggregateByTime: true,
      })
      const parsed = data
        .map(parseFill)
        .filter((fill): fill is HyperliquidFill => fill != null)
        .sort((a, b) => a.time - b.time)

      if (parsed.length === 0) break

      for (const fill of parsed) {
        const key = `${fill.time}:${fill.hash ?? ''}:${fill.oid ?? ''}:${fill.coin}:${fill.dir}:${fill.sz}:${fill.px}`
        if (seen.has(key)) continue
        seen.add(key)
        fills.push(fill)
      }

      const lastTime = parsed[parsed.length - 1]?.time
      if (!lastTime || parsed.length < 1900) break
      cursor = lastTime + 1
      if (fills.length >= 10_000) break
    }

    return fills.sort((a, b) => a.time - b.time)
  }

  async fetchCandleSnapshot(coin: string, interval: string, startTime: number, endTime: number): Promise<HyperliquidCandle[]> {
    const data = await this.post<unknown[]>({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    })
    return data
      .map(parseCandle)
      .filter((candle): candle is HyperliquidCandle => candle != null)
      .sort((a, b) => a.startTime - b.startTime)
  }

  async fetchFundingHistory(coin: string, startTime: number, endTime: number): Promise<HyperliquidFundingPoint[]> {
    const points: HyperliquidFundingPoint[] = []
    let cursor = startTime
    const seen = new Set<number>()

    while (cursor <= endTime) {
      const data = await this.post<unknown[]>({
        type: 'fundingHistory',
        coin,
        startTime: cursor,
        endTime,
      })
      const parsed = data
        .map((point) => parseFundingPoint(coin, point))
        .filter((point): point is HyperliquidFundingPoint => point != null)
        .sort((a, b) => a.time - b.time)

      if (parsed.length === 0) break

      for (const point of parsed) {
        if (seen.has(point.time)) continue
        seen.add(point.time)
        points.push(point)
      }

      const lastTime = parsed[parsed.length - 1]?.time
      if (!lastTime || parsed.length < 500) break
      cursor = lastTime + 1
    }

    return points.sort((a, b) => a.time - b.time)
  }

  async fetchUserNonFundingLedgerUpdates(wallet: string, startTime: number, endTime: number): Promise<HyperliquidLedgerUpdate[]> {
    const data = await this.post<unknown[]>({
      type: 'userNonFundingLedgerUpdates',
      user: wallet,
      startTime,
      endTime,
    })
    return data
      .map(parseLedgerUpdate)
      .filter((update): update is HyperliquidLedgerUpdate => update != null)
      .sort((a, b) => a.time - b.time)
  }
}

export async function fetchHyperliquidLeaderboardRows(limit: number): Promise<HyperliquidLeaderboardRow[]> {
  const res = await fetch('https://stats-data.hyperliquid.xyz/Mainnet/leaderboard')
  if (!res.ok) {
    throw new Error(`Hyperliquid leaderboard request failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json() as { leaderboardRows?: unknown[] }
  return (data.leaderboardRows ?? [])
    .map((rawRow): HyperliquidLeaderboardRow | null => {
      if (!rawRow || typeof rawRow !== 'object') return null
      const row = rawRow as Record<string, unknown>
      const wallet = typeof row.ethAddress === 'string' ? row.ethAddress : null
      if (!wallet) return null
      return {
        wallet,
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
        accountValueUsd: positiveNumberOrNull(row.accountValue),
        dayVolumeUsd: leaderboardVolume(row, 'day'),
        weekVolumeUsd: leaderboardVolume(row, 'week'),
        monthVolumeUsd: leaderboardVolume(row, 'month'),
        allTimeVolumeUsd: leaderboardVolume(row, 'allTime'),
        raw: rawRow,
      }
    })
    .filter((row): row is HyperliquidLeaderboardRow => row != null)
    .slice(0, limit)
}
