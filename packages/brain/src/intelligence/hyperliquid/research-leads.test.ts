import { describe, expect, it } from 'vitest'
import {
  buildHyperliquidFundingResearchLeads,
  buildHyperliquidPriceMomentumResearchLeads,
  buildHyperliquidWalletBehaviorResearchLeads,
  buildHyperliquidVolumeResearchLeads,
  rankHyperliquidResearchLeads,
  summarizeHyperliquidResearchLeads,
} from './research-leads.js'
import type { HyperliquidCandle, HyperliquidFill, HyperliquidFundingPoint } from './client.js'
import type { HyperliquidPositionSnapshot } from './types.js'
import type { HyperliquidWalletQualityProfile } from './wallet-profile.js'

function candle(input: {
  coin?: string
  start: string
  close: number
  volume: number
  open?: number
}): HyperliquidCandle {
  const startTime = Date.parse(input.start)
  const endTime = startTime + 24 * 3_600_000 - 1
  return {
    coin: input.coin ?? 'NEAR',
    interval: '1d',
    startTime,
    endTime,
    open: input.open ?? input.close,
    high: Math.max(input.open ?? input.close, input.close),
    low: Math.min(input.open ?? input.close, input.close),
    close: input.close,
    volume: input.volume,
    trades: null,
    raw: {},
  }
}

function fundingPoints(asset: string, count: number, fundingRate: number | ((index: number) => number)): HyperliquidFundingPoint[] {
  const start = Date.parse('2026-05-24T12:00:00.000Z')
  return Array.from({ length: count }, (_, index) => ({
    coin: asset,
    time: start + index * 3_600_000,
    fundingRate: typeof fundingRate === 'function' ? fundingRate(index) : fundingRate,
    premium: null,
    raw: {},
  }))
}

function fill(input: Partial<HyperliquidFill> & {
  coin?: string
  dir: string
  px?: number
  sz?: number
  time: number
}): HyperliquidFill {
  return {
    coin: input.coin ?? 'NEAR',
    dir: input.dir,
    px: input.px ?? 5,
    sz: input.sz ?? 100_000,
    time: input.time,
    closedPnl: input.closedPnl ?? null,
    hash: input.hash ?? `hash-${input.time}`,
    oid: input.oid ?? input.time,
    crossed: input.crossed ?? true,
    raw: input.raw ?? {},
  }
}

function position(input: {
  wallet?: string
  asset?: string
  side: 'long' | 'short'
  notionalUsd: number
}): HyperliquidPositionSnapshot {
  return {
    wallet: input.wallet ?? '0xwallet',
    asset: input.asset ?? 'NEAR',
    side: input.side,
    size: input.notionalUsd / 5,
    notionalUsd: input.notionalUsd,
    entryPrice: 5,
    markPrice: 5,
    leverage: null,
    unrealizedPnlUsd: null,
    marginUsedUsd: null,
    observedAt: '2026-05-28T00:00:00.000Z',
    raw: {},
  }
}

function walletProfile(input: Partial<HyperliquidWalletQualityProfile> = {}): HyperliquidWalletQualityProfile {
  return {
    wallet: input.wallet ?? '0xwallet',
    label: input.label ?? 'manual wallet',
    sources: input.sources ?? ['manual'],
    identitySources: input.identitySources ?? {
      userProvidedLabel: 'manual wallet',
      hyperliquidDisplayName: null,
      hypurrscanTags: [],
      hypurrscanAlias: null,
      userRole: 'user',
    },
    behavior: input.behavior ?? {
      accountValueUsd: null,
      currentExposureUsd: 2_000_000,
      currentLongExposureUsd: 2_000_000,
      currentShortExposureUsd: 0,
      netExposurePct: 100,
      dayVolumeUsd: null,
      weekVolumeUsd: null,
      monthVolumeUsd: null,
      fillWindowVolumeUsd: 1_000_000,
      volumeToEquityRatio: null,
      fillsPerDay: 3,
      assetsTraded: 1,
      medianHoldTimeHours: null,
      roundTripSharePct: 0,
      smallFillSharePct: 0,
      makerFillSharePct: 0,
      directionalConcentrationPct: 100,
      largeDepositsUsd: 0,
      largeDepositCount: 0,
    },
    classification: input.classification ?? 'directional_trader',
    confidence: input.confidence ?? 0.72,
    reasons: input.reasons ?? ['Largest directional asset is 100% of signed notional.'],
    receipts: input.receipts ?? [],
  }
}

describe('buildHyperliquidVolumeResearchLeads', () => {
  it('turns a NEAR-like 30d volume spike into a research lead', () => {
    const baselineStart = Date.parse('2026-04-26T00:00:00.000Z')
    const baseline = Array.from({ length: 30 }, (_, index) => candle({
      start: new Date(baselineStart + index * 24 * 3_600_000).toISOString(),
      close: 4,
      volume: 8_000_000,
    }))
    const leads = buildHyperliquidVolumeResearchLeads({
      asset: 'NEAR',
      candles: [
        ...baseline,
        candle({ start: '2026-05-26T00:00:00.000Z', open: 4, close: 3.68, volume: 47_600_000 }),
      ],
      now: '2026-05-27T12:00:00.000Z',
      windowsDays: [30],
    })

    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({
      asset: 'NEAR',
      lane: 'volume_spike',
      status: 'research',
      headline: 'NEAR volume spike: 5.47x 30d baseline, price down 8%',
      metrics: expect.objectContaining({
        windowDays: 30,
        spikeMultiple: 5.474,
        priceMovePct: -8,
      }),
    })
    expect(leads[0].whatChanged).toContain('Latest daily Hyperliquid volume')
    expect(leads[0].suggestedResearchQuestions).toEqual(expect.arrayContaining([
      'Did funding flip or become extreme during the move?',
      'Did open interest rise or fall while volume expanded?',
    ]))
    expect(leads[0].receipts[0]).toMatchObject({
      source: 'hyperliquid',
      rawRef: 'candleSnapshot',
    })
  })

  it('keeps visible but sub-threshold volume as a watch lead', () => {
    const leads = buildHyperliquidVolumeResearchLeads({
      asset: 'SOL',
      candles: [
        candle({ coin: 'SOL', start: '2026-05-20T00:00:00.000Z', close: 100, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-21T00:00:00.000Z', close: 100, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-22T00:00:00.000Z', close: 100, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-23T00:00:00.000Z', close: 100, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-24T00:00:00.000Z', close: 100, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-25T00:00:00.000Z', open: 100, close: 104, volume: 110_000 }),
      ],
      now: '2026-05-26T12:00:00.000Z',
      windowsDays: [7],
    })

    expect(leads[0]).toMatchObject({
      asset: 'SOL',
      status: 'watch',
      headline: 'SOL volume watch: 1.14x 7d baseline, price up 4%',
    })
    expect(leads[0].checks.find((check) => check.name === 'research spike multiple')).toMatchObject({
      passed: false,
    })
  })

  it('emits an ignore lead when there is not enough baseline data', () => {
    const leads = buildHyperliquidVolumeResearchLeads({
      asset: 'BTC',
      candles: [
        candle({ coin: 'BTC', start: '2026-05-24T00:00:00.000Z', close: 100_000, volume: 100 }),
        candle({ coin: 'BTC', start: '2026-05-25T00:00:00.000Z', close: 101_000, volume: 400 }),
      ],
      now: '2026-05-26T12:00:00.000Z',
      windowsDays: [7],
    })

    expect(leads[0]).toMatchObject({
      asset: 'BTC',
      status: 'ignore',
    })
    expect(leads[0].suggestedResearchQuestions).toHaveLength(0)
    expect(leads[0].checks.find((check) => check.name === 'enough baseline days')).toMatchObject({
      passed: false,
    })
  })
})

describe('buildHyperliquidFundingResearchLeads', () => {
  it('turns sustained positive funding into a research lead', () => {
    const leads = buildHyperliquidFundingResearchLeads({
      asset: 'NEAR',
      funding: fundingPoints('NEAR', 48, 0.00006),
      now: '2026-05-26T12:00:00.000Z',
      windowsDays: [2],
    })

    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({
      asset: 'NEAR',
      lane: 'funding_pressure',
      status: 'research',
      headline: 'NEAR funding pressure: longs paying shorts, avg 0.6 bps over 2d',
      metrics: expect.objectContaining({
        samples: 48,
        averageFundingBps: 0.6,
        tailFundingBps: 0.6,
        positiveSampleSharePct: 100,
      }),
    })
    expect(leads[0].whatChanged).toContain('funding averaged 0.6 bps')
    expect(leads[0].suggestedResearchQuestions).toEqual(expect.arrayContaining([
      'Did volume expand during the same window?',
      'Did open interest rise or fall while funding pressure built?',
    ]))
  })

  it('keeps softer one-sided funding as a watch lead', () => {
    const leads = buildHyperliquidFundingResearchLeads({
      asset: 'TON',
      funding: fundingPoints('TON', 48, -0.000015),
      now: '2026-05-26T12:00:00.000Z',
      windowsDays: [2],
    })

    expect(leads[0]).toMatchObject({
      asset: 'TON',
      status: 'watch',
      headline: 'TON funding watch: shorts paying longs, avg -0.15 bps over 2d',
    })
    expect(leads[0].checks.find((check) => check.name === 'research average funding')).toMatchObject({
      passed: false,
    })
  })

  it('emits an ignore lead when funding is undersampled', () => {
    const leads = buildHyperliquidFundingResearchLeads({
      asset: 'BTC',
      funding: fundingPoints('BTC', 12, 0.0001),
      now: '2026-05-26T12:00:00.000Z',
      windowsDays: [2],
    })

    expect(leads[0]).toMatchObject({
      asset: 'BTC',
      status: 'ignore',
    })
    expect(leads[0].suggestedResearchQuestions).toHaveLength(0)
    expect(leads[0].checks.find((check) => check.name === 'enough hourly samples')).toMatchObject({
      passed: false,
    })
  })
})

describe('buildHyperliquidPriceMomentumResearchLeads', () => {
  it('turns a large 1d selloff into a research lead', () => {
    const leads = buildHyperliquidPriceMomentumResearchLeads({
      asset: 'NEAR',
      candles: [
        candle({ start: '2026-05-20T00:00:00.000Z', close: 4, volume: 8_000_000 }),
        candle({ start: '2026-05-21T00:00:00.000Z', close: 4.1, volume: 8_000_000 }),
        candle({ start: '2026-05-22T00:00:00.000Z', close: 4.05, volume: 8_000_000 }),
        candle({ start: '2026-05-23T00:00:00.000Z', close: 4.2, volume: 8_000_000 }),
        candle({ start: '2026-05-24T00:00:00.000Z', close: 4, volume: 8_000_000 }),
        candle({ start: '2026-05-25T00:00:00.000Z', close: 4, volume: 8_000_000 }),
        candle({ start: '2026-05-26T00:00:00.000Z', open: 4, close: 3.68, volume: 47_600_000 }),
      ],
      now: '2026-05-27T12:00:00.000Z',
      windowsDays: [1],
    })

    expect(leads[0]).toMatchObject({
      asset: 'NEAR',
      lane: 'price_momentum',
      status: 'research',
      headline: 'NEAR price move: down 8% over 1d',
      metrics: expect.objectContaining({
        windowDays: 1,
        priceMovePct: -8,
      }),
    })
    expect(leads[0].suggestedResearchQuestions).toEqual(expect.arrayContaining([
      'Did volume expand with the price move?',
      'Did funding become one-sided after the move?',
    ]))
  })

  it('keeps a medium 7d move as a watch lead', () => {
    const leads = buildHyperliquidPriceMomentumResearchLeads({
      asset: 'SOL',
      candles: [
        candle({ coin: 'SOL', start: '2026-05-17T00:00:00.000Z', close: 100, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-18T00:00:00.000Z', close: 101, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-19T00:00:00.000Z', close: 102, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-20T00:00:00.000Z', close: 100, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-21T00:00:00.000Z', close: 103, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-22T00:00:00.000Z', close: 105, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-23T00:00:00.000Z', close: 106, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-24T00:00:00.000Z', close: 107, volume: 100_000 }),
        candle({ coin: 'SOL', start: '2026-05-25T00:00:00.000Z', close: 110, volume: 100_000 }),
      ],
      now: '2026-05-26T12:00:00.000Z',
      windowsDays: [7],
    })

    expect(leads[0]).toMatchObject({
      asset: 'SOL',
      status: 'watch',
      headline: 'SOL price watch: up 8.91% over 7d',
    })
    expect(leads[0].checks.find((check) => check.name === 'research price move')).toMatchObject({
      passed: false,
    })
  })

  it('emits an ignore lead when the move is too small', () => {
    const leads = buildHyperliquidPriceMomentumResearchLeads({
      asset: 'BTC',
      candles: [
        candle({ coin: 'BTC', start: '2026-05-20T00:00:00.000Z', close: 100_000, volume: 100 }),
        candle({ coin: 'BTC', start: '2026-05-21T00:00:00.000Z', close: 100_500, volume: 100 }),
        candle({ coin: 'BTC', start: '2026-05-22T00:00:00.000Z', close: 100_200, volume: 100 }),
        candle({ coin: 'BTC', start: '2026-05-23T00:00:00.000Z', close: 100_600, volume: 100 }),
        candle({ coin: 'BTC', start: '2026-05-24T00:00:00.000Z', close: 100_400, volume: 100 }),
        candle({ coin: 'BTC', start: '2026-05-25T00:00:00.000Z', close: 100_900, volume: 100 }),
      ],
      now: '2026-05-26T12:00:00.000Z',
      windowsDays: [1],
    })

    expect(leads[0]).toMatchObject({
      asset: 'BTC',
      status: 'ignore',
    })
    expect(leads[0].suggestedResearchQuestions).toHaveLength(0)
  })
})

describe('buildHyperliquidWalletBehaviorResearchLeads', () => {
  it('turns trusted wallet accumulation into a research lead', () => {
    const start = Date.parse('2026-05-27T00:00:00.000Z')
    const leads = buildHyperliquidWalletBehaviorResearchLeads({
      wallet: '0xwallet',
      profile: walletProfile(),
      fills: [
        fill({ dir: 'Open Long', time: start, px: 5, sz: 120_000 }),
        fill({ dir: 'Open Long', time: start + 3_600_000, px: 5, sz: 80_000 }),
      ],
      currentPositions: [position({ side: 'long', notionalUsd: 2_000_000 })],
      now: '2026-05-28T00:00:00.000Z',
      lookbackDays: 2,
    })

    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({
      asset: 'NEAR',
      lane: 'watchlist_wallet',
      status: 'research',
      headline: 'NEAR wallet behavior: manual wallet adding to / building long exposure',
      metrics: expect.objectContaining({
        wallet: '0xwallet',
        walletClassification: 'directional_trader',
        absNetDirectionalFlowUsd: 1_000_000,
        currentPositionNotionalUsd: 2_000_000,
        changePct: 50,
      }),
    })
    expect(leads[0].suggestedResearchQuestions).toEqual(expect.arrayContaining([
      'Is this NEAR wallet behavior aligned with price, funding, and volume right now?',
    ]))
  })

  it('keeps a noisy wallet behavior lead ignored even with large flow', () => {
    const start = Date.parse('2026-05-27T00:00:00.000Z')
    const leads = buildHyperliquidWalletBehaviorResearchLeads({
      wallet: '0xnoisy',
      profile: walletProfile({
        wallet: '0xnoisy',
        classification: 'too_noisy',
        confidence: 0.62,
        reasons: ['No meaningful current exposure and too much churn.'],
      }),
      fills: [
        fill({ coin: 'SOL', dir: 'Open Short', time: start, px: 100, sz: 20_000 }),
      ],
      currentPositions: [position({ wallet: '0xnoisy', asset: 'SOL', side: 'short', notionalUsd: 2_000_000 })],
      now: '2026-05-28T00:00:00.000Z',
      lookbackDays: 2,
    })

    expect(leads[0]).toMatchObject({
      asset: 'SOL',
      status: 'ignore',
      metrics: expect.objectContaining({
        walletClassification: 'too_noisy',
      }),
    })
    expect(leads[0].checks.find((check) => check.name === 'wallet is directional')).toMatchObject({
      passed: false,
    })
  })
})

describe('research lead helpers', () => {
  it('ranks research leads before watch and ignore leads', () => {
    const leads = [
      ...buildHyperliquidVolumeResearchLeads({
        asset: 'QUIET',
        candles: [
          candle({ coin: 'QUIET', start: '2026-05-20T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'QUIET', start: '2026-05-21T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'QUIET', start: '2026-05-22T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'QUIET', start: '2026-05-23T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'QUIET', start: '2026-05-24T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'QUIET', start: '2026-05-25T00:00:00.000Z', close: 1, volume: 90_000 }),
        ],
        now: '2026-05-26T12:00:00.000Z',
        windowsDays: [7],
      }),
      ...buildHyperliquidVolumeResearchLeads({
        asset: 'LOUD',
        candles: [
          candle({ coin: 'LOUD', start: '2026-05-20T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'LOUD', start: '2026-05-21T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'LOUD', start: '2026-05-22T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'LOUD', start: '2026-05-23T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'LOUD', start: '2026-05-24T00:00:00.000Z', close: 1, volume: 100_000 }),
          candle({ coin: 'LOUD', start: '2026-05-25T00:00:00.000Z', close: 1, volume: 500_000 }),
        ],
        now: '2026-05-26T12:00:00.000Z',
        windowsDays: [7],
      }),
    ]
    const ranked = rankHyperliquidResearchLeads(leads)
    const summary = summarizeHyperliquidResearchLeads(ranked)

    expect(ranked[0]).toMatchObject({ asset: 'LOUD', status: 'research' })
    expect(summary.volume_spike).toEqual({ research: 1, watch: 0, ignore: 1 })
  })
})
