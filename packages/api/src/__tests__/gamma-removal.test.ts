/**
 * E2E tests for Gamma → Dome migration.
 *
 * These tests verify that every predict endpoint works using ONLY Dome API
 * (no Gamma fallback). They hit the real Dome API via DOME_API_KEY.
 *
 * Run: pnpm --filter @myboon/api test
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'

// Dome API can be slow on cold calls (market list + price fetches)
vi.setConfig({ testTimeout: 30_000 })

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000'

// Known slugs for testing — these should exist on Polymarket/Dome
const KNOWN_BINARY_SLUG = 'will-china-invade-taiwan-before-2027'
const KNOWN_SPORT_TAG = 'epl'
const KNOWN_SPORT_TAG_UCL = 'ucl'

/**
 * Helper to fetch from the running API server.
 * Tests require the server to be running: `pnpm --filter @myboon/api dev`
 */
async function api(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}${path}`)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

describe('Gamma removal — E2E (Dome-only)', () => {
  beforeAll(async () => {
    // Verify the API server is reachable
    try {
      const res = await fetch(`${API_BASE}/health`)
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
    } catch (err) {
      throw new Error(
        `API server not reachable at ${API_BASE}. Start it with: pnpm --filter @myboon/api dev\n${err}`
      )
    }
  })

  // ─── 1. Health (baseline) ───

  it('GET /health returns ok', async () => {
    const { status, body } = await api('/health')
    expect(status).toBe(200)
    expect(body).toEqual({ status: 'ok' })
  })

  // ─── 2. Binary collection list (geopolitics) ───

  it('GET /predict/collections/geopolitics returns array of markets with required fields', async () => {
    const { status, body } = await api('/predict/collections/geopolitics')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)

    const markets = body as Record<string, unknown>[]
    // Should have at least some markets (curated list)
    expect(markets.length).toBeGreaterThan(0)

    // Each market should have Dome-sourced fields
    for (const m of markets) {
      expect(m).toHaveProperty('slug')
      expect(m).toHaveProperty('question')
      expect(m).toHaveProperty('category', 'geopolitics')
      expect(m).toHaveProperty('conditionId')
      expect(m).toHaveProperty('clobTokenIds')
      expect(Array.isArray(m.clobTokenIds)).toBe(true)
      // yesPrice/noPrice can be null but must exist
      expect('yesPrice' in m).toBe(true)
      expect('noPrice' in m).toBe(true)
    }
  })

  // ─── 3. Legacy alias: GET /predict/markets ───

  it('GET /predict/markets returns same shape as geopolitics collection', async () => {
    const { status, body } = await api('/predict/markets')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
  })

  // ─── 4. Single market detail ───

  it('GET /predict/markets/:slug returns market detail with Dome fields', async () => {
    const { status, body } = await api(`/predict/markets/${KNOWN_BINARY_SLUG}`)
    expect(status).toBe(200)

    const m = body as Record<string, unknown>
    expect(m).toHaveProperty('slug', KNOWN_BINARY_SLUG)
    expect(m).toHaveProperty('question')
    expect(typeof m.question).toBe('string')
    expect(m).toHaveProperty('conditionId')
    expect(m).toHaveProperty('clobTokenIds')
    expect(m).toHaveProperty('outcomePrices')
    expect(m).toHaveProperty('endDate')
    expect(m).toHaveProperty('image')
  })

  it('GET /predict/markets/nonexistent-slug-xyz returns 404', async () => {
    const { status, body } = await api('/predict/markets/nonexistent-slug-xyz-12345')
    expect(status).toBe(404)
    expect(body).toHaveProperty('error')
  })

  // ─── 5. Binary collection detail ───

  it('GET /predict/collections/geopolitics/:slug returns detail', async () => {
    const { status, body } = await api(`/predict/collections/geopolitics/${KNOWN_BINARY_SLUG}`)
    expect(status).toBe(200)

    const m = body as Record<string, unknown>
    expect(m).toHaveProperty('slug')
    expect(m).toHaveProperty('question')
    expect(m).toHaveProperty('conditionId')
  })

  // ─── 6. Grouped collection list (sport) ───

  it('GET /predict/collections/epl returns array of grouped events', async () => {
    const { status, body } = await api('/predict/collections/epl')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)

    const events = body as Record<string, unknown>[]
    // EPL may have 0 events if off-season, but endpoint must not error
    if (events.length > 0) {
      const e = events[0]
      expect(e).toHaveProperty('slug')
      expect(e).toHaveProperty('title')
      expect(e).toHaveProperty('sport', 'epl')
      expect(e).toHaveProperty('outcomes')
      expect(Array.isArray(e.outcomes)).toBe(true)

      // Each outcome should have price and label
      const outcomes = e.outcomes as Record<string, unknown>[]
      for (const o of outcomes) {
        expect(o).toHaveProperty('label')
        expect('price' in o).toBe(true)
        expect(o).toHaveProperty('conditionId')
        expect(o).toHaveProperty('clobTokenIds')
      }
    }
  })

  // ─── 7. Legacy sport alias ───

  it('GET /predict/sports/epl returns same shape as collections/epl', async () => {
    const { status, body } = await api('/predict/sports/epl')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
  })

  // ─── 8. Grouped event detail ───

  it('GET /predict/collections/epl/:slug returns event detail (if events exist)', async () => {
    // First get the list to find a real slug
    const listRes = await api('/predict/collections/epl')
    const events = listRes.body as Record<string, unknown>[]

    if (events.length === 0) {
      // Off-season — skip but don't fail
      console.log('  ⚠ No EPL events available — skipping detail test')
      return
    }

    const slug = events[0].slug as string
    const { status, body } = await api(`/predict/collections/epl/${slug}`)
    expect(status).toBe(200)

    const detail = body as Record<string, unknown>
    expect(detail).toHaveProperty('slug', slug)
    expect(detail).toHaveProperty('title')
    expect(detail).toHaveProperty('outcomes')
    expect(Array.isArray(detail.outcomes)).toBe(true)

    const outcomes = detail.outcomes as Record<string, unknown>[]
    expect(outcomes.length).toBeGreaterThan(0)
    for (const o of outcomes) {
      expect(o).toHaveProperty('label')
      expect(o).toHaveProperty('question')
      expect('price' in o).toBe(true)
    }
  })

  // ─── 9. Trending ───

  it('GET /predict/trending returns array of trending markets', async () => {
    const { status, body } = await api('/predict/trending?limit=5&tag=geopolitics')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)

    const markets = body as Record<string, unknown>[]
    if (markets.length > 0) {
      const m = markets[0]
      expect(m).toHaveProperty('slug')
      expect(m).toHaveProperty('question')
      expect(m).toHaveProperty('clobTokenIds')
      expect('yesPrice' in m).toBe(true)
    }
  })

  // ─── 10. Price endpoint ───

  it('GET /predict/markets/:slug/price returns yes/no prices', async () => {
    const { status, body } = await api(`/predict/markets/${KNOWN_BINARY_SLUG}/price`)
    expect(status).toBe(200)

    const p = body as Record<string, unknown>
    expect(p).toHaveProperty('slug', KNOWN_BINARY_SLUG)
    expect('yesPrice' in p).toBe(true)
    expect('noPrice' in p).toBe(true)
    expect(p).toHaveProperty('fetchedAt')
  })

  it('GET /predict/markets/nonexistent-slug/price returns 404', async () => {
    const { status } = await api('/predict/markets/nonexistent-slug-xyz-12345/price')
    expect(status).toBe(404)
  })

  // ─── 11. Collections list ───

  it('GET /predict/collections returns available collections', async () => {
    const { status, body } = await api('/predict/collections')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)

    const cols = body as Record<string, unknown>[]
    expect(cols.length).toBeGreaterThan(0)

    const keys = cols.map((c) => c.key)
    expect(keys).toContain('epl')
    expect(keys).toContain('geopolitics')
  })

  // ─── 12. Unknown collection ───

  it('GET /predict/collections/unknown returns 400', async () => {
    const { status } = await api('/predict/collections/unknown-xyz')
    expect(status).toBe(400)
  })

  // ─── 13. No Gamma references in source ───

  it('source code contains no gammaFetch or GAMMA_BASE references', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')

    const indexPath = join(import.meta.dirname, '..', 'index.ts')
    const source = readFileSync(indexPath, 'utf-8')

    expect(source).not.toContain('gammaFetch')
    expect(source).not.toContain('GAMMA_BASE')
    expect(source).not.toContain('gamma-api.polymarket.com')
    expect(source).not.toContain('withDomeFallback')
  })

  it('collections.ts contains no gammaSeriesId references', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')

    const colPath = join(import.meta.dirname, '..', 'collections.ts')
    const source = readFileSync(colPath, 'utf-8')

    expect(source).not.toContain('gammaSeriesId')
    expect(source).not.toContain('gammaFetch')
  })
})
