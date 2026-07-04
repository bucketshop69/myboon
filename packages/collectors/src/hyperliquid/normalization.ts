import type {
  HyperliquidAssetContext,
  HyperliquidCandle,
  HyperliquidFundingDirection,
  HyperliquidFundingPoint,
  HyperliquidMarketSnapshot,
  HyperliquidMetaAndAssetContexts,
  HyperliquidUniverseAsset,
} from './types'

const HOUR_MS = 3_600_000

const ENTITY_HINTS: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  HYPE: 'HYPE',
  XRP: 'XRP',
  DOGE: 'Dogecoin',
  BNB: 'BNB',
  ADA: 'Cardano',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  SUI: 'Sui',
  BCH: 'Bitcoin Cash',
  LTC: 'Litecoin',
  TON: 'Toncoin',
  TRX: 'TRON',
  DOT: 'Polkadot',
  NEAR: 'NEAR Protocol',
  APT: 'Aptos',
  ARB: 'Arbitrum',
  OP: 'Optimism',
}

export function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function positiveNumberOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 ? parsed : null
}

function round(value: number, decimals = 6): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null
  return round(((current - previous) / previous) * 100, 4)
}

function sign(value: number | null): -1 | 0 | 1 {
  if (value == null) return 0
  if (value > 0) return 1
  if (value < 0) return -1
  return 0
}

function fundingDirection(value: number | null): HyperliquidFundingDirection {
  const valueSign = sign(value)
  if (valueSign > 0) return 'positive'
  if (valueSign < 0) return 'negative'
  return 'neutral'
}

function fundingFlipped(current: number | null, previous: number | null): boolean {
  const currentSign = sign(current)
  const previousSign = sign(previous)
  return currentSign !== 0 && previousSign !== 0 && currentSign !== previousSign
}

function entityHint(symbol: string): string {
  return ENTITY_HINTS[symbol.toUpperCase()] ?? symbol.toUpperCase()
}

export function normalizeMetaAndAssetContexts(raw: unknown): HyperliquidMetaAndAssetContexts {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error('Hyperliquid metaAndAssetCtxs response must be a two-item array')
  }
  const meta = raw[0] && typeof raw[0] === 'object' && !Array.isArray(raw[0])
    ? raw[0] as HyperliquidMetaAndAssetContexts['meta']
    : {}
  const contexts = Array.isArray(raw[1]) ? raw[1] as HyperliquidAssetContext[] : []
  return { meta, contexts, raw }
}

export function normalizeCandle(rawCandle: unknown): HyperliquidCandle | null {
  if (!rawCandle || typeof rawCandle !== 'object' || Array.isArray(rawCandle)) return null
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
  if (!coin || !interval || startTime == null || endTime == null || open == null || high == null || low == null || close == null || volume == null) {
    return null
  }
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

export function normalizeFundingPoint(coin: string, rawPoint: unknown): HyperliquidFundingPoint | null {
  if (!rawPoint || typeof rawPoint !== 'object' || Array.isArray(rawPoint)) return null
  const raw = rawPoint as Record<string, unknown>
  const time = numberOrNull(raw.time)
  const fundingRate = numberOrNull(raw.fundingRate)
  if (time == null || fundingRate == null) return null
  return {
    coin: typeof raw.coin === 'string' ? raw.coin : coin,
    time,
    fundingRate,
    premium: numberOrNull(raw.premium),
    raw: rawPoint,
  }
}

export function selectTopMarketsBy24hNotionalVolume(
  metaAndContexts: HyperliquidMetaAndAssetContexts,
  limit: number
): Array<{ asset: HyperliquidUniverseAsset; context: HyperliquidAssetContext; symbol: string; rank: number }> {
  const universe = Array.isArray(metaAndContexts.meta.universe) ? metaAndContexts.meta.universe : []
  return metaAndContexts.contexts
    .map((context, index) => {
      const asset = universe[index] ?? {}
      const symbol = typeof asset.name === 'string' ? asset.name : null
      return { asset, context, symbol, volume: positiveNumberOrNull(context?.dayNtlVlm) }
    })
    .filter((item): item is { asset: HyperliquidUniverseAsset; context: HyperliquidAssetContext; symbol: string; volume: number } => (
      Boolean(item.symbol)
      && item.asset.isDelisted !== true
      && item.volume != null
      && item.volume > 0
    ))
    .sort((a, b) => b.volume - a.volume || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
    .map((item, index) => ({
      asset: item.asset,
      context: item.context,
      symbol: item.symbol,
      rank: index + 1,
    }))
}

function candleCloseAtOrBefore(candles: HyperliquidCandle[], targetTime: number): number | null {
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (candles[index].endTime <= targetTime) return candles[index].close
  }
  return null
}

function latestCompletedCandle(candles: HyperliquidCandle[], observedMs: number): HyperliquidCandle | null {
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (candles[index].endTime <= observedMs) return candles[index]
  }
  return null
}

function notionalVolume(candles: HyperliquidCandle[]): number {
  return round(candles.reduce((sum, candle) => sum + candle.volume * candle.close, 0), 4)
}

function completedWindowVolume(
  candles: HyperliquidCandle[],
  anchorEndMs: number,
  hours: number,
  offsetHours = 0
): number | null {
  const completed = candles.filter((candle) => candle.endTime <= anchorEndMs)
  const endExclusive = anchorEndMs + 1 - offsetHours * HOUR_MS
  const startInclusive = endExclusive - hours * HOUR_MS
  const windowCandles = completed.filter((candle) => (
    candle.startTime >= startInclusive
    && candle.endTime < endExclusive
  ))
  return windowCandles.length >= hours ? notionalVolume(windowCandles.slice(-hours)) : null
}

function fundingAtOrBefore(
  points: HyperliquidFundingPoint[],
  targetTime: number,
  maxStalenessMs = 90 * 60 * 1000
): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].time <= targetTime) {
      return targetTime - points[index].time <= maxStalenessMs ? points[index].fundingRate : null
    }
  }
  return null
}

export function normalizeMarketSnapshot(input: {
  symbol: string
  asset: HyperliquidUniverseAsset
  context: HyperliquidAssetContext
  rank: number
  observedAt: string
  candles: HyperliquidCandle[]
  fundingHistory: HyperliquidFundingPoint[]
}): HyperliquidMarketSnapshot {
  const observedMs = new Date(input.observedAt).getTime()
  const candles = [...input.candles].sort((a, b) => a.startTime - b.startTime)
  const fundingHistory = [...input.fundingHistory].sort((a, b) => a.time - b.time)
  const anchorCandle = latestCompletedCandle(candles, observedMs)
  const anchorEndMs = anchorCandle?.endTime ?? observedMs
  const latestClose = anchorCandle?.close ?? null

  const volume1h = completedWindowVolume(candles, anchorEndMs, 1)
  const previousVolume1h = completedWindowVolume(candles, anchorEndMs, 1, 1)
  const volume4h = completedWindowVolume(candles, anchorEndMs, 4)
  const previousVolume4h = completedWindowVolume(candles, anchorEndMs, 4, 4)
  const volume24h = completedWindowVolume(candles, anchorEndMs, 24)
  const previousVolume24h = completedWindowVolume(candles, anchorEndMs, 24, 24)

  const currentFunding = numberOrNull(input.context.funding)
  const fundingRate1hAgo = fundingAtOrBefore(fundingHistory, observedMs - HOUR_MS)
  const fundingRate4hAgo = fundingAtOrBefore(fundingHistory, observedMs - 4 * HOUR_MS)
  const fundingRate24hAgo = fundingAtOrBefore(fundingHistory, observedMs - 24 * HOUR_MS)

  return {
    venue: 'hyperliquid',
    symbol: input.symbol,
    baseAsset: input.symbol,
    entityHint: entityHint(input.symbol),
    marketType: 'perp',
    observedAt: input.observedAt,
    venueTimestamp: null,
    rankBy24hNotionalVolume: input.rank,
    markPrice: positiveNumberOrNull(input.context.markPx),
    midPrice: positiveNumberOrNull(input.context.midPx),
    oraclePrice: positiveNumberOrNull(input.context.oraclePx),
    prevDayPrice: positiveNumberOrNull(input.context.prevDayPx),
    premium: numberOrNull(input.context.premium),
    dayNotionalVolume: positiveNumberOrNull(input.context.dayNtlVlm),
    dayBaseVolume: positiveNumberOrNull(input.context.dayBaseVlm),
    volume1h,
    volume4h,
    volume24h,
    volumeChange1hPct: pctChange(volume1h, previousVolume1h),
    volumeChange4hPct: pctChange(volume4h, previousVolume4h),
    volumeChange24hPct: pctChange(volume24h, previousVolume24h),
    priceChange1hPct: pctChange(latestClose, candleCloseAtOrBefore(candles, anchorEndMs + 1 - HOUR_MS)),
    priceChange4hPct: pctChange(latestClose, candleCloseAtOrBefore(candles, anchorEndMs + 1 - 4 * HOUR_MS)),
    priceChange24hPct: pctChange(latestClose, candleCloseAtOrBefore(candles, anchorEndMs + 1 - 24 * HOUR_MS)),
    fundingRateCurrent: currentFunding,
    fundingRate1hAgo,
    fundingRate4hAgo,
    fundingRate24hAgo,
    fundingChange1h: currentFunding != null && fundingRate1hAgo != null ? round(currentFunding - fundingRate1hAgo, 8) : null,
    fundingChange4h: currentFunding != null && fundingRate4hAgo != null ? round(currentFunding - fundingRate4hAgo, 8) : null,
    fundingChange24h: currentFunding != null && fundingRate24hAgo != null ? round(currentFunding - fundingRate24hAgo, 8) : null,
    fundingDirection: fundingDirection(currentFunding),
    fundingFlipped1h: fundingFlipped(currentFunding, fundingRate1hAgo),
    fundingFlipped4h: fundingFlipped(currentFunding, fundingRate4hAgo),
    fundingFlipped24h: fundingFlipped(currentFunding, fundingRate24hAgo),
    rawPayload: {
      metaAsset: input.asset,
      assetContext: input.context,
      candles: candles.map((candle) => candle.raw),
      fundingHistory: fundingHistory.map((point) => point.raw),
      fundingHistoryAvailable: fundingHistory.length > 0,
      fundingHistoryLimitation: fundingHistory.length > 0
        ? null
        : 'Hyperliquid fundingHistory returned no usable points; only current funding was stored for this snapshot.',
    },
  }
}

export function snapshotMetrics(snapshot: HyperliquidMarketSnapshot): Record<string, unknown> {
  return {
    symbol: snapshot.symbol,
    baseAsset: snapshot.baseAsset,
    rankBy24hNotionalVolume: snapshot.rankBy24hNotionalVolume,
    markPrice: snapshot.markPrice,
    midPrice: snapshot.midPrice,
    oraclePrice: snapshot.oraclePrice,
    prevDayPrice: snapshot.prevDayPrice,
    premium: snapshot.premium,
    dayNotionalVolume: snapshot.dayNotionalVolume,
    dayBaseVolume: snapshot.dayBaseVolume,
    volume1h: snapshot.volume1h,
    volume4h: snapshot.volume4h,
    volume24h: snapshot.volume24h,
    volumeChange1hPct: snapshot.volumeChange1hPct,
    volumeChange4hPct: snapshot.volumeChange4hPct,
    volumeChange24hPct: snapshot.volumeChange24hPct,
    priceChange1hPct: snapshot.priceChange1hPct,
    priceChange4hPct: snapshot.priceChange4hPct,
    priceChange24hPct: snapshot.priceChange24hPct,
    fundingRateCurrent: snapshot.fundingRateCurrent,
    fundingRate1hAgo: snapshot.fundingRate1hAgo,
    fundingRate4hAgo: snapshot.fundingRate4hAgo,
    fundingRate24hAgo: snapshot.fundingRate24hAgo,
    fundingChange1h: snapshot.fundingChange1h,
    fundingChange4h: snapshot.fundingChange4h,
    fundingChange24h: snapshot.fundingChange24h,
    fundingDirection: snapshot.fundingDirection,
    fundingFlipped1h: snapshot.fundingFlipped1h,
    fundingFlipped4h: snapshot.fundingFlipped4h,
    fundingFlipped24h: snapshot.fundingFlipped24h,
    observedAt: snapshot.observedAt,
  }
}
