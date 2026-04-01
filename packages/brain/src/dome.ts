/**
 * Dome API client — Polymarket data without geo-restrictions
 * REST docs: https://docs.domeapi.io
 * Base URL: https://api.domeapi.io/v1
 */

const BASE_URL = 'https://api.domeapi.io/v1'

interface DomeMarket {
  market_slug: string
  title: string
  condition_id: string
  status: string
  end_time: number | null
  volume_total: number
  side_a: { id: string; label: string }
  side_b: { id: string; label: string }
  winning_side: string | null
}

interface DomeMarketsResponse {
  markets: DomeMarket[]
}

interface DomeMarketPrice {
  price: number
  at_time?: number
}

function domeHeaders(): Record<string, string> {
  const key = process.env.DOME_API_KEY
  if (!key) throw new Error('DOME_API_KEY not set')
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Look up one or more markets by slug in a single request.
 * Returns a map of slug -> DomeMarket.
 */
export async function getMarketsBySlugs(
  slugs: string[]
): Promise<Map<string, DomeMarket>> {
  const params = slugs.map((s) => `market_slug=${encodeURIComponent(s)}`).join('&')
  const res = await fetch(`${BASE_URL}/polymarket/markets?${params}&limit=20`, {
    headers: domeHeaders(),
  })
  if (!res.ok) throw new Error(`Dome markets fetch failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as DomeMarketsResponse
  const map = new Map<string, DomeMarket>()
  for (const m of data.markets ?? []) {
    map.set(m.market_slug, m)
  }
  return map
}

/**
 * Get current YES price (probability) for a single token ID.
 * Returns null on failure.
 */
export async function getMarketPrice(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_URL}/polymarket/market-price/${encodeURIComponent(tokenId)}`, {
      headers: domeHeaders(),
    })
    if (!res.ok) return null
    const data = await res.json() as DomeMarketPrice
    return typeof data.price === 'number' ? data.price : null
  } catch {
    return null
  }
}

/**
 * Fetch live YES-win odds for a batch of outcome slugs.
 * Returns a map of slug -> probability (0-1), or null if unavailable.
 *
 * Single round-trip for market lookup, then parallel price fetches.
 */
export async function fetchOutcomeOdds(
  slugs: string[]
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>(slugs.map((s) => [s, null]))

  let markets: Map<string, DomeMarket>
  try {
    markets = await getMarketsBySlugs(slugs)
  } catch (err) {
    console.warn('[dome] Market lookup failed:', err)
    return result
  }

  // Fetch all prices in parallel
  await Promise.all(
    slugs.map(async (slug) => {
      const market = markets.get(slug)
      if (!market) return
      const tokenId = market.side_a?.id
      if (!tokenId) return
      const price = await getMarketPrice(tokenId)
      result.set(slug, price)
    })
  )

  return result
}

/**
 * Resolve a slug to its polymarket_tracked fields.
 * Returns null if the market cannot be found.
 */
export async function resolveMarketBySlug(slug: string): Promise<{
  token_id: string
  no_token_id: string | null
  condition_id: string
  title: string
  volume: number
  end_date: string | null
} | null> {
  try {
    const markets = await getMarketsBySlugs([slug])
    const m = markets.get(slug)
    if (!m) return null
    return {
      token_id: m.side_a.id,
      no_token_id: m.side_b?.id ?? null,
      condition_id: m.condition_id,
      title: m.title,
      volume: m.volume_total ?? 0,
      end_date: m.end_time ? new Date(m.end_time * 1000).toISOString() : null,
    }
  } catch {
    return null
  }
}
