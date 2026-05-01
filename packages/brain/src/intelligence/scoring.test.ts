import { describe, expect, it } from 'vitest'
import { scorePolymarketOddsShift, scoringVersion } from './scoring.js'

const expectScoreRange = (value: number) => {
  expect(value).toBeGreaterThanOrEqual(0)
  expect(value).toBeLessThanOrEqual(1)
}

describe('intelligence v2 scoring', () => {
  it('returns current scoring version', () => {
    expect(scoringVersion()).toBe(1)
  })

  it('scores Polymarket odds shifts into bounded components', () => {
    const score = scorePolymarketOddsShift({
      oddsDelta: 0.12,
      hoursSinceObserved: 2,
      liquidityUsd: 50_000,
    })

    expectScoreRange(score.confidence)
    expectScoreRange(score.urgency)
    expectScoreRange(score.freshness)
    expectScoreRange(score.sourceReliability)
    expectScoreRange(score.signalWeight)
    expectScoreRange(score.dedupePriority)
  })

  it('gives stronger odds moves higher signal weight', () => {
    const small = scorePolymarketOddsShift({ oddsDelta: 0.02, hoursSinceObserved: 1 })
    const large = scorePolymarketOddsShift({ oddsDelta: 0.15, hoursSinceObserved: 1 })

    expect(large.signalWeight).toBeGreaterThan(small.signalWeight)
    expect(large.confidence).toBeGreaterThan(small.confidence)
  })
})
