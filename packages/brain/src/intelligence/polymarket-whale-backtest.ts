import {
  INTELLIGENCE_SCHEMA_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  oddsMoveCriterion,
  type BacktestRunSummary,
  type ClassifiedSignal,
  type NarrativeOutcome,
  type SignalDirection,
} from './contracts.js'
import { classifyPolymarketWhaleBet, scorePolymarketWhaleBet, type PolymarketWhaleBetArchetype } from './scoring.js'
import type { LegacyOddsShiftSignal, OddsShiftBacktestOptions } from './polymarket-backtest.js'

export interface LegacyWhaleBetSignal {
  id: string
  topic?: string | null
  slug?: string | null
  created_at: string
  weight?: number | null
  metadata?: {
    user?: string
    amount?: number | string
    side?: string
    outcome?: string
    marketId?: string
    slug?: string
    walletTotalBets?: number | string | null
    walletWinRate?: number | string | null
    walletLabel?: string
    tradePrice?: number | string | null
    marketOddsAtBet?: number | string | null
    activityTimestamp?: string
    source?: string
    [key: string]: unknown
  } | null
}

export interface WhaleBetBacktestOptions extends OddsShiftBacktestOptions {
  minAmountUsd?: number
}

export interface WhaleBetArchetypeBacktestStats {
  archetype: PolymarketWhaleBetArchetype
  candidateCount: number
  selectedCount: number
  hitRate: number
  missRate: number
  avgRiskUsd: number | null
  avgAmountUsd: number
  examples: NarrativeOutcome[]
}

export interface WhaleBetBacktestResult {
  summary: BacktestRunSummary
  selectedSignals: ClassifiedSignal<Candidate['signal']['metadata']>[]
  selected: NarrativeOutcome[]
  baselineSignals: ClassifiedSignal<Candidate['signal']['metadata']>[]
  baseline: NarrativeOutcome[]
  byArchetype: Record<PolymarketWhaleBetArchetype, WhaleBetArchetypeBacktestStats>
  examples: {
    hits: NarrativeOutcome[]
    misses: NarrativeOutcome[]
  }
}

interface OddsPoint {
  observedAt: string
  price: number
}

interface Candidate {
  signal: ClassifiedSignal<{
    amountUsd: number
    side: string | null
    outcome: string | null
    wallet: string | null
    walletTotalBets: number | null
    walletWinRate: number | null
    tradePrice: number | null
    marketOddsAtBet: number | null
    whaleArchetype: PolymarketWhaleBetArchetype
    riskUsd: number | null
    publishableAsConviction: boolean
    publishableAsNarrative: boolean
    classificationReason: string
  }>
  outcome: NarrativeOutcome
  amountUsd: number
}

const DEFAULT_OPTIONS: WhaleBetBacktestOptions = {
  continuationDelta: 0.03,
  windowHours: 24,
  topFraction: 0.3,
  minCandidates: 10,
  minAmountUsd: 500,
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

const wilsonInterval = (hits: number, n: number, z = 1.96): { lower: number; upper: number; level: number } => {
  if (n === 0) return { lower: 0, upper: 0, level: 0.95 }
  const p = hits / n
  const denom = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denom
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin), level: 0.95 }
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePrice(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 && parsed <= 1 ? parsed : null
}

function inferDirection(sideRaw: unknown, outcomeRaw: unknown): Exclude<SignalDirection, 'neutral' | 'unknown'> | null {
  const side = typeof sideRaw === 'string' ? sideRaw.toUpperCase() : ''
  const outcome = typeof outcomeRaw === 'string' ? outcomeRaw.toUpperCase() : ''
  if (!side) return null

  const isNo = outcome === 'NO'
  const isSell = side === 'SELL'

  // Most non-YES/NO Polymarket slugs are already an outcome-specific binary market.
  // BUY means conviction in that outcome's YES price; SELL means pressure against it.
  if (isNo) return isSell ? 'up' : 'down'
  return isSell ? 'down' : 'up'
}

function toClassifiedSignal(raw: LegacyWhaleBetSignal): ClassifiedSignal<Candidate['signal']['metadata']> | null {
  const slug = raw.slug ?? raw.metadata?.slug
  const amountUsd = numberOrNull(raw.metadata?.amount)
  const direction = inferDirection(raw.metadata?.side, raw.metadata?.outcome)
  const observedAt = typeof raw.metadata?.activityTimestamp === 'string' ? raw.metadata.activityTimestamp : raw.created_at
  if (!slug || amountUsd == null || amountUsd <= 0 || !direction) return null

  const walletTotalBets = numberOrNull(raw.metadata?.walletTotalBets)
  const walletWinRate = numberOrNull(raw.metadata?.walletWinRate)
  const tradePrice = normalizePrice(raw.metadata?.tradePrice)
  const marketOddsAtBet = normalizePrice(raw.metadata?.marketOddsAtBet)
  const outcome = typeof raw.metadata?.outcome === 'string' ? raw.metadata.outcome : null
  const classificationInput = {
    amountUsd,
    hoursSinceObserved: 0,
    tradePrice,
    marketOddsAtBet,
    outcome,
    walletTotalBets,
    walletWinRate,
  }
  const whaleClassification = classifyPolymarketWhaleBet(classificationInput)
  const score = scorePolymarketWhaleBet(classificationInput)

  return {
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    id: `classified:${raw.id}`,
    kind: 'polymarket.large_trade',
    source: 'polymarket',
    featureSnapshotIds: [`legacy-signal:${raw.id}`],
    entityRef: {
      marketId: raw.metadata?.marketId,
      slug,
    },
    direction,
    observedAt,
    classifiedAt: new Date().toISOString(),
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
    ruleId: 'polymarket.whale_bet.v2',
    score,
    metadata: {
      amountUsd,
      side: typeof raw.metadata?.side === 'string' ? raw.metadata.side : null,
      outcome,
      wallet: typeof raw.metadata?.user === 'string' ? raw.metadata.user : null,
      walletTotalBets,
      walletWinRate,
      tradePrice,
      marketOddsAtBet,
      whaleArchetype: whaleClassification.archetype,
      riskUsd: whaleClassification.riskUsd,
      publishableAsConviction: whaleClassification.publishableAsConviction,
      publishableAsNarrative: whaleClassification.publishableAsConviction,
      classificationReason: whaleClassification.reason,
    },
    trace: [
      {
        source: 'polymarket',
        sourceId: raw.id,
        fetchedAt: raw.created_at,
      },
    ],
  }
}

function oddsPointsBySlug(rawOdds: LegacyOddsShiftSignal[]): Map<string, OddsPoint[]> {
  const groups = new Map<string, OddsPoint[]>()
  for (const row of rawOdds) {
    const slug = row.slug ?? row.metadata?.slug
    const price = normalizePrice(row.metadata?.shift_to ?? row.metadata?.yes_price)
    if (!slug || price == null) continue
    const group = groups.get(slug) ?? []
    group.push({ observedAt: row.created_at, price })
    groups.set(slug, group)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  }
  return groups
}

function evaluateCandidate(
  signal: ClassifiedSignal<Candidate['signal']['metadata']>,
  oddsPoints: OddsPoint[],
  options: WhaleBetBacktestOptions
): NarrativeOutcome {
  const cutoff = new Date(new Date(signal.observedAt).getTime() + options.windowHours * 3_600_000).toISOString()
  const start = oddsPoints.find((point) => point.observedAt >= signal.observedAt)
  if (!start || start.observedAt > cutoff) {
    return {
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: `outcome:${signal.id}`,
      narrativeId: signal.id,
      evaluatedAt: new Date().toISOString(),
      criteria: [oddsMoveCriterion(signal.direction as 'up' | 'down', options.continuationDelta, options.windowHours)],
      result: 'inconclusive',
      measuredValues: { startPrice: null, latestPrice: null, measuredMove: null, matchedAt: null, matchedPrice: null },
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      notes: 'No odds point found inside evaluation window at or after whale bet timestamp',
    }
  }

  let latestInWindow: OddsPoint | undefined
  let matched: OddsPoint | undefined

  for (const point of oddsPoints) {
    if (point.observedAt <= start.observedAt) continue
    if (point.observedAt > cutoff) break
    latestInWindow = point
    const move = point.price - start.price
    if (!matched && (signal.direction === 'up' ? move >= options.continuationDelta : move <= -options.continuationDelta)) {
      matched = point
    }
  }

  const measuredMove = latestInWindow ? latestInWindow.price - start.price : 0
  return {
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    id: `outcome:${signal.id}`,
    narrativeId: signal.id,
    evaluatedAt: new Date().toISOString(),
    criteria: [oddsMoveCriterion(signal.direction as 'up' | 'down', options.continuationDelta, options.windowHours)],
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


function classifyWithBacktestOddsFallback(signal: Candidate['signal'], outcome: NarrativeOutcome): Candidate['signal'] {
  if (signal.metadata.tradePrice != null || signal.metadata.marketOddsAtBet != null) return signal
  const startPrice = numberOrNull(outcome.measuredValues.startPrice)
  if (startPrice == null) return signal

  const classificationInput = {
    amountUsd: signal.metadata.amountUsd,
    hoursSinceObserved: 0,
    tradePrice: null,
    marketOddsAtBet: startPrice,
    outcome: signal.metadata.outcome,
    walletTotalBets: signal.metadata.walletTotalBets,
    walletWinRate: signal.metadata.walletWinRate,
  }
  const whaleClassification = classifyPolymarketWhaleBet(classificationInput)
  return {
    ...signal,
    score: scorePolymarketWhaleBet(classificationInput),
    metadata: {
      ...signal.metadata,
      marketOddsAtBet: startPrice,
      whaleArchetype: whaleClassification.archetype,
      riskUsd: whaleClassification.riskUsd,
      publishableAsConviction: whaleClassification.publishableAsConviction,
      publishableAsNarrative: whaleClassification.publishableAsConviction,
      classificationReason: `${whaleClassification.reason} (using backtest start odds fallback)`,
    },
  }
}

const ARCHETYPES: PolymarketWhaleBetArchetype[] = ['penny_pickup', 'lottery', 'contrarian', 'conviction', 'noise']

function buildArchetypeStats(candidates: Candidate[], selected: Candidate[]): Record<PolymarketWhaleBetArchetype, WhaleBetArchetypeBacktestStats> {
  const selectedIds = new Set(selected.map((candidate) => candidate.signal.id))
  return Object.fromEntries(
    ARCHETYPES.map((archetype) => {
      const group = candidates.filter((candidate) => candidate.signal.metadata.whaleArchetype === archetype)
      const hits = group.filter((candidate) => candidate.outcome.result === 'hit').length
      const misses = group.filter((candidate) => candidate.outcome.result === 'miss').length
      const risks = group.map((candidate) => candidate.signal.metadata.riskUsd).filter((risk): risk is number => typeof risk === 'number' && Number.isFinite(risk))
      return [archetype, {
        archetype,
        candidateCount: group.length,
        selectedCount: group.filter((candidate) => selectedIds.has(candidate.signal.id)).length,
        hitRate: group.length === 0 ? 0 : hits / group.length,
        missRate: group.length === 0 ? 0 : misses / group.length,
        avgRiskUsd: risks.length === 0 ? null : mean(risks),
        avgAmountUsd: mean(group.map((candidate) => candidate.amountUsd)),
        examples: group.slice(0, 3).map((candidate) => candidate.outcome),
      }]
    })
  ) as Record<PolymarketWhaleBetArchetype, WhaleBetArchetypeBacktestStats>
}

export function runPolymarketWhaleBetBacktest(
  rawWhales: LegacyWhaleBetSignal[],
  rawOdds: LegacyOddsShiftSignal[],
  partialOptions: Partial<WhaleBetBacktestOptions> = {}
): WhaleBetBacktestResult {
  const options = { ...DEFAULT_OPTIONS, ...partialOptions }
  const oddsBySlug = oddsPointsBySlug(rawOdds)
  const signals = rawWhales
    .map(toClassifiedSignal)
    .filter((signal): signal is ClassifiedSignal<Candidate['signal']['metadata']> => Boolean(signal))
    .filter((signal) => signal.metadata.amountUsd >= (options.minAmountUsd ?? 0))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))

  const candidates: Candidate[] = signals.map((signal) => {
    const outcome = evaluateCandidate(signal, oddsBySlug.get(signal.entityRef.slug ?? '') ?? [], options)
    const classifiedSignal = classifyWithBacktestOddsFallback(signal, outcome)
    return {
      signal: classifiedSignal,
      outcome,
      amountUsd: classifiedSignal.metadata.amountUsd,
    }
  })

  const conclusive = candidates.filter((candidate) => candidate.outcome.result !== 'inconclusive')
  const publishable = conclusive.filter((candidate) => candidate.signal.metadata.publishableAsNarrative)
  const selectedCount = Math.max(options.minCandidates ?? 1, Math.ceil(publishable.length * options.topFraction))
  const boundedSelectedCount = Math.min(selectedCount, publishable.length)

  const selectedCandidates = [...publishable]
    .sort((a, b) => b.signal.score.confidence - a.signal.score.confidence || b.signal.score.urgency - a.signal.score.urgency)
    .slice(0, boundedSelectedCount)

  const selectedSignals = selectedCandidates.map((candidate) => candidate.signal)
  const selected = selectedCandidates.map((candidate) => candidate.outcome)

  // Compare against the same publishable candidate pool we allow the scorer to select from.
  // Otherwise the baseline can win by picking non-narratable trades (for example penny-pickup
  // clips near 99¢) that the production classifier intentionally suppresses.
  const baselineCandidates = [...publishable]
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, boundedSelectedCount)
  const baselineSignals = baselineCandidates.map((candidate) => candidate.signal)
  const baseline = baselineCandidates.map((candidate) => candidate.outcome)

  const hitRate = mean(selected.map((outcome) => (outcome.result === 'hit' ? 1 : 0)))
  const baselineHitRate = mean(baseline.map((outcome) => (outcome.result === 'hit' ? 1 : 0)))
  const hits = selected.filter((outcome) => outcome.result === 'hit').length
  const windowStart = conclusive[0]?.signal.observedAt ?? signals[0]?.observedAt ?? new Date().toISOString()
  const windowEnd = conclusive.at(-1)?.signal.observedAt ?? signals.at(-1)?.observedAt ?? windowStart
  const actualWindowDays = Math.max(0, (new Date(windowEnd).getTime() - new Date(windowStart).getTime()) / 86_400_000)

  return {
    summary: {
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: `backtest:polymarket.whale_bet:${Date.now()}`,
      source: 'polymarket',
      signalKind: 'polymarket.large_trade',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      windowStart,
      windowEnd,
      requestedWindowDays: options.requestedWindowDays,
      actualWindowDays,
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      baseline: 'largest_trade_amount',
      candidateCount: conclusive.length,
      hitRate,
      baselineHitRate,
      confidenceInterval: wilsonInterval(hits, selected.length),
    },
    selectedSignals,
    selected,
    baselineSignals,
    baseline,
    byArchetype: buildArchetypeStats(conclusive, selectedCandidates),
    examples: {
      hits: selected.filter((outcome) => outcome.result === 'hit').slice(0, 5),
      misses: selected.filter((outcome) => outcome.result === 'miss').slice(0, 5),
    },
  }
}
