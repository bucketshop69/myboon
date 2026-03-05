export interface Market {
  title: string
  id: string
  slug: string
  tokenIds: [string, string]
  endDate?: string
  volume?: number
  outcomePrices?: [string, string]
}

export interface GammaEvent {
  id: string
  title: string
  slug: string
  endDate?: string
  volume?: number
  volumeNum?: number
  markets?: GammaMarket[]
}

export interface GammaMarket {
  id: string
  question?: string
  slug?: string
  clobTokenIds?: unknown
  outcomePrices?: string
  endDateIso?: string
  volumeNum?: number
}

export interface Signal {
  source: 'POLYMARKET'
  type: 'MARKET_DISCOVERED' | 'ODDS_SHIFT'
  topic: string
  weight: number
  metadata: {
    marketId: string
    slug: string
    volume?: number
    endDate?: string
    yes_price?: number
    no_price?: number
    shift_from?: number
    shift_to?: number
  }
}
