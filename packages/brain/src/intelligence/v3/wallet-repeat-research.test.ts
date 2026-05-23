import { describe, expect, it } from 'vitest'
import {
  buildWalletRepeatResearchPackets,
  buildWalletRepeatResearchPacketsFromLegacy,
  legacyWhaleBetToWalletTradeSeed,
  type PolymarketOddsSnapshotSeed,
  type PolymarketWalletTradeSeed,
} from './wallet-repeat-research.js'
import { validateResearchPacket } from './packet-validator.js'
import type { LegacyWhaleBetSignal } from '../polymarket-whale-backtest.js'

const now = '2026-05-23T12:00:00.000Z'

function trade(overrides: Partial<PolymarketWalletTradeSeed> = {}): PolymarketWalletTradeSeed {
  return {
    id: 'trade-1',
    wallet: '0xabc',
    slug: 'will-x-happen',
    marketTitle: 'Will X happen?',
    outcome: 'YES',
    side: 'BUY',
    amountUsd: 2000,
    price: 0.29,
    marketOddsAtTrade: 0.29,
    observedAt: '2026-05-23T08:00:00.000Z',
    capturedAt: '2026-05-23T08:00:05.000Z',
    rawRef: 'legacy-signal:trade-1',
    ...overrides,
  }
}

function odds(overrides: Partial<PolymarketOddsSnapshotSeed> = {}): PolymarketOddsSnapshotSeed {
  return {
    id: 'odds-1',
    slug: 'will-x-happen',
    price: 0.22,
    observedAt: '2026-05-23T08:00:00.000Z',
    capturedAt: '2026-05-23T08:00:03.000Z',
    rawRef: 'odds:odds-1',
    ...overrides,
  }
}

describe('feed v3 wallet-repeat research builder', () => {
  it('produces exactly one ResearchPacket for same-wallet same-market same-side trades', () => {
    const results = buildWalletRepeatResearchPackets(
      [
        trade(),
        trade({ id: 'trade-2', amountUsd: 3500, price: 0.31, observedAt: '2026-05-23T11:20:00.000Z' }),
      ],
      [
        odds(),
        odds({ id: 'odds-2', price: 0.34, observedAt: '2026-05-23T11:30:00.000Z' }),
      ],
      { now }
    )

    expect(results).toHaveLength(1)
    expect(results[0].packet).toMatchObject({
      storyKey: 'polymarket:wallet-repeat:0xabc:will-x-happen:yes:up',
      segment: 'Smart Money',
      archetype: 'wallet_repeat_action',
      status: 'new',
    })
    expect(results[0].packet.facts.filter((fact) => fact.factType === 'wallet.trade')).toHaveLength(2)
    expect(results[0].decision.decision).toBe('publish')
    expect(validateResearchPacket(results[0].packet, results[0].decision).valid).toBe(true)
  })

  it('marks a material third trade as a thread update', () => {
    const storyKey = 'polymarket:wallet-repeat:0xabc:will-x-happen:yes:up'
    const results = buildWalletRepeatResearchPackets(
      [
        trade(),
        trade({ id: 'trade-2', amountUsd: 3500, price: 0.31, observedAt: '2026-05-23T11:20:00.000Z' }),
        trade({ id: 'trade-3', amountUsd: 4200, price: 0.33, observedAt: '2026-05-23T11:45:00.000Z' }),
      ],
      [
        odds(),
        odds({ id: 'odds-2', price: 0.35, observedAt: '2026-05-23T11:50:00.000Z' }),
      ],
      {
        now,
        existingThreadByStoryKey: { [storyKey]: 'thread-1' },
        coveredThroughByStoryKey: { [storyKey]: '2026-05-23T11:20:00.000Z' },
      }
    )

    expect(results).toHaveLength(1)
    expect(results[0].packet.threadId).toBe('thread-1')
    expect(results[0].packet.status).toBe('update')
    expect(results[0].decision.decision).toBe('update')
    expect(validateResearchPacket(results[0].packet, results[0].decision).valid).toBe(true)
  })

  it('suppresses an existing story when replay contains no new material facts', () => {
    const storyKey = 'polymarket:wallet-repeat:0xabc:will-x-happen:yes:up'
    const results = buildWalletRepeatResearchPackets(
      [
        trade(),
        trade({ id: 'trade-2', amountUsd: 3500, price: 0.31, observedAt: '2026-05-23T11:20:00.000Z' }),
      ],
      [
        odds(),
        odds({ id: 'odds-2', price: 0.34, observedAt: '2026-05-23T11:30:00.000Z' }),
      ],
      {
        now,
        existingThreadByStoryKey: { [storyKey]: 'thread-1' },
        coveredThroughByStoryKey: { [storyKey]: '2026-05-23T11:30:00.000Z' },
      }
    )

    expect(results).toHaveLength(1)
    expect(results[0].decision.decision).toBe('suppress')
    expect(validateResearchPacket(results[0].packet, results[0].decision).valid).toBe(true)
  })

  it('suppresses an existing story when there is no material change', () => {
    const storyKey = 'polymarket:wallet-repeat:0xabc:will-x-happen:yes:up'
    const results = buildWalletRepeatResearchPackets(
      [
        trade({ amountUsd: 25 }),
        trade({ id: 'trade-2', amountUsd: 30, price: 0.291, observedAt: '2026-05-23T11:20:00.000Z' }),
      ],
      [
        odds(),
        odds({ id: 'odds-2', price: 0.221, observedAt: '2026-05-23T11:30:00.000Z' }),
      ],
      {
        now,
        existingThreadByStoryKey: { [storyKey]: 'thread-1' },
        materialityThresholds: { minNewTradeAmountUsd: 500, minOddsDelta: 0.03 },
      }
    )

    expect(results).toHaveLength(1)
    expect(results[0].decision.decision).toBe('suppress')
    expect(validateResearchPacket(results[0].packet, results[0].decision).valid).toBe(true)
  })

  it('holds repeat trades when the market slug is unresolved', () => {
    const results = buildWalletRepeatResearchPackets(
      [
        trade({ slug: null, marketId: 'condition-1' }),
        trade({ id: 'trade-2', slug: null, marketId: 'condition-1', amountUsd: 3500, price: 0.31, observedAt: '2026-05-23T11:20:00.000Z' }),
      ],
      [
        odds({ slug: 'condition-1' }),
        odds({ id: 'odds-2', slug: 'condition-1', price: 0.34, observedAt: '2026-05-23T11:30:00.000Z' }),
      ],
      { now }
    )

    expect(results).toHaveLength(1)
    expect(results[0].decision).toMatchObject({
      decision: 'hold',
      surface: 'none',
      reason: 'Wallet-repeat story is missing a resolved market slug.',
    })
    expect(results[0].packet.recommendedActions).toEqual([])
    expect(validateResearchPacket(results[0].packet, results[0].decision).valid).toBe(true)
  })

  it('holds repeat trades when market or odds context is unresolved', () => {
    const results = buildWalletRepeatResearchPackets(
      [
        trade(),
        trade({ id: 'trade-2', amountUsd: 3500, price: 0.31, observedAt: '2026-05-23T11:20:00.000Z' }),
      ],
      [],
      { now }
    )

    expect(results).toHaveLength(1)
    expect(results[0].decision).toMatchObject({
      decision: 'hold',
      surface: 'none',
      reason: 'Wallet-repeat story is missing market or odds context.',
    })
    expect(validateResearchPacket(results[0].packet, results[0].decision).valid).toBe(true)
  })

  it('drops unsupported trade sides instead of inferring a direction', () => {
    const results = buildWalletRepeatResearchPackets(
      [
        trade({ side: 'TRANSFER' }),
        trade({ id: 'trade-2', side: 'TRANSFER', amountUsd: 3500, price: 0.31, observedAt: '2026-05-23T11:20:00.000Z' }),
      ],
      [
        odds(),
        odds({ id: 'odds-2', price: 0.34, observedAt: '2026-05-23T11:30:00.000Z' }),
      ],
      { now }
    )

    expect(results).toEqual([])
  })

  it('suppresses noisy markets before publication', () => {
    const results = buildWalletRepeatResearchPackets(
      [
        trade(),
        trade({ id: 'trade-2', amountUsd: 3500, price: 0.31, observedAt: '2026-05-23T11:20:00.000Z' }),
      ],
      [
        odds(),
        odds({ id: 'odds-2', price: 0.34, observedAt: '2026-05-23T11:30:00.000Z' }),
      ],
      { now, noisyMarketSlugs: ['will-x-happen'] }
    )

    expect(results).toHaveLength(1)
    expect(results[0].decision.decision).toBe('suppress')
    expect(validateResearchPacket(results[0].packet, results[0].decision).valid).toBe(true)
  })

  it('converts legacy WHALE_BET rows into wallet trade seeds for shadow mode', () => {
    const legacy: LegacyWhaleBetSignal = {
      id: 'legacy-1',
      topic: 'Will X happen?',
      slug: 'will-x-happen',
      created_at: '2026-05-23T08:00:05.000Z',
      metadata: {
        user: '0xabc',
        side: 'BUY',
        outcome: 'YES',
        amount: '1200',
        tradePrice: '0.29',
        activityTimestamp: '2026-05-23T08:00:00.000Z',
      },
    }

    expect(legacyWhaleBetToWalletTradeSeed(legacy)).toMatchObject({
      id: 'legacy-1',
      wallet: '0xabc',
      slug: 'will-x-happen',
      amountUsd: 1200,
      price: 0.29,
    })
  })

  it('runs the wallet-repeat slice from legacy rows', () => {
    const legacyRows: LegacyWhaleBetSignal[] = [
      {
        id: 'legacy-1',
        topic: 'Will X happen?',
        slug: 'will-x-happen',
        created_at: '2026-05-23T08:00:05.000Z',
        metadata: {
          user: '0xabc',
          side: 'BUY',
          outcome: 'YES',
          amount: 1200,
          tradePrice: 0.29,
          activityTimestamp: '2026-05-23T08:00:00.000Z',
        },
      },
      {
        id: 'legacy-2',
        topic: 'Will X happen?',
        slug: 'will-x-happen',
        created_at: '2026-05-23T11:20:05.000Z',
        metadata: {
          user: '0xabc',
          side: 'BUY',
          outcome: 'YES',
          amount: 1800,
          tradePrice: 0.31,
          activityTimestamp: '2026-05-23T11:20:00.000Z',
        },
      },
    ]

    const results = buildWalletRepeatResearchPacketsFromLegacy(
      legacyRows,
      [
        odds(),
        odds({ id: 'odds-2', price: 0.34, observedAt: '2026-05-23T11:30:00.000Z' }),
      ],
      { now }
    )

    expect(results).toHaveLength(1)
    expect(results[0].decision.decision).toBe('publish')
    expect(validateResearchPacket(results[0].packet, results[0].decision).valid).toBe(true)
  })
})
