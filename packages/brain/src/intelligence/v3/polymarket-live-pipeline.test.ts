import { describe, expect, it } from 'vitest'
import type { PublishedOutput } from '../../publisher-types.js'
import type { PacketWriterInput } from './packet-writer.js'
import {
  runFreshPolymarketV3Pipeline,
  type ExistingStoryState,
  type NarrativeInsertRow,
  type PolymarketV3LiveStore,
  type PolymarketV3Signal,
  type PolymarketV3Writer,
  type PublishedInsertRow,
} from './polymarket-live-pipeline.js'
import type { PolymarketOddsSnapshotSeed } from './wallet-repeat-research.js'

const now = '2026-05-23T12:00:00.000Z'

function whale(id: string, observedAt: string, amount: number): PolymarketV3Signal {
  return {
    id,
    source: 'POLYMARKET',
    type: 'WHALE_BET',
    topic: 'Will BTC hit $150k by June 30, 2026?',
    slug: 'will-btc-hit-150k-by-june-30-2026',
    weight: 8,
    created_at: observedAt,
    processed: false,
    metadata: {
      user: '0xabc',
      amount,
      side: 'BUY',
      outcome: 'YES',
      marketId: 'condition-1',
      slug: 'will-btc-hit-150k-by-june-30-2026',
      activityTimestamp: observedAt,
      tradePrice: 0.42,
      marketOddsAtBet: 0.42,
    },
  }
}

function odds(id: string, observedAt: string): PolymarketV3Signal {
  return {
    id,
    source: 'POLYMARKET',
    type: 'ODDS_SHIFT',
    topic: 'Will BTC hit $150k by June 30, 2026?',
    slug: 'will-btc-hit-150k-by-june-30-2026',
    weight: 8,
    created_at: observedAt,
    processed: false,
    metadata: {
      slug: 'will-btc-hit-150k-by-june-30-2026',
      marketId: 'condition-1',
      shift_from: 0.4,
      shift_to: 0.45,
      yes_price: 0.45,
    },
  }
}

class FakeStore implements PolymarketV3LiveStore {
  narratives: NarrativeInsertRow[] = []
  published: PublishedInsertRow[] = []
  processed: string[] = []

  constructor(
    private readonly signals: PolymarketV3Signal[],
    private readonly existingStories: Record<string, ExistingStoryState> = {},
    private readonly currentSnapshots: PolymarketOddsSnapshotSeed[] = []
  ) {}

  async fetchFreshSignals(): Promise<PolymarketV3Signal[]> {
    return this.signals
  }

  async fetchCurrentMarketSnapshots(): Promise<PolymarketOddsSnapshotSeed[]> {
    return this.currentSnapshots
  }

  async fetchExistingStories(): Promise<Record<string, ExistingStoryState>> {
    return this.existingStories
  }

  async insertNarrative(row: NarrativeInsertRow): Promise<{ id: string }> {
    this.narratives.push(row)
    return { id: `narrative-${this.narratives.length}` }
  }

  async insertPublishedNarrative(row: PublishedInsertRow): Promise<void> {
    this.published.push(row)
  }

  async markSignalsProcessed(ids: string[]): Promise<void> {
    this.processed.push(...ids)
  }
}

class FakeWriter implements PolymarketV3Writer {
  inputs: PacketWriterInput[] = []

  async write(input: PacketWriterInput): Promise<PublishedOutput> {
    this.inputs.push(input)
    return {
      content_small: '0xabc repeated the same BTC side.\nReceipts are fresh.',
      content_full: 'The packet shows repeat same-side Polymarket activity with current market context.',
      reasoning: 'Receipt-backed repeat wallet action passed V3 editorial checks.',
      tags: ['polymarket', 'btc'],
      priority: input.decision.priority,
      publisher_score: 8,
      actions: input.allowedActions,
      content_type: 'signal',
    }
  }
}

describe('runFreshPolymarketV3Pipeline', () => {
  it('turns fresh Polymarket signals into a published feed row', async () => {
    const store = new FakeStore([
      whale('w1', '2026-05-23T11:40:00.000Z', 1000),
      whale('w2', '2026-05-23T11:55:00.000Z', 1500),
      odds('o1', '2026-05-23T11:56:00.000Z'),
    ])
    const writer = new FakeWriter()

    const result = await runFreshPolymarketV3Pipeline(store, writer, {
      now,
      markProcessed: true,
    })

    expect(result.fetchedSignals).toBe(3)
    expect(result.packets).toBe(1)
    expect(result.decisions.publish).toBe(1)
    expect(result.published).toHaveLength(1)
    expect(writer.inputs).toHaveLength(1)
    expect(store.narratives).toHaveLength(1)
    expect(store.published).toHaveLength(1)
    expect(store.published[0].narrative_id).toBe('narrative-1')
    expect(store.published[0].story_key).toBe('polymarket:wallet-repeat:0xabc:condition-1:yes:up')
    expect(store.published[0].actions).toEqual([
      { type: 'predict', slug: 'will-btc-hit-150k-by-june-30-2026' },
    ])
    expect(store.processed.sort()).toEqual(['o1', 'w1', 'w2'])
  })

  it('publishes material changes as thread updates when a story already exists', async () => {
    const storyKey = 'polymarket:wallet-repeat:0xabc:condition-1:yes:up'
    const store = new FakeStore(
      [
        whale('w1', '2026-05-23T11:20:00.000Z', 1000),
        whale('w2', '2026-05-23T11:50:00.000Z', 1500),
        odds('o1', '2026-05-23T11:56:00.000Z'),
      ],
      {
        [storyKey]: {
          storyKey,
          threadId: 'published-thread-1',
          coveredThrough: '2026-05-23T11:30:00.000Z',
        },
      }
    )
    const writer = new FakeWriter()

    const result = await runFreshPolymarketV3Pipeline(store, writer, {
      now,
      markProcessed: false,
    })

    expect(result.decisions.update).toBe(1)
    expect(result.published).toHaveLength(1)
    expect(writer.inputs[0].decision.decision).toBe('update')
    expect(store.published[0].thread_id).toBe('published-thread-1')
    expect(store.processed).toHaveLength(0)
  })

  it('holds packets that do not have odds or market context', async () => {
    const store = new FakeStore([
      whale('w1', '2026-05-23T11:40:00.000Z', 1000),
      whale('w2', '2026-05-23T11:55:00.000Z', 1500),
    ])
    const writer = new FakeWriter()

    const result = await runFreshPolymarketV3Pipeline(store, writer, { now })

    expect(result.decisions.hold).toBe(1)
    expect(result.published).toHaveLength(0)
    expect(result.held[0].reason).toMatch(/missing market or odds context/i)
    expect(writer.inputs).toHaveLength(0)
    expect(store.published).toHaveLength(0)
  })
})
