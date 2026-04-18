export interface Signal {
  source: 'POLYMARKET' | 'PACIFIC'
  type:
    | 'MARKET_DISCOVERED'
    | 'ODDS_SHIFT'
    | 'WHALE_BET'
    | 'VOLUME_SURGE'
    | 'MARKET_CLOSING'
    | 'LIQUIDATION_CASCADE'
    | 'OI_SURGE'
    | 'FUNDING_SPIKE'
  topic: string
  slug?: string
  weight: number
  metadata: Record<string, unknown>
}
