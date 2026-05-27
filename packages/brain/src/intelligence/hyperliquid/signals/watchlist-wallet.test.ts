import { describe, expect, it } from 'vitest'
import {
  detectWatchlistWalletSignals,
  normalizeWatchlistWalletBriefs,
} from './watchlist-wallet.js'
import type {
  HyperliquidPositionSnapshot,
  HyperliquidResearchBrief,
  HyperliquidWatchlistEntry,
} from '../types.js'

const now = '2026-05-26T12:00:00.000Z'
const wallet = '0xabc'

const watch: HyperliquidWatchlistEntry = {
  wallet,
  label: 'Watched Wallet',
  reason: 'Known sharp Hyperliquid trader',
  minPositionUsd: 100_000,
  active: true,
}

function position(input: {
  asset?: string
  side: 'long' | 'short'
  notionalUsd: number
  observedAt?: string
  id?: string
}): HyperliquidPositionSnapshot {
  return {
    id: input.id,
    wallet,
    asset: input.asset ?? 'ETH',
    side: input.side,
    size: 1,
    notionalUsd: input.notionalUsd,
    entryPrice: 3000,
    markPrice: 3000,
    leverage: 5,
    unrealizedPnlUsd: null,
    marginUsedUsd: null,
    observedAt: input.observedAt ?? now,
    raw: {},
  }
}

function options(overrides: Partial<Parameters<typeof detectWatchlistWalletSignals>[4]> = {}) {
  return {
    now,
    minPositionUsd: 100_000,
    minChangeUsd: 50_000,
    minChangePct: 0.25,
    ...overrides,
  }
}

function brief(input: {
  id: string
  finding: HyperliquidResearchBrief['finding']
  beforeUsd: number
  afterUsd: number
  storyKey?: string
}): HyperliquidResearchBrief {
  const storyKey = input.storyKey ?? 'hyperliquid:wallet-position:0xabc:eth'
  return {
    id: input.id,
    type: 'wallet_position_change',
    asset: 'ETH',
    wallet,
    walletLabel: 'Watched Wallet',
    finding: input.finding,
    before: {
      side: input.beforeUsd > 0 ? 'long' : null,
      notionalUsd: input.beforeUsd,
      entryPrice: input.beforeUsd > 0 ? 3000 : null,
      unrealizedPnlUsd: null,
    },
    after: {
      side: input.afterUsd > 0 ? 'long' : null,
      notionalUsd: input.afterUsd,
      entryPrice: input.afterUsd > 0 ? 3000 : null,
      unrealizedPnlUsd: null,
    },
    marketContext: {
      fundingRate: null,
      openInterestUsd: null,
      markPrice: null,
      volume24hUsd: null,
    },
    timeWindow: '5 min',
    receipts: [{
      source: 'hyperliquid',
      sourceId: input.id,
      capturedAt: now,
      rawRef: 'hyperliquid_position_snapshots',
    }],
    whyItMayMatter: 'The wallet increased meaningful exposure.',
    uncertainty: ['The wallet may be hedged elsewhere.'],
    suggestedAngle: 'ETH long double-down',
    dedupeKey: `${storyKey}:${input.finding}`,
    storyKey,
    priorityHint: 6,
    createdAt: now,
  }
}

describe('watchlist wallet signals', () => {
  it('maps opened, added, and flipped wallet findings into normalized signal kinds', () => {
    const opened = detectWatchlistWalletSignals(
      watch,
      [],
      [position({ side: 'long', notionalUsd: 250_000, id: 'opened' })],
      [],
      options()
    )
    const added = detectWatchlistWalletSignals(
      watch,
      [position({ side: 'long', notionalUsd: 200_000, id: 'before-add' })],
      [position({ side: 'long', notionalUsd: 400_000, id: 'after-add' })],
      [],
      options()
    )
    const flipped = detectWatchlistWalletSignals(
      watch,
      [position({ side: 'long', notionalUsd: 200_000, id: 'before-flip' })],
      [position({ side: 'short', notionalUsd: 220_000, id: 'after-flip' })],
      [],
      options()
    )

    expect(opened[0]).toMatchObject({
      kind: 'watchlist_wallet.opened',
      action: 'opened',
      direction: 'long',
      status: 'candidate',
    })
    expect(added[0]).toMatchObject({
      kind: 'watchlist_wallet.added',
      action: 'added',
      direction: 'long',
      notionalDeltaUsd: 200_000,
      status: 'candidate',
    })
    expect(flipped[0]).toMatchObject({
      kind: 'watchlist_wallet.flipped',
      action: 'flipped',
      direction: 'flipped',
      status: 'candidate',
    })
  })

  it('suppresses weak adds using the visible min change USD and percent filters', () => {
    const signals = detectWatchlistWalletSignals(
      watch,
      [position({ side: 'long', notionalUsd: 200_000, id: 'before' })],
      [position({ side: 'long', notionalUsd: 230_000, id: 'after' })],
      [],
      options()
    )

    expect(signals).toHaveLength(0)
  })

  it('suppresses duplicate wallet+asset briefs after the first candidate', () => {
    const signals = normalizeWatchlistWalletBriefs(
      [
        brief({ id: 'first', finding: 'opened', beforeUsd: 0, afterUsd: 200_000 }),
        brief({ id: 'second', finding: 'added', beforeUsd: 200_000, afterUsd: 400_000 }),
      ],
      options()
    )

    expect(signals[0].status).toBe('candidate')
    expect(signals[1].status).toBe('suppressed')
    expect(signals[1].suppressReasons).toContain('duplicate wallet+asset signal in batch')
    expect(signals[1].filters).toEqual({
      minPositionUsd: 100_000,
      minChangeUsd: 50_000,
      minChangePct: 0.25,
      dedupeBy: 'wallet_asset',
    })
  })

  it('suppresses duplicate wallet+asset story keys already covered by the caller', () => {
    const signals = normalizeWatchlistWalletBriefs(
      [brief({ id: 'duplicate', finding: 'opened', beforeUsd: 0, afterUsd: 200_000 })],
      options({ duplicateStoryKeys: new Set(['hyperliquid:wallet-position:0xabc:eth']) })
    )

    expect(signals[0].status).toBe('suppressed')
    expect(signals[0].suppressReasons).toContain('recent duplicate story')
  })
})
