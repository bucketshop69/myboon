export type HyperliquidFundingDirection = 'positive' | 'negative' | 'neutral'

export type HyperliquidCandidateStatus =
  | 'pending_research'
  | 'researching'
  | 'researched'
  | 'research_failed'
  | 'skipped'

export type HyperliquidCandidateTriggerType =
  | 'weighted_market_signal'
  | 'price_change_1h'
  | 'price_change_4h'
  | 'funding_flip_1h'
  | 'funding_flip_4h'
  | 'funding_flip_24h'
  | 'funding_extreme'
  | 'price_and_funding_move'
  | 'volume_spike'

export interface HyperliquidUniverseAsset {
  name?: unknown
  szDecimals?: unknown
  maxLeverage?: unknown
  marginTableId?: unknown
  isDelisted?: unknown
}

export interface HyperliquidAssetContext {
  funding?: unknown
  openInterest?: unknown
  prevDayPx?: unknown
  dayNtlVlm?: unknown
  premium?: unknown
  oraclePx?: unknown
  markPx?: unknown
  midPx?: unknown
  impactPxs?: unknown
  dayBaseVlm?: unknown
}

export interface HyperliquidMetaAndAssetContexts {
  meta: {
    universe?: HyperliquidUniverseAsset[]
    [key: string]: unknown
  }
  contexts: HyperliquidAssetContext[]
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

export interface HyperliquidMarketSnapshot {
  venue: 'hyperliquid'
  symbol: string
  baseAsset: string
  entityHint: string
  marketType: 'perp'
  observedAt: string
  venueTimestamp: string | null
  rankBy24hNotionalVolume: number
  markPrice: number | null
  midPrice: number | null
  oraclePrice: number | null
  prevDayPrice: number | null
  premium: number | null
  dayNotionalVolume: number | null
  dayBaseVolume: number | null
  volume1h: number | null
  volume4h: number | null
  volume24h: number | null
  volumeChange1hPct: number | null
  volumeChange4hPct: number | null
  volumeChange24hPct: number | null
  priceChange1hPct: number | null
  priceChange4hPct: number | null
  priceChange24hPct: number | null
  fundingRateCurrent: number | null
  fundingRate1hAgo: number | null
  fundingRate4hAgo: number | null
  fundingRate24hAgo: number | null
  fundingChange1h: number | null
  fundingChange4h: number | null
  fundingChange24h: number | null
  fundingDirection: HyperliquidFundingDirection
  fundingFlipped1h: boolean
  fundingFlipped4h: boolean
  fundingFlipped24h: boolean
  rawPayload: {
    metaAsset: unknown
    assetContext: unknown
    candles: unknown[]
    fundingHistory: unknown[]
    fundingHistoryAvailable: boolean
    fundingHistoryLimitation: string | null
  }
}

export interface HyperliquidCandidateDraft {
  triggerType: HyperliquidCandidateTriggerType
  triggerReason: string
  score: number
  metricsSnapshot: Record<string, unknown>
  priorMetricsSnapshot: Record<string, unknown> | null
  entityHint: string
  status: HyperliquidCandidateStatus
  observedAt: string
  dedupeKey: string
}

export interface HyperliquidCollectorOptions {
  now?: string
  topMarketCount?: number
  candleLookbackHours?: number
  fundingLookbackHours?: number
  priceChange1hThresholdPct?: number
  priceChange4hThresholdPct?: number
  extremeFundingRateThreshold?: number
  fundingMoveThreshold?: number
  priceFundingMovePriceThresholdPct?: number
  volumeSpikeThresholdPct?: number
  weightedCandidateThreshold?: number
  candidateDedupeHours?: number
}

export interface HyperliquidCollectorResult {
  observedAt: string
  fetchedMarkets: number
  selectedMarkets: number
  snapshotsWritten: number
  candidatesWritten: number
  topMarkets: Array<{
    symbol: string
    entityHint: string
    rankBy24hNotionalVolume: number
    dayNotionalVolume: number | null
    priceChange1hPct: number | null
    priceChange4hPct: number | null
    fundingRateCurrent: number | null
  }>
  candidates: Array<{
    symbol: string
    triggerType: HyperliquidCandidateTriggerType
    score: number
    triggerReason: string
  }>
}
