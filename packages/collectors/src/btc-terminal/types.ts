/**
 * BTC Terminal — daily snapshot shape
 * Raw data from 3 sources: Polymarket (via Dome), Hyperliquid, Pacific
 */

export interface PolymarketBTCData {
  /** BTC price target odds — e.g. { '$100k': 0.35, '$150k': 0.10 } */
  priceTargets: Record<string, number | null>
  /** BTC ATH timing odds — e.g. { 'By June 2026': 0.03 } */
  athTiming: Record<string, number | null>
  /** BTC vs Gold vs S&P 2026 odds */
  assetRace: Record<string, number | null>
}

export interface HyperliquidBTCData {
  price: number
  change24h: number
  change24hPct: number
  fundingRate: number
  fundingAnnualized: number
  openInterest: number
  volume24h: number
}

export interface PacificBTCData {
  markPrice: number
  fundingRate: number
  fundingAnnualized: number
  openInterest: number
  volume24h: number
}

export interface BTCTerminalSnapshot {
  timestamp: string
  polymarket: PolymarketBTCData
  hyperliquid: HyperliquidBTCData
  pacific: PacificBTCData | null  // null if BTC not listed on Pacific
}
