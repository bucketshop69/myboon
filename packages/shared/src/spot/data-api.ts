import { SPOT_API_BASE_URL, SPOT_CACHE_POLICY } from './config.js'
import { assertSolanaAddress } from './data-validation.js'
import { SpotClientError } from './errors.js'
import type {
  SpotClientConfig,
  SpotFreshness,
  SpotResult,
  SpotTokenBalance,
  SpotWalletBalances,
} from './types.js'

interface CachePolicy {
  freshMs: number
  staleMs: number
}

interface CacheEntry {
  value: unknown
  fetchedAt: number
  expiresAt: number
  staleUntil: number
}

interface RawSpotTokenBalance {
  mint: string
  symbol: string | null
  name: string | null
  icon: string | null
  decimals: number
  amount: string
  uiAmount: number
  priceUsd: number | null
  valueUsd: number | null
}

interface RawSpotWalletBalances {
  wallet: string
  totalValueUsd: number | null
  tokens: RawSpotTokenBalance[]
}

function normalizeToken(raw: RawSpotTokenBalance): SpotTokenBalance {
  return {
    mint: raw.mint,
    symbol: raw.symbol ?? null,
    name: raw.name ?? null,
    iconUrl: raw.icon ?? null,
    decimals: raw.decimals,
    amount: raw.amount,
    uiAmount: raw.uiAmount,
    priceUsd: raw.priceUsd ?? null,
    valueUsd: raw.valueUsd ?? null,
  }
}

function normalizeWalletBalances(raw: RawSpotWalletBalances): SpotWalletBalances {
  return {
    wallet: raw.wallet,
    totalValueUsd: raw.totalValueUsd ?? null,
    tokens: raw.tokens.map(normalizeToken),
  }
}

/**
 * Typed client for myboon's Spot balances backend proxy.
 *
 * Shaped like `MeteoraDataApiClient` (cache, retry, freshness metadata), but
 * calls myboon's own `/spot` backend route rather than an upstream API
 * directly — the underlying Helius DAS key is metered/paid and must never be
 * exposed client-side.
 *
 * Exposes both an aggregate read (`getWalletBalances`) and a single-mint read
 * (`getMintBalance`) so a future issue can swap Meteora's/Pacifica's narrow
 * balance checks onto this client without a rewrite.
 */
export class SpotDataApiClient {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly cache = new Map<string, CacheEntry>()
  private readonly inFlight = new Map<string, Promise<unknown>>()

  constructor(config: SpotClientConfig = {}) {
    this.baseUrl = (config.apiBaseUrl ?? SPOT_API_BASE_URL).replace(/\/+$/, '')
    this.fetcher = config.fetch ?? fetch
    this.timeoutMs = config.requestTimeoutMs ?? 12_000
    this.maxRetries = config.maxRetries ?? 2
  }

  clearCache(): void {
    this.cache.clear()
  }

  /** All token balances for the wallet, each priced in USD. */
  async getWalletBalances(walletAddress: string): Promise<SpotResult<SpotWalletBalances>> {
    assertSolanaAddress(walletAddress, 'walletAddress')
    const result = await this.request<RawSpotWalletBalances>(
      `/spot/${encodeURIComponent(walletAddress)}/balances`,
      SPOT_CACHE_POLICY.balances,
    )
    return {
      data: normalizeWalletBalances(result.data),
      freshness: result.freshness,
    }
  }

  /** Balance for a single mint held by the wallet (null if not held). */
  async getMintBalance(
    walletAddress: string,
    mint: string,
  ): Promise<SpotResult<SpotTokenBalance | null>> {
    assertSolanaAddress(walletAddress, 'walletAddress')
    assertSolanaAddress(mint, 'mint')
    const result = await this.request<RawSpotTokenBalance | null>(
      `/spot/${encodeURIComponent(walletAddress)}/balances/${encodeURIComponent(mint)}`,
      SPOT_CACHE_POLICY.balances,
    )
    return {
      data: result.data ? normalizeToken(result.data) : null,
      freshness: result.freshness,
    }
  }

  private async request<T>(path: string, policy: CachePolicy): Promise<SpotResult<T>> {
    const url = `${this.baseUrl}${path}`
    const now = Date.now()
    const cached = this.cache.get(url)
    if (cached && now < cached.expiresAt) {
      return {
        data: cached.value as T,
        freshness: this.freshness('fresh', cached.fetchedAt),
      }
    }

    const pending = this.inFlight.get(url)
    if (pending) {
      const value = await pending
      const entry = this.cache.get(url)
      return {
        data: value as T,
        freshness: this.freshness('fresh', entry?.fetchedAt ?? Date.now()),
      }
    }

    const request = this.fetchWithRetry<T>(url)
      .then((value) => {
        const fetchedAt = Date.now()
        this.cache.set(url, {
          value,
          fetchedAt,
          expiresAt: fetchedAt + policy.freshMs,
          staleUntil: fetchedAt + policy.staleMs,
        })
        return value
      })
      .finally(() => this.inFlight.delete(url))

    this.inFlight.set(url, request)

    try {
      const value = await request
      return { data: value, freshness: this.freshness('live', Date.now()) }
    } catch (error) {
      if (cached && now < cached.staleUntil) {
        return {
          data: cached.value as T,
          freshness: this.freshness('stale', cached.fetchedAt),
        }
      }
      throw error
    }
  }

  private async fetchWithRetry<T>(url: string): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await this.fetcher(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (response.status === 404) {
          return null as T
        }
        if (response.status === 429) {
          throw new SpotClientError(
            'UPSTREAM_RATE_LIMITED',
            'Spot balances API rate limit reached',
            response.status,
          )
        }
        if (!response.ok) {
          const message = await response.text().catch(() => '')
          throw new SpotClientError(
            response.status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_RESPONSE_INVALID',
            message || `Spot balances API request failed with ${response.status}`,
            response.status,
          )
        }
        return (await response.json()) as T
      } catch (error) {
        lastError = error
        const retryable =
          error instanceof SpotClientError
            ? error.code === 'UPSTREAM_RATE_LIMITED' || error.code === 'UPSTREAM_UNAVAILABLE'
            : true
        if (!retryable || attempt === this.maxRetries) break
        await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 1_000)))
      } finally {
        clearTimeout(timeout)
      }
    }

    if (lastError instanceof SpotClientError) throw lastError
    throw new SpotClientError('UPSTREAM_UNAVAILABLE', 'Spot balances API is unavailable', null, lastError)
  }

  private freshness(state: SpotFreshness['state'], fetchedAt: number): SpotFreshness {
    return {
      state,
      source: 'spot_balances_api',
      servedAt: new Date().toISOString(),
      ageMs: Math.max(0, Date.now() - fetchedAt),
    }
  }
}
