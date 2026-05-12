import type {
  PublicProfile,
  PortfolioValue,
  MarketsTraded,
  Position,
  ClosedPosition,
  Activity,
  PositionsQuery,
  ClosedPositionsQuery,
  ActivityQuery,
} from './types.js'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const DATA_API = 'https://data-api.polymarket.com'

// ── Cache interface ──
// Supabase-backed cache using a key-value table with TTL.
// Pass supabaseUrl + supabaseKey to enable. Without it, all calls go direct (no caching).

export interface ProfileCacheConfig {
  supabaseUrl: string
  supabaseKey: string
  /** Table name (default: 'profile_cache') */
  table?: string
}

interface CacheRow {
  key: string
  data: unknown
  fetched_at: string
  ttl_hours: number
}

export interface ProfileClientConfig {
  /** Override gamma-api base URL (e.g. for VPS proxy) */
  gammaApiUrl?: string
  /** Override data-api base URL (e.g. for VPS proxy) */
  dataApiUrl?: string
  /** Request timeout in ms (default 10000) */
  timeoutMs?: number
  /** Supabase cache config — omit to disable caching */
  cache?: ProfileCacheConfig
}

export class PolymarketProfileClient {
  private readonly gammaApi: string
  private readonly dataApi: string
  private readonly timeoutMs: number
  private readonly cache: ProfileCacheConfig | null

  constructor(config?: ProfileClientConfig) {
    this.gammaApi = config?.gammaApiUrl ?? GAMMA_API
    this.dataApi = config?.dataApiUrl ?? DATA_API
    this.timeoutMs = config?.timeoutMs ?? 10_000
    this.cache = config?.cache ?? null
  }

  // ── Cache helpers ──

  private get cacheTable(): string {
    return this.cache?.table ?? 'polymarket_profile_cache'
  }

  private cacheHeaders(): Record<string, string> {
    if (!this.cache) return {}
    return {
      apikey: this.cache.supabaseKey,
      Authorization: `Bearer ${this.cache.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }
  }

  private async fromCache<T>(key: string): Promise<T | null> {
    if (!this.cache) return null

    try {
      const url = `${this.cache.supabaseUrl}/rest/v1/${this.cacheTable}?key=eq.${encodeURIComponent(key)}&select=data,fetched_at,ttl_hours&limit=1`
      const res = await fetch(url, { headers: this.cacheHeaders() })
      if (!res.ok) return null

      const rows = await res.json() as CacheRow[]
      if (!rows || rows.length === 0) return null

      const row = rows[0]
      const ageHours = (Date.now() - new Date(row.fetched_at).getTime()) / 36e5
      if (ageHours > row.ttl_hours) return null

      return row.data as T
    } catch {
      return null
    }
  }

  private async toCache(key: string, data: unknown, ttlHours: number): Promise<void> {
    if (!this.cache) return

    try {
      const url = `${this.cache.supabaseUrl}/rest/v1/${this.cacheTable}`
      await fetch(url, {
        method: 'POST',
        headers: {
          ...this.cacheHeaders(),
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          key,
          data,
          fetched_at: new Date().toISOString(),
          ttl_hours: ttlHours,
        }),
      })
    } catch {
      // Cache write failure is non-fatal
    }
  }

  private async cached<T>(key: string, ttlHours: number, fetcher: () => Promise<T>): Promise<T> {
    const hit = await this.fromCache<T>(key)
    if (hit !== null) return hit

    const data = await fetcher()
    await this.toCache(key, data, ttlHours)
    return data
  }

  // ── Core fetch helper ──

  private async get<T>(url: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`[polymarket-profile] ${res.status} ${res.statusText}: ${body}`)
      }
      return res.json() as Promise<T>
    } finally {
      clearTimeout(timer)
    }
  }

  // ── URL builders ──

  private buildQuery(base: string, params: object): string {
    const url = new URL(base)
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      if (Array.isArray(value)) {
        url.searchParams.set(key, value.join(','))
      } else {
        url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }

  // ── Public Profile (gamma-api) — cached 24h ──

  async getProfile(address: string): Promise<PublicProfile> {
    const url = this.buildQuery(`${this.gammaApi}/public-profile`, { address })
    return this.cached(`profile:${address}`, 24, () => this.get<PublicProfile>(url))
  }

  // ── Portfolio Value (data-api) — cached 1h ──

  async getPortfolioValue(user: string): Promise<PortfolioValue> {
    const url = this.buildQuery(`${this.dataApi}/value`, { user })
    return this.cached(`value:${user}`, 1, async () => {
      const arr = await this.get<PortfolioValue[]>(url)
      if (!arr || arr.length === 0) return { user, value: 0 }
      return arr[0]
    })
  }

  // ── Markets Traded (data-api) — cached 24h ──

  async getMarketsTraded(user: string): Promise<MarketsTraded> {
    const url = this.buildQuery(`${this.dataApi}/traded`, { user })
    return this.cached(`traded:${user}`, 24, () => this.get<MarketsTraded>(url))
  }

  // ── Positions (data-api) — cached 15min ──

  async getPositions(query: PositionsQuery): Promise<Position[]> {
    const url = this.buildQuery(`${this.dataApi}/positions`, query)
    const cacheKey = `positions:${query.user}:${query.sortBy ?? 'TOKENS'}:${query.limit ?? 100}`
    return this.cached(cacheKey, 0.25, () => this.get<Position[]>(url))
  }

  // ── Closed Positions (data-api) — cached 6h ──

  async getClosedPositions(query: ClosedPositionsQuery): Promise<ClosedPosition[]> {
    const url = this.buildQuery(`${this.dataApi}/closed-positions`, query)
    const cacheKey = `closed:${query.user}:${query.sortBy ?? 'REALIZEDPNL'}:${query.limit ?? 10}`
    return this.cached(cacheKey, 6, () => this.get<ClosedPosition[]>(url))
  }

  // ── Activity (data-api) — no cache (real-time) ──

  async getActivity(query: ActivityQuery): Promise<Activity[]> {
    const url = this.buildQuery(`${this.dataApi}/activity`, query)
    return this.get<Activity[]>(url)
  }
}
