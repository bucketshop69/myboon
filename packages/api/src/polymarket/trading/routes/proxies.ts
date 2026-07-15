import type { Hono } from 'hono'
import { CLOB_HOST } from '../contracts.js'

export function registerProxyRoutes(routes: Hono) {
  routes.get('/book', async (c) => {
    const tokenId = c.req.query('token_id')
    if (!tokenId) return c.json({ error: 'Missing token_id query param' }, 400)
    try {
      const res = await fetch(`${CLOB_HOST}/book?token_id=${encodeURIComponent(tokenId)}`)
      const data = await res.json()
      return c.json(data, (res.ok ? 200 : res.status) as any)
    } catch (err: any) {
      return c.json({ error: 'CLOB book proxy failed', detail: err.message }, 502)
    }
  })

  routes.get('/midpoint', async (c) => {
    const tokenId = c.req.query('token_id')
    if (!tokenId) return c.json({ error: 'Missing token_id query param' }, 400)
    try {
      const res = await fetch(`${CLOB_HOST}/midpoint?token_id=${encodeURIComponent(tokenId)}`)
      const data = await res.json()
      return c.json(data, (res.ok ? 200 : res.status) as any)
    } catch (err: any) {
      return c.json({ error: 'CLOB midpoint proxy failed', detail: err.message }, 502)
    }
  })

  routes.get('/last-trade-price', async (c) => {
    const tokenId = c.req.query('token_id')
    if (!tokenId) return c.json({ error: 'Missing token_id query param' }, 400)
    try {
      const res = await fetch(`${CLOB_HOST}/last-trade-price?token_id=${encodeURIComponent(tokenId)}`)
      const data = await res.json()
      return c.json(data, (res.ok ? 200 : res.status) as any)
    } catch (err: any) {
      return c.json({ error: 'CLOB last-trade-price proxy failed', detail: err.message }, 502)
    }
  })

  routes.get('/markets/:conditionId', async (c) => {
    const conditionId = c.req.param('conditionId')
    try {
      const res = await fetch(`${CLOB_HOST}/markets/${encodeURIComponent(conditionId)}`)
      const data = await res.json()
      return c.json(data, (res.ok ? 200 : res.status) as any)
    } catch (err: any) {
      return c.json({ error: 'CLOB market info proxy failed', detail: err.message }, 502)
    }
  })

  routes.get('/rewards/markets', async (c) => {
    try {
      const incomingUrl = new URL(c.req.url)
      const upstreamUrl = new URL('https://polymarket.com/api/rewards/markets')
      upstreamUrl.search = incomingUrl.search
      const res = await fetch(upstreamUrl)
      const body = await res.text()
      return new Response(body, {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
      })
    } catch (err: any) {
      return c.json({ error: 'Polymarket rewards markets proxy failed', detail: err.message }, 502)
    }
  })

  routes.get('/gamma/events/:eventId', async (c) => {
    const eventId = c.req.param('eventId')
    try {
      const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`)
      const data = await res.json()
      return c.json(data, res.ok ? 200 : (res.status as any))
    } catch (err: any) {
      return c.json({ error: 'Gamma proxy failed', detail: err.message }, 502)
    }
  })

  routes.get('/v2/health', async (c) => {
    try {
      const res = await fetch(`${CLOB_HOST}/time`)
      const data = await res.json().catch(() => null)
      return c.json({ ok: res.ok, host: CLOB_HOST, status: res.status, serverTime: data })
    } catch (err: any) {
      return c.json({ ok: false, host: CLOB_HOST, error: err.message }, 502)
    }
  })
}
