import {
  normalizeCandle,
  normalizeFundingPoint,
  normalizeMetaAndAssetContexts,
} from './normalization'
import type {
  HyperliquidCandle,
  HyperliquidFundingPoint,
  HyperliquidMetaAndAssetContexts,
} from './types'

const DEFAULT_INFO_URL = 'https://api.hyperliquid.xyz/info'

export interface HyperliquidInfoClientOptions {
  infoUrl?: string
}

export class HyperliquidInfoClient {
  private readonly infoUrl: string

  constructor(options: HyperliquidInfoClientOptions = {}) {
    this.infoUrl = options.infoUrl ?? process.env.HYPERLIQUID_INFO_URL ?? DEFAULT_INFO_URL
  }

  private async post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`Hyperliquid info request failed ${res.status}: ${await res.text()}`)
    }

    return res.json() as Promise<T>
  }

  async fetchMetaAndAssetContexts(): Promise<HyperliquidMetaAndAssetContexts> {
    const raw = await this.post<unknown>({ type: 'metaAndAssetCtxs' })
    return normalizeMetaAndAssetContexts(raw)
  }

  async fetchCandles(input: {
    coin: string
    interval: '1h'
    startTime: number
    endTime: number
  }): Promise<HyperliquidCandle[]> {
    const raw = await this.post<unknown[]>({
      type: 'candleSnapshot',
      req: {
        coin: input.coin,
        interval: input.interval,
        startTime: input.startTime,
        endTime: input.endTime,
      },
    })

    return (Array.isArray(raw) ? raw : [])
      .map(normalizeCandle)
      .filter((candle): candle is HyperliquidCandle => candle != null)
  }

  async fetchFundingHistory(input: {
    coin: string
    startTime: number
    endTime: number
  }): Promise<HyperliquidFundingPoint[]> {
    const raw = await this.post<unknown[]>({
      type: 'fundingHistory',
      coin: input.coin,
      startTime: input.startTime,
      endTime: input.endTime,
    })

    return (Array.isArray(raw) ? raw : [])
      .map((point) => normalizeFundingPoint(input.coin, point))
      .filter((point): point is HyperliquidFundingPoint => point != null)
  }
}
