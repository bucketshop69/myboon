import 'dotenv/config'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { clobRoutes } from './clob.js'
import { CURATED_GEOPOLITICS_SLUGS, deriveCategory, deriveCategoryFromText } from './curated.js'
import type { SupportedSport } from './curated.js'
import {
  isDomeAvailable,
  domeGetMarketsBySlugs,
  domeGetMarketBySlug,
  domeGetMarketPrice,
  domeGetMarketsByTag,
  domeGetSportMarkets,
  domeGetMarketsByEventSlug,
  domeGroupMatchOutcomes,
  deriveMatchTitle,
  domeOutcomeLabel,
  domeMarketToClobTokenIds,
  domeEndTimeToIso,
  domeStatusToActive,
  domeGetIplMatches,
} from './dome.js'

// --- pinned markets ---

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pinnedPath = resolve(__dirname, '../../collectors/src/polymarket/pinned.json')
let PINNED_SLUGS: string[] = []
try {
  PINNED_SLUGS = JSON.parse(readFileSync(pinnedPath, 'utf-8')) as string[]
  console.log(`[api] Loaded ${PINNED_SLUGS.length} pinned slugs`)
} catch (err) {
  console.warn(`[api] Could not load pinned.json: ${err instanceof Error ? err.message : err}`)
}

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = parseInt(process.env.PORT ?? '3000', 10)

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')

if (missing.length > 0) {
  console.error(`[api] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

// --- supabase helpers ---

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function supabaseFetch(path: string): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: supabaseHeaders() })
}

// --- polymarket helpers ---

const GAMMA_BASE = 'https://gamma-api.polymarket.com'
const DATA_API_BASE = 'https://data-api.polymarket.com'
const CLOB_BASE = process.env.CLOB_HOST || 'https://clob-v2.polymarket.com'

async function gammaFetch(path: string): Promise<Response> {
  return fetch(`${GAMMA_BASE}/${path}`)
}

async function dataApiFetch(path: string): Promise<Response> {
  return fetch(`${DATA_API_BASE}/${path}`)
}

async function clobFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${CLOB_BASE}/${path}`, options)
}

function parseStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.filter((value): value is string => typeof value === 'string')
  }

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string')
      }
    } catch {
      return []
    }
  }

  return []
}

function parseNullableNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input !== 'string') return null

  const parsed = parseFloat(input)
  return Number.isFinite(parsed) ? parsed : null
}

// --- dome fallback wrapper ---

async function withDomeFallback<T>(
  label: string,
  domeFn: () => Promise<T>,
  gammaFn: () => Promise<T>,
): Promise<T> {
  if (!isDomeAvailable()) return gammaFn()
  try {
    return await domeFn()
  } catch (err) {
    console.warn(`[api] Dome failed for ${label}, falling back to Gamma:`, err instanceof Error ? err.message : err)
    return gammaFn()
  }
}

// --- app ---

const app = new Hono()

app.use('*', cors())
app.use('*', logger())

// --- CLOB routes (Polymarket Builder) ---
app.route('/clob', clobRoutes)

// GET /health
app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

// GET /narratives
app.get('/narratives', async (c) => {
  const rawLimit = parseInt(c.req.query('limit') ?? '20', 10)
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 50)
  const rawOffset = parseInt(c.req.query('offset') ?? '0', 10)
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset

  try {
    const res = await supabaseFetch(
      `published_narratives?select=id,narrative_id,content_small,tags,priority,actions,thread_id,created_at&order=created_at.desc,priority.desc&limit=${limit}&offset=${offset}`
    )

    if (!res.ok) {
      console.error(`[api] Supabase error ${res.status}: ${await res.text()}`)
      return c.json({ error: 'Internal server error' }, 500)
    }

    const data = await res.json()
    return c.json(data)
  } catch (err) {
    console.error('[api] Unexpected error in GET /narratives:', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /narratives/:id
app.get('/narratives/:id', async (c) => {
  const id = c.req.param('id')

  if (!id || id.trim() === '') {
    return c.json({ error: 'Bad request' }, 400)
  }

  try {
    const res = await supabaseFetch(
      `published_narratives?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    )

    if (!res.ok) {
      console.error(`[api] Supabase error ${res.status}: ${await res.text()}`)
      return c.json({ error: 'Internal server error' }, 500)
    }

    const data = await res.json() as unknown[]
    if (!Array.isArray(data) || data.length === 0) {
      return c.json({ error: 'Not found' }, 404)
    }

    return c.json(data[0])
  } catch (err) {
    console.error(`[api] Unexpected error in GET /narratives/${id}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// --- predict routes ---

const CURATED_GEO_SET = new Set<string>(CURATED_GEOPOLITICS_SLUGS)

// GET /predict/markets
app.get('/predict/markets', async (c) => {
  const results = await Promise.allSettled(
    CURATED_GEOPOLITICS_SLUGS.map(async (slug) => {
      return withDomeFallback(
        `markets/${slug}`,
        async () => {
          const domeMarkets = await domeGetMarketsBySlugs([slug])
          const m = domeMarkets.get(slug)
          if (!m) throw new Error(`Dome: no market found for slug ${slug}`)

          const clobTokenIds = domeMarketToClobTokenIds(m)

          let yesPrice: number | null = null
          let noPrice: number | null = null

          if (clobTokenIds.length >= 1) {
            const [yesPriceResult, noPriceResult] = await Promise.allSettled([
              domeGetMarketPrice(clobTokenIds[0]),
              clobTokenIds[1] ? domeGetMarketPrice(clobTokenIds[1]) : Promise.resolve(null),
            ])
            if (yesPriceResult.status === 'fulfilled') yesPrice = yesPriceResult.value
            if (noPriceResult.status === 'fulfilled') noPrice = noPriceResult.value
          }

          return {
            slug,
            question: m.title,
            category: 'geopolitics',
            conditionId: m.condition_id,
            clobTokenIds,
            yesPrice,
            noPrice,
            volume24h: m.volume_1_week ?? m.volume_total ?? null,
            endDate: domeEndTimeToIso(m.end_time),
            active: domeStatusToActive(m.status),
            image: m.image ?? null,
          }
        },
        async () => {
          const res = await gammaFetch(`markets?slug=${encodeURIComponent(slug)}`)
          if (!res.ok) throw new Error(`Gamma API ${res.status} for slug ${slug}`)

          const data = await res.json() as unknown[]
          if (!Array.isArray(data) || data.length === 0) throw new Error(`No market found for slug ${slug}`)

          const market = data[0] as Record<string, unknown>
          const clobTokenIds = parseStringArray(market.clobTokenIds ?? market.clob_token_ids)

          let yesPrice: number | null = null
          let noPrice: number | null = null

          if (clobTokenIds.length >= 2) {
            const [yesPriceRes, noPriceRes] = await Promise.allSettled([
              clobFetch(`price?token_id=${encodeURIComponent(clobTokenIds[0])}&side=buy`),
              clobFetch(`price?token_id=${encodeURIComponent(clobTokenIds[1])}&side=buy`),
            ])
            if (yesPriceRes.status === 'fulfilled' && yesPriceRes.value.ok) {
              const body = await yesPriceRes.value.json() as Record<string, unknown>
              yesPrice = parseNullableNumber(body.price)
            }
            if (noPriceRes.status === 'fulfilled' && noPriceRes.value.ok) {
              const body = await noPriceRes.value.json() as Record<string, unknown>
              noPrice = parseNullableNumber(body.price)
            }
          }

          return {
            slug,
            question: market.question ?? market.title ?? null,
            category: 'geopolitics',
            conditionId: market.conditionId ?? market.condition_id ?? null,
            clobTokenIds,
            yesPrice,
            noPrice,
            volume24h: market.volume24hr ?? market.volume_24h ?? market.volume ?? null,
            endDate: market.endDate ?? market.end_date ?? null,
            active: market.active ?? null,
            image: market.image ?? market.imageUrl ?? null,
          }
        },
      )
    })
  )

  const markets: unknown[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      markets.push(result.value)
    } else {
      console.error(`[api] GET /predict/markets — skipping ${CURATED_GEOPOLITICS_SLUGS[i]}:`, result.reason)
    }
  }

  return c.json(markets)
})

// GET /predict/markets/:slug
// No curated gate — feed predict blocks need any valid Polymarket slug, not just curated ones.
// The curated list applies only to GET /predict/markets (list endpoint).
app.get('/predict/markets/:slug', async (c) => {
  const slug = c.req.param('slug')

  try {
    const data = await withDomeFallback(
      `markets/detail/${slug}`,
      async () => {
        const m = await domeGetMarketBySlug(slug)
        if (!m) throw new Error(`Dome: no market found for slug ${slug}`)

        const clobTokenIds = domeMarketToClobTokenIds(m)

        // Fetch live prices so the detail screen has real odds
        const [yesPrice, noPrice] = await Promise.all([
          clobTokenIds[0] ? domeGetMarketPrice(clobTokenIds[0]) : Promise.resolve(null),
          clobTokenIds[1] ? domeGetMarketPrice(clobTokenIds[1]) : Promise.resolve(null),
        ])

        // Return in Gamma-compatible shape so mobile mappers work unchanged
        return {
          slug: m.market_slug,
          question: m.title,
          description: m.description ?? null,
          conditionId: m.condition_id,
          clobTokenIds,
          outcomePrices: JSON.stringify([
            String(yesPrice ?? 0),
            String(noPrice ?? 0),
          ]),
          endDate: domeEndTimeToIso(m.end_time),
          active: domeStatusToActive(m.status),
          volume24hr: m.volume_1_week ?? m.volume_total ?? null,
          volumeNum: m.volume_total ?? null,
          liquidityNum: null,
          image: m.image ?? null,
        }
      },
      async () => {
        const res = await gammaFetch(`markets?slug=${encodeURIComponent(slug)}`)
        if (!res.ok) throw new Error(`Gamma API ${res.status}`)
        const arr = await res.json() as unknown[]
        if (!Array.isArray(arr) || arr.length === 0) throw new Error('not found')
        return arr[0]
      },
    )

    return c.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not found') || msg.includes('no market')) {
      return c.json({ error: 'Not found' }, 404)
    }
    console.error(`[api] Unexpected error in GET /predict/markets/${slug}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// V1 /predict/order and /predict/orders routes removed — use /clob/order and /clob/positions instead

// GET /predict/history/:tokenId
// tokenId = Yes token ID from clobTokenIds[0] (pass the Yes token for Yes price history)
// ?interval=1h (default) | 1d
// Response shape: { history: [{ t: number, p: number }] }
//
// TODO(#059): migrate to Dome OHLCV once endpoint shape confirmed
// dome.polymarket.markets.getOhlcv({ market_id: tokenId, resolution: interval })
app.get('/predict/history/:tokenId', async (c) => {
  const tokenId = c.req.param('tokenId')

  if (!tokenId || tokenId.trim() === '') {
    return c.json({ error: 'Bad request' }, 400)
  }

  const interval = c.req.query('interval') ?? '1h'
  const fidelityMap: Record<string, number> = { '1m': 1, '5m': 5, '1h': 60, '1d': 1440 }
  const fidelity = fidelityMap[interval]

  if (!fidelity) {
    return c.json({ error: 'Bad request', detail: 'interval must be one of: 1m, 5m, 1h, 1d' }, 400)
  }

  const endTs = Math.floor(Date.now() / 1000)
  const startTs = endTs - 7 * 24 * 60 * 60 // last 7 days

  try {
    const res = await clobFetch(
      `prices-history?market=${encodeURIComponent(tokenId)}&startTs=${startTs}&endTs=${endTs}&fidelity=${fidelity}`
    )

    if (!res.ok) {
      console.error(`[api] CLOB prices-history error ${res.status} for ${tokenId}`)
      return c.json({ error: 'Internal server error' }, 500)
    }

    // Normalise to { history: [{ t, p }] } — CLOB already returns this shape,
    // but wrap defensively so the contract holds after any future Dome migration.
    const raw = await res.json() as Record<string, unknown>
    const history = Array.isArray(raw.history) ? raw.history : []
    return c.json({ history })
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/history/${tokenId}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/sports/:sport
// Dynamically fetches live games for a sport — no hardcoded slugs needed.
// Supported: epl, ucl
const SPORT_SERIES: Record<string, string> = {
  epl: '10188',
  ucl: '10204',
}

app.get('/predict/sports/:sport', async (c) => {
  const sport = c.req.param('sport').toLowerCase() as SupportedSport
  const seriesId = SPORT_SERIES[sport]

  if (!seriesId) {
    return c.json({ error: `Unsupported sport. Supported: ${Object.keys(SPORT_SERIES).join(', ')}` }, 400)
  }

  // Shared mapper: normalises an event (from either Dome or Gamma) into the response shape
  function mapEventToGame(e: Record<string, unknown>, _source: 'dome' | 'gamma') {
    const markets = (e.markets ?? []) as Record<string, unknown>[]

    const outcomes = markets.map((m) => {
      const outcomePrices = parseStringArray(m.outcomePrices)
      const clobTokenIds = parseStringArray(m.clobTokenIds)

      return {
        label: m.groupItemTitle ?? m.question ?? null,
        price: parseNullableNumber(outcomePrices[0]),
        conditionId: m.conditionId ?? m.condition_id ?? null,
        clobTokenIds,
      }
    })

    return {
      slug: e.slug,
      title: e.title,
      sport,
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
      image: e.image ?? null,
      active: e.active ?? null,
      volume24h: e.volume24hr ?? e.volume24h ?? null,
      liquidity: e.liquidity ?? null,
      negRisk: e.negRisk ?? false,
      outcomes,
      _source, // debug only — strip if noisy
    }
  }

  try {
    const games = await withDomeFallback(
      `sports/list/${sport}`,
      async () => {
        // Dome: flat list of outcome markets → group by event_slug → fetch prices
        const allMarkets = await domeGetSportMarkets(sport)
        const now = Math.floor(Date.now() / 1000)
        const matchGroups = domeGroupMatchOutcomes(allMarkets)
          // Exclude matches that have already ended
          .filter((g) => !g.endTime || g.endTime > now)

        // Fetch all YES token prices in one parallel batch
        const allTokenIds = matchGroups.flatMap((g) =>
          g.outcomes.map((m) => m.side_a?.id).filter(Boolean) as string[]
        )
        const priceResults = await Promise.allSettled(
          allTokenIds.map((id) => domeGetMarketPrice(id))
        )
        const priceMap = new Map<string, number | null>()
        allTokenIds.forEach((id, i) => {
          const r = priceResults[i]
          priceMap.set(id, r.status === 'fulfilled' ? r.value : null)
        })

        return matchGroups.map((g) => {
          const outcomes = g.outcomes.map((m) => ({
            label: domeOutcomeLabel(m),
            price: priceMap.get(m.side_a?.id ?? '') ?? null,
            conditionId: m.condition_id ?? null,
            clobTokenIds: domeMarketToClobTokenIds(m),
          }))

          return {
            slug: g.eventSlug,
            title: deriveMatchTitle(g.outcomes),
            sport,
            startDate: g.gameStartTime ?? null,
            endDate: domeEndTimeToIso(g.endTime),
            image: g.image ?? null,
            active: true,
            volume24h: g.volume1Week,
            liquidity: null,
            negRisk: true,
            outcomes,
          }
        })
      },
      async () => {
        const res = await gammaFetch(`events?series_id=${seriesId}&active=true&closed=false&limit=20`)
        if (!res.ok) throw new Error(`Gamma API ${res.status} for sport ${sport}`)
        const raw = await res.json()
        if (!Array.isArray(raw)) throw new Error(`Gamma unexpected response for sport ${sport}`)
        return (raw as Record<string, unknown>[])
          .filter((e) => !String(e.slug ?? '').endsWith('-more-markets'))
          .map((e) => mapEventToGame(e, 'gamma'))
      },
    )

    return c.json(games)
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/sports/${sport}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/sports/:sport/:slug — full game detail with all outcomes
app.get('/predict/sports/:sport/:slug', async (c) => {
  const sport = c.req.param('sport').toLowerCase() as SupportedSport
  const slug = c.req.param('slug')
  const seriesId = SPORT_SERIES[sport]

  if (!seriesId) {
    return c.json({ error: `Unsupported sport. Supported: ${Object.keys(SPORT_SERIES).join(', ')}` }, 400)
  }

  // Shared outcome mapper — same shape from Dome or Gamma events
  function mapOutcome(m: Record<string, unknown>) {
    const outcomePrices = parseStringArray(m.outcomePrices)
    const clobTokenIds = parseStringArray(m.clobTokenIds)
    return {
      label: m.groupItemTitle ?? null,
      question: m.question ?? null,
      price: parseNullableNumber(outcomePrices[0]),
      conditionId: m.conditionId ?? m.condition_id ?? null,
      clobTokenIds,
      liquidity: m.liquidityNum ?? null,
      volume24h: m.volume24hr ?? null,
      bestBid: m.bestBid ?? null,
      bestAsk: m.bestAsk ?? null,
      acceptingOrders: m.acceptingOrders ?? null,
    }
  }

  try {
    const detail = await withDomeFallback(
      `sports/detail/${sport}/${slug}`,
      async () => {
        // Dome: fetch all outcome markets for this event slug, then get prices
        if (!slug.startsWith(`${sport}-`)) {
          throw new Error(`Dome: slug ${slug} does not match sport ${sport}`)
        }

        const domeMarkets = await domeGetMarketsByEventSlug(slug)
        if (!domeMarkets.length) throw new Error(`Dome: no markets found for event ${slug}`)

        // Parallel price fetches for all YES tokens
        const priceResults = await Promise.allSettled(
          domeMarkets.map((m) => domeGetMarketPrice(m.side_a?.id ?? ''))
        )
        const prices = priceResults.map((r) => (r.status === 'fulfilled' ? r.value : null))

        const outcomes = domeMarkets.map((m, i) => ({
          label: domeOutcomeLabel(m),
          question: m.title,
          price: prices[i],
          conditionId: m.condition_id ?? null,
          clobTokenIds: domeMarketToClobTokenIds(m),
          liquidity: null,
          volume24h: m.volume_1_week ?? null,
          bestBid: null,
          bestAsk: null,
          acceptingOrders: m.status === 'open' ? true : false,
        }))

        const first = domeMarkets[0]
        return {
          slug,
          title: deriveMatchTitle(domeMarkets),
          description: first.description ?? null,
          sport,
          startDate: first.game_start_time ?? null,
          endDate: domeEndTimeToIso(first.end_time),
          image: first.image ?? null,
          active: first.status === 'open',
          negRisk: true,
          volume24h: domeMarkets.reduce((sum, m) => sum + (m.volume_1_week ?? 0), 0),
          liquidity: null,
          outcomes,
        }
      },
      async () => {
        const res = await gammaFetch(`events?slug=${encodeURIComponent(slug)}`)
        if (!res.ok) throw new Error(`Gamma API ${res.status} for slug ${slug}`)

        const events = await res.json() as Record<string, unknown>[]
        if (!Array.isArray(events) || events.length === 0) throw new Error('not found')

        const e = events[0]
        const eventSlug = String(e.slug ?? '')
        const eventSeries = Array.isArray(e.series) ? e.series : []
        const belongsToSeries = eventSeries.some((row) => {
          if (!row || typeof row !== 'object') return false
          const id = (row as Record<string, unknown>).id
          return String(id) === seriesId
        })

        if (!eventSlug.startsWith(`${sport}-`) && !belongsToSeries) throw new Error('not found')

        const markets = (e.markets ?? []) as Record<string, unknown>[]
        return {
          slug: e.slug,
          title: e.title,
          description: e.description ?? null,
          sport,
          startDate: e.startDate ?? null,
          endDate: e.endDate ?? null,
          image: e.image ?? null,
          active: e.active ?? null,
          negRisk: e.negRisk ?? false,
          volume24h: e.volume24hr ?? null,
          liquidity: e.liquidity ?? null,
          outcomes: markets.map(mapOutcome),
        }
      },
    )

    return c.json(detail)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not found')) return c.json({ error: 'Not found' }, 404)
    console.error(`[api] Unexpected error in GET /predict/sports/${sport}/${slug}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/price/:tokenId
app.get('/predict/price/:tokenId', async (c) => {
  const tokenId = c.req.param('tokenId')

  if (!tokenId || tokenId.trim() === '') {
    return c.json({ error: 'Bad request' }, 400)
  }

  try {
    const [buyRes, sellRes] = await Promise.allSettled([
      clobFetch(`price?token_id=${encodeURIComponent(tokenId)}&side=buy`),
      clobFetch(`price?token_id=${encodeURIComponent(tokenId)}&side=sell`),
    ])

    let buy: number | null = null
    let sell: number | null = null

    if (buyRes.status === 'fulfilled' && buyRes.value.ok) {
      const body = await buyRes.value.json() as Record<string, unknown>
      buy = parseNullableNumber(body.price)
    } else {
      console.error(`[api] CLOB price buy failed for token ${tokenId}`)
    }

    if (sellRes.status === 'fulfilled' && sellRes.value.ok) {
      const body = await sellRes.value.json() as Record<string, unknown>
      sell = parseNullableNumber(body.price)
    } else {
      console.error(`[api] CLOB price sell failed for token ${tokenId}`)
    }

    return c.json({ tokenId, buy, sell })
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/price/${tokenId}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/trending
// Returns top active binary markets sorted by weekly volume.
// ?limit=10 (default 10, max 20) &tag=politics (default politics)
app.get('/predict/trending', async (c) => {
  const rawLimit = parseInt(c.req.query('limit') ?? '10', 10)
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 10 : Math.min(rawLimit, 20)
  const tag = (c.req.query('tag') ?? 'geopolitics').trim().toLowerCase()

  try {
    const markets = await withDomeFallback(
      `trending/${tag}`,
      async () => {
        const now = Math.floor(Date.now() / 1000)
        const raw = await domeGetMarketsByTag(tag, limit * 3)

        const filtered = raw
          // Exclude sport outcome markets (game_start_time is set)
          .filter((m) => !m.game_start_time)
          // Exclude expired
          .filter((m) => !m.end_time || m.end_time > now)
          // Sort by weekly volume desc
          .sort((a, b) => (b.volume_1_week ?? 0) - (a.volume_1_week ?? 0))
          .slice(0, limit)

        // Fetch prices in parallel
        const priceResults = await Promise.allSettled(
          filtered.map((m) =>
            Promise.all([
              m.side_a?.id ? domeGetMarketPrice(m.side_a.id) : Promise.resolve(null),
              m.side_b?.id ? domeGetMarketPrice(m.side_b.id) : Promise.resolve(null),
            ])
          )
        )

        return filtered.map((m, i) => {
          const pr = priceResults[i]
          const [yesPrice, noPrice] = pr.status === 'fulfilled' ? pr.value : [null, null]
          return {
            slug: m.market_slug,
            question: m.title,
            category: tag,
            conditionId: m.condition_id,
            clobTokenIds: domeMarketToClobTokenIds(m),
            yesPrice,
            noPrice,
            volume24h: m.volume_1_week ?? m.volume_total ?? null,
            endDate: domeEndTimeToIso(m.end_time),
            active: domeStatusToActive(m.status),
            image: m.image ?? null,
          }
        })
      },
      // Gamma fallback: re-use curated list sorted by volume (no dynamic trending)
      async () => {
        console.warn(`[api] Dome unavailable for trending/${tag} — returning curated fallback`)
        return []
      },
    )

    return c.json(markets)
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/trending:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/markets/:slug/price
// Lightweight live price poll — use for 30s refresh on detail screens.
// Response: { slug, yesPrice, noPrice, fetchedAt }
app.get('/predict/markets/:slug/price', async (c) => {
  const slug = c.req.param('slug')

  try {
    const prices = await withDomeFallback(
      `markets/price/${slug}`,
      async () => {
        const m = await domeGetMarketBySlug(slug)
        if (!m) throw new Error(`Dome: no market found for slug ${slug}`)

        const [yesPrice, noPrice] = await Promise.all([
          m.side_a?.id ? domeGetMarketPrice(m.side_a.id) : Promise.resolve(null),
          m.side_b?.id ? domeGetMarketPrice(m.side_b.id) : Promise.resolve(null),
        ])
        return { yesPrice, noPrice }
      },
      async () => {
        // Fallback: fetch market from Gamma to get token IDs, then CLOB for prices
        const res = await gammaFetch(`markets?slug=${encodeURIComponent(slug)}`)
        if (!res.ok) throw new Error(`Gamma ${res.status}`)
        const arr = await res.json() as unknown[]
        if (!Array.isArray(arr) || arr.length === 0) throw new Error('not found')

        const market = arr[0] as Record<string, unknown>
        const clobTokenIds = parseStringArray(market.clobTokenIds ?? market.clob_token_ids)

        let yesPrice: number | null = null
        let noPrice: number | null = null

        if (clobTokenIds.length >= 2) {
          const [yRes, nRes] = await Promise.allSettled([
            clobFetch(`price?token_id=${encodeURIComponent(clobTokenIds[0])}&side=buy`),
            clobFetch(`price?token_id=${encodeURIComponent(clobTokenIds[1])}&side=buy`),
          ])
          if (yRes.status === 'fulfilled' && yRes.value.ok) {
            const body = await yRes.value.json() as Record<string, unknown>
            yesPrice = parseNullableNumber(body.price)
          }
          if (nRes.status === 'fulfilled' && nRes.value.ok) {
            const body = await nRes.value.json() as Record<string, unknown>
            noPrice = parseNullableNumber(body.price)
          }
        }
        return { yesPrice, noPrice }
      },
    )

    return c.json({ slug, ...prices, fetchedAt: new Date().toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not found')) return c.json({ error: 'Not found' }, 404)
    console.error(`[api] Unexpected error in GET /predict/markets/${slug}/price:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/portfolio/:address
// Portfolio value + open positions + activity via Gamma data-api.
// All Gamma — no CLOB auth needed, just the polygon proxy wallet address.
app.get('/predict/portfolio/:address', async (c) => {
  const address = c.req.param('address')
  if (!address?.trim()) return c.json({ error: 'Bad request' }, 400)

  try {
    // Fetch value, positions, and profile in parallel
    const [valueRes, posRes, profileRes] = await Promise.allSettled([
      dataApiFetch(`value?user=${encodeURIComponent(address)}`),
      dataApiFetch(`positions?user=${encodeURIComponent(address)}&sizeThreshold=0.1&limit=100&sortBy=CURRENT_VALUE&sortDirection=DESC`),
      gammaFetch(`public-profile?proxyWallet=${encodeURIComponent(address)}`),
    ])

    // Parse portfolio value
    let portfolioValue: number | null = null
    if (valueRes.status === 'fulfilled' && valueRes.value.ok) {
      const body = await valueRes.value.json() as unknown
      // data-api /value returns [{ user, value }] or { value }
      if (Array.isArray(body) && body.length > 0) {
        portfolioValue = parseNullableNumber((body[0] as Record<string, unknown>).value)
      } else if (body && typeof body === 'object') {
        portfolioValue = parseNullableNumber((body as Record<string, unknown>).value)
      }
    }

    // Parse positions
    let positions: unknown[] = []
    if (posRes.status === 'fulfilled' && posRes.value.ok) {
      const body = await posRes.value.json() as unknown
      positions = Array.isArray(body) ? body : []
    }

    // Parse profile
    let profile: Record<string, unknown> | null = null
    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      profile = await profileRes.value.json() as Record<string, unknown>
    }

    // Compute summary from positions
    let totalPnl = 0
    let openCount = 0
    for (const p of positions) {
      const pos = p as Record<string, unknown>
      totalPnl += parseNullableNumber(pos.cashPnl) ?? 0
      openCount++
    }

    return c.json({
      address,
      portfolioValue: portfolioValue !== null ? Math.round(portfolioValue * 100) / 100 : null,
      positions,
      profile: profile ? {
        name: profile.name ?? profile.pseudonym ?? null,
        bio: profile.bio ?? null,
        profileImage: profile.profileImage ?? null,
        xUsername: profile.xUsername ?? null,
      } : null,
      summary: {
        openPositions: openCount,
        totalPnl: Math.round(totalPnl * 100) / 100,
      },
    })
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/portfolio/${address}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/profile/:address
// Rich wallet profile card — identity, stats, top positions, top wins, classification.
// Aggregates 5 data-api + gamma-api calls in parallel.
app.get('/predict/profile/:address', async (c) => {
  const address = c.req.param('address')
  if (!address?.trim()) return c.json({ error: 'Bad request' }, 400)

  try {
    const [profileRes, valueRes, tradedRes, posRes, closedRes] = await Promise.allSettled([
      gammaFetch(`public-profile?address=${encodeURIComponent(address)}`),
      dataApiFetch(`value?user=${encodeURIComponent(address)}`),
      dataApiFetch(`traded?user=${encodeURIComponent(address)}`),
      dataApiFetch(`positions?user=${encodeURIComponent(address)}&limit=5&sortBy=CASHPNL&sortDirection=DESC`),
      dataApiFetch(`closed-positions?user=${encodeURIComponent(address)}&limit=5&sortBy=REALIZEDPNL&sortDirection=DESC`),
    ])

    // Identity
    let identity: Record<string, unknown> | null = null
    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      const p = await profileRes.value.json() as Record<string, unknown>
      identity = {
        name: p.name ?? p.pseudonym ?? null,
        pseudonym: p.pseudonym ?? null,
        xUsername: p.xUsername ?? null,
        verifiedBadge: p.verifiedBadge ?? false,
        createdAt: p.createdAt ?? null,
        profileImage: p.profileImage ?? null,
        bio: p.bio ?? null,
      }
    }

    // Portfolio value
    let portfolioValue: number | null = null
    if (valueRes.status === 'fulfilled' && valueRes.value.ok) {
      const body = await valueRes.value.json() as unknown
      if (Array.isArray(body) && body.length > 0) {
        portfolioValue = parseNullableNumber((body[0] as Record<string, unknown>).value)
      }
    }

    // Markets traded
    let marketsTraded: number | null = null
    if (tradedRes.status === 'fulfilled' && tradedRes.value.ok) {
      const body = await tradedRes.value.json() as Record<string, unknown>
      marketsTraded = parseNullableNumber(body.traded)
    }

    // Top positions
    let topPositions: unknown[] = []
    if (posRes.status === 'fulfilled' && posRes.value.ok) {
      const body = await posRes.value.json() as unknown
      topPositions = Array.isArray(body) ? body : []
    }

    // Top wins (closed)
    let topWins: unknown[] = []
    if (closedRes.status === 'fulfilled' && closedRes.value.ok) {
      const body = await closedRes.value.json() as unknown
      topWins = Array.isArray(body) ? body : []
    }

    // Derived stats
    let totalOpenPnl = 0
    for (const p of topPositions) {
      totalOpenPnl += parseNullableNumber((p as Record<string, unknown>).cashPnl) ?? 0
    }
    let totalRealizedPnl = 0
    for (const w of topWins) {
      totalRealizedPnl += parseNullableNumber((w as Record<string, unknown>).realizedPnl) ?? 0
    }

    // Classification
    let classification: string = 'unknown'
    if (portfolioValue !== null) {
      if (portfolioValue >= 50_000) classification = 'whale'
      else if (portfolioValue >= 1_000) classification = 'mid'
      else classification = 'retail'
    }

    return c.json({
      address,
      identity,
      stats: {
        portfolioValue: portfolioValue !== null ? Math.round(portfolioValue * 100) / 100 : null,
        marketsTraded,
        openPositions: topPositions.length,
        totalOpenPnl: Math.round(totalOpenPnl * 100) / 100,
        totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
      },
      classification,
      topPositions,
      topWins,
    })
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/profile/${address}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/activity/:address
// Recent trade activity via Gamma data-api.
app.get('/predict/activity/:address', async (c) => {
  const address = c.req.param('address')
  if (!address?.trim()) return c.json({ error: 'Bad request' }, 400)

  try {
    const res = await dataApiFetch(
      `activity?user=${encodeURIComponent(address)}&limit=50&sortBy=TIMESTAMP&sortDirection=DESC`
    )
    if (!res.ok) {
      console.error(`[api] data-api /activity error ${res.status}`)
      return c.json({ error: 'Failed to fetch activity' }, 502)
    }
    const body = await res.json() as unknown
    return c.json(Array.isArray(body) ? body : [])
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/activity/${address}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/positions/:address/market/:slug
// Positions for a specific market via Gamma data-api.
// Fetches all user positions and filters by slug (data-api doesn't support slug filter directly).
app.get('/predict/positions/:address/market/:slug', async (c) => {
  const address = c.req.param('address')
  const slug = c.req.param('slug')
  if (!address?.trim() || !slug?.trim()) return c.json({ error: 'Bad request' }, 400)

  try {
    const res = await dataApiFetch(
      `positions?user=${encodeURIComponent(address)}&sizeThreshold=0.1&limit=100&sortBy=CURRENT_VALUE&sortDirection=DESC`
    )
    if (!res.ok) {
      console.error(`[api] data-api /positions error ${res.status}`)
      return c.json({ error: 'Failed to fetch positions' }, 502)
    }
    const body = await res.json() as unknown
    if (!Array.isArray(body)) return c.json([])

    // Filter positions matching this market's slug or eventSlug
    const filtered = body.filter((p: unknown) => {
      const pos = p as Record<string, unknown>
      return pos.slug === slug || pos.eventSlug === slug
    })
    return c.json(filtered)
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/positions/${address}/market/${slug}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ---------------------------------------------------------------------------
// GET /predict/feed — Unified predict feed
// ---------------------------------------------------------------------------
//
// Returns a mixed list of binary markets and sport matches from three sources:
//   1. Pinned binary markets  (from packages/collectors/src/polymarket/pinned.json)
//   2. EPL matches            (Gamma series_id 10188)
//   3. IPL matches            (Gamma series_id 11213)
//
// All data comes from Polymarket's Gamma API (gamma-api.polymarket.com).
//
// Query params:
//   ?category=crypto|politics|sports|tech|macro|entertainment|all  (default: all)
//   ?sport=epl|ipl          — filter to specific sport (implies category=sports)
//   ?limit=N                — max items returned, default 30, max 50
//
// Response shape:
//   {
//     items: FeedItem[],       — mixed binary + match items, sorted
//     categories: string[]     — unique categories present in items
//   }
//
// Sort order: live matches → upcoming matches (by kickoff) → binary markets (by volume)
//
// FE notes:
//   - type="binary": use yesPrice/noPrice, clobTokenIds[0]=YES token, [1]=NO token
//   - type="match":  use outcomes[] array, each has label/price/clobTokenIds
//   - status="live": match is in progress — show live indicator
//   - status="upcoming": match hasn't started — show gameStartTime as countdown
//   - gameStartTime: actual match kickoff (NOT market creation time)
//   - startDate: market creation time (less useful for display)
//   - prices are 0-1 (probability), e.g. 0.65 = 65% chance
//   - conditionId + clobTokenIds needed for placing trades via CLOB
// ---------------------------------------------------------------------------

/**
 * Feed item — either a binary market (yes/no) or a sport match (multiple outcomes).
 *
 * Binary (type="binary"):
 *   question, yesPrice, noPrice, clobTokenIds[0]=YES / [1]=NO, conditionId
 *
 * Match (type="match"):
 *   title, sport ("epl"|"ipl"), outcomes[].label/price/clobTokenIds, status, gameStartTime
 *   - EPL: 3 outcomes (Team A / Team B / Draw)
 *   - IPL: 2 outcomes (Team A / Team B, no draw in cricket)
 */
interface FeedItem {
  type: 'binary' | 'match'
  slug: string                              // Polymarket market/event slug — unique identifier
  question?: string                         // Binary only: market question text
  title?: string                            // Match only: "Team A vs Team B"
  category: string                          // crypto | politics | sports | tech | macro | entertainment | other
  tags: string[]                            // Category-related tags
  sport?: string                            // Match only: "epl" | "ipl"
  status?: 'live' | 'upcoming' | 'ended'    // Match only: derived from gameStartTime vs now
  gameStartTime?: string | null             // Match only: actual kickoff time (ISO/UTC)
  yesPrice?: number | null                  // Binary only: YES outcome price (0-1)
  noPrice?: number | null                   // Binary only: NO outcome price (0-1)
  volume: number | null                     // 24h trading volume in USD
  endDate: string | null                    // Market resolution/expiry date
  startDate?: string | null                 // Market creation date (not game start)
  active: boolean | null                    // Market accepting trades
  image: string | null                      // Market/event thumbnail URL
  clobTokenIds?: string[]                   // Binary only: [yesTokenId, noTokenId] for CLOB trades
  conditionId?: string | null               // Binary only: Polymarket condition ID for CLOB
  outcomes?: {                              // Match only: one entry per possible outcome
    label: string                           //   Team name or "Draw"
    price: number | null                    //   Outcome price (0-1)
    conditionId?: string | null             //   Condition ID for this outcome's market
    clobTokenIds: string[]                  //   Token IDs for placing trades
  }[]
}

/** Derive match status from kickoff time. gameStartTime is actual kickoff, not market creation. */
function deriveMatchStatus(gameStartTime: string | null | undefined, active: boolean, closed: boolean): 'live' | 'upcoming' | 'ended' {
  if (closed) return 'ended'
  if (!gameStartTime) return active ? 'upcoming' : 'ended'
  const start = new Date(gameStartTime).getTime()
  const now = Date.now()
  if (now >= start && active) return 'live'
  if (now < start) return 'upcoming'
  return 'ended'
}

app.get('/predict/feed', async (c) => {
  const categoryFilter = (c.req.query('category') ?? 'all').toLowerCase()
  const sportFilter = c.req.query('sport')?.toLowerCase() ?? null
  const rawLimit = parseInt(c.req.query('limit') ?? '30', 10)
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 30 : Math.min(rawLimit, 50)

  try {
    // Parallel-fetch all three sources (Gamma only — Dome is unreliable)
    const [pinnedResult, eplResult, iplResult] = await Promise.allSettled([
      // 1. Pinned binary markets via Gamma
      (async (): Promise<FeedItem[]> => {
        if (PINNED_SLUGS.length === 0) return []
        if (sportFilter) return []
        if (categoryFilter === 'sports') return []

        const results = await Promise.allSettled(
          PINNED_SLUGS.map(async (slug) => {
            const res = await gammaFetch(`markets?slug=${encodeURIComponent(slug)}`)
            if (!res.ok) return null
            const arr = await res.json() as unknown[]
            if (!Array.isArray(arr) || arr.length === 0) return null
            const market = arr[0] as Record<string, unknown>

            // Gamma markets don't have tags — derive category from slug + question
            const question = String(market.question ?? market.title ?? slug).toLowerCase()
            const category = deriveCategoryFromText(slug, question)
            if (categoryFilter !== 'all' && category !== categoryFilter) return null

            const clobTokenIds = parseStringArray(market.clobTokenIds ?? market.clob_token_ids)

            // Parse outcomePrices from Gamma (already embedded in market response)
            const outcomePrices = parseStringArray(market.outcomePrices)
            const yesPrice = parseNullableNumber(outcomePrices[0])
            const noPrice = parseNullableNumber(outcomePrices[1])

            return {
              type: 'binary' as const,
              slug,
              question: market.question ?? market.title ?? null,
              category,
              tags: [category],
              yesPrice,
              noPrice,
              volume: market.volume24hr ?? market.volume ?? null,
              endDate: market.endDate ?? market.end_date ?? null,
              active: market.active ?? null,
              image: market.image ?? market.imageUrl ?? null,
              clobTokenIds,
              conditionId: market.conditionId ?? market.condition_id ?? null,
            } as FeedItem
          })
        )
        return results
          .filter((r): r is PromiseFulfilledResult<FeedItem | null> => r.status === 'fulfilled')
          .map((r) => r.value)
          .filter((item): item is FeedItem => item !== null)
      })(),

      // 2. EPL matches via Gamma (series_id 10188)
      (async (): Promise<FeedItem[]> => {
        if (sportFilter && sportFilter !== 'epl') return []
        if (categoryFilter !== 'all' && categoryFilter !== 'sports') return []

        const res = await gammaFetch('events?series_id=10188&active=true&closed=false&limit=20')
        if (!res.ok) return []
        const events = await res.json() as Record<string, unknown>[]
        if (!Array.isArray(events)) return []

        return events
          .filter((e) => {
            const slug = String(e.slug ?? '')
            return slug.startsWith('epl-') && !slug.endsWith('-more-markets')
          })
          .map((e) => {
            const markets = (e.markets ?? []) as Record<string, unknown>[]
            const gameStart = String(markets[0]?.gameStartTime ?? e.startTime ?? '')
            const isActive = (e.active as boolean) ?? false
            const isClosed = (e.closed as boolean) ?? false
            const outcomes = markets.map((m) => {
              const outcomePrices = parseStringArray(m.outcomePrices)
              const clobTokenIds = parseStringArray(m.clobTokenIds)
              return {
                label: m.groupItemTitle ?? m.question ?? null,
                price: parseNullableNumber(outcomePrices[0]),
                conditionId: m.conditionId ?? m.condition_id ?? null,
                clobTokenIds,
              }
            })
            return {
              type: 'match' as const,
              slug: e.slug as string,
              title: e.title as string,
              category: 'sports',
              sport: 'epl',
              tags: ['sports', 'epl'],
              status: deriveMatchStatus(gameStart || null, isActive, isClosed),
              gameStartTime: gameStart || null,
              startDate: (e.startDate as string) ?? null,
              endDate: (e.endDate as string) ?? null,
              image: (e.image as string) ?? null,
              active: isActive,
              volume: (e.volume24hr ?? e.volume ?? null) as number | null,
              outcomes,
            } as FeedItem
          })
      })(),

      // 3. IPL matches via Gamma (series_id 11213)
      (async (): Promise<FeedItem[]> => {
        if (sportFilter && sportFilter !== 'ipl') return []
        if (categoryFilter !== 'all' && categoryFilter !== 'sports') return []

        const res = await gammaFetch('events?series_id=11213&active=true&closed=false&limit=20')
        if (!res.ok) return []
        const events = await res.json() as Record<string, unknown>[]
        if (!Array.isArray(events)) return []

        // Dedupe: Polymarket creates both "cricipl-guj-che-DATE" and "cricipl-che-guj-DATE"
        // for the same match with flipped team order. Keep the one with higher volume.
        const matchMap = new Map<string, Record<string, unknown>>()
        for (const e of events) {
          const slug = String(e.slug ?? '')
          if (!slug.startsWith('cricipl-') || !/\d{4}-\d{2}-\d{2}$/.test(slug)) continue
          const parts = slug.replace('cricipl-', '').match(/^(.+)-(\d{4}-\d{2}-\d{2})$/)
          if (!parts) continue
          const teams = parts[1].split('-').sort().join('-')
          const key = `${teams}-${parts[2]}`
          const existing = matchMap.get(key)
          if (!existing || ((e.volume ?? 0) as number) > ((existing.volume ?? 0) as number)) {
            matchMap.set(key, e)
          }
        }

        return Array.from(matchMap.values())
          .map((e) => {
            const markets = (e.markets ?? []) as Record<string, unknown>[]
            const mainMarket = markets.find((m) => m.slug === e.slug) ?? markets[0]
            if (!mainMarket) return null

            const outcomesRaw = typeof mainMarket.outcomes === 'string'
              ? JSON.parse(mainMarket.outcomes as string) as string[]
              : (mainMarket.outcomes ?? []) as string[]
            const outcomePrices = parseStringArray(mainMarket.outcomePrices)
            const clobTokenIds = parseStringArray(mainMarket.clobTokenIds)

            const outcomes = outcomesRaw.map((label, idx) => ({
              label,
              price: parseNullableNumber(outcomePrices[idx]),
              conditionId: mainMarket.conditionId ?? mainMarket.condition_id ?? null,
              clobTokenIds: clobTokenIds[idx] ? [clobTokenIds[idx]] : [],
            }))

            const title = String(e.title ?? '').replace(/^Indian Premier League:\s*/, '')
            const gameStart = String(mainMarket.gameStartTime ?? e.startTime ?? '')
            const isActive = (e.active as boolean) ?? false
            const isClosed = (e.closed as boolean) ?? false

            return {
              type: 'match' as const,
              slug: e.slug as string,
              title,
              category: 'sports',
              sport: 'ipl',
              tags: ['sports', 'cricket', 'indian premier league'],
              status: deriveMatchStatus(gameStart || null, isActive, isClosed),
              gameStartTime: gameStart || null,
              startDate: (e.startDate as string) ?? null,
              endDate: (e.endDate as string) ?? null,
              image: (e.image as string) ?? null,
              active: isActive,
              volume: (e.volume24hr ?? e.volume ?? null) as number | null,
              outcomes,
            } as FeedItem
          })
          .filter((item): item is FeedItem => item !== null)
      })(),
    ])

    // Collect results, skip failed sources
    const items: FeedItem[] = []
    const sources = [pinnedResult, eplResult, iplResult]
    const sourceNames = ['pinned', 'epl', 'ipl']
    for (let i = 0; i < sources.length; i++) {
      const r = sources[i]
      if (r.status === 'fulfilled') {
        items.push(...r.value)
      } else {
        console.error(`[api] /predict/feed — ${sourceNames[i]} failed:`, r.reason)
      }
    }

    // Sort: live first, then upcoming (by gameStartTime), then pinned by volume, then rest
    const statusOrder = { live: 0, upcoming: 1, ended: 2 }

    items.sort((a, b) => {
      const aStatus = statusOrder[a.status ?? 'ended'] ?? 2
      const bStatus = statusOrder[b.status ?? 'ended'] ?? 2

      // Live matches always first
      if (aStatus !== bStatus) return aStatus - bStatus

      // Within same status, sort matches by gameStartTime
      if (a.status === b.status && a.gameStartTime && b.gameStartTime) {
        return new Date(a.gameStartTime).getTime() - new Date(b.gameStartTime).getTime()
      }

      // Matches before binary markets
      if (a.type === 'match' && b.type !== 'match') return -1
      if (a.type !== 'match' && b.type === 'match') return 1

      // Binary markets by volume
      return (b.volume ?? 0) - (a.volume ?? 0)
    })

    // Dedupe categories from actual items
    const categories = [...new Set(items.map((item) => item.category))]

    return c.json({ items: items.slice(0, limit), categories })
  } catch (err) {
    console.error('[api] Unexpected error in GET /predict/feed:', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// --- start server ---

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[api] Listening on port ${PORT}`)
})
