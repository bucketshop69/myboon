/**
 * Polymarket BTC extractor — uses Dome API (no geo-restriction)
 *
 * Fetches odds for BTC-related prediction markets via event_slug lookup.
 * Each event has multiple outcome markets; we fetch price per market.
 */

import 'dotenv/config'
import type { PolymarketBTCData } from '../types'

const BASE_URL = 'https://api.domeapi.io/v1'

function domeHeaders(): Record<string, string> {
  const key = process.env.DOME_API_KEY
  if (!key) throw new Error('DOME_API_KEY not set')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

interface DomeMarket {
  market_slug: string
  title: string
  side_a: { id: string; label: string }
  side_b: { id: string; label: string }
  volume_total: number
}

/** Polymarket event slugs — from polymarket.com/event/{slug} */
const EVENT_SLUGS = {
  priceTargets: 'what-price-will-bitcoin-hit-before-2027',
  athTiming: 'bitcoin-all-time-high-by',
  assetRace: 'bitcoin-vs-gold-vs-sp-500-in-2026',
  // btcOutperformGold: 'will-bitcoin-outperform-gold-in-2026',
  // btcBestMonth: 'bitcoin-best-month-in-2026',
  // btc60kOr80k: 'will-bitcoin-hit-60k-or-80k-first-965',
  // stablecoins500b: 'will-stablecoins-hit-500b-before-2027',
  // ethFlipped: 'eth-flipped-in-2026',
  // hypeOnBinance: 'hyperliquid-listed-on-binance-in-2026',
} as const

/**
 * Fetch all markets under an event and get YES price for each.
 * Returns { "short label": probability } map.
 */
async function fetchEventOdds(eventSlug: string): Promise<Record<string, number | null>> {
  const res = await fetch(
    `${BASE_URL}/polymarket/markets?event_slug=${eventSlug}&limit=50`,
    { headers: domeHeaders() }
  )
  if (!res.ok) throw new Error(`Dome markets fetch failed: ${res.status}`)
  const data = await res.json()
  const markets: DomeMarket[] = data.markets ?? []

  const odds: Record<string, number | null> = {}

  // Fetch prices in parallel (batched)
  await Promise.all(
    markets.map(async (m) => {
      const tokenId = m.side_a?.id
      if (!tokenId) return

      // Extract short label from title: "Will Bitcoin reach $100,000 by..." → "$100k reach"
      const label = extractLabel(m.title)

      try {
        const priceRes = await fetch(
          `${BASE_URL}/polymarket/market-price/${tokenId}`,
          { headers: domeHeaders() }
        )
        if (!priceRes.ok) {
          odds[label] = null
          return
        }
        const priceData = await priceRes.json()
        odds[label] = typeof priceData.price === 'number' ? priceData.price : null
      } catch {
        odds[label] = null
      }
    })
  )

  return odds
}

/**
 * Extract a short readable label from market title.
 * "Will Bitcoin reach $100,000 by December 31, 2026?" → "↑ $100k"
 * "Will Bitcoin dip to $55,000 by December 31, 2026?" → "↓ $55k"
 * "Will Gold have the best performance in 2026?" → "Gold"
 * "Bitcoin all time high by June 30, 2026?" → "By Jun 2026"
 */
function extractLabel(title: string): string {
  // Price target: reach/dip
  const priceMatch = title.match(/(?:reach|dip to) \$([0-9,]+)/i)
  if (priceMatch) {
    const amount = parseInt(priceMatch[1].replace(/,/g, ''), 10)
    const direction = title.toLowerCase().includes('dip') ? '↓' : '↑'
    const formatted =
      amount >= 1_000_000
        ? `$${(amount / 1_000_000).toFixed(0)}M`
        : amount >= 1000
          ? `$${(amount / 1000).toFixed(0)}k`
          : `$${amount}`
    return `${direction} ${formatted}`
  }

  // ATH timing: "by June 30, 2026"
  const dateMatch = title.match(/by (\w+ \d+, \d{4})/i)
  if (dateMatch) {
    const d = new Date(dateMatch[1])
    const month = d.toLocaleString('en', { month: 'short' })
    return `By ${month} ${d.getFullYear()}`
  }

  // Asset race: "Will Gold have..."
  const assetMatch = title.match(/Will (.+?) have/i)
  if (assetMatch) return assetMatch[1]

  // Fallback: first 30 chars
  return title.slice(0, 30)
}

export async function extractPolymarket(): Promise<PolymarketBTCData> {
  const [priceTargets, athTiming, assetRace] = await Promise.all([
    fetchEventOdds(EVENT_SLUGS.priceTargets).catch((err) => {
      console.error('[polymarket] priceTargets failed:', err)
      return {} as Record<string, number | null>
    }),
    fetchEventOdds(EVENT_SLUGS.athTiming).catch((err) => {
      console.error('[polymarket] athTiming failed:', err)
      return {} as Record<string, number | null>
    }),
    fetchEventOdds(EVENT_SLUGS.assetRace).catch((err) => {
      console.error('[polymarket] assetRace failed:', err)
      return {} as Record<string, number | null>
    }),
  ])

  console.log(`[polymarket] Price targets: ${Object.keys(priceTargets).length} markets`)
  console.log(`[polymarket] ATH timing: ${Object.keys(athTiming).length} markets`)
  console.log(`[polymarket] Asset race: ${Object.keys(assetRace).length} markets`)

  return { priceTargets, athTiming, assetRace }
}
