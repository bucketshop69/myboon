import type { PublishedOutput } from '../../publisher-types.js'
import {
  buildHyperliquidResearchBrief,
  detectHyperliquidPositionFindings,
  runHyperliquidMechanicalGate,
} from './research.js'
import type {
  HyperliquidEditorDecision,
  HyperliquidEditorDecisionKind,
  HyperliquidMarketSnapshot,
  HyperliquidPipelineResult,
  HyperliquidPositionSnapshot,
  HyperliquidResearchBrief,
  HyperliquidWatchlistEntry,
} from './types.js'

export interface HyperliquidDataClient {
  fetchWalletPositions(wallet: string, observedAt: string): Promise<HyperliquidPositionSnapshot[]>
  fetchMarketSnapshots(observedAt: string): Promise<HyperliquidMarketSnapshot[]>
}

export interface HyperliquidResearchStore {
  loadWatchlist(): Promise<HyperliquidWatchlistEntry[]>
  loadLatestPositionSnapshots(wallet: string): Promise<HyperliquidPositionSnapshot[]>
  savePositionSnapshots(snapshots: HyperliquidPositionSnapshot[]): Promise<HyperliquidPositionSnapshot[]>
  saveMarketSnapshots(snapshots: HyperliquidMarketSnapshot[]): Promise<HyperliquidMarketSnapshot[]>
  fetchRecentStoryKeys(since: string): Promise<Set<string>>
  insertResearchFinding(input: {
    finding: unknown
    brief: HyperliquidResearchBrief
    decision: HyperliquidEditorDecision
  }): Promise<{ id: string }>
  insertNarrative(input: {
    brief: HyperliquidResearchBrief
    decision: HyperliquidEditorDecision
    output: PublishedOutput
    findingId: string
  }): Promise<{ id: string }>
  insertPublishedNarrative(input: {
    narrativeId: string
    brief: HyperliquidResearchBrief
    decision: HyperliquidEditorDecision
    output: PublishedOutput
    findingId: string
    threadId: string | null
  }): Promise<void>
  findExistingThread(storyKey: string): Promise<string | null>
}

export interface HyperliquidEditor {
  review(brief: HyperliquidResearchBrief): Promise<HyperliquidEditorDecision>
}

export interface HyperliquidWriter {
  write(brief: HyperliquidResearchBrief, decision: HyperliquidEditorDecision): Promise<PublishedOutput>
}

export interface HyperliquidPipelineOptions {
  now: string
  minPositionUsd?: number
  minChangeUsd?: number
  minChangePct?: number
  duplicateWindowHours?: number
  maxPublications?: number
}

const DEFAULT_MIN_POSITION_USD = 100_000
const DEFAULT_MIN_CHANGE_USD = 50_000
const DEFAULT_MIN_CHANGE_PCT = 0.3
const DEFAULT_DUPLICATE_WINDOW_HOURS = 6
const DEFAULT_MAX_PUBLICATIONS = 3

function marketByAsset(markets: HyperliquidMarketSnapshot[]): Map<string, HyperliquidMarketSnapshot> {
  return new Map(markets.map((market) => [market.asset, market]))
}

function countDecision(decisions: Record<HyperliquidEditorDecisionKind, number>, decision: HyperliquidEditorDecisionKind): void {
  decisions[decision] = (decisions[decision] ?? 0) + 1
}

function shouldPublish(decision: HyperliquidEditorDecision): boolean {
  return decision.decision === 'publish' || decision.decision === 'update'
}

export async function runHyperliquidResearchPipeline(
  store: HyperliquidResearchStore,
  client: HyperliquidDataClient,
  editor: HyperliquidEditor,
  writer: HyperliquidWriter,
  partialOptions: HyperliquidPipelineOptions
): Promise<HyperliquidPipelineResult> {
  const options = {
    minPositionUsd: DEFAULT_MIN_POSITION_USD,
    minChangeUsd: DEFAULT_MIN_CHANGE_USD,
    minChangePct: DEFAULT_MIN_CHANGE_PCT,
    duplicateWindowHours: DEFAULT_DUPLICATE_WINDOW_HOURS,
    maxPublications: DEFAULT_MAX_PUBLICATIONS,
    ...partialOptions,
  }
  const duplicateSince = new Date(new Date(options.now).getTime() - options.duplicateWindowHours * 3_600_000).toISOString()
  const duplicateStoryKeys = await store.fetchRecentStoryKeys(duplicateSince)
  const watchlist = (await store.loadWatchlist()).filter((entry) => entry.active)
  const markets = await store.saveMarketSnapshots(await client.fetchMarketSnapshots(options.now))
  const marketsByAsset = marketByAsset(markets)
  const decisions: Record<HyperliquidEditorDecisionKind, number> = {
    publish: 0,
    update: 0,
    hold: 0,
    ignore: 0,
  }
  const published: HyperliquidPipelineResult['published'] = []
  const held: HyperliquidPipelineResult['held'] = []
  let snapshotsSaved = 0
  let findings = 0
  let briefs = 0

  for (const watch of watchlist) {
    const previous = await store.loadLatestPositionSnapshots(watch.wallet)
    const current = await store.savePositionSnapshots(await client.fetchWalletPositions(watch.wallet, options.now))
    snapshotsSaved += current.length

    if (previous.length === 0) {
      continue
    }

    const detected = detectHyperliquidPositionFindings(watch, previous, current, marketsByAsset, {
      now: options.now,
      minPositionUsd: options.minPositionUsd,
      minChangeUsd: options.minChangeUsd,
      minChangePct: options.minChangePct,
      duplicateStoryKeys,
    })
    findings += detected.length

    for (const finding of detected) {
      const brief = buildHyperliquidResearchBrief(finding, options.now)
      briefs += 1
      const gate = runHyperliquidMechanicalGate(brief, {
        now: options.now,
        minPositionUsd: options.minPositionUsd,
        minChangeUsd: options.minChangeUsd,
        minChangePct: options.minChangePct,
        duplicateStoryKeys,
      })

      if (!gate.passed) {
        const decision: HyperliquidEditorDecision = {
          decision: 'hold',
          priority: 2,
          reason: gate.reasons.join('; '),
          surface: 'none',
        }
        countDecision(decisions, decision.decision)
        await store.insertResearchFinding({ finding, brief, decision })
        held.push({ briefId: brief.id, storyKey: brief.storyKey, decision: decision.decision, reason: decision.reason })
        continue
      }

      const decision = await editor.review(brief)
      countDecision(decisions, decision.decision)
      const findingRow = await store.insertResearchFinding({ finding, brief, decision })

      if (!shouldPublish(decision)) {
        held.push({ briefId: brief.id, storyKey: brief.storyKey, decision: decision.decision, reason: decision.reason })
        continue
      }

      if (published.length >= options.maxPublications) {
        held.push({
          briefId: brief.id,
          storyKey: brief.storyKey,
          decision: 'hold',
          reason: `Max publications per run reached (${options.maxPublications}).`,
        })
        continue
      }

      const output = await writer.write(brief, decision)
      const threadId = decision.decision === 'update' ? await store.findExistingThread(brief.storyKey) : null
      const narrative = await store.insertNarrative({ brief, decision, output, findingId: findingRow.id })
      await store.insertPublishedNarrative({
        narrativeId: narrative.id,
        brief,
        decision,
        output,
        findingId: findingRow.id,
        threadId,
      })
      duplicateStoryKeys.add(brief.storyKey)
      published.push({
        narrativeId: narrative.id,
        storyKey: brief.storyKey,
        contentSmall: output.content_small,
      })
    }
  }

  return {
    watchlistCount: watchlist.length,
    snapshotsSaved,
    findings,
    briefs,
    decisions,
    published,
    held,
  }
}
