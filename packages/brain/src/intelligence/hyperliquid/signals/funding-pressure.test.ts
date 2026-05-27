import { describe, expect, it } from 'vitest'
import { detectHyperliquidFundingPressureFindings, type HyperliquidFundingPoint } from './funding-pressure.js'

const now = '2026-05-26T12:00:00.000Z'
const start = Date.parse('2026-05-24T12:00:00.000Z')

const options = {
  now,
  minSampleCount: 24,
  absoluteFundingThreshold: 0.0001,
  averageFundingThreshold: 0.00005,
  sustainedSampleShare: 0.7,
}

function points(asset: string, count: number, fundingRate: number | ((index: number) => number)): HyperliquidFundingPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    asset,
    fundingRate: typeof fundingRate === 'function' ? fundingRate(index) : fundingRate,
    observedAt: new Date(start + index * 3_600_000).toISOString(),
  }))
}

describe('detectHyperliquidFundingPressureFindings', () => {
  it('detects positive funding crowding', () => {
    const findings = detectHyperliquidFundingPressureFindings({
      ETH: points('ETH', 48, 0.00012),
    }, options)

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        asset: 'ETH',
        type: 'strong_positive_funding',
        direction: 'long_crowded',
        avgFunding: 0.00012,
        maxFunding: 0.00012,
        minFunding: 0.00012,
        sampleCount: 48,
        storyKey: 'hyperliquid:funding-pressure:eth:strong_positive_funding',
      }),
      expect.objectContaining({
        asset: 'ETH',
        type: 'sustained_crowding',
        direction: 'long_crowded',
      }),
    ]))
  })

  it('detects negative funding crowding', () => {
    const findings = detectHyperliquidFundingPressureFindings({
      SOL: points('SOL', 48, -0.00013),
    }, options)

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        asset: 'SOL',
        type: 'strong_negative_funding',
        direction: 'short_crowded',
        avgFunding: -0.00013,
        maxFunding: -0.00013,
        minFunding: -0.00013,
      }),
      expect.objectContaining({
        asset: 'SOL',
        type: 'sustained_crowding',
        direction: 'short_crowded',
      }),
    ]))
  })

  it('detects a funding flip across the historical window', () => {
    const findings = detectHyperliquidFundingPressureFindings({
      BTC: points('BTC', 48, (index) => index < 24 ? -0.00012 : 0.00014),
    }, options)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toEqual(expect.objectContaining({
      asset: 'BTC',
      type: 'funding_flip',
      direction: 'negative_to_positive',
      avgFunding: 0.00001,
      maxFunding: 0.00014,
      minFunding: -0.00012,
      startTime: '2026-05-24T12:00:00.000Z',
      endTime: '2026-05-26T11:00:00.000Z',
      storyKey: 'hyperliquid:funding-pressure:btc:funding_flip',
    }))
    expect(findings[0].reason).toMatch(/flipped/i)
  })

  it('ignores assets with insufficient samples', () => {
    const findings = detectHyperliquidFundingPressureFindings({
      HYPE: points('HYPE', 23, 0.0002),
    }, options)

    expect(findings).toHaveLength(0)
  })
})
