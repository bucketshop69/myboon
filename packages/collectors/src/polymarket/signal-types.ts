export interface Signal {
  source: 'POLYMARKET' | 'NANSEN'
  type:
    | 'MARKET_DISCOVERED'
    | 'ODDS_SHIFT'
    | 'WHALE_BET'
    | 'VOLUME_SURGE'
    | 'MARKET_CLOSING'
    | 'PM_MARKET_SURGE'
    | 'PM_EVENT_TRENDING'
  topic: string
  slug?: string
  weight: number
  metadata: Record<string, unknown>
}
