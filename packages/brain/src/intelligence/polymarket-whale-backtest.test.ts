import { describe, expect, it } from 'vitest'
import { runPolymarketWhaleBetBacktest, type LegacyWhaleBetSignal } from './polymarket-whale-backtest.js'
import type { LegacyOddsShiftSignal } from './polymarket-backtest.js'

const whale = (
  id: string,
  slug: string,
  createdAt: string,
  amount: number,
  side: string,
  outcome: string,
  tradePrice?: number
): LegacyWhaleBetSignal => ({
  id,
  slug,
  topic: slug,
  created_at: createdAt,
  weight: amount >= 10_000 ? 10 : 8,
  metadata: {
    slug,
    amount,
    side,
    outcome,
    user: `wallet-${id}`,
    activityTimestamp: createdAt,
    walletTotalBets: 100,
    walletWinRate: 0.6,
    tradePrice,
  },
})

const odds = (
  id: string,
  slug: string,
  createdAt: string,
  price: number
): LegacyOddsShiftSignal => ({
  id,
  slug,
  topic: slug,
  created_at: createdAt,
  metadata: {
    slug,
    shift_from: price - 0.01,
    shift_to: price,
    yes_price: price,
  },
})

describe('Polymarket whale-bet backtest', () => {
  it('evaluates whale bet direction against later odds movement', () => {
    const whales = [
      whale('1', 'market-a', '2026-01-01T00:00:00.000Z', 5_000, 'BUY', 'Yes'),
      whale('2', 'market-b', '2026-01-01T00:00:00.000Z', 5_000, 'BUY', 'No'),
    ]
    const oddsRows = [
      odds('o1', 'market-a', '2026-01-01T00:01:00.000Z', 0.4),
      odds('o2', 'market-a', '2026-01-01T06:00:00.000Z', 0.45),
      odds('o3', 'market-b', '2026-01-01T00:01:00.000Z', 0.6),
      odds('o4', 'market-b', '2026-01-01T06:00:00.000Z', 0.55),
    ]

    const result = runPolymarketWhaleBetBacktest(whales, oddsRows, {
      continuationDelta: 0.03,
      windowHours: 24,
      topFraction: 1,
      minCandidates: 1,
    })

    expect(result.summary.signalKind).toBe('polymarket.large_trade')
    expect(result.summary.baseline).toBe('largest_trade_amount')
    expect(result.summary.candidateCount).toBe(2)
    expect(result.summary.hitRate).toBe(1)
    expect(result.summary.actualWindowDays).toBeGreaterThanOrEqual(0)
    expect(result.selected[0]?.criteria[0]).toMatchObject({ kind: 'odds_move', targetDelta: 0.03, windowHours: 24 })
    expect(result.summary.confidenceInterval?.level).toBe(0.95)
    expect(result.byArchetype.conviction.candidateCount).toBe(2)
    expect(result.byArchetype.conviction.selectedCount).toBe(2)
  })

  it('prefers metadata.activityTimestamp over database created_at for historical alignment', () => {
    const whales: LegacyWhaleBetSignal[] = [{
      id: 'activity-time',
      slug: 'market-a',
      topic: 'market-a',
      created_at: '2026-01-02T00:00:00.000Z',
      weight: 8,
      metadata: {
        slug: 'market-a',
        amount: 5_000,
        side: 'BUY',
        outcome: 'Yes',
        user: 'wallet-activity-time',
        activityTimestamp: '2026-01-01T00:00:00.000Z',
        walletTotalBets: 100,
        walletWinRate: 0.6,
      },
    }]
    const oddsRows = [
      odds('o1', 'market-a', '2026-01-01T00:01:00.000Z', 0.4),
      odds('o2', 'market-a', '2026-01-01T06:00:00.000Z', 0.45),
    ]

    const result = runPolymarketWhaleBetBacktest(whales, oddsRows, {
      continuationDelta: 0.03,
      windowHours: 24,
      topFraction: 1,
      minCandidates: 1,
    })

    expect(result.summary.candidateCount).toBe(1)
    expect(result.selected[0]?.result).toBe('hit')
  })

  it('reports archetype stats and excludes penny-pickup from selected publishable whales', () => {
    const whales = [
      whale('1', 'market-a', '2026-01-01T00:00:00.000Z', 100_000, 'BUY', 'Yes', 0.99),
      whale('2', 'market-b', '2026-01-01T00:00:00.000Z', 10_000, 'BUY', 'Yes', 0.2),
    ]
    const oddsRows = [
      odds('o1', 'market-a', '2026-01-01T00:01:00.000Z', 0.99),
      odds('o2', 'market-a', '2026-01-01T06:00:00.000Z', 1),
      odds('o3', 'market-b', '2026-01-01T00:01:00.000Z', 0.2),
      odds('o4', 'market-b', '2026-01-01T06:00:00.000Z', 0.25),
    ]

    const result = runPolymarketWhaleBetBacktest(whales, oddsRows, {
      continuationDelta: 0.03,
      windowHours: 24,
      topFraction: 1,
      minCandidates: 1,
    })

    expect(result.byArchetype.penny_pickup.candidateCount).toBe(1)
    expect(result.byArchetype.penny_pickup.selectedCount).toBe(0)
    expect(result.byArchetype.contrarian.candidateCount).toBe(1)
    expect(result.byArchetype.contrarian.selectedCount).toBe(1)
    expect(result.selected).toHaveLength(1)
    expect(result.baseline).toHaveLength(1)
    expect(result.baseline[0]?.narrativeId).toContain('classified:2')
  })
})
