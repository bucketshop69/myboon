import { describe, expect, it } from 'vitest'
import { classifyPolymarketWhaleBet, scorePolymarketOddsShift, scorePolymarketWhaleBet, scoringVersion } from './scoring.js'

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


  it('classifies 95%+ consensus whale bets as penny pickup, not conviction', () => {
    const classification = classifyPolymarketWhaleBet({
      amountUsd: 100_000,
      hoursSinceObserved: 0,
      tradePrice: 0.99,
    })

    expect(classification.archetype).toBe('penny_pickup')
    expect(classification.publishableAsConviction).toBe(false)
    expect(classification.riskUsd).toBeCloseTo(1_000)
  })

  it('scores contrarian whale risk higher than same-notional penny pickup', () => {
    const penny = scorePolymarketWhaleBet({ amountUsd: 100_000, hoursSinceObserved: 0, tradePrice: 0.99 })
    const contrarian = scorePolymarketWhaleBet({ amountUsd: 100_000, hoursSinceObserved: 0, tradePrice: 0.20 })

    expect(contrarian.signalWeight).toBeGreaterThan(penny.signalWeight)
    expect(contrarian.confidence).toBeGreaterThan(penny.confidence)
  })
})
