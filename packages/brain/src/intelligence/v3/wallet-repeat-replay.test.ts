import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LegacyOddsShiftSignal } from '../polymarket-backtest.js'
import type { LegacyWhaleBetSignal } from '../polymarket-whale-backtest.js'
import {
  legacyOddsToWalletRepeatSnapshots,
  runPolymarketWalletRepeatReplay,
  writeWalletRepeatReplayArtifact,
  type WalletRepeatReplayArtifact,
} from './wallet-repeat-replay.js'

const now = '2026-05-23T12:00:00.000Z'

function whale(id: string, overrides: Partial<LegacyWhaleBetSignal> = {}): LegacyWhaleBetSignal {
  const { metadata: metadataOverrides, ...rowOverrides } = overrides
  return {
    id,
    topic: 'Will X happen?',
    slug: 'will-x-happen',
    created_at: '2026-05-23T08:00:05.000Z',
    ...rowOverrides,
    metadata: {
      user: '0xabc',
      side: 'BUY',
      outcome: 'YES',
      amount: 1200,
      tradePrice: 0.29,
      activityTimestamp: '2026-05-23T08:00:00.000Z',
      ...(metadataOverrides ?? {}),
    },
  }
}

function odds(id: string, overrides: Partial<LegacyOddsShiftSignal> = {}): LegacyOddsShiftSignal {
  const { metadata: metadataOverrides, ...rowOverrides } = overrides
  return {
    id,
    topic: 'Will X happen?',
    slug: 'will-x-happen',
    created_at: '2026-05-23T08:00:00.000Z',
    ...rowOverrides,
    metadata: {
      slug: 'will-x-happen',
      shift_to: 0.3,
      ...(metadataOverrides ?? {}),
    },
  }
}

describe('feed v3 wallet-repeat replay', () => {
  it('converts legacy odds rows into replay snapshots', () => {
    const snapshots = legacyOddsToWalletRepeatSnapshots([
      odds('odds-2', { created_at: '2026-05-23T09:00:00.000Z', metadata: { shift_to: 0.34, slug: 'will-x-happen' } }),
      odds('odds-1', { created_at: '2026-05-23T08:00:00.000Z', metadata: { shift_to: 0.29, slug: 'will-x-happen' } }),
      odds('bad', { slug: null, metadata: { shift_to: 0.4, slug: '' } }),
    ])

    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(['odds-1', 'odds-2'])
    expect(snapshots[0]).toMatchObject({
      slug: 'will-x-happen',
      price: 0.29,
      rawRef: 'legacy-signal:odds-1',
    })
  })

  it('runs deterministic shadow replay from legacy rows without writer output', () => {
    const whales = [
      whale('trade-1'),
      whale('trade-2', {
        created_at: '2026-05-23T09:00:05.000Z',
        metadata: {
          amount: 1800,
          tradePrice: 0.31,
          activityTimestamp: '2026-05-23T09:00:00.000Z',
        },
      }),
    ]
    const oddsRows = [
      odds('odds-1', { created_at: '2026-05-23T09:00:00.000Z', metadata: { shift_to: 0.31, slug: 'will-x-happen' } }),
      odds('odds-2', { created_at: '2026-05-23T10:00:00.000Z', metadata: { shift_to: 0.36, slug: 'will-x-happen' } }),
    ]

    const first = runPolymarketWalletRepeatReplay(whales, oddsRows, { now, requestedWindowDays: 1 })
    const second = runPolymarketWalletRepeatReplay(whales, oddsRows, { now, requestedWindowDays: 1 })

    expect(first.shadowMode).toBe(true)
    expect(first.deterministicReplayKey).toBe(second.deterministicReplayKey)
    expect(first.summary.id).toBe(second.summary.id)
    expect(first.packets).toHaveLength(1)
    expect(first.decisions[0].decision).toBe('publish')
    expect(first.decisionCounts.publish).toBe(1)
    expect(first.selected).toHaveLength(1)
    expect(first.selected[0].result).toBe('hit')
    expect(first.summary.hitRate).toBe(1)
  })

  it('builds historical packets as of latest trade instead of run clock', () => {
    const result = runPolymarketWalletRepeatReplay([
      whale('trade-1', {
        created_at: '2026-05-01T08:00:05.000Z',
        metadata: {
          amount: 1200,
          tradePrice: 0.29,
          activityTimestamp: '2026-05-01T08:00:00.000Z',
        },
      }),
      whale('trade-2', {
        created_at: '2026-05-01T09:00:05.000Z',
        metadata: {
          amount: 1800,
          tradePrice: 0.31,
          activityTimestamp: '2026-05-01T09:00:00.000Z',
        },
      }),
    ], [
      odds('odds-1', { created_at: '2026-05-01T09:00:00.000Z', metadata: { shift_to: 0.31, slug: 'will-x-happen' } }),
      odds('odds-2', { created_at: '2026-05-01T10:00:00.000Z', metadata: { shift_to: 0.36, slug: 'will-x-happen' } }),
    ], { now })

    expect(result.packets[0].createdAt).toBe('2026-05-01T09:00:00.000Z')
    expect(result.decisions[0].decision).toBe('publish')
    expect(result.decisionCounts.suppress).toBe(0)
  })

  it('does not leak future odds into packet facts while using them for outcome scoring', () => {
    const result = runPolymarketWalletRepeatReplay([
      whale('trade-1'),
      whale('trade-2', {
        created_at: '2026-05-23T09:00:05.000Z',
        metadata: {
          amount: 1800,
          tradePrice: 0.31,
          activityTimestamp: '2026-05-23T09:00:00.000Z',
        },
      }),
    ], [
      odds('odds-1', { created_at: '2026-05-23T09:00:00.000Z', metadata: { shift_to: 0.31, slug: 'will-x-happen' } }),
      odds('odds-2', { created_at: '2026-05-23T10:00:00.000Z', metadata: { shift_to: 0.36, slug: 'will-x-happen' } }),
    ], { now })

    const packetValues = result.packets[0].facts.map((fact) => fact.values)

    expect(packetValues).toContainEqual(expect.objectContaining({ yesPrice: 0.31 }))
    expect(packetValues).not.toContainEqual(expect.objectContaining({ yesPrice: 0.36 }))
    expect(packetValues).not.toContainEqual(expect.objectContaining({ toPrice: 0.36 }))
    expect(result.selected[0].result).toBe('hit')
    expect(result.selected[0].measuredValues.matchedPrice).toBe(0.36)
  })

  it('reports holds for missing odds context in shadow mode', () => {
    const result = runPolymarketWalletRepeatReplay([
      whale('trade-1'),
      whale('trade-2', {
        created_at: '2026-05-23T09:00:05.000Z',
        metadata: {
          amount: 1800,
          tradePrice: 0.31,
          activityTimestamp: '2026-05-23T09:00:00.000Z',
        },
      }),
    ], [], { now })

    expect(result.packets).toHaveLength(1)
    expect(result.decisionCounts.hold).toBe(1)
    expect(result.decisions[0].reason).toBe('Wallet-repeat story is missing market or odds context.')
    expect(result.selected).toEqual([])
  })

  it('reports misses when odds do not follow through', () => {
    const result = runPolymarketWalletRepeatReplay([
      whale('trade-1'),
      whale('trade-2', {
        created_at: '2026-05-23T09:00:05.000Z',
        metadata: {
          amount: 1800,
          tradePrice: 0.31,
          activityTimestamp: '2026-05-23T09:00:00.000Z',
        },
      }),
    ], [
      odds('odds-1', { created_at: '2026-05-23T09:00:00.000Z', metadata: { shift_to: 0.31, slug: 'will-x-happen' } }),
      odds('odds-2', { created_at: '2026-05-23T10:00:00.000Z', metadata: { shift_to: 0.32, slug: 'will-x-happen' } }),
    ], { now })

    expect(result.decisions[0].decision).toBe('publish')
    expect(result.selected[0].result).toBe('miss')
    expect(result.summary.hitRate).toBe(0)
    expect(result.examples.misses).toHaveLength(1)
  })

  it('reports inconclusive packets when no follow-through odds point exists', () => {
    const result = runPolymarketWalletRepeatReplay([
      whale('trade-1'),
      whale('trade-2', {
        created_at: '2026-05-23T09:00:05.000Z',
        metadata: {
          amount: 1800,
          tradePrice: 0.31,
          activityTimestamp: '2026-05-23T09:00:00.000Z',
        },
      }),
    ], [
      odds('odds-1', { created_at: '2026-05-23T09:00:00.000Z', metadata: { shift_to: 0.31, slug: 'will-x-happen' } }),
    ], { now })

    expect(result.decisions[0].decision).toBe('publish')
    expect(result.summary.candidateCount).toBe(0)
    expect(result.selected).toEqual([])
    expect(result.packets).toHaveLength(1)
  })

  it('supports NO-side replay direction', () => {
    const result = runPolymarketWalletRepeatReplay([
      whale('trade-1', { metadata: { outcome: 'NO', side: 'BUY', amount: 1200, tradePrice: 0.7, activityTimestamp: '2026-05-23T08:00:00.000Z' } }),
      whale('trade-2', {
        created_at: '2026-05-23T09:00:05.000Z',
        metadata: { outcome: 'NO', side: 'BUY', amount: 1800, tradePrice: 0.72, activityTimestamp: '2026-05-23T09:00:00.000Z' },
      }),
    ], [
      odds('odds-1', { created_at: '2026-05-23T09:00:00.000Z', metadata: { shift_to: 0.31, slug: 'will-x-happen' } }),
      odds('odds-2', { created_at: '2026-05-23T10:00:00.000Z', metadata: { shift_to: 0.27, slug: 'will-x-happen' } }),
    ], { now })

    expect(result.packets[0].storyKey).toBe('polymarket:wallet-repeat:0xabc:will-x-happen:no:down')
    expect(result.selected[0].result).toBe('hit')
  })

  it('writes a shadow replay artifact with packets and examples', async () => {
    const result = runPolymarketWalletRepeatReplay([
      whale('trade-1'),
      whale('trade-2', {
        created_at: '2026-05-23T09:00:05.000Z',
        metadata: {
          amount: 1800,
          tradePrice: 0.31,
          activityTimestamp: '2026-05-23T09:00:00.000Z',
        },
      }),
    ], [
      odds('odds-1', { created_at: '2026-05-23T09:00:00.000Z', metadata: { shift_to: 0.31, slug: 'will-x-happen' } }),
      odds('odds-2', { created_at: '2026-05-23T10:00:00.000Z', metadata: { shift_to: 0.36, slug: 'will-x-happen' } }),
    ], { now })
    const dir = await mkdtemp(path.join(tmpdir(), 'myboon-wallet-repeat-'))
    const outputPath = path.join(dir, 'shadow.json')

    const written = await writeWalletRepeatReplayArtifact({
      params: { rows: 2 },
      ...result,
    }, outputPath)
    const parsed = JSON.parse(await readFile(written, 'utf8')) as WalletRepeatReplayArtifact

    expect(parsed.shadowMode).toBe(true)
    expect(parsed.packets).toHaveLength(1)
    expect(parsed.examples.packets[0].storyKey).toBe('polymarket:wallet-repeat:0xabc:will-x-happen:yes:up')
  })
})
