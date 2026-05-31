import type { OutcomeCriterion } from '../contracts.js'

export const FEED_V3_SCHEMA_VERSION = 1 as const

export type V3Source = 'polymarket' | 'hyperliquid' | 'internal' | 'the_graph_token_api'

export type EntityType = 'wallet' | 'market' | 'outcome' | 'source' | 'asset' | 'protocol' | 'theme' | 'sector'

export type Segment =
  | 'Smart Money'
  | 'Breaking Tape'
  | 'Receipt Check'
  | 'Thread Update'
  | 'Crowded Trade'
  | 'Market Structure'

export type Archetype =
  | 'smart_money_position'
  | 'wallet_repeat_action'
  | 'funding_pressure'
  | 'volume_expansion'
  | 'price_momentum'
  | 'watchlist_wallet_behavior'
  | 'entity_research_update'

export type EventKind =
  | 'wallet.repeat_action'
  | 'wallet.trade'
  | 'odds.repricing'
  | 'market.snapshot'
  | 'perps.funding_pressure'
  | 'perps.volume_expansion'
  | 'perps.price_momentum'

export type PacketStatus = 'new' | 'update' | 'developing' | 'killed'

export type EditorialDecisionKind = 'publish' | 'update' | 'hold' | 'merge' | 'suppress' | 'escalate'

export type EditorialSurface = 'feed_card' | 'thread' | 'push_alert' | 'daily_report' | 'market_detail' | 'none'

export type V3SignalDirection = 'up' | 'down' | 'neutral' | 'unknown'

export type FactValue = number | string | boolean | null

export interface EntityRef {
  type: EntityType
  id: string
  canonicalName: string
}

export interface FactTrace {
  source: V3Source
  sourceId: string
  capturedAt: string
  url?: string
  rawRef?: string
}

export interface RawFact<TPayload = unknown> {
  schemaVersion: typeof FEED_V3_SCHEMA_VERSION
  id: string
  source: V3Source
  sourceKind: string
  observedAt: string
  receivedAt: string
  dedupeKey: string
  entityHints: Record<string, unknown>
  rawPayload: TPayload
  trace: FactTrace
}

export interface NormalizedFact {
  schemaVersion: typeof FEED_V3_SCHEMA_VERSION
  id: string
  rawFactIds: string[]
  factType: 'wallet.trade' | 'market.snapshot' | 'odds.snapshot'
  observedAt: string
  entities: EntityRef[]
  values: Record<string, FactValue>
  labels: string[]
  trace: FactTrace[]
}

export interface ClassifiedEvent {
  schemaVersion: typeof FEED_V3_SCHEMA_VERSION
  id: string
  eventKind: EventKind
  normalizedFactIds: string[]
  entityRefs: EntityRef[]
  direction: V3SignalDirection
  magnitude: number
  confidence: number
  urgency: number
  novelty: number
  ruleId: string
  scoringVersion: number
  observedAt: string
  classifiedAt: string
}

export interface StoryCandidate {
  schemaVersion: typeof FEED_V3_SCHEMA_VERSION
  id: string
  storyKey: string
  segment: Segment
  archetype: Archetype
  entityRefs: EntityRef[]
  eventIds: string[]
  thesis: string
  whyNow: string
  evidenceSummary: string
  noveltyScore: number
  urgencyScore: number
  confidenceScore: number
  publishabilityScore: number
  suppressReasons: string[]
  createdAt: string
}

export interface PacketFact {
  id: string
  normalizedFactIds: string[]
  claim: string
  factType: string
  observedAt: string
  values: Record<string, FactValue>
  receipt: FactTrace
  confidence: number
}

export interface RecommendedAction {
  type: 'predict' | 'perps'
  slug?: string
  asset?: string
}

export interface ResearchPacket {
  schemaVersion: typeof FEED_V3_SCHEMA_VERSION
  id: string
  storyCandidateId: string
  storyKey: string
  threadId?: string
  segment: Segment
  archetype: Archetype
  status: PacketStatus
  headlineClaim: string
  thesis: string
  whyNow: string
  whatChanged: string
  entities: EntityRef[]
  facts: PacketFact[]
  counterEvidence: PacketFact[]
  materiality: {
    score: number
    reasons: string[]
  }
  freshness: number
  confidence: number
  uncertainty: string[]
  recommendedActions: RecommendedAction[]
  successCriteria: OutcomeCriterion[]
  editorialConstraints: string[]
  createdAt: string
}

export interface EditorialDecision {
  schemaVersion: typeof FEED_V3_SCHEMA_VERSION
  packetId: string
  decision: EditorialDecisionKind
  surface: EditorialSurface
  priority: number
  reason: string
  expiresAt?: string
}

export interface PacketValidationResult {
  valid: boolean
  errors: string[]
}
