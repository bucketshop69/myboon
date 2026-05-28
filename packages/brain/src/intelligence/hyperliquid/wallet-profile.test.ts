import { describe, expect, it } from 'vitest'
import type { HyperliquidFill, HyperliquidLeaderboardRow } from './client.js'
import type { HyperliquidPositionSnapshot } from './types.js'
import {
  buildHyperliquidWalletQualityProfile,
  normalizeHyperliquidWalletWatchlist,
} from './wallet-profile.js'

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

function position(input: Partial<HyperliquidPositionSnapshot> & {
  wallet?: string
  asset?: string
  side: 'long' | 'short'
  notionalUsd: number
}): HyperliquidPositionSnapshot {
  return {
    wallet: input.wallet ?? '0xwallet',
    asset: input.asset ?? 'NEAR',
    side: input.side,
    size: input.size ?? 100_000,
    notionalUsd: input.notionalUsd,
    entryPrice: input.entryPrice ?? 5,
    markPrice: input.markPrice ?? 5,
    leverage: input.leverage ?? null,
    unrealizedPnlUsd: input.unrealizedPnlUsd ?? null,
    marginUsedUsd: input.marginUsedUsd ?? null,
    observedAt: input.observedAt ?? '2026-05-28T00:00:00.000Z',
    raw: input.raw ?? {},
  }
}

function leaderboard(input: Partial<HyperliquidLeaderboardRow> = {}): HyperliquidLeaderboardRow {
  return {
    wallet: input.wallet ?? '0xwallet',
    displayName: input.displayName ?? 'near-trader',
    accountValueUsd: input.accountValueUsd ?? 1_000_000,
    dayVolumeUsd: input.dayVolumeUsd ?? 300_000,
    weekVolumeUsd: input.weekVolumeUsd ?? 2_000_000,
    monthVolumeUsd: input.monthVolumeUsd ?? 5_000_000,
    allTimeVolumeUsd: input.allTimeVolumeUsd ?? 20_000_000,
    raw: input.raw ?? {},
  }
}

describe('buildHyperliquidWalletQualityProfile', () => {
  it('classifies concentrated position activity as a directional trader', () => {
    const start = Date.parse('2026-05-20T00:00:00.000Z')
    const profile = buildHyperliquidWalletQualityProfile({
      watch: {
        wallet: '0xwallet',
        label: 'manual near wallet',
        sources: ['manual'],
        reason: 'manual list',
        active: true,
      },
      fills: [
        fill({ dir: 'Open Long', time: start, sz: 100_000 }),
        fill({ dir: 'Open Long', time: start + 86_400_000, sz: 80_000 }),
        fill({ dir: 'Open Long', time: start + 2 * 86_400_000, sz: 60_000 }),
        fill({ dir: 'Close Long', time: start + 5 * 86_400_000, sz: 20_000 }),
        fill({ dir: 'Open Long', time: start + 6 * 86_400_000, sz: 20_000 }),
        fill({ dir: 'Open Long', time: start + 7 * 86_400_000, sz: 20_000 }),
        fill({ dir: 'Open Long', time: start + 8 * 86_400_000, sz: 20_000 }),
        fill({ dir: 'Open Long', time: start + 9 * 86_400_000, sz: 20_000 }),
      ],
      positions: [position({ side: 'long', notionalUsd: 1_200_000 })],
      leaderboard: leaderboard(),
      ledgerUpdates: [],
      userRole: 'user',
      now: '2026-05-28T00:00:00.000Z',
    })

    expect(profile).toMatchObject({
      classification: 'directional_trader',
      label: 'manual near wallet',
      behavior: expect.objectContaining({
        assetsTraded: 1,
        currentExposureUsd: 1_200_000,
        directionalConcentrationPct: 100,
      }),
    })
    expect(profile.reasons.join(' ')).toContain('Largest directional asset')
  })

  it('flags broad high-churn activity as possible market maker behavior', () => {
    const start = Date.parse('2026-05-20T00:00:00.000Z')
    const assets = ['BTC', 'ETH', 'SOL', 'NEAR', 'HYPE', 'DOGE', 'XRP', 'TON', 'SUI', 'ZEC']
    const fills = assets.flatMap((asset, index) => [
      fill({ coin: asset, dir: 'Open Long', time: start + index * 3_600_000, px: 10, sz: 500, crossed: false }),
      fill({ coin: asset, dir: 'Close Long', time: start + index * 3_600_000 + 600_000, px: 10.1, sz: 500, crossed: false }),
    ])

    const profile = buildHyperliquidWalletQualityProfile({
      watch: {
        wallet: '0xmaker',
        label: null,
        sources: ['leaderboard'],
        reason: 'leaderboard',
        active: true,
      },
      fills,
      positions: [],
      leaderboard: leaderboard({
        wallet: '0xmaker',
        accountValueUsd: 100_000,
        monthVolumeUsd: 10_000_000,
      }),
      ledgerUpdates: [],
      userRole: 'user',
      now: '2026-05-28T00:00:00.000Z',
    })

    expect(profile.classification).toBe('possible_market_maker')
    expect(profile.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('Traded 10 assets'),
      expect.stringContaining('Monthly volume/equity ratio'),
    ]))
  })

  it('dedupes the same wallet across manual, deposit, and leaderboard sources', () => {
    const watchlist = normalizeHyperliquidWalletWatchlist([
      { wallet: '0xABC', label: 'manual', sources: ['manual'], reason: 'manual', active: true },
      { wallet: '0xabc', label: null, sources: ['deposit'], reason: 'large deposit', active: true, minDepositUsd: 500_000 },
      { wallet: '0xAbC', label: 'leader', sources: ['leaderboard'], reason: 'leaderboard', active: true },
    ])

    expect(watchlist).toHaveLength(1)
    expect(watchlist[0]).toMatchObject({
      wallet: '0xABC',
      label: 'manual',
      sources: ['manual', 'deposit', 'leaderboard'],
      minDepositUsd: 500_000,
    })
  })
})
