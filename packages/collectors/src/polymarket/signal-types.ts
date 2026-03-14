export interface Signal {
  source: 'POLYMARKET'
  type: 'MARKET_DISCOVERED' | 'ODDS_SHIFT' | 'WHALE_BET' | 'VOLUME_SURGE' | 'MARKET_CLOSING'
  topic: string
  slug?: string
  weight: number
  metadata: {
    marketId?: string
    slug?: string
    volume?: number
    endDate?: string
    yes_price?: number
    no_price?: number
    shift_from?: number
    shift_to?: number
    user?: string
    amount?: number
    side?: string
    outcome?: string
    volume_delta?: number
    walletTotalBets?: number
    walletWinRate?: number | null
    walletLabel?: string
  }
}
