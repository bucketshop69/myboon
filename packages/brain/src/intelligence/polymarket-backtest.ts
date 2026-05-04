import {
  INTELLIGENCE_SCHEMA_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  oddsMoveCriterion,
  type BacktestRunSummary,
  type ClassifiedSignal,
  type NarrativeOutcome,
} from './contracts.js'
import { scorePolymarketOddsShift } from './scoring.js'

export interface LegacyOddsShiftSignal {
  id: string
  topic?: string | null
  slug?: string | null
  created_at: string
  metadata?: {
    marketId?: string
    slug?: string
    yes_price?: number
    shift_from?: number
    shift_to?: number
    [key: string]: unknown
  } | null
}

export interface OddsShiftBacktestOptions {
  continuationDelta: number
  windowHours: number
  topFraction: number
  minCandidates?: number
  requestedWindowDays?: number
}

export interface OddsShiftBacktestResult {
  summary: BacktestRunSummary
  selected: NarrativeOutcome[]
  baseline: NarrativeOutcome[]
  examples: {
    hits: NarrativeOutcome[]
    misses: NarrativeOutcome[]
  }
}

interface Candidate {
  signal: ClassifiedSignal<{ oddsDelta: number; from: number; to: number }>
  outcome: NarrativeOutcome
  absDelta: number
}

const DEFAULT_OPTIONS: OddsShiftBacktestOptions = {
  continuationDelta: 0.03,
  windowHours: 24,
  topFraction: 0.3,
  minCandidates: 10,
}

const hoursBetween = (from: string, to: string): number =>
  (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000

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

function normalizePrice(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null
}

function toClassifiedSignal(raw: LegacyOddsShiftSignal): ClassifiedSignal<{ oddsDelta: number; from: number; to: number }> | null {
  const from = normalizePrice(raw.metadata?.shift_from)
  const to = normalizePrice(raw.metadata?.shift_to ?? raw.metadata?.yes_price)
  const slug = raw.slug ?? raw.metadata?.slug
  if (from == null || to == null || !slug) return null

  const oddsDelta = to - from
  const score = scorePolymarketOddsShift({
    oddsDelta,
    hoursSinceObserved: 0,
    currentPrice: to,
  })

  return {
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    id: `classified:${raw.id}`,
    kind: 'polymarket.odds_shift',
    source: 'polymarket',
    featureSnapshotIds: [`legacy-signal:${raw.id}`],
    entityRef: {
      marketId: raw.metadata?.marketId,
      slug,
    },
    direction: oddsDelta > 0 ? 'up' : oddsDelta < 0 ? 'down' : 'neutral',
    observedAt: raw.created_at,
    classifiedAt: new Date().toISOString(),
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
    ruleId: 'polymarket.odds_shift.v1',
    score,
    metadata: { oddsDelta, from, to },
    trace: [
      {
        source: 'polymarket',
        sourceId: raw.id,
        fetchedAt: raw.created_at,
      },
    ],
  }
}

function evaluateCandidate(
  signal: ClassifiedSignal<{ oddsDelta: number; from: number; to: number }>,
  marketSignals: ClassifiedSignal<{ oddsDelta: number; from: number; to: number }>[],
  signalIndex: number,
  options: OddsShiftBacktestOptions
): NarrativeOutcome {
  const direction = signal.direction === 'down' ? 'down' : 'up'
  const startPrice = signal.metadata.to
  const cutoff = new Date(new Date(signal.observedAt).getTime() + options.windowHours * 3_600_000).toISOString()
  let matched: ClassifiedSignal<{ oddsDelta: number; from: number; to: number }> | undefined
  let latestInWindow: ClassifiedSignal<{ oddsDelta: number; from: number; to: number }> | undefined

  for (let i = signalIndex + 1; i < marketSignals.length; i += 1) {
    const candidate = marketSignals[i]
    if (!candidate || candidate.observedAt <= signal.observedAt) continue
    if (candidate.observedAt > cutoff) break

    latestInWindow = candidate
    if (!matched) {
      const move = candidate.metadata.to - startPrice
      if (direction === 'up' ? move >= options.continuationDelta : move <= -options.continuationDelta) {
        matched = candidate
      }
    }
  }

  const measuredMove = latestInWindow ? latestInWindow.metadata.to - startPrice : 0

  return {
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    id: `outcome:${signal.id}`,
    narrativeId: signal.id,
    evaluatedAt: new Date().toISOString(),
    criteria: [oddsMoveCriterion(direction, options.continuationDelta, options.windowHours)],
    result: matched ? 'hit' : latestInWindow ? 'miss' : 'inconclusive',
    measuredValues: {
      startPrice,
      latestPrice: latestInWindow?.metadata.to ?? null,
      measuredMove,
      matchedAt: matched?.observedAt ?? null,
      matchedPrice: matched?.metadata.to ?? null,
    },
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
  }
}

export function runPolymarketOddsShiftBacktest(
  rawSignals: LegacyOddsShiftSignal[],
  partialOptions: Partial<OddsShiftBacktestOptions> = {}
): OddsShiftBacktestResult {
  const options = { ...DEFAULT_OPTIONS, ...partialOptions }
  const signals = rawSignals
    .map(toClassifiedSignal)
    .filter((signal): signal is ClassifiedSignal<{ oddsDelta: number; from: number; to: number }> => Boolean(signal))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))

  const signalsBySlug = new Map<string, ClassifiedSignal<{ oddsDelta: number; from: number; to: number }>[]> ()
  for (const signal of signals) {
    const slug = signal.entityRef.slug ?? 'unknown'
    const group = signalsBySlug.get(slug) ?? []
    group.push(signal)
    signalsBySlug.set(slug, group)
  }

  const signalIndexById = new Map<string, number>()
  for (const group of signalsBySlug.values()) {
    group.forEach((signal, index) => signalIndexById.set(signal.id, index))
  }

  const candidates: Candidate[] = signals.map((signal) => {
    const marketSignals = signalsBySlug.get(signal.entityRef.slug ?? 'unknown') ?? []
    return {
      signal,
      outcome: evaluateCandidate(signal, marketSignals, signalIndexById.get(signal.id) ?? -1, options),
      absDelta: Math.abs(signal.metadata.oddsDelta),
    }
  })

  const conclusive = candidates.filter((candidate) => candidate.outcome.result !== 'inconclusive')
  const selectedCount = Math.max(options.minCandidates ?? 1, Math.ceil(conclusive.length * options.topFraction))
  const boundedSelectedCount = Math.min(selectedCount, conclusive.length)

  const selected = [...conclusive]
    .sort((a, b) => b.signal.score.confidence - a.signal.score.confidence || b.signal.score.urgency - a.signal.score.urgency)
    .slice(0, boundedSelectedCount)
    .map((candidate) => candidate.outcome)

  const baseline = [...conclusive]
    .sort((a, b) => b.absDelta - a.absDelta)
    .slice(0, boundedSelectedCount)
    .map((candidate) => candidate.outcome)

  const hitRate = mean(selected.map((outcome) => (outcome.result === 'hit' ? 1 : 0)))
  const baselineHitRate = mean(baseline.map((outcome) => (outcome.result === 'hit' ? 1 : 0)))
  const hits = selected.filter((outcome) => outcome.result === 'hit').length
  const windowStart = conclusive[0]?.signal.observedAt ?? signals[0]?.observedAt ?? new Date().toISOString()
  const windowEnd = conclusive.at(-1)?.signal.observedAt ?? signals.at(-1)?.observedAt ?? windowStart
  const actualWindowDays = Math.max(0, (new Date(windowEnd).getTime() - new Date(windowStart).getTime()) / 86_400_000)

  return {
    summary: {
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: `backtest:polymarket.odds_shift:${Date.now()}`,
      source: 'polymarket',
      signalKind: 'polymarket.odds_shift',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      windowStart,
      windowEnd,
      requestedWindowDays: options.requestedWindowDays,
      actualWindowDays,
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      baseline: 'largest_raw_odds_delta',
      candidateCount: conclusive.length,
      hitRate,
      baselineHitRate,
      confidenceInterval: wilsonInterval(hits, selected.length),
    },
    selected,
    baseline,
    examples: {
      hits: selected.filter((outcome) => outcome.result === 'hit').slice(0, 5),
      misses: selected.filter((outcome) => outcome.result === 'miss').slice(0, 5),
    },
  }
}
