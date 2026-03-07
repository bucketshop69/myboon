import type { Market, MarketSnapshot, GammaEvent, GammaMarket } from './types.js'

export interface PolymarketClientConfig {
  gammaApiUrl?: string
  clobApiUrl?: string
}

const DEFAULT_GAMMA_API_URL = 'https://gamma-api.polymarket.com'
const DEFAULT_CLOB_API_URL = 'https://clob.polymarket.com'

function parseTokenIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String)
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.map(String)
      }
    } catch {
      // not valid JSON, ignore
    }
  }
  return []
}

export class PolymarketClient {
  private readonly gammaApiUrl: string
  private readonly clobApiUrl: string

  constructor(config?: PolymarketClientConfig) {
    this.gammaApiUrl = config?.gammaApiUrl ?? DEFAULT_GAMMA_API_URL
    this.clobApiUrl = config?.clobApiUrl ?? DEFAULT_CLOB_API_URL
  }

  async getTopMarkets(limit = 20): Promise<Market[]> {
    const url = `${this.gammaApiUrl}/events?active=true&closed=false&limit=50&order=volume&ascending=false`

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Gamma API error: ${res.status} ${res.statusText}`)
    }

    const events: GammaEvent[] = await res.json()
    const markets: Market[] = []
    const now = new Date()

    for (const event of events) {
      const firstMarket: GammaMarket | undefined = event.markets?.[0]
      if (!firstMarket) continue

      const tokenIds = parseTokenIds(firstMarket.clobTokenIds)
      if (tokenIds.length < 2) continue

      // Skip markets that have already ended
      const endDate = firstMarket.endDateIso ?? event.endDate
      if (endDate && new Date(endDate) < now) continue

      let outcomePrices: [string, string] | undefined
      if (firstMarket.outcomePrices) {
        try {
          const prices: unknown = JSON.parse(firstMarket.outcomePrices)
          if (Array.isArray(prices) && prices.length >= 2) {
            outcomePrices = [String(prices[0]), String(prices[1])]
          }
        } catch {
          // ignore parse errors
        }
      }

      markets.push({
        title: event.title,
        id: firstMarket.id,
        slug: firstMarket.slug ?? event.slug,
        tokenIds: [tokenIds[0], tokenIds[1]],
        endDate,
        volume: firstMarket.volumeNum ?? event.volumeNum ?? event.volume,
        outcomePrices,
      })

      if (markets.length === limit) break
    }

    return markets
  }

  async getMarketBySlug(slug: string): Promise<Market | null> {
    const url = `${this.gammaApiUrl}/markets?slug=${encodeURIComponent(slug)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const markets: GammaMarket[] = await res.json()
    if (!markets || markets.length === 0) return null
    const market = markets[0]
    const tokenIds = parseTokenIds(market.clobTokenIds)
    if (tokenIds.length < 2) return null
    return {
      title: market.question ?? slug,
      id: market.id,
      slug: market.slug ?? slug,
      tokenIds: [tokenIds[0], tokenIds[1]],
      endDate: market.endDateIso,
      volume: market.volumeNum,
    }
  }

  async getMarketByConditionId(conditionId: string): Promise<Market | null> {
    const url = `${this.gammaApiUrl}/markets?condition_id=${encodeURIComponent(conditionId)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const markets: GammaMarket[] = await res.json()
    if (!markets || markets.length === 0) return null
    const market = markets[0]
    const tokenIds = parseTokenIds(market.clobTokenIds)
    if (tokenIds.length < 2) {
      // Return a minimal market without tokenIds if we can't parse them
      return {
        title: market.question ?? conditionId,
        id: market.id,
        slug: market.slug ?? conditionId,
        tokenIds: ['', ''],
        endDate: market.endDateIso,
        volume: market.volumeNum,
      }
    }
    return {
      title: market.question ?? conditionId,
      id: market.id,
      slug: market.slug ?? conditionId,
      tokenIds: [tokenIds[0], tokenIds[1]],
      endDate: market.endDateIso,
      volume: market.volumeNum,
    }
  }

  async getOrderBook(tokenId: string): Promise<{ bestBid: number; bestAsk: number } | null> {
    const url = `${this.clobApiUrl}/book?token_id=${tokenId}`

    const res = await fetch(url)
    if (!res.ok) {
      return null
    }

    const data: {
      bids?: { price: string; size: string }[]
      asks?: { price: string; size: string }[]
    } = await res.json()

    const bestBid =
      data.bids && data.bids.length > 0 ? parseFloat(data.bids[0].price) : 0
    const bestAsk =
      data.asks && data.asks.length > 0 ? parseFloat(data.asks[0].price) : 0

    return { bestBid, bestAsk }
  }

  async getMarketSnapshot(slug: string): Promise<MarketSnapshot | null> {
    const market = await this.getMarketBySlug(slug)
    if (!market) return null

    const [yesTokenId] = market.tokenIds
    const book = await this.getOrderBook(yesTokenId)
    if (!book) return null

    const yesPrice = book.bestAsk > 0 ? book.bestAsk : book.bestBid
    const noPrice = yesPrice > 0 ? parseFloat((1 - yesPrice).toFixed(4)) : 0

    return {
      market,
      yesPrice,
      noPrice,
      fetchedAt: new Date().toISOString(),
    }
  }
}
