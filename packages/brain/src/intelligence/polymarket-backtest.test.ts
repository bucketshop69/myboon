import { describe, expect, it } from 'vitest'
import { runPolymarketOddsShiftBacktest, type LegacyOddsShiftSignal } from './polymarket-backtest.js'

const signal = (
  id: string,
  slug: string,
  createdAt: string,
  from: number,
  to: number
): LegacyOddsShiftSignal => ({
  id,
  slug,
  topic: slug,
  created_at: createdAt,
  metadata: {
    slug,
    shift_from: from,
    shift_to: to,
    yes_price: to,
  },
})

describe('Polymarket odds-shift backtest', () => {
  it('evaluates continuation outcomes and baseline', () => {
    const rows = [
      signal('1', 'market-a', '2026-01-01T00:00:00.000Z', 0.4, 0.48),
      signal('2', 'market-a', '2026-01-01T06:00:00.000Z', 0.48, 0.53),
      signal('3', 'market-b', '2026-01-01T00:00:00.000Z', 0.6, 0.52),
      signal('4', 'market-b', '2026-01-01T08:00:00.000Z', 0.52, 0.55),
    ]

    const result = runPolymarketOddsShiftBacktest(rows, {
      continuationDelta: 0.03,
      windowHours: 24,
      topFraction: 1,
      minCandidates: 1,
    })

    expect(result.summary.candidateCount).toBeGreaterThan(0)
    expect(result.summary.hitRate).toBeGreaterThanOrEqual(0)
    expect(result.summary.hitRate).toBeLessThanOrEqual(1)
    expect(result.summary.baselineHitRate).toBeGreaterThanOrEqual(0)
    expect(result.summary.confidenceInterval?.level).toBe(0.95)
  })
})
