export const INTELLIGENCE_SCHEMA_VERSION = 1 as const
export const INTELLIGENCE_SCORING_VERSION = 1 as const
export const INTELLIGENCE_EDITOR_VERSION = 1 as const

export type SourceVenue = 'polymarket'

export type PolymarketRawEventKind =
  | 'polymarket.market_snapshot'
  | 'polymarket.odds_snapshot'
  | 'polymarket.volume_liquidity_snapshot'
  | 'polymarket.large_trade'
  | 'polymarket.resolution'

export type ClassifiedSignalKind =
  | 'polymarket.odds_shift'
  | 'polymarket.volume_spike'
  | 'polymarket.liquidity_expansion'
  | 'polymarket.large_trade'
  | 'polymarket.resolution'

export type SignalDirection = 'up' | 'down' | 'neutral' | 'unknown'

export type OutcomeCriterion =
  | {
      kind: 'odds_move'
      direction: Exclude<SignalDirection, 'neutral' | 'unknown'>
      targetDelta: number
      windowHours: number
    }
  | {
      kind: 'market_resolution'
      expectedOutcome: string
      windowHours?: number
    }
  | {
      kind: 'volume_or_liquidity_follow_through'
      targetMultiplier: number
      windowHours: number
    }

export function oddsMoveCriterion(
  direction: Exclude<SignalDirection, 'neutral' | 'unknown'>,
  targetDelta: number,
  windowHours: number
): Extract<OutcomeCriterion, { kind: 'odds_move' }> {
  return { kind: 'odds_move', direction, targetDelta, windowHours }
}

export function marketResolutionCriterion(
  expectedOutcome: string,
  windowHours?: number
): Extract<OutcomeCriterion, { kind: 'market_resolution' }> {
  return { kind: 'market_resolution', expectedOutcome, ...(windowHours == null ? {} : { windowHours }) }
}

export interface ContractVersion {
  schemaVersion: typeof INTELLIGENCE_SCHEMA_VERSION
}

export interface TraceRef {
  source: SourceVenue
  sourceId: string
  fetchedAt: string
  url?: string
  rawSnapshotId?: string
}

export interface RawEvent<TPayload = unknown> extends ContractVersion {
  id: string
  source: SourceVenue
  kind: PolymarketRawEventKind
  entityRef: {
    marketId?: string
    slug?: string
    conditionId?: string
    assetId?: string
  }
  observedAt: string
  receivedAt: string
  dedupeKey: string
  trace: TraceRef
  payload: TPayload
}

export interface FeatureSnapshot<TFeatures extends Record<string, unknown> = Record<string, unknown>> extends ContractVersion {
  id: string
  source: SourceVenue
  rawEventIds: string[]
  entityRef: RawEvent['entityRef']
  observedAt: string
  computedAt: string
  featureVersion: number
  features: TFeatures
  trace: TraceRef[]
}

export interface ScoreBreakdown {
  confidence: number
  urgency: number
  freshness: number
  sourceReliability: number
  signalWeight: number
  dedupePriority: number
}

export interface ClassifiedSignal<TMetadata extends Record<string, unknown> = Record<string, unknown>> extends ContractVersion {
  id: string
  kind: ClassifiedSignalKind
  source: SourceVenue
  featureSnapshotIds: string[]
  entityRef: RawEvent['entityRef']
  direction: SignalDirection
  observedAt: string
  classifiedAt: string
  scoringVersion: typeof INTELLIGENCE_SCORING_VERSION
  ruleId: string
  score: ScoreBreakdown
  metadata: TMetadata
  trace: TraceRef[]
}

export interface NarrativeCandidate extends ContractVersion {
  id: string
  source: SourceVenue
  signalIds: string[]
  entityRef: RawEvent['entityRef']
  title: string
  thesis: string
  whyNow: string
  invalidation: string
  narrativeScore: number
  scoringVersion: typeof INTELLIGENCE_SCORING_VERSION
  successCriteria: OutcomeCriterion[]
  createdAt: string
}

export interface PublishedNarrative extends NarrativeCandidate {
  publishedAt: string
  editorVersion: typeof INTELLIGENCE_EDITOR_VERSION | number
  status: 'published'
}

export interface NarrativeOutcome extends ContractVersion {
  id: string
  narrativeId: string
  evaluatedAt: string
  criteria: OutcomeCriterion[]
  result: 'hit' | 'miss' | 'inconclusive'
  measuredValues: Record<string, number | string | boolean | null>
  scoringVersion: typeof INTELLIGENCE_SCORING_VERSION
  notes?: string
}

export interface BacktestRunSummary extends ContractVersion {
  id: string
  source: SourceVenue
  signalKind: ClassifiedSignalKind
  startedAt: string
  completedAt?: string
  windowStart: string
  windowEnd: string
  requestedWindowDays?: number
  actualWindowDays: number
  scoringVersion: typeof INTELLIGENCE_SCORING_VERSION
  baseline: 'random_candidate' | 'largest_raw_odds_delta' | 'largest_trade_amount'
  candidateCount: number
  hitRate: number
  baselineHitRate: number
  confidenceInterval?: {
    lower: number
    upper: number
    level: number
  }
}
