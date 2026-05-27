import { describe, expect, it } from 'vitest'
import { detectHyperliquidVolumeSpikes, type HyperliquidVolumePoint } from './volume-spike.js'

function point(asset: string, observedAt: string, volumeUsd: number): HyperliquidVolumePoint {
  return { asset, observedAt, volumeUsd }
}

describe('detectHyperliquidVolumeSpikes', () => {
  it('detects the latest asset volume above its 7-day baseline', () => {
    const findings = detectHyperliquidVolumeSpikes([
      point('ETH', '2026-05-20T00:00:00.000Z', 10_000_000),
      point('ETH', '2026-05-21T00:00:00.000Z', 12_000_000),
      point('ETH', '2026-05-22T00:00:00.000Z', 8_000_000),
      point('ETH', '2026-05-23T00:00:00.000Z', 30_000_000),
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      asset: 'ETH',
      recentVolumeUsd: 30_000_000,
      baselineVolumeUsd: 10_000_000,
      spikeMultiple: 3,
      priorityHint: 8,
      storyKey: 'hyperliquid:volume-spike:eth',
    })
    expect(findings[0].timeRange).toEqual({
      baselineStart: '2026-05-16T00:00:00.000Z',
      baselineEnd: '2026-05-22T00:00:00.000Z',
      recentStart: '2026-05-23T00:00:00.000Z',
      recentEnd: '2026-05-23T00:00:00.000Z',
    })
    expect(findings[0].reason).toContain('ETH volume is 3x its 7-day baseline')
  })

  it('suppresses assets below the spike multiple', () => {
    const findings = detectHyperliquidVolumeSpikes([
      point('SOL', '2026-05-20T00:00:00.000Z', 10_000_000),
      point('SOL', '2026-05-21T00:00:00.000Z', 10_000_000),
      point('SOL', '2026-05-22T00:00:00.000Z', 10_000_000),
      point('SOL', '2026-05-23T00:00:00.000Z', 19_000_000),
    ])

    expect(findings).toHaveLength(0)
  })

  it('suppresses assets below the minimum recent volume', () => {
    const findings = detectHyperliquidVolumeSpikes([
      point('DOGE', '2026-05-20T00:00:00.000Z', 100_000),
      point('DOGE', '2026-05-21T00:00:00.000Z', 100_000),
      point('DOGE', '2026-05-22T00:00:00.000Z', 100_000),
      point('DOGE', '2026-05-23T00:00:00.000Z', 500_000),
    ])

    expect(findings).toHaveLength(0)
  })

  it('suppresses assets with insufficient baseline points', () => {
    const findings = detectHyperliquidVolumeSpikes([
      point('BTC', '2026-05-21T00:00:00.000Z', 20_000_000),
      point('BTC', '2026-05-22T00:00:00.000Z', 20_000_000),
      point('BTC', '2026-05-23T00:00:00.000Z', 80_000_000),
    ])

    expect(findings).toHaveLength(0)
  })
})
