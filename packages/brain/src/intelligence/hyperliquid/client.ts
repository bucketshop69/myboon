import type { HyperliquidMarketSnapshot, HyperliquidPositionSnapshot, HyperliquidPositionSide } from './types.js'

const DEFAULT_INFO_URL = 'https://api.hyperliquid.xyz/info'

interface HyperliquidClientOptions {
  infoUrl?: string
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

  async fetchMarketSnapshots(observedAt: string): Promise<HyperliquidMarketSnapshot[]> {
    const data = await this.post<unknown[]>({ type: 'metaAndAssetCtxs' })
    const meta = data[0]
    const contexts = Array.isArray(data[1]) ? data[1] : []
    return contexts
      .map((ctx, index) => parseMarketSnapshot(meta, ctx, index, observedAt))
      .filter((snapshot): snapshot is HyperliquidMarketSnapshot => snapshot != null)
  }
}
