import { describe, expect, it } from 'vitest'
import {
  detectHyperliquidPriceOiDivergences,
  type HyperliquidPriceOiPoint,
} from './price-oi-divergence.js'

const start = '2026-05-19T12:00:00.000Z'
const end = '2026-05-26T12:00:00.000Z'

function points(asset: string, startPrice: number, endPrice: number, startOi: number, endOi: number): HyperliquidPriceOiPoint[] {
  return [
    { asset, timestamp: start, price: startPrice, openInterestUsd: startOi },
    { asset, timestamp: end, price: endPrice, openInterestUsd: endOi },
  ]
}

describe('detectHyperliquidPriceOiDivergences', () => {
  it('classifies price up and open interest up as leverage momentum', () => {
    const findings = detectHyperliquidPriceOiDivergences(points('ETH', 3000, 3180, 1_000_000_000, 1_120_000_000), { now: end })

    expect(findings).toHaveLength(1)
    expect(findings[0].classification).toBe('leverage_momentum')
    expect(findings[0].asset).toBe('ETH')
    expect(findings[0].deltas.priceDeltaPct).toBe(0.06)
    expect(findings[0].deltas.openInterestDeltaPct).toBe(0.12)
    expect(findings[0].storyKey).toBe('hyperliquid:price-oi-divergence:eth:leverage-momentum')
    expect(findings[0].reason).toContain('fresh positioning')
  })

  it('classifies price down and open interest up as pressure building', () => {
    const findings = detectHyperliquidPriceOiDivergences(points('BTC', 100_000, 94_000, 2_000_000_000, 2_140_000_000), { now: end })

    expect(findings).toHaveLength(1)
    expect(findings[0].classification).toBe('pressure_building')
    expect(findings[0].deltas.priceDeltaPct).toBe(-0.06)
    expect(findings[0].deltas.openInterestDeltaUsd).toBe(140_000_000)
    expect(findings[0].reason).toContain('pressure building')
  })

  it('classifies price up and open interest down as short covering', () => {
    const findings = detectHyperliquidPriceOiDivergences(points('SOL', 150, 162, 600_000_000, 540_000_000), { now: end })

    expect(findings).toHaveLength(1)
    expect(findings[0].classification).toBe('short_covering')
    expect(findings[0].deltas.priceDeltaPct).toBe(0.08)
    expect(findings[0].deltas.openInterestDeltaPct).toBe(-0.1)
    expect(findings[0].reason).toContain('short covering')
  })

  it('classifies price down and open interest down as unwind', () => {
    const findings = detectHyperliquidPriceOiDivergences(points('HYPE', 40, 37, 300_000_000, 270_000_000), { now: end })

    expect(findings).toHaveLength(1)
    expect(findings[0].classification).toBe('unwind')
    expect(findings[0].deltas.priceDeltaPct).toBe(-0.075)
    expect(findings[0].deltas.openInterestDeltaPct).toBe(-0.1)
    expect(findings[0].reason).toContain('de-risking')
  })

  it('suppresses moves below price, open-interest percent, or open-interest USD thresholds', () => {
    const belowPrice = points('ETH', 3000, 3030, 1_000_000_000, 1_100_000_000)
    const belowOpenInterestPct = points('BTC', 100_000, 94_000, 2_000_000_000, 2_060_000_000)
    const belowOpenInterestUsd = points('DOGE', 0.2, 0.22, 100_000_000, 105_500_000)

    const findings = detectHyperliquidPriceOiDivergences([
      ...belowPrice,
      ...belowOpenInterestPct,
      ...belowOpenInterestUsd,
    ], { now: end })

    expect(findings).toHaveLength(0)
  })
})
