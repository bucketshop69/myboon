import assert from 'node:assert/strict'
import test from 'node:test'
import { PolymarketCatalogValidationError } from './contracts.js'
import { resolvePolymarketCatalogItem } from './source.js'

test('resolves a sports event slug into stored source metadata', async (context) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/events')
    assert.equal(url.searchParams.get('slug'), 'team-a-v-team-b')
    return Response.json([{
      id: 'event-42',
      slug: 'team-a-v-team-b',
      title: 'Team A v Team B',
      markets: [{
        slug: 'team-a-v-team-b',
        gameStartTime: '2099-01-01T00:00:00.000Z',
      }],
    }])
  }
  context.after(() => { globalThis.fetch = originalFetch })

  assert.deepEqual(await resolvePolymarketCatalogItem({
    sourceKind: 'event',
    sourceSlug: 'team-a-v-team-b',
    sport: 'cricket',
  }), {
    sourceKind: 'event',
    sourceSlug: 'team-a-v-team-b',
    sourceId: 'event-42',
    conditionId: null,
    title: 'Team A v Team B',
    category: 'sports',
    sport: 'cricket',
    isEnabled: true,
    displayOverrides: {},
  })
})

test('requires a sport for event sources before contacting Polymarket', async () => {
  await assert.rejects(
    resolvePolymarketCatalogItem({ sourceKind: 'event', sourceSlug: 'team-a-v-team-b' }),
    (error: unknown) => error instanceof PolymarketCatalogValidationError
      && error.message.includes('require a sport'),
  )
})

test('rejects non-match events so they are not rendered as sports matches', async (context) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json([{
    id: 'event-99',
    slug: 'awards-event',
    title: 'Awards event',
    markets: [{ slug: 'will-a-win', question: 'Will A win?' }],
  }])
  context.after(() => { globalThis.fetch = originalFetch })

  await assert.rejects(
    resolvePolymarketCatalogItem({
      sourceKind: 'event',
      sourceSlug: 'awards-event',
      sport: 'other',
    }),
    (error: unknown) => error instanceof PolymarketCatalogValidationError
      && error.message.includes('match-style sports events'),
  )
})

test('resolves an individual market and reports unknown slugs as validation errors', async (context) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    const slug = url.searchParams.get('slug')
    return Response.json(slug === 'will-it-ship'
      ? [{
          id: 'market-9',
          conditionId: 'condition-9',
          slug,
          question: 'Will it ship?',
        }]
      : [])
  }
  context.after(() => { globalThis.fetch = originalFetch })

  const market = await resolvePolymarketCatalogItem({
    sourceKind: 'market',
    sourceSlug: 'will-it-ship',
    category: 'tech',
  })
  assert.equal(market.sourceId, 'market-9')
  assert.equal(market.conditionId, 'condition-9')
  assert.equal(market.title, 'Will it ship?')
  assert.equal(market.category, 'tech')

  await assert.rejects(
    resolvePolymarketCatalogItem({ sourceKind: 'market', sourceSlug: 'missing-market' }),
    (error: unknown) => error instanceof PolymarketCatalogValidationError
      && error.message.includes('No Polymarket source'),
  )
})

test('resolves an automatic sport code to the current Polymarket series snapshot', async (context) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/sports') {
      return Response.json([{ sport: 'crint', series: '10528' }])
    }
    if (url.pathname === '/series/10528') {
      return Response.json({ id: '10528', title: 'International Cricket', slug: 'international-cricket' })
    }
    throw new Error(`Unexpected request ${url}`)
  }
  context.after(() => { globalThis.fetch = originalFetch })

  assert.deepEqual(await resolvePolymarketCatalogItem({
    sourceKind: 'sports_rule',
    sourceSlug: 'CRINT',
    ruleConfig: { windowDays: 14, limit: 20, marketType: 'moneyline' },
  }), {
    sourceKind: 'sports_rule',
    sourceSlug: 'crint',
    sourceId: '10528',
    conditionId: null,
    title: 'International Cricket',
    category: 'sports',
    sport: 'cricket',
    isEnabled: true,
    displayOverrides: { resolvedSeriesSlug: 'international-cricket' },
    ruleConfig: { windowDays: 14, limit: 20, marketType: 'moneyline' },
  })
})

test('rejects invalid automatic source limits before contacting Polymarket', async () => {
  await assert.rejects(
    resolvePolymarketCatalogItem({
      sourceKind: 'sports_rule',
      sourceSlug: 'crint',
      ruleConfig: { windowDays: 31, limit: 20, marketType: 'moneyline' },
    }),
    (error: unknown) => error instanceof PolymarketCatalogValidationError
      && error.message.includes('1–30 day window'),
  )
})
