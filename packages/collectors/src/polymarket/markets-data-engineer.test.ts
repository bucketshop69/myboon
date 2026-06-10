import assert from 'node:assert/strict'
import test from 'node:test'
import type { PolymarketMarketsDataEngineerOptions } from './markets-data-engineer'
import { __testing } from './markets-data-engineer'

const options: Required<PolymarketMarketsDataEngineerOptions> = {
  now: '2026-06-10T00:00:00.000Z',
  tagSlugs: ['crypto'],
  topMarketsPerTag: 3,
  fetchLimitPerTag: 50,
  includeManualPins: true,
  oddsMoveThreshold: 0.05,
  volumeMoveThresholdPct: 0.2,
  activitySpikeThresholdPct: 0.25,
  closingSoonHours: 72,
  candidateCooldownHours: 6,
  manualPinMaxSelected: 2,
  manualPinMaxRepresentativesPerInput: 1,
  manualPinScoreBoost: 8,
  candidateRetryFailedHours: 24,
  candidateRecentPublishedCooldownHours: 168,
  candidateMaterialMoveMultiplier: 2,
}

function market(overrides: Record<string, unknown> = {}): any {
  const slug = String(overrides.slug ?? 'market')
  return {
    marketId: `${slug}-id`,
    slug,
    title: String(overrides.title ?? slug),
    tagSlug: String(overrides.tagSlug ?? 'crypto'),
    tagLabel: String(overrides.tagLabel ?? 'Crypto'),
    eventSlug: (overrides.eventSlug as string | null | undefined) ?? null,
    eventTitle: (overrides.eventTitle as string | null | undefined) ?? null,
    endDate: (overrides.endDate as string | null | undefined) ?? null,
    yesPrice: 0.5,
    noPrice: 0.5,
    volume: 1_000,
    volume24h: 100,
    liquidity: 100,
    competitive: null,
    commentCount: null,
    lastTradePrice: null,
    oneHourPriceChange: null,
    oneDayPriceChange: null,
    oneWeekPriceChange: null,
    updatedAt: '2026-06-10T00:00:00.000Z',
    sourceUrl: 'https://example.com',
    rawPayload: {},
    isManualPin: Boolean(overrides.isManualPin),
    watchScore: Number(overrides.watchScore ?? 50),
    scoreBreakdown: {},
    selectionReason: 'test',
    ...overrides,
  }
}

function candidate(overrides: Record<string, unknown> = {}): any {
  return {
    market: market(overrides.market as Record<string, unknown> | undefined),
    draft: {
      candidateType: 'odds_moved',
      whatChanged: 'changed',
      whyFlagged: 'flagged',
      score: 60,
      scoreBreakdown: {},
      metrics: { oddsDelta: 0.06 },
      evidenceRefs: [],
      ...(overrides.draft as Record<string, unknown> | undefined),
    },
    dedupeKey: String(overrides.dedupeKey ?? 'key'),
  }
}

test('chooseWatchlist caps manual pins while retaining dynamic per-tag selections', () => {
  const markets = [
    market({ slug: 'manual-1', isManualPin: true, watchScore: 100 }),
    market({ slug: 'manual-2', isManualPin: true, watchScore: 99 }),
    market({ slug: 'manual-3', isManualPin: true, watchScore: 98 }),
    market({ slug: 'dynamic-1', watchScore: 80 }),
    market({ slug: 'dynamic-2', watchScore: 79 }),
    market({ slug: 'dynamic-3', watchScore: 78 }),
    market({ slug: 'dynamic-4', watchScore: 77 }),
  ]

  const selected = __testing.chooseWatchlist(markets, options)

  assert.equal(selected.filter((item: any) => item.isManualPin).length, 2)
  assert.deepEqual(
    selected.filter((item: any) => !item.isManualPin).map((item: any) => item.slug).sort(),
    ['dynamic-1', 'dynamic-2', 'dynamic-3']
  )
})

test('chooseWatchlist does not let a lower-scored manual duplicate replace a stronger dynamic market', () => {
  const selected = __testing.chooseWatchlist([
    market({ slug: 'same-market', isManualPin: true, watchScore: 40 }),
    market({ slug: 'same-market', isManualPin: false, watchScore: 85 }),
  ], options)

  assert.equal(selected.length, 1)
  assert.equal(selected[0].isManualPin, false)
  assert.equal(selected[0].watchScore, 85)
})

test('selectManualPinRepresentatives chooses the strongest child from a multi-market pin', () => {
  const selected = __testing.selectManualPinRepresentatives('event-pin', [
    market({ slug: 'thin-child', isManualPin: true, watchScore: 75, volume: 100, volume24h: 10, liquidity: 10 }),
    market({ slug: 'liquid-child', isManualPin: true, watchScore: 70, volume: 100_000, volume24h: 20_000, liquidity: 50_000 }),
  ], Date.parse(options.now), 1)

  assert.equal(selected.length, 1)
  assert.equal(selected[0].slug, 'liquid-child')
  assert.equal(selected[0].scoreBreakdown.manualResolvedMarkets, 2)
})

test('dedupeCandidateInserts collapses cross-type family candidates to the highest score', () => {
  const low = candidate({ dedupeKey: 'family-key', draft: { candidateType: 'odds_moved', score: 50 } })
  const high = candidate({ dedupeKey: 'family-key', draft: { candidateType: 'volume_moved', score: 85 } })

  const selected = __testing.dedupeCandidateInserts([low, high])

  assert.equal(selected.length, 1)
  assert.equal(selected[0].draft.candidateType, 'volume_moved')
})

test('blocksCandidate suppresses unresolved backlog but lets material moves through', () => {
  const pendingBlock = {
    kind: 'candidate_unresolved',
    slug: 'same-market',
    title: 'Same market',
    status: 'pending_research',
    at: options.now,
  } as const

  assert.equal(__testing.blocksCandidate(candidate(), [pendingBlock as any], options.now, options), true)
  assert.equal(
    __testing.blocksCandidate(candidate({ draft: { metrics: { oddsDelta: 0.12 }, score: 75 } }), [pendingBlock as any], options.now, options),
    false
  )
})

test('blocksCandidate respects failed-research retry window', () => {
  const recentFailed = {
    kind: 'research_failed_recent',
    slug: 'same-market',
    title: 'Same market',
    status: 'research_failed',
    at: '2026-06-09T12:00:00.000Z',
  } as const
  const staleFailed = {
    ...recentFailed,
    kind: 'research_failed_stale' as const,
    at: '2026-06-08T00:00:00.000Z',
  }

  assert.equal(__testing.blocksCandidate(candidate(), [recentFailed as any], options.now, options), true)
  assert.equal(__testing.blocksCandidate(candidate(), [staleFailed as any], options.now, options), false)
})
