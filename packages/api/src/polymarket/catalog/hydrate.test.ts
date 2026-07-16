import assert from 'node:assert/strict'
import test from 'node:test'
import type { PolymarketCatalogRelease } from './contracts.js'
import { hydratePolymarketCatalogRelease } from './hydrate.js'
import { mapGammaEventToFeaturedMarket } from '../read/featured-markets.js'

test('hydrates ordered sports events and binary markets into the shared featured contract', async (context) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.searchParams.get('slug') === 'catalog-test-match') {
      return Response.json([{
        id: 'event-1',
        slug: 'catalog-test-match',
        title: 'Team A vs Team B',
        active: true,
        closed: false,
        markets: [{
          slug: 'catalog-test-match',
          conditionId: 'condition-match',
          outcomes: JSON.stringify(['Team A', 'Team B']),
          outcomePrices: JSON.stringify(['0.45', '0.55']),
          clobTokenIds: JSON.stringify(['match-a', 'match-b']),
          gameStartTime: '2099-01-01T00:00:00.000Z',
        }],
      }])
    }
    if (url.searchParams.get('slug') === 'catalog-test-binary') {
      return Response.json([{
        id: 'market-1',
        slug: 'catalog-test-binary',
        question: 'Will the catalog ship?',
        conditionId: 'condition-binary',
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.7', '0.3']),
        clobTokenIds: JSON.stringify(['binary-yes', 'binary-no']),
        active: true,
      }])
    }
    throw new Error(`Unexpected request ${url}`)
  }
  context.after(() => { globalThis.fetch = originalFetch })

  const release: PolymarketCatalogRelease = {
    id: 'release-1',
    version: 2,
    revision: 1,
    status: 'published',
    note: null,
    createdBy: 'test',
    publishedBy: 'test',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    publishedAt: '2026-07-15T00:00:00.000Z',
    items: [
      catalogItem('event', 'catalog-test-match', 0, 'sports', 'cricket'),
      catalogItem('market', 'catalog-test-binary', 1, 'tech', null),
    ],
  }

  const hydrated = await hydratePolymarketCatalogRelease(release)
  assert.deepEqual(hydrated.categories, ['sports', 'tech'])
  assert.equal(hydrated.items[0]?.type, 'match')
  assert.equal(hydrated.items[0]?.sport, 'cricket')
  assert.equal(hydrated.items[1]?.type, 'binary')
  assert.equal(hydrated.items[1]?.yesPrice, 0.7)
  assert.equal(hydrated.items[1]?.noPrice, 0.3)
})

test('expands automatic sports rules, excludes props, re-resolves series, and deduplicates pins first', async (context) => {
  const originalFetch = globalThis.fetch
  const now = Date.parse('2026-07-16T12:00:00.000Z')
  const requestedSeries = new Set<string>()
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/sports') {
      return Response.json([
        { sport: 'crint', series: 'current-cricket-series' },
        { sport: 'epl', series: 'current-epl-series' },
      ])
    }
    if (url.pathname === '/series/current-cricket-series') {
      return Response.json({ id: 'current-cricket-series', title: 'International Cricket', slug: 'international-cricket' })
    }
    if (url.pathname === '/series/current-epl-series') {
      return Response.json({ id: 'current-epl-series', title: 'Premier League 2026', slug: 'premier-league-2026' })
    }
    if (url.pathname === '/events' && url.searchParams.get('slug') === 'pinned-game') {
      return Response.json([consolidatedGame('pinned-game', 'Pinned game', '2026-07-16T13:00:00.000Z')])
    }
    if (url.pathname === '/events' && url.searchParams.has('series_id')) {
      const seriesId = url.searchParams.get('series_id') ?? ''
      requestedSeries.add(seriesId)
      if (seriesId === 'current-cricket-series') {
        return Response.json([
          consolidatedGame('pinned-game', 'Pinned game', '2026-07-16T13:00:00.000Z'),
          {
            ...consolidatedGame('cricket-prop', 'Most sixes', '2026-07-16T13:30:00.000Z'),
            markets: [{
              sportsMarketType: 'cricket_most_sixes',
              outcomes: JSON.stringify(['Yes', 'No']),
              outcomePrices: JSON.stringify(['0.5', '0.5']),
              clobTokenIds: JSON.stringify(['prop-yes', 'prop-no']),
              gameStartTime: '2026-07-16T13:30:00.000Z',
            }],
          },
          consolidatedGame('next-cricket-game', 'India vs England', '2026-07-17T10:30:00.000Z'),
          consolidatedGame('second-cricket-game', 'West Indies vs New Zealand', '2026-07-18T10:30:00.000Z'),
        ])
      }
      if (seriesId === 'current-epl-series') {
        return Response.json([threeWayGame('epl-ars-che-2026-08-15', 'Arsenal vs Chelsea', '2026-07-16T11:00:00.000Z')])
      }
      if (seriesId === 'stored-fallback-series') {
        return Response.json([{
          ...consolidatedGame('fallback-game', 'Fallback game', '2026-07-19T10:30:00.000Z'),
          seriesSlug: null,
        }])
      }
    }
    throw new Error(`Unexpected request ${url}`)
  }
  context.after(() => { globalThis.fetch = originalFetch })

  const release: PolymarketCatalogRelease = {
    id: 'release-dynamic',
    version: 3,
    revision: 1,
    status: 'published',
    note: null,
    createdBy: 'test',
    publishedBy: 'test',
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    publishedAt: '2026-07-16T00:00:00.000Z',
    items: [
      catalogItem('event', 'pinned-game', 0, 'sports', 'cricket'),
      ruleItem('crint', 'stale-cricket-series', 1, 'international-cricket', 2),
      ruleItem('epl', 'stale-epl-series', 2, 'premier-league-2025'),
      ruleItem('fallback-code', 'stored-fallback-series', 3, null, 1),
    ],
  }

  const hydrated = await hydratePolymarketCatalogRelease(release, { now, limit: 5 })
  assert.deepEqual(hydrated.items.map((item) => item.slug), [
    'pinned-game',
    'next-cricket-game',
    'second-cricket-game',
    'epl-ars-che-2026-08-15',
    'fallback-game',
  ])
  assert.deepEqual([...requestedSeries].sort(), ['current-cricket-series', 'current-epl-series', 'stored-fallback-series'])
  assert.equal(hydrated.items.some((item) => item.slug === 'cricket-prop'), false)
  assert.equal(hydrated.items[3]?.status, 'live')
  assert.deepEqual(hydrated.items[3]?.outcomes?.map((outcome) => outcome.label), ['Arsenal', 'Draw', 'Chelsea'])
  assert.deepEqual(hydrated.items[3]?.outcomes?.map((outcome) => outcome.price), [0.4, 0.25, 0.35])
})

test('maps legacy grouped EPL event pins as home, draw, and away outcomes', () => {
  const legacy = threeWayGame('epl-ars-che-2026-08-15', 'Arsenal vs Chelsea', '2026-08-15T12:00:00.000Z')
  for (const market of legacy.markets) delete (market as { sportsMarketType?: string }).sportsMarketType

  const mapped = mapGammaEventToFeaturedMarket(legacy, { category: 'sports', sport: 'epl' })
  assert.deepEqual(mapped?.outcomes?.map((outcome) => outcome.label), ['Arsenal', 'Draw', 'Chelsea'])
  assert.deepEqual(mapped?.outcomes?.map((outcome) => outcome.price), [0.4, 0.25, 0.35])
})

function catalogItem(
  sourceKind: 'event' | 'market',
  sourceSlug: string,
  position: number,
  category: string,
  sport: string | null,
) {
  return {
    id: `item-${position}`,
    sourceKind,
    sourceSlug,
    sourceId: null,
    conditionId: null,
    title: sourceSlug,
    category,
    sport,
    position,
    isEnabled: true,
    activeFrom: null,
    activeUntil: null,
    displayOverrides: {},
    ruleConfig: null,
  }
}

function ruleItem(sourceSlug: string, sourceId: string, position: number, resolvedSeriesSlug: string | null, limit = 20) {
  return {
    id: `rule-${position}`,
    sourceKind: 'sports_rule' as const,
    sourceSlug,
    sourceId,
    conditionId: null,
    title: sourceSlug,
    category: 'sports',
    sport: sourceSlug === 'crint' ? 'cricket' : sourceSlug,
    position,
    isEnabled: true,
    activeFrom: null,
    activeUntil: null,
    displayOverrides: resolvedSeriesSlug ? { resolvedSeriesSlug } : {},
    ruleConfig: { windowDays: 30, limit, marketType: 'moneyline' as const },
  }
}

function consolidatedGame(slug: string, title: string, startTime: string) {
  return {
    slug,
    title,
    seriesSlug: 'international-cricket',
    startTime,
    active: true,
    closed: false,
    archived: false,
    markets: [{
      slug,
      sportsMarketType: 'moneyline',
      outcomes: JSON.stringify(['India', 'England']),
      outcomePrices: JSON.stringify(['0.55', '0.45']),
      clobTokenIds: JSON.stringify([`${slug}-india`, `${slug}-england`]),
      gameStartTime: startTime,
    }],
  }
}

function threeWayGame(slug: string, title: string, startTime: string) {
  const leg = (suffix: string, label: string, price: string) => ({
    slug: `${slug}-${suffix}`,
    sportsMarketType: 'moneyline',
    groupItemTitle: label,
    outcomes: JSON.stringify(['Yes', 'No']),
    outcomePrices: JSON.stringify([price, String(1 - Number(price))]),
    clobTokenIds: JSON.stringify([`${slug}-${suffix}-yes`, `${slug}-${suffix}-no`]),
    conditionId: `${slug}-${suffix}-condition`,
    gameStartTime: startTime,
  })
  return {
    slug,
    title,
    seriesSlug: 'premier-league-2026',
    startTime,
    active: true,
    closed: false,
    archived: false,
    markets: [
      leg('ars', 'Arsenal', '0.4'),
      leg('draw', 'Draw (Arsenal vs Chelsea)', '0.25'),
      leg('che', 'Chelsea', '0.35'),
    ],
  }
}
