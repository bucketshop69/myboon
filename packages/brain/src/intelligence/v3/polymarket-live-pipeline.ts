import type { LegacyOddsShiftSignal } from '../polymarket-backtest.js'
import type { LegacyWhaleBetSignal } from '../polymarket-whale-backtest.js'
import type { PublishedOutput } from '../../publisher-types.js'
import {
  createPacketWriterInput,
  toPacketBackedPublishedRow,
  type PacketBackedPublishedRow,
  type PacketWriterInput,
} from './packet-writer.js'
import {
  buildWalletRepeatResearchPackets,
  type PolymarketOddsSnapshotSeed,
  type PolymarketWalletTradeSeed,
  type WalletRepeatResearchResult,
} from './wallet-repeat-research.js'

export type PolymarketV3Signal = (LegacyWhaleBetSignal | LegacyOddsShiftSignal) & {
  source: string
  type: string
  weight?: number | null
  processed?: boolean | null
}

export interface ExistingStoryState {
  storyKey: string
  threadId: string
  coveredThrough: string | null
}

export interface NarrativeInsertRow {
  cluster: string
  observation: string
  score: number
  signal_count: number
  signals_snapshot: unknown
  slugs: string[]
  content_type: PublishedOutput['content_type']
  status: 'published'
  schema_version: number
  success_criteria: unknown
}

export interface PublishedInsertRow extends PacketBackedPublishedRow {
  narrative_id: string
  reasoning: string
  publisher_score: number
  editor_version: number
}

export interface PolymarketV3LiveStore {
  fetchFreshSignals(params: {
    since: string
    limit: number
    includeProcessed: boolean
  }): Promise<PolymarketV3Signal[]>
  fetchCurrentMarketSnapshots(slugs: string[], now: string): Promise<PolymarketOddsSnapshotSeed[]>
  fetchExistingStories(storyKeys: string[]): Promise<Record<string, ExistingStoryState>>
  insertNarrative(row: NarrativeInsertRow): Promise<{ id: string }>
  insertPublishedNarrative(row: PublishedInsertRow): Promise<void>
  markSignalsProcessed(signalIds: string[]): Promise<void>
}

export interface PolymarketV3Writer {
  write(input: PacketWriterInput): Promise<PublishedOutput>
}

export interface PolymarketV3LiveOptions {
  now: string
  lookbackHours?: number
  limit?: number
  includeProcessed?: boolean
  markProcessed?: boolean
  maxPublications?: number
  staleAfterHours?: number
}

export interface PolymarketV3LiveRunResult {
  fetchedSignals: number
  whaleSignals: number
  oddsSignals: number
  packets: number
  decisions: Record<string, number>
  published: Array<{
    narrativeId: string
    packetId: string
    storyKey: string
    contentSmall: string
  }>
  processedSignalIds: string[]
  held: Array<{
    packetId: string
    storyKey: string
    decision: string
    reason: string
  }>
}

const DEFAULT_LOOKBACK_HOURS = 24
const DEFAULT_LIMIT = 500
const DEFAULT_MAX_PUBLICATIONS = 3
const V3_EDITOR_VERSION = 3

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePrice(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 && parsed <= 1 ? parsed : null
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isWhaleSignal(signal: PolymarketV3Signal): signal is LegacyWhaleBetSignal & PolymarketV3Signal {
  return signal.source === 'POLYMARKET' && signal.type === 'WHALE_BET'
}

function isOddsSignal(signal: PolymarketV3Signal): signal is LegacyOddsShiftSignal & PolymarketV3Signal {
  return signal.source === 'POLYMARKET' && signal.type === 'ODDS_SHIFT'
}

export function polymarketSignalsToWalletTrades(signals: PolymarketV3Signal[]): PolymarketWalletTradeSeed[] {
  return signals
    .filter(isWhaleSignal)
    .map((signal): PolymarketWalletTradeSeed | null => {
      const wallet = normalizeText(signal.metadata?.user)
      const slug = normalizeText(signal.slug) ?? normalizeText(signal.metadata?.slug)
      const marketId = normalizeText(signal.metadata?.marketId)
      const outcome = normalizeText(signal.metadata?.outcome)
      const side = normalizeText(signal.metadata?.side)
      const amountUsd = numberOrNull(signal.metadata?.amount)
      const observedAt = normalizeText(signal.metadata?.activityTimestamp) ?? signal.created_at

      if (!wallet || !outcome || !side || amountUsd == null || amountUsd <= 0) return null

      return {
        id: signal.id,
        wallet,
        slug,
        marketId,
        marketTitle: normalizeText(signal.topic),
        outcome,
        side,
        amountUsd,
        price: normalizePrice(signal.metadata?.tradePrice),
        marketOddsAtTrade: normalizePrice(signal.metadata?.marketOddsAtBet),
        observedAt,
        capturedAt: signal.created_at,
        rawRef: `signal:${signal.id}`,
      }
    })
    .filter((trade): trade is PolymarketWalletTradeSeed => trade != null)
}

export function polymarketSignalsToOddsSnapshots(signals: PolymarketV3Signal[]): PolymarketOddsSnapshotSeed[] {
  const snapshots: PolymarketOddsSnapshotSeed[] = []

  for (const signal of signals.filter(isOddsSignal)) {
    const slug = normalizeText(signal.slug) ?? normalizeText(signal.metadata?.slug)
    const from = normalizePrice(signal.metadata?.shift_from)
    const to = normalizePrice(signal.metadata?.shift_to ?? signal.metadata?.yes_price)
    if (!slug || from == null || to == null) continue

    const observedMs = new Date(signal.created_at).getTime()
    const fromObservedAt = Number.isFinite(observedMs)
      ? new Date(Math.max(0, observedMs - 1000)).toISOString()
      : signal.created_at

    snapshots.push({
      id: `${signal.id}:from`,
      slug,
      price: from,
      observedAt: fromObservedAt,
      capturedAt: signal.created_at,
      rawRef: `signal:${signal.id}`,
    })
    snapshots.push({
      id: `${signal.id}:to`,
      slug,
      price: to,
      observedAt: signal.created_at,
      capturedAt: signal.created_at,
      rawRef: `signal:${signal.id}`,
    })
  }

  return snapshots
}

function countDecision(decisions: Record<string, number>, decision: string): void {
  decisions[decision] = (decisions[decision] ?? 0) + 1
}

function scoreFromPacket(result: WalletRepeatResearchResult): number {
  return Math.max(7, Math.min(10, Math.round(result.packet.materiality.score * 4 + result.decision.priority)))
}

function packetSlugs(result: WalletRepeatResearchResult): string[] {
  return result.packet.recommendedActions
    .flatMap((action) => action.type === 'predict' && typeof action.slug === 'string' ? [action.slug] : [])
}

function buildNarrativeRow(
  result: WalletRepeatResearchResult,
  output: PublishedOutput,
  sourceSignals: PolymarketV3Signal[]
): NarrativeInsertRow {
  return {
    cluster: result.packet.headlineClaim,
    observation: [
      result.packet.thesis,
      result.packet.whyNow,
      result.packet.whatChanged,
      `Editorial decision: ${result.decision.decision} because ${result.decision.reason}`,
    ].join(' '),
    score: scoreFromPacket(result),
    signal_count: result.packet.facts.length,
    signals_snapshot: {
      packet: result.packet,
      decision: result.decision,
      source_signal_ids: sourceSignals.map((signal) => signal.id),
    },
    slugs: packetSlugs(result),
    content_type: output.content_type,
    status: 'published',
    schema_version: result.packet.schemaVersion,
    success_criteria: result.packet.successCriteria,
  }
}

function signalIdsForPacket(result: WalletRepeatResearchResult, sourceSignals: PolymarketV3Signal[]): string[] {
  const available = new Set(sourceSignals.map((signal) => signal.id))
  const ids = new Set<string>()
  for (const fact of result.packet.facts) {
    for (const rawRef of [fact.receipt.rawRef, fact.receipt.sourceId]) {
      const id = typeof rawRef === 'string' ? rawRef.replace(/^signal:/, '').replace(/:(from|to)$/, '') : ''
      if (available.has(id)) ids.add(id)
    }
  }
  return [...ids]
}

export async function runFreshPolymarketV3Pipeline(
  store: PolymarketV3LiveStore,
  writer: PolymarketV3Writer,
  partialOptions: PolymarketV3LiveOptions
): Promise<PolymarketV3LiveRunResult> {
  const options = {
    lookbackHours: DEFAULT_LOOKBACK_HOURS,
    limit: DEFAULT_LIMIT,
    includeProcessed: true,
    markProcessed: true,
    maxPublications: DEFAULT_MAX_PUBLICATIONS,
    ...partialOptions,
  }

  const since = new Date(new Date(options.now).getTime() - options.lookbackHours * 3_600_000).toISOString()
  const sourceSignals = await store.fetchFreshSignals({
    since,
    limit: options.limit,
    includeProcessed: options.includeProcessed,
  })

  const whaleSignals = sourceSignals.filter(isWhaleSignal)
  const oddsSignals = sourceSignals.filter(isOddsSignal)
  const trades = polymarketSignalsToWalletTrades(sourceSignals)
  const signalOddsSnapshots = polymarketSignalsToOddsSnapshots(sourceSignals)
  const slugs = [...new Set(trades.map((trade) => trade.slug).filter((slug): slug is string => Boolean(slug)))]
  const currentSnapshots = await store.fetchCurrentMarketSnapshots(slugs, options.now)
  const oddsSnapshots = [...signalOddsSnapshots, ...currentSnapshots]

  const initial = buildWalletRepeatResearchPackets(trades, oddsSnapshots, {
    now: options.now,
    staleAfterHours: options.staleAfterHours,
  })
  const storyKeys = [...new Set(initial.map((result) => result.packet.storyKey))]
  const existingStories = await store.fetchExistingStories(storyKeys)
  const existingThreadByStoryKey = Object.fromEntries(
    Object.entries(existingStories).map(([storyKey, state]) => [storyKey, state.threadId])
  )
  const coveredThroughByStoryKey = Object.fromEntries(
    Object.entries(existingStories)
      .filter(([, state]) => state.coveredThrough)
      .map(([storyKey, state]) => [storyKey, state.coveredThrough!])
  )

  const results = buildWalletRepeatResearchPackets(trades, oddsSnapshots, {
    now: options.now,
    existingThreadByStoryKey,
    coveredThroughByStoryKey,
    staleAfterHours: options.staleAfterHours,
  })

  const decisionCounts: Record<string, number> = {}
  const published: PolymarketV3LiveRunResult['published'] = []
  const held: PolymarketV3LiveRunResult['held'] = []
  const consumedSignalIds = new Set<string>()

  for (const result of results) {
    countDecision(decisionCounts, result.decision.decision)

    if (result.decision.decision !== 'publish' && result.decision.decision !== 'update') {
      const relevantSignalIds = signalIdsForPacket(result, sourceSignals)
      if (result.decision.decision === 'suppress') {
        relevantSignalIds.forEach((id) => consumedSignalIds.add(id))
      }
      held.push({
        packetId: result.packet.id,
        storyKey: result.packet.storyKey,
        decision: result.decision.decision,
        reason: result.decision.reason,
      })
      continue
    }

    if (published.length >= options.maxPublications) {
      held.push({
        packetId: result.packet.id,
        storyKey: result.packet.storyKey,
        decision: 'hold',
        reason: `Max publications per run reached (${options.maxPublications}).`,
      })
      continue
    }

    const writerInput = createPacketWriterInput(result.packet, result.decision)
    const output = await writer.write(writerInput)
    const relevantSignalIds = signalIdsForPacket(result, sourceSignals)
    const relevantSignals = sourceSignals.filter((signal) => relevantSignalIds.includes(signal.id))
    const narrative = await store.insertNarrative(buildNarrativeRow(result, output, relevantSignals))
    const packetRow = toPacketBackedPublishedRow(writerInput, output)
    await store.insertPublishedNarrative({
      ...packetRow,
      narrative_id: narrative.id,
      reasoning: output.reasoning,
      publisher_score: output.publisher_score,
      editor_version: V3_EDITOR_VERSION,
    })

    relevantSignalIds.forEach((id) => consumedSignalIds.add(id))

    published.push({
      narrativeId: narrative.id,
      packetId: result.packet.id,
      storyKey: result.packet.storyKey,
      contentSmall: output.content_small,
    })
  }

  const processedSignalIds = [...consumedSignalIds]
  if (options.markProcessed && processedSignalIds.length > 0) {
    await store.markSignalsProcessed(processedSignalIds)
  }

  return {
    fetchedSignals: sourceSignals.length,
    whaleSignals: whaleSignals.length,
    oddsSignals: oddsSignals.length,
    packets: results.length,
    decisions: decisionCounts,
    published,
    processedSignalIds,
    held,
  }
}
