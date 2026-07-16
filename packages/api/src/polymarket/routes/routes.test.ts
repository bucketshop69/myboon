import assert from 'node:assert/strict'
import test from 'node:test'
import { Hono } from 'hono'
import { FEATURED_MARKET_SLUG } from '../read/featured-markets.js'
import { normalizeTokenIds } from '../read/market-read.js'
import { createPolymarketReadRoutes } from './index.js'

test('mounts the unchanged single featured market under its descriptive route', async () => {
  const app = new Hono()
  app.route('/polymarket', createPolymarketReadRoutes())

  assert.equal((await app.request('/predict/feed')).status, 404)
  assert.equal((await app.request('/polymarket/feed')).status, 404)
  assert.equal((await app.request('/polymarket/collections/featured')).status, 503)

  const originalFetch = globalThis.fetch
  const requestedUrls: string[] = []
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input))
    return Response.json([{
      slug: FEATURED_MARKET_SLUG,
      title: 'Zimbabwe vs Bangladesh',
      startDate: '2099-01-01T00:00:00Z',
      endDate: '2099-01-02T00:00:00Z',
      startTime: '2099-01-01T12:00:00Z',
      active: true,
      closed: false,
      volume24hr: 123,
      markets: [{
        slug: FEATURED_MARKET_SLUG,
        conditionId: 'condition-1',
        outcomes: JSON.stringify(['Zimbabwe', 'Bangladesh']),
        outcomePrices: JSON.stringify(['0.4', '0.6']),
        clobTokenIds: JSON.stringify(['token-a', 'token-b']),
        gameStartTime: '2099-01-01T12:00:00Z',
      }],
    }])
  }

  try {
    const response = await app.request('/polymarket/featured-markets')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      items: [{
        type: 'match',
        slug: FEATURED_MARKET_SLUG,
        title: 'Zimbabwe vs Bangladesh',
        category: 'sports',
        sport: 'cricket',
        tags: ['sports', 'cricket'],
        status: 'upcoming',
        gameStartTime: '2099-01-01T12:00:00Z',
        startDate: '2099-01-01T00:00:00Z',
        endDate: '2099-01-02T00:00:00Z',
        image: null,
        active: true,
        volume: 123,
        outcomes: [
          { label: 'Zimbabwe', price: 0.4, conditionId: 'condition-1', clobTokenIds: ['token-a'] },
          { label: 'Bangladesh', price: 0.6, conditionId: 'condition-1', clobTokenIds: ['token-b'] },
        ],
      }],
      categories: ['sports'],
    })
    assert.deepEqual(requestedUrls, [
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(FEATURED_MARKET_SLUG)}`,
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('keeps sport validation and route suffix unchanged', async () => {
  const app = new Hono()
  app.route('/polymarket', createPolymarketReadRoutes())

  const response = await app.request('/polymarket/sports/unknown')
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    error: 'Unsupported sport. Supported: epl, ucl, ipl, fifwc',
  })
})

test('opens dynamically discovered international cricket games through the shared cricket detail route', async (context) => {
  const app = new Hono()
  app.route('/polymarket', createPolymarketReadRoutes())
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json([{
    slug: 'crint-gbr2-ind4-2026-07-16',
    title: 'England vs India',
    active: true,
    closed: false,
    startTime: '2099-07-16T12:00:00Z',
    markets: [{
      slug: 'crint-gbr2-ind4-2026-07-16',
      sportsMarketType: 'moneyline',
      outcomes: JSON.stringify(['England', 'India']),
      outcomePrices: JSON.stringify(['0.51', '0.49']),
      clobTokenIds: JSON.stringify(['england-token', 'india-token']),
      conditionId: 'condition-cricket',
      gameStartTime: '2099-07-16T12:00:00Z',
    }],
  }])
  context.after(() => { globalThis.fetch = originalFetch })

  const response = await app.request('/polymarket/sports/cricket/crint-gbr2-ind4-2026-07-16')
  assert.equal(response.status, 200)
  const body = await response.json() as Record<string, unknown>
  assert.equal(body.slug, 'crint-gbr2-ind4-2026-07-16')
  assert.equal(body.sport, 'cricket')
  assert.deepEqual((body.outcomes as Array<Record<string, unknown>>).map((outcome) => outcome.label), ['England', 'India'])
})

test('opens dynamically discovered games for non-static Polymarket sport codes', async (context) => {
  const app = new Hono()
  app.route('/polymarket', createPolymarketReadRoutes())
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/sports') return Response.json([{ sport: 'wnba', series: 'wnba-current' }])
    if (url.pathname === '/series/wnba-current') {
      return Response.json({ id: 'wnba-current', title: 'WNBA', slug: 'wnba' })
    }
    if (url.pathname === '/events') {
      return Response.json([{
        slug: 'wnba-ny-lv-2026-07-16',
        title: 'New York vs Las Vegas',
        seriesSlug: 'wnba',
        active: true,
        closed: false,
        startTime: '2099-07-16T12:00:00Z',
        markets: [{
          slug: 'wnba-ny-lv-2026-07-16',
          sportsMarketType: 'moneyline',
          outcomes: JSON.stringify(['New York', 'Las Vegas']),
          outcomePrices: JSON.stringify(['0.52', '0.48']),
          clobTokenIds: JSON.stringify(['new-york-token', 'las-vegas-token']),
          gameStartTime: '2099-07-16T12:00:00Z',
        }],
      }])
    }
    throw new Error(`Unexpected request ${url}`)
  }
  context.after(() => { globalThis.fetch = originalFetch })

  const response = await app.request('/polymarket/sports/wnba/wnba-ny-lv-2026-07-16')
  assert.equal(response.status, 200)
  const body = await response.json() as Record<string, unknown>
  assert.equal(body.sport, 'wnba')
  assert.deepEqual((body.outcomes as Array<Record<string, unknown>>).map((outcome) => outcome.label), ['New York', 'Las Vegas'])
})

test('keeps live-price token parsing deduplicated and capped at 80', () => {
  const raw = ['token-0', ' token-0 ', ...Array.from({ length: 85 }, (_, index) => `token-${index}`)].join(',')
  const tokenIds = normalizeTokenIds(raw)

  assert.equal(tokenIds.length, 80)
  assert.deepEqual(tokenIds.slice(0, 3), ['token-0', 'token-1', 'token-2'])
  assert.equal(tokenIds.at(-1), 'token-79')
})
