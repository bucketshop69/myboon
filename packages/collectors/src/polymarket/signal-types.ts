export interface Signal {
  source: 'POLYMARKET' | 'NANSEN' | 'PACIFIC'
  type:
    | 'MARKET_DISCOVERED'
    | 'ODDS_SHIFT'
    | 'WHALE_BET'
    | 'VOLUME_SURGE'
    | 'MARKET_CLOSING'
    | 'PM_MARKET_SURGE'
    | 'PM_EVENT_TRENDING'
    | 'LIQUIDATION_CASCADE'
    | 'OI_SURGE'
    | 'FUNDING_SPIKE'
  topic: string
  slug?: string
  weight: number
  metadata: Record<string, unknown>
}
