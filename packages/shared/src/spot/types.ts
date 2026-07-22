export interface SpotClientConfig {
  /** Base URL of myboon's own backend API (mounts the /spot proxy route). */
  apiBaseUrl?: string
  fetch?: typeof fetch
  requestTimeoutMs?: number
  maxRetries?: number
}

export interface SpotFreshness {
  state: 'live' | 'fresh' | 'stale'
  source: 'spot_balances_api'
  servedAt: string
  ageMs: number
}

export interface SpotResult<T> {
  data: T
  freshness: SpotFreshness
}

export interface SpotTokenBalance {
  mint: string
  symbol: string | null
  name: string | null
  iconUrl: string | null
  decimals: number
  amount: string
  uiAmount: number
  priceUsd: number | null
  valueUsd: number | null
}

export interface SpotWalletBalances {
  wallet: string
  totalValueUsd: number | null
  tokens: SpotTokenBalance[]
}
