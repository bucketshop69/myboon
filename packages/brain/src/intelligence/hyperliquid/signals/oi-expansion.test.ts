import { describe, expect, it } from 'vitest'
import {
  detectHyperliquidOiExpansionFindings,
  type HyperliquidOiExpansionPoint,
} from './oi-expansion.js'

const start = '2026-05-19T00:00:00.000Z'
const end = '2026-05-26T00:00:00.000Z'

function point(input: Partial<HyperliquidOiExpansionPoint> & { asset: string; observedAt: string }): HyperliquidOiExpansionPoint {
  return {
    asset: input.asset,
    observedAt: input.observedAt,
    openInterestUsd: input.openInterestUsd ?? null,
    markPrice: input.markPrice ?? null,
    midPrice: input.midPrice ?? null,
    oraclePrice: input.oraclePrice ?? null,
  }
}

describe('detectHyperliquidOiExpansionFindings', () => {
  it('emits a story-ready finding for publish-worthy 7-day OI expansion', () => {
    const findings = detectHyperliquidOiExpansionFindings([
      point({ asset: 'HYPE', observedAt: start, openInterestUsd: 80_000_000, markPrice: 28 }),
      point({ asset: 'HYPE', observedAt: end, openInterestUsd: 130_000_000, markPrice: 34 }),
    ], {
      minOpenInterestUsd: 50_000_000,
      minOiIncreaseUsd: 25_000_000,
      minOiIncreasePct: 0.3,
      requirePriceConfirmation: true,
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      type: 'oi_expansion',
      asset: 'HYPE',
      startOpenInterestUsd: 80_000_000,
      endOpenInterestUsd: 130_000_000,
      oiDeltaUsd: 50_000_000,
      oiDeltaPct: 0.625,
      startPriceUsd: 28,
      endPriceUsd: 34,
      priceDeltaPct: 0.2143,
      timeRange: { start, end, days: 7 },
      storyKey: 'hyperliquid:oi-expansion:hype',
    })
    expect(findings[0].reason).toContain('open interest expanded')
    expect(findings[0].priorityHint).toBeGreaterThanOrEqual(7)
  })

  it('suppresses assets below OI expansion thresholds', () => {
    const findings = detectHyperliquidOiExpansionFindings([
      point({ asset: 'ETH', observedAt: start, openInterestUsd: 100_000_000, markPrice: 3000 }),
      point({ asset: 'ETH', observedAt: end, openInterestUsd: 112_000_000, markPrice: 3100 }),
    ], {
      minOpenInterestUsd: 50_000_000,
      minOiIncreaseUsd: 25_000_000,
      minOiIncreasePct: 0.2,
    })

    expect(findings).toHaveLength(0)
  })

  it('ignores assets without enough valid OI observations', () => {
    const findings = detectHyperliquidOiExpansionFindings([
      point({ asset: 'SOL', observedAt: start, openInterestUsd: null, markPrice: 160 }),
      point({ asset: 'SOL', observedAt: end, openInterestUsd: 90_000_000, markPrice: 180 }),
      point({ asset: 'BTC', observedAt: start, openInterestUsd: 500_000_000, markPrice: 100_000 }),
      point({ asset: 'BTC', observedAt: end, openInterestUsd: null, markPrice: 110_000 }),
    ], {
      minOpenInterestUsd: 50_000_000,
      minOiIncreaseUsd: 25_000_000,
      minOiIncreasePct: 0.2,
    })

    expect(findings).toHaveLength(0)
  })
})
