import { describe, expect, it } from 'vitest'
import { runHyperliquidMonthlyShadowReplay } from './shadow-replay.js'
import type { HyperliquidFill } from './client.js'
import type { HyperliquidMarketSnapshot, HyperliquidWatchlistEntry } from './types.js'

const wallet = '0xabc'
const now = '2026-05-26T12:00:00.000Z'
const startTime = Date.parse('2026-04-26T12:00:00.000Z')
const endTime = Date.parse(now)
const warmupStartTime = Date.parse('2026-04-19T12:00:00.000Z')

function fill(input: Partial<HyperliquidFill> & { time: number; dir: string; sz: number; px: number }): HyperliquidFill {
  return {
    coin: input.coin ?? 'ETH',
    dir: input.dir,
    px: input.px,
    sz: input.sz,
    time: input.time,
    closedPnl: input.closedPnl ?? null,
    hash: input.hash ?? `hash-${input.time}`,
    oid: input.oid ?? input.time,
    raw: input.raw ?? {},
  }
}

const watchlist: HyperliquidWatchlistEntry[] = [{
  wallet,
  label: 'watched',
  reason: 'test',
  minPositionUsd: 100_000,
  active: true,
}]

const markets: HyperliquidMarketSnapshot[] = [{
  asset: 'ETH',
  markPrice: 3000,
  midPrice: 3000,
  oraclePrice: 3000,
  fundingRate: 0.0002,
  openInterestUsd: 1_000_000_000,
  volume24hUsd: 800_000_000,
  previousDayPrice: 2900,
  observedAt: now,
  raw: {},
}]

describe('runHyperliquidMonthlyShadowReplay', () => {
  it('replays fills into would-publish rows without writing to Supabase', () => {
    const artifact = runHyperliquidMonthlyShadowReplay({
      watchlist,
      fillsByWallet: {
        [wallet]: [
          fill({ time: startTime - 60_000, dir: 'Open Short', sz: 50, px: 3000 }),
          fill({ time: startTime + 60_000, dir: 'Open Short', sz: 450, px: 3100 }),
        ],
      },
      marketSnapshots: markets,
      options: {
        now,
        startTime,
        endTime,
        warmupStartTime,
        minPositionUsd: 100_000,
        minChangeUsd: 50_000,
        minChangePct: 0.3,
        maxPublications: 10,
      },
    })

    expect(artifact.kind).toBe('hyperliquid.monthly-shadow-replay')
    expect(artifact.summary.fillCount).toBe(2)
    expect(artifact.summary.wouldPublishCount).toBe(1)
    expect(artifact.wouldPublish[0].publishedNarrativeRow.story_key).toBe('hyperliquid:wallet-position:0xabc:eth')
    expect(artifact.wouldPublish[0].publishedNarrativeRow.evidence_refs.length).toBeGreaterThan(0)
  })

  it('returns a zero artifact when the watchlist is empty', () => {
    const artifact = runHyperliquidMonthlyShadowReplay({
      watchlist: [],
      fillsByWallet: {},
      marketSnapshots: markets,
      options: {
        now,
        startTime,
        endTime,
        warmupStartTime,
        minPositionUsd: 100_000,
        minChangeUsd: 50_000,
        minChangePct: 0.3,
        maxPublications: 10,
      },
    })

    expect(artifact.summary.fillCount).toBe(0)
    expect(artifact.summary.wouldPublishCount).toBe(0)
  })
})
