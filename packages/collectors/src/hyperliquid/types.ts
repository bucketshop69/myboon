export type HyperliquidPositionSide = 'long' | 'short'

export interface HyperliquidWatchlistEntry {
  wallet: string
  label: string
  reason: string
  minPositionUsd?: number | null
  active: boolean
}

export interface HyperliquidPositionSnapshot {
  id?: string
  wallet: string
  asset: string
  side: HyperliquidPositionSide
  size: number
  notionalUsd: number
  entryPrice: number | null
  markPrice: number | null
  leverage: number | null
  unrealizedPnlUsd: number | null
  marginUsedUsd: number | null
  observedAt: string
  raw: unknown
}

export interface HyperliquidMarketSnapshot {
  asset: string
  markPrice: number | null
  midPrice: number | null
  oraclePrice: number | null
  fundingRate: number | null
  openInterestUsd: number | null
  volume24hUsd: number | null
  previousDayPrice: number | null
  observedAt: string
  raw: unknown
}
