import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { ALL_SLUGS, CURATED_SLUGS } from './curated.js'

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
const CLOB_BASE = 'https://clob.polymarket.com'

async function gammaFetch(path: string): Promise<Response> {
  return fetch(`${GAMMA_BASE}/${path}`)
}

async function clobFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${CLOB_BASE}/${path}`, options)
}

// --- app ---

const app = new Hono()

app.use('*', cors())
app.use('*', logger())

// GET /health
app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

// GET /narratives
app.get('/narratives', async (c) => {
  const rawLimit = parseInt(c.req.query('limit') ?? '20', 10)
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 20)

  try {
    const res = await supabaseFetch(
      `published_narratives?select=id,narrative_id,content_small,tags,priority,created_at&order=priority.desc,created_at.desc&limit=${limit}`
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

// GET /predict/markets
app.get('/predict/markets', async (c) => {
  const geoSet = new Set(CURATED_SLUGS.geopolitics)

  const results = await Promise.allSettled(
    ALL_SLUGS.map(async (slug) => {
      const res = await gammaFetch(`markets?slug=${encodeURIComponent(slug)}`)
      if (!res.ok) throw new Error(`Gamma API ${res.status} for slug ${slug}`)

      const data = await res.json() as unknown[]
      if (!Array.isArray(data) || data.length === 0) throw new Error(`No market found for slug ${slug}`)

      const market = data[0] as Record<string, unknown>
      const category = geoSet.has(slug) ? 'geopolitics' : 'sports'
      const rawTokenIds = market.clobTokenIds ?? market.clob_token_ids ?? []
      const clobTokenIds: string[] = typeof rawTokenIds === 'string'
        ? JSON.parse(rawTokenIds)
        : rawTokenIds as string[]

      let yesPrice: number | null = null
      let noPrice: number | null = null

      if (clobTokenIds.length >= 2) {
        const [yesPriceRes, noPriceRes] = await Promise.allSettled([
          clobFetch(`price?token_id=${encodeURIComponent(clobTokenIds[0])}&side=buy`),
          clobFetch(`price?token_id=${encodeURIComponent(clobTokenIds[1])}&side=buy`),
        ])
        if (yesPriceRes.status === 'fulfilled' && yesPriceRes.value.ok) {
          const body = await yesPriceRes.value.json() as Record<string, unknown>
          yesPrice = typeof body.price === 'number' ? body.price : parseFloat(body.price as string) || null
        }
        if (noPriceRes.status === 'fulfilled' && noPriceRes.value.ok) {
          const body = await noPriceRes.value.json() as Record<string, unknown>
          noPrice = typeof body.price === 'number' ? body.price : parseFloat(body.price as string) || null
        }
      }

      return {
        slug,
        question: market.question ?? market.title ?? null,
        category,
        conditionId: market.conditionId ?? market.condition_id ?? null,
        clobTokenIds,
        yesPrice,
        noPrice,
        volume24h: market.volume24hr ?? market.volume_24h ?? market.volume ?? null,
        endDate: market.endDate ?? market.end_date ?? null,
        active: market.active ?? null,
        image: market.image ?? market.imageUrl ?? null,
      }
    })
  )

  const markets: unknown[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      markets.push(result.value)
    } else {
      console.error(`[api] GET /predict/markets — skipping ${ALL_SLUGS[i]}:`, result.reason)
    }
  }

  return c.json(markets)
})

// GET /predict/markets/:slug
app.get('/predict/markets/:slug', async (c) => {
  const slug = c.req.param('slug')

  if (!ALL_SLUGS.includes(slug)) {
    return c.json({ error: 'Not found' }, 404)
  }

  try {
    const res = await gammaFetch(`markets?slug=${encodeURIComponent(slug)}`)
    if (!res.ok) {
      console.error(`[api] Gamma API error ${res.status} for slug ${slug}`)
      return c.json({ error: 'Internal server error' }, 500)
    }

    const data = await res.json() as unknown[]
    if (!Array.isArray(data) || data.length === 0) {
      return c.json({ error: 'Not found' }, 404)
    }

    return c.json(data[0])
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/markets/${slug}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /predict/order
app.post('/predict/order', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  try {
    const res = await clobFetch('order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const responseText = await res.text()

    if (!res.ok) {
      console.error(`[api] CLOB POST /order error ${res.status}: ${responseText}`)
      let detail = 'Order rejected by exchange'
      try {
        const parsed = JSON.parse(responseText) as Record<string, unknown>
        if (typeof parsed.error === 'string') detail = parsed.error
        else if (typeof parsed.message === 'string') detail = parsed.message
      } catch { /* keep generic detail */ }
      return c.json({ error: 'Order rejected', detail }, 502)
    }

    let responseData: unknown
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw: responseText }
    }

    return c.json(responseData)
  } catch (err) {
    console.error('[api] Unexpected error in POST /predict/order:', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/orders/:address
app.get('/predict/orders/:address', async (c) => {
  const address = c.req.param('address')

  if (!address || address.trim() === '') {
    return c.json({ error: 'Bad request' }, 400)
  }

  try {
    const res = await clobFetch(`orders?maker_address=${encodeURIComponent(address)}`)
    if (!res.ok) {
      console.error(`[api] CLOB GET /orders error ${res.status}`)
      return c.json({ error: 'Internal server error' }, 500)
    }

    return c.json(await res.json())
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/orders/${address}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/history/:tokenId
// tokenId = Yes token ID from clobTokenIds[0] (pass the Yes token for Yes price history)
// ?interval=1h (default) | 1d
app.get('/predict/history/:tokenId', async (c) => {
  const tokenId = c.req.param('tokenId')

  if (!tokenId || tokenId.trim() === '') {
    return c.json({ error: 'Bad request' }, 400)
  }

  const interval = c.req.query('interval') ?? '1h'
  const fidelityMap: Record<string, number> = { '1m': 1, '5m': 5, '1h': 60, '1d': 1440 }
  const fidelity = fidelityMap[interval] ?? 60

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

    return c.json(await res.json())
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
  const sport = c.req.param('sport').toLowerCase()
  const seriesId = SPORT_SERIES[sport]

  if (!seriesId) {
    return c.json({ error: `Unsupported sport. Supported: ${Object.keys(SPORT_SERIES).join(', ')}` }, 400)
  }

  try {
    const res = await gammaFetch(
      `events?series_id=${seriesId}&active=true&closed=false&limit=20&order=start_date&ascending=true`
    )

    if (!res.ok) {
      console.error(`[api] Gamma API error ${res.status} for sport ${sport}`)
      return c.json({ error: 'Internal server error' }, 500)
    }

    const events = await res.json() as Record<string, unknown>[]

    // Filter out -more-markets variants, keep primary game markets only
    const games = events
      .filter((e) => !String(e.slug ?? '').endsWith('-more-markets'))
      .map((e) => {
        const markets = (e.markets ?? []) as Record<string, unknown>[]

        // Each market = one outcome (home win / away win / draw)
        // groupItemTitle is the team name or "Draw"
        const outcomes = markets.map((m) => {
          const outcomePrices = typeof m.outcomePrices === 'string'
            ? JSON.parse(m.outcomePrices) as string[]
            : (m.outcomePrices ?? []) as string[]
          const clobTokenIds = typeof m.clobTokenIds === 'string'
            ? JSON.parse(m.clobTokenIds) as string[]
            : (m.clobTokenIds ?? []) as string[]

          return {
            label: m.groupItemTitle ?? m.question ?? null,  // "Burnley FC", "AFC Bournemouth", "Draw"
            price: outcomePrices[0] ? parseFloat(outcomePrices[0]) : null, // Yes price = win probability
            conditionId: m.conditionId ?? null,
            clobTokenIds,
          }
        })

        return {
          slug: e.slug,
          title: e.title,
          sport,
          startDate: e.startDate,
          endDate: e.endDate,
          image: e.image,
          active: e.active,
          volume24h: e.volume24hr,
          liquidity: e.liquidity,
          negRisk: e.negRisk ?? false,
          outcomes, // [{label: "Burnley FC", price: 0.235}, {label: "AFC Bournemouth", price: 0.45}, {label: "Draw", price: 0.315}]
        }
      })

    return c.json(games)
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/sports/${sport}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /predict/sports/:sport/:slug — full game detail with all outcomes
app.get('/predict/sports/:sport/:slug', async (c) => {
  const sport = c.req.param('sport').toLowerCase()
  const slug = c.req.param('slug')

  if (!SPORT_SERIES[sport]) {
    return c.json({ error: `Unsupported sport. Supported: ${Object.keys(SPORT_SERIES).join(', ')}` }, 400)
  }

  try {
    const res = await gammaFetch(`events?slug=${encodeURIComponent(slug)}`)

    if (!res.ok) {
      console.error(`[api] Gamma API error ${res.status} for slug ${slug}`)
      return c.json({ error: 'Internal server error' }, 500)
    }

    const events = await res.json() as Record<string, unknown>[]
    if (!Array.isArray(events) || events.length === 0) {
      return c.json({ error: 'Not found' }, 404)
    }

    const e = events[0]
    const markets = (e.markets ?? []) as Record<string, unknown>[]

    const outcomes = markets.map((m) => {
      const outcomePrices = typeof m.outcomePrices === 'string'
        ? JSON.parse(m.outcomePrices) as string[]
        : (m.outcomePrices ?? []) as string[]
      const clobTokenIds = typeof m.clobTokenIds === 'string'
        ? JSON.parse(m.clobTokenIds) as string[]
        : (m.clobTokenIds ?? []) as string[]

      return {
        label: m.groupItemTitle ?? null,
        question: m.question ?? null,
        price: outcomePrices[0] ? parseFloat(outcomePrices[0]) : null,
        conditionId: m.conditionId ?? null,
        clobTokenIds,
        liquidity: m.liquidityNum ?? null,
        volume24h: m.volume24hr ?? null,
        bestBid: m.bestBid ?? null,
        bestAsk: m.bestAsk ?? null,
        acceptingOrders: m.acceptingOrders ?? null,
      }
    })

    return c.json({
      slug: e.slug,
      title: e.title,
      description: e.description,
      sport,
      startDate: e.startDate,
      endDate: e.endDate,
      image: e.image,
      active: e.active,
      negRisk: e.negRisk ?? false,
      volume24h: e.volume24hr,
      liquidity: e.liquidity,
      outcomes,
    })
  } catch (err) {
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
      buy = typeof body.price === 'number' ? body.price : parseFloat(body.price as string) || null
    } else {
      console.error(`[api] CLOB price buy failed for token ${tokenId}`)
    }

    if (sellRes.status === 'fulfilled' && sellRes.value.ok) {
      const body = await sellRes.value.json() as Record<string, unknown>
      sell = typeof body.price === 'number' ? body.price : parseFloat(body.price as string) || null
    } else {
      console.error(`[api] CLOB price sell failed for token ${tokenId}`)
    }

    return c.json({ tokenId, buy, sell })
  } catch (err) {
    console.error(`[api] Unexpected error in GET /predict/price/${tokenId}:`, err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// --- start server ---

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[api] Listening on port ${PORT}`)
})
