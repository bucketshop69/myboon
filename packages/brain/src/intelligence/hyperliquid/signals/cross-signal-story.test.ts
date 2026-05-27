import { describe, expect, it } from 'vitest'
import {
  combineHyperliquidCrossSignalStories,
  type HyperliquidNormalizedSignalFinding,
} from './cross-signal-story.js'

const now = '2026-05-26T12:00:00.000Z'
const windowStart = '2026-05-19T12:00:00.000Z'
const windowEnd = now

function finding(input: Partial<HyperliquidNormalizedSignalFinding> & {
  id: string
  signalType: HyperliquidNormalizedSignalFinding['signalType']
  asset?: string
  strength: number
  summary?: string
}): HyperliquidNormalizedSignalFinding {
  return {
    asset: input.asset ?? 'ETH',
    observedAt: input.observedAt ?? '2026-05-25T12:00:00.000Z',
    bias: input.bias ?? 'bullish',
    summary: input.summary ?? `${input.signalType} strengthened on Hyperliquid.`,
    ...input,
  }
}

describe('combineHyperliquidCrossSignalStories', () => {
  it('combines multiple independent signals into one asset story row', () => {
    const stories = combineHyperliquidCrossSignalStories([
      finding({
        id: 'wallet-1',
        signalType: 'wallet',
        strength: 6.2,
        summary: 'Watched wallets added ETH long exposure.',
        evidenceRefs: [{
          source: 'hyperliquid',
          sourceId: 'wallet-1',
          capturedAt: now,
          rawRef: 'wallet-position:wallet-1',
        }],
      }),
      finding({
        id: 'funding-1',
        signalType: 'funding',
        strength: 5.8,
        summary: 'Funding stayed positive while price held up.',
      }),
      finding({
        id: 'oi-1',
        signalType: 'open_interest',
        strength: 5.5,
        summary: 'Open interest rose into the move.',
      }),
      finding({
        id: 'btc-weak',
        asset: 'BTC',
        signalType: 'volume',
        strength: 4,
        summary: 'BTC volume was mildly higher.',
      }),
    ], { now, windowStart, windowEnd })

    expect(stories).toHaveLength(1)
    expect(stories[0]).toMatchObject({
      asset: 'ETH',
      signalCount: 3,
      storyKey: 'hyperliquid:cross-signal:eth:2026-05-19:2026-05-26',
    })
    expect(stories[0].signalTypes).toEqual(expect.arrayContaining(['wallet', 'funding', 'open_interest']))
    expect(stories[0].score).toBeGreaterThanOrEqual(6.5)
    expect(stories[0].publishedNarrativeRow).toMatchObject({
      content_type: 'crypto',
      actions: [{ type: 'perps', asset: 'ETH' }],
      thread_id: null,
      story_key: stories[0].storyKey,
    })
    expect(stories[0].publishedNarrativeRow.content_small).toContain('ETH')
    expect(stories[0].publishedNarrativeRow.reasoning).toContain('Multi-signal threshold')
    expect(stories[0].publishedNarrativeRow.evidence_refs).toHaveLength(3)
  })

  it('suppresses weak single-signal stories', () => {
    const stories = combineHyperliquidCrossSignalStories([
      finding({
        id: 'volume-1',
        asset: 'SOL',
        signalType: 'volume',
        strength: 7,
        summary: 'SOL volume improved, but no other signal confirmed it.',
      }),
    ], { now, windowStart, windowEnd })

    expect(stories).toHaveLength(0)
  })

  it('allows a very strong single-signal story', () => {
    const stories = combineHyperliquidCrossSignalStories([
      finding({
        id: 'wallet-strong',
        asset: 'BTC',
        signalType: 'wallet',
        strength: 8.4,
        bias: 'bearish',
        summary: 'A watched wallet opened an unusually large BTC short.',
      }),
    ], { now, windowStart, windowEnd })

    expect(stories).toHaveLength(1)
    expect(stories[0]).toMatchObject({
      asset: 'BTC',
      signalCount: 1,
      signalTypes: ['wallet'],
      bias: 'bearish',
    })
    expect(stories[0].score).toBeGreaterThanOrEqual(8.5)
    expect(stories[0].publishedNarrativeRow.reasoning).toContain('Single-signal threshold')
    expect(stories[0].publishedNarrativeRow.tags).toContain('hl-wallet')
  })
})
