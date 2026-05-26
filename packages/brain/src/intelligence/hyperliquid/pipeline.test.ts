import { describe, expect, it } from 'vitest'
import type { PublishedOutput } from '../../publisher-types.js'
import { runHyperliquidResearchPipeline, type HyperliquidDataClient, type HyperliquidEditor, type HyperliquidResearchStore, type HyperliquidWriter } from './pipeline.js'
import type { HyperliquidEditorDecision, HyperliquidMarketSnapshot, HyperliquidPositionSnapshot, HyperliquidResearchBrief, HyperliquidWatchlistEntry } from './types.js'

const now = '2026-05-26T10:00:00.000Z'

function position(input: Partial<HyperliquidPositionSnapshot> & { wallet: string; asset: string; side: 'long' | 'short'; notionalUsd: number; observedAt: string }): HyperliquidPositionSnapshot {
  return {
    wallet: input.wallet,
    asset: input.asset,
    side: input.side,
    size: input.size ?? 1,
    notionalUsd: input.notionalUsd,
    entryPrice: input.entryPrice ?? 3000,
    markPrice: input.markPrice ?? 3000,
    leverage: input.leverage ?? 5,
    unrealizedPnlUsd: input.unrealizedPnlUsd ?? null,
    marginUsedUsd: input.marginUsedUsd ?? null,
    observedAt: input.observedAt,
    raw: input.raw ?? {},
    ...(input.id ? { id: input.id } : {}),
  }
}

const market: HyperliquidMarketSnapshot = {
  asset: 'ETH',
  markPrice: 3200,
  midPrice: 3200,
  oraclePrice: 3198,
  fundingRate: 0.0002,
  openInterestUsd: 500_000_000,
  volume24hUsd: 900_000_000,
  previousDayPrice: 3150,
  observedAt: now,
  raw: {},
}

class FakeStore implements HyperliquidResearchStore {
  findings: unknown[] = []
  narratives: unknown[] = []
  published: unknown[] = []

  constructor(
    private readonly watchlist: HyperliquidWatchlistEntry[],
    private readonly previous: Record<string, HyperliquidPositionSnapshot[]>,
    private readonly duplicateStoryKeys = new Set<string>()
  ) {}

  async loadWatchlist(): Promise<HyperliquidWatchlistEntry[]> {
    return this.watchlist
  }

  async loadLatestPositionSnapshots(wallet: string): Promise<HyperliquidPositionSnapshot[]> {
    return this.previous[wallet] ?? []
  }

  async savePositionSnapshots(snapshots: HyperliquidPositionSnapshot[]): Promise<HyperliquidPositionSnapshot[]> {
    return snapshots.map((snapshot, index) => ({ ...snapshot, id: snapshot.id ?? `snapshot-${index}` }))
  }

  async saveMarketSnapshots(snapshots: HyperliquidMarketSnapshot[]): Promise<HyperliquidMarketSnapshot[]> {
    return snapshots
  }

  async fetchRecentStoryKeys(): Promise<Set<string>> {
    return this.duplicateStoryKeys
  }

  async insertResearchFinding(input: { brief: HyperliquidResearchBrief; decision: HyperliquidEditorDecision }): Promise<{ id: string }> {
    this.findings.push(input)
    return { id: `finding-${this.findings.length}` }
  }

  async insertNarrative(input: unknown): Promise<{ id: string }> {
    this.narratives.push(input)
    return { id: `narrative-${this.narratives.length}` }
  }

  async insertPublishedNarrative(input: unknown): Promise<void> {
    this.published.push(input)
  }

  async findExistingThread(): Promise<string | null> {
    return null
  }
}

class FakeClient implements HyperliquidDataClient {
  constructor(private readonly current: Record<string, HyperliquidPositionSnapshot[]>) {}

  async fetchWalletPositions(wallet: string): Promise<HyperliquidPositionSnapshot[]> {
    return this.current[wallet] ?? []
  }

  async fetchMarketSnapshots(): Promise<HyperliquidMarketSnapshot[]> {
    return [market]
  }
}

class FakeEditor implements HyperliquidEditor {
  briefs: HyperliquidResearchBrief[] = []

  async review(brief: HyperliquidResearchBrief): Promise<HyperliquidEditorDecision> {
    this.briefs.push(brief)
    return { decision: 'publish', priority: brief.priorityHint, reason: 'Interesting watched-wallet change.', surface: 'feed_card' }
  }
}

class FakeWriter implements HyperliquidWriter {
  async write(brief: HyperliquidResearchBrief, decision: HyperliquidEditorDecision): Promise<PublishedOutput> {
    return {
      content_small: `${brief.asset} ${brief.finding} by watched wallet.`,
      content_full: brief.whyItMayMatter,
      reasoning: decision.reason,
      tags: ['hyperliquid', brief.asset.toLowerCase()],
      priority: decision.priority,
      publisher_score: 8,
      actions: [{ type: 'perps', asset: brief.asset }],
      content_type: 'crypto',
    }
  }
}

describe('runHyperliquidResearchPipeline', () => {
  it('publishes a watched wallet add that passes gates', async () => {
    const wallet = '0xabc'
    const store = new FakeStore(
      [{ wallet, label: 'watched', reason: 'test', active: true, minPositionUsd: 100_000 }],
      { [wallet]: [position({ id: 'prev', wallet, asset: 'ETH', side: 'short', notionalUsd: 420_000, observedAt: '2026-05-26T09:30:00.000Z' })] }
    )
    const client = new FakeClient({
      [wallet]: [position({ id: 'curr', wallet, asset: 'ETH', side: 'short', notionalUsd: 1_600_000, observedAt: now })],
    })
    const editor = new FakeEditor()

    const result = await runHyperliquidResearchPipeline(store, client, editor, new FakeWriter(), { now })

    expect(result.watchlistCount).toBe(1)
    expect(result.findings).toBe(1)
    expect(result.decisions.publish).toBe(1)
    expect(result.published).toHaveLength(1)
    expect(editor.briefs[0].suggestedAngle).toContain('double-down')
    expect(store.published).toHaveLength(1)
  })

  it('holds duplicate recent stories before the AI editor', async () => {
    const wallet = '0xabc'
    const storyKey = 'hyperliquid:wallet-position:0xabc:eth'
    const store = new FakeStore(
      [{ wallet, label: 'watched', reason: 'test', active: true, minPositionUsd: 100_000 }],
      { [wallet]: [position({ wallet, asset: 'ETH', side: 'long', notionalUsd: 200_000, observedAt: '2026-05-26T09:30:00.000Z' })] },
      new Set([storyKey])
    )
    const client = new FakeClient({
      [wallet]: [position({ wallet, asset: 'ETH', side: 'long', notionalUsd: 500_000, observedAt: now })],
    })
    const editor = new FakeEditor()

    const result = await runHyperliquidResearchPipeline(store, client, editor, new FakeWriter(), { now })

    expect(result.decisions.hold).toBe(1)
    expect(result.published).toHaveLength(0)
    expect(result.held[0].reason).toMatch(/duplicate/i)
    expect(editor.briefs).toHaveLength(0)
  })

  it('uses the first wallet snapshot as baseline instead of publishing stale existing positions', async () => {
    const wallet = '0xabc'
    const store = new FakeStore(
      [{ wallet, label: 'watched', reason: 'test', active: true, minPositionUsd: 100_000 }],
      {}
    )
    const client = new FakeClient({
      [wallet]: [position({ wallet, asset: 'ETH', side: 'long', notionalUsd: 500_000, observedAt: now })],
    })

    const result = await runHyperliquidResearchPipeline(store, client, new FakeEditor(), new FakeWriter(), { now })

    expect(result.snapshotsSaved).toBe(1)
    expect(result.findings).toBe(0)
    expect(result.published).toHaveLength(0)
  })
})
