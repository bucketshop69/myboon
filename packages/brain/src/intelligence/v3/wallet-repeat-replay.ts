import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  INTELLIGENCE_SCHEMA_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  type BacktestRunSummary,
  type NarrativeOutcome,
} from '../contracts.js'
import type { LegacyOddsShiftSignal } from '../polymarket-backtest.js'
import type { LegacyWhaleBetSignal } from '../polymarket-whale-backtest.js'
import type { EditorialDecision, ResearchPacket } from './contracts.js'
import {
  buildWalletRepeatResearchPackets,
  legacyWhaleBetToWalletTradeSeed,
  type PolymarketOddsSnapshotSeed,
  type PolymarketWalletTradeSeed,
} from './wallet-repeat-research.js'

export interface WalletRepeatReplayOptions {
  now: string
  requestedWindowDays?: number
  continuationDelta?: number
  windowHours?: number
  topFraction?: number
  minCandidates?: number
  existingThreadByStoryKey?: Record<string, string>
  coveredThroughByStoryKey?: Record<string, string>
  noisyMarketSlugs?: string[]
}

export interface WalletRepeatReplayCandidate {
  packet: ResearchPacket
  decision: EditorialDecision
  outcome: NarrativeOutcome
  totalExposureUsd: number
  latestTradeAt: string
}

export interface WalletRepeatReplayResult {
  summary: BacktestRunSummary
  shadowMode: true
  deterministicReplayKey: string
  decisionCounts: Record<EditorialDecision['decision'], number>
  packets: ResearchPacket[]
  decisions: EditorialDecision[]
  selected: NarrativeOutcome[]
  baseline: NarrativeOutcome[]
  examples: {
    hits: NarrativeOutcome[]
    misses: NarrativeOutcome[]
    packets: Array<{
      packetId: string
      storyKey: string
      decision: EditorialDecision['decision']
      headlineClaim: string
      latestTradeAt: string
    }>
  }
}

export interface WalletRepeatReplayArtifact {
  params: Record<string, unknown>
  summary: BacktestRunSummary
  shadowMode: true
  deterministicReplayKey: string
  decisionCounts: WalletRepeatReplayResult['decisionCounts']
  packets: ResearchPacket[]
  decisions: EditorialDecision[]
  selected: NarrativeOutcome[]
  baseline: NarrativeOutcome[]
  examples: WalletRepeatReplayResult['examples']
}

interface OddsPoint {
  slug: string
  observedAt: string
  price: number
}

const DEFAULT_OPTIONS = {
  continuationDelta: 0.03,
  windowHours: 24,
  topFraction: 0.3,
  minCandidates: 1,
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePrice(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 && parsed <= 1 ? parsed : null
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function wilsonInterval(hits: number, n: number, z = 1.96): { lower: number; upper: number; level: number } {
  if (n === 0) return { lower: 0, upper: 0, level: 0.95 }
  const p = hits / n
  const denom = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denom
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin), level: 0.95 }
}

function legacyOddsToSnapshot(raw: LegacyOddsShiftSignal): PolymarketOddsSnapshotSeed | null {
  const slug = raw.slug ?? raw.metadata?.slug
  const price = normalizePrice(raw.metadata?.shift_to ?? raw.metadata?.yes_price)
  if (!slug || price == null) return null
  return {
    id: raw.id,
    slug,
    price,
    observedAt: raw.created_at,
    capturedAt: raw.created_at,
    rawRef: `legacy-signal:${raw.id}`,
  }
}

function oddsPointsBySlug(oddsSnapshots: PolymarketOddsSnapshotSeed[]): Map<string, OddsPoint[]> {
  const groups = new Map<string, OddsPoint[]>()
  for (const snapshot of oddsSnapshots) {
    const group = groups.get(snapshot.slug) ?? []
    group.push({
      slug: snapshot.slug,
      observedAt: snapshot.observedAt,
      price: snapshot.price,
    })
    groups.set(snapshot.slug, group)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  }
  return groups
}

function packetMarketSlug(packet: ResearchPacket): string | null {
  const actionSlug = packet.recommendedActions.find((action) => action.type === 'predict')?.slug
  if (actionSlug) return actionSlug
  const tradeFact = packet.facts.find((fact) => fact.factType === 'wallet.trade')
  const value = tradeFact?.values.marketSlug
  return typeof value === 'string' ? value : null
}

function latestTradeAt(packet: ResearchPacket): string {
  return packet.facts
    .filter((fact) => fact.factType === 'wallet.trade')
    .map((fact) => fact.observedAt)
    .sort()
    .at(-1) ?? packet.createdAt
}

function totalExposureUsd(packet: ResearchPacket): number {
  return packet.facts
    .filter((fact) => fact.factType === 'wallet.trade')
    .reduce((sum, fact) => sum + (typeof fact.values.amountUsd === 'number' ? fact.values.amountUsd : 0), 0)
}

function evaluatePacket(
  packet: ResearchPacket,
  oddsBySlug: Map<string, OddsPoint[]>,
  options: Required<Pick<WalletRepeatReplayOptions, 'continuationDelta' | 'windowHours'>>
): NarrativeOutcome {
  const criterion = packet.successCriteria.find((item) => item.kind === 'odds_move')
  const direction = criterion?.kind === 'odds_move' ? criterion.direction : 'up'
  const targetDelta = criterion?.kind === 'odds_move' ? criterion.targetDelta : options.continuationDelta
  const windowHours = criterion?.kind === 'odds_move' ? criterion.windowHours : options.windowHours
  const observedAt = latestTradeAt(packet)
  const cutoff = new Date(new Date(observedAt).getTime() + windowHours * 3_600_000).toISOString()
  const slug = packetMarketSlug(packet)
  const odds = slug ? oddsBySlug.get(slug) ?? [] : []
  const start = odds.find((point) => point.observedAt >= observedAt)

  if (!start || start.observedAt > cutoff) {
    return {
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: `outcome:${packet.id}`,
      narrativeId: packet.id,
      evaluatedAt: packet.createdAt,
      criteria: packet.successCriteria,
      result: 'inconclusive',
      measuredValues: {
        startPrice: null,
        latestPrice: null,
        measuredMove: null,
        matchedAt: null,
        matchedPrice: null,
      },
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      notes: 'No odds point found inside evaluation window at or after latest wallet trade',
    }
  }

  let latestInWindow: OddsPoint | undefined
  let matched: OddsPoint | undefined
  for (const point of odds) {
    if (point.observedAt <= start.observedAt) continue
    if (point.observedAt > cutoff) break
    latestInWindow = point
    const move = point.price - start.price
    if (!matched && (direction === 'up' ? move >= targetDelta : move <= -targetDelta)) {
      matched = point
    }
  }

  const measuredMove = latestInWindow ? latestInWindow.price - start.price : 0
  return {
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    id: `outcome:${packet.id}`,
    narrativeId: packet.id,
    evaluatedAt: packet.createdAt,
    criteria: packet.successCriteria,
    result: matched ? 'hit' : latestInWindow ? 'miss' : 'inconclusive',
    measuredValues: {
      startPrice: start.price,
      latestPrice: latestInWindow?.price ?? null,
      measuredMove,
      matchedAt: matched?.observedAt ?? null,
      matchedPrice: matched?.price ?? null,
    },
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
  }
}

function decisionCounts(decisions: EditorialDecision[]): WalletRepeatReplayResult['decisionCounts'] {
  return {
    publish: decisions.filter((decision) => decision.decision === 'publish').length,
    update: decisions.filter((decision) => decision.decision === 'update').length,
    hold: decisions.filter((decision) => decision.decision === 'hold').length,
    merge: decisions.filter((decision) => decision.decision === 'merge').length,
    suppress: decisions.filter((decision) => decision.decision === 'suppress').length,
    escalate: decisions.filter((decision) => decision.decision === 'escalate').length,
  }
}

export function legacyOddsToWalletRepeatSnapshots(rawOdds: LegacyOddsShiftSignal[]): PolymarketOddsSnapshotSeed[] {
  return rawOdds
    .map(legacyOddsToSnapshot)
    .filter((snapshot): snapshot is PolymarketOddsSnapshotSeed => snapshot != null)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))
}

export function runPolymarketWalletRepeatReplay(
  rawWhales: LegacyWhaleBetSignal[],
  rawOdds: LegacyOddsShiftSignal[],
  partialOptions: WalletRepeatReplayOptions
): WalletRepeatReplayResult {
  const options = { ...DEFAULT_OPTIONS, ...partialOptions }
  const trades = rawWhales
    .map(legacyWhaleBetToWalletTradeSeed)
    .filter((trade): trade is PolymarketWalletTradeSeed => trade != null)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))
  const oddsSnapshots = legacyOddsToWalletRepeatSnapshots(rawOdds)
  const replayKey = stableHash({
    options,
    trades: trades.map((trade) => [trade.id, trade.wallet, trade.slug, trade.marketId, trade.outcome, trade.side, trade.amountUsd, trade.observedAt]),
    odds: oddsSnapshots.map((odds) => [odds.id, odds.slug, odds.price, odds.observedAt]),
  })
  const packetResults = buildWalletRepeatResearchPackets(trades, oddsSnapshots, options)
  const oddsBySlug = oddsPointsBySlug(oddsSnapshots)
  const candidates: WalletRepeatReplayCandidate[] = packetResults.map(({ packet, decision }) => ({
    packet,
    decision,
    outcome: evaluatePacket(packet, oddsBySlug, options),
    totalExposureUsd: totalExposureUsd(packet),
    latestTradeAt: latestTradeAt(packet),
  }))

  const conclusive = candidates.filter((candidate) => candidate.outcome.result !== 'inconclusive')
  const publishable = conclusive.filter((candidate) => candidate.decision.decision === 'publish' || candidate.decision.decision === 'update')
  const selectedCount = Math.max(options.minCandidates, Math.ceil(publishable.length * options.topFraction))
  const boundedSelectedCount = Math.min(selectedCount, publishable.length)
  const selectedCandidates = [...publishable]
    .sort((a, b) => b.packet.materiality.score - a.packet.materiality.score || b.packet.confidence - a.packet.confidence)
    .slice(0, boundedSelectedCount)
  const baselineCandidates = [...publishable]
    .sort((a, b) => b.totalExposureUsd - a.totalExposureUsd)
    .slice(0, boundedSelectedCount)
  const selected = selectedCandidates.map((candidate) => candidate.outcome)
  const baseline = baselineCandidates.map((candidate) => candidate.outcome)
  const hits = selected.filter((outcome) => outcome.result === 'hit').length
  const conclusiveTimes = conclusive.map((candidate) => candidate.latestTradeAt).sort()
  const tradeTimes = trades.map((trade) => trade.observedAt).sort()
  const windowStart = conclusiveTimes[0] ?? tradeTimes[0] ?? options.now
  const windowEnd = conclusiveTimes.at(-1) ?? tradeTimes.at(-1) ?? windowStart
  const actualWindowDays = Math.max(0, (new Date(windowEnd).getTime() - new Date(windowStart).getTime()) / 86_400_000)

  return {
    summary: {
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: `backtest:v3.polymarket.wallet_repeat:${replayKey}`,
      source: 'polymarket',
      signalKind: 'polymarket.large_trade',
      startedAt: options.now,
      completedAt: options.now,
      windowStart,
      windowEnd,
      requestedWindowDays: options.requestedWindowDays,
      actualWindowDays,
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      baseline: 'largest_trade_amount',
      candidateCount: conclusive.length,
      hitRate: mean(selected.map((outcome) => (outcome.result === 'hit' ? 1 : 0))),
      baselineHitRate: mean(baseline.map((outcome) => (outcome.result === 'hit' ? 1 : 0))),
      confidenceInterval: wilsonInterval(hits, selected.length),
    },
    shadowMode: true,
    deterministicReplayKey: replayKey,
    decisionCounts: decisionCounts(candidates.map((candidate) => candidate.decision)),
    packets: candidates.map((candidate) => candidate.packet),
    decisions: candidates.map((candidate) => candidate.decision),
    selected,
    baseline,
    examples: {
      hits: selected.filter((outcome) => outcome.result === 'hit').slice(0, 5),
      misses: selected.filter((outcome) => outcome.result === 'miss').slice(0, 5),
      packets: candidates.slice(0, 5).map((candidate) => ({
        packetId: candidate.packet.id,
        storyKey: candidate.packet.storyKey,
        decision: candidate.decision.decision,
        headlineClaim: candidate.packet.headlineClaim,
        latestTradeAt: candidate.latestTradeAt,
      })),
    },
  }
}

export function defaultWalletRepeatReplayArtifactPath(result: Pick<WalletRepeatReplayResult, 'summary'>): string {
  const safeId = result.summary.id.replace(/[^a-zA-Z0-9._-]/g, '-')
  return path.resolve(process.cwd(), 'artifacts', 'intelligence-backtests', `${safeId}.json`)
}

export async function writeWalletRepeatReplayArtifact(
  artifact: WalletRepeatReplayArtifact,
  outputPath = defaultWalletRepeatReplayArtifactPath(artifact)
): Promise<string> {
  const resolved = path.resolve(outputPath)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  return resolved
}
