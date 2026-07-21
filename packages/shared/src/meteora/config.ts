export const METEORA_DATA_API_URL = 'https://dlmm.datapi.meteora.ag'

export const METEORA_DLMM_PROGRAM_IDS = {
  'mainnet-beta': 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  devnet: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
} as const

export const METEORA_CACHE_POLICY = {
  protocolMetrics: { freshMs: 20_000, staleMs: 5 * 60_000 },
  pools: { freshMs: 20_000, staleMs: 5 * 60_000 },
  pool: { freshMs: 10_000, staleMs: 2 * 60_000 },
  ohlcv: { freshMs: 30_000, staleMs: 5 * 60_000 },
  portfolio: { freshMs: 5_000, staleMs: 60_000 },
  positions: { freshMs: 5_000, staleMs: 60_000 },
  limitOrders: { freshMs: 5_000, staleMs: 60_000 },
} as const

export const METEORA_MAX_PAGE_SIZE = {
  pools: 100,
  portfolio: 50,
  positions: 100,
  limitOrders: 100,
} as const
