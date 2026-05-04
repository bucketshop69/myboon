import { describe, expect, it } from 'vitest'
import { INTELLIGENCE_SCHEMA_VERSION, INTELLIGENCE_SCORING_VERSION, oddsMoveCriterion } from './contracts.js'
import { BacktestRunSummarySchema, NarrativeOutcomeSchema, RawEventSchema } from './schemas.js'

describe('intelligence runtime schemas', () => {
  it('validates raw events at runtime', () => {
    const parsed = RawEventSchema.parse({
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: 'raw-1',
      source: 'polymarket',
      kind: 'polymarket.large_trade',
      entityRef: { slug: 'market-a' },
      observedAt: '2026-01-01T00:00:00.000Z',
      receivedAt: '2026-01-01T00:00:01.000Z',
      dedupeKey: 'polymarket:trade:1',
      trace: {
        source: 'polymarket',
        sourceId: 'trade-1',
        fetchedAt: '2026-01-01T00:00:01.000Z',
      },
      payload: { amount: 1000 },
    })

    expect(parsed.schemaVersion).toBe(INTELLIGENCE_SCHEMA_VERSION)
    expect(parsed.entityRef.slug).toBe('market-a')
  })

  it('rejects stale schema versions', () => {
    const result = RawEventSchema.safeParse({ schemaVersion: 999 })
    expect(result.success).toBe(false)
  })

  it('validates frozen outcome criteria and actual backtest windows', () => {
    const outcome = NarrativeOutcomeSchema.parse({
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: 'outcome-1',
      narrativeId: 'classified-1',
      evaluatedAt: '2026-01-02T00:00:00.000Z',
      criteria: [oddsMoveCriterion('up', 0.03, 24)],
      result: 'hit',
      measuredValues: { startPrice: 0.4, latestPrice: 0.45, measuredMove: 0.05 },
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
    })
    expect(outcome.criteria[0]).toMatchObject({ kind: 'odds_move', targetDelta: 0.03 })

    const summary = BacktestRunSummarySchema.parse({
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: 'backtest-1',
      source: 'polymarket',
      signalKind: 'polymarket.odds_shift',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-02T00:00:00.000Z',
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2026-02-05T00:00:00.000Z',
      requestedWindowDays: 35,
      actualWindowDays: 35,
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      baseline: 'largest_raw_odds_delta',
      candidateCount: 10,
      hitRate: 0.7,
      baselineHitRate: 0.5,
    })
    expect(summary.actualWindowDays).toBe(35)
  })
})
