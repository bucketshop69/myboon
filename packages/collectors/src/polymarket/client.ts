import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import type { GammaEvent, GammaMarket, Market } from './types'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export function parseTokenIds(raw: unknown): string[] {
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

export async function fetchTopMarkets(): Promise<Market[]> {
  const url =
    'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&order=volume&ascending=false'

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

    if (markets.length === 20) break
  }

  return markets
}

export async function fetchOrderBook(
  tokenId: string
): Promise<{ bestBid: number; bestAsk: number } | null> {
  const url = `https://clob.polymarket.com/book?token_id=${tokenId}`

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
