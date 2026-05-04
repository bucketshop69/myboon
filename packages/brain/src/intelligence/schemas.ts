import {
  INTELLIGENCE_SCHEMA_VERSION,
  type BacktestRunSummary,
  type ClassifiedSignal,
  type NarrativeCandidate,
  type NarrativeOutcome,
  type OutcomeCriterion,
  type PublishedNarrative,
  type RawEvent,
} from './contracts.js'

export interface RuntimeSchema<T> {
  readonly name: string
  parse(value: unknown): T
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: Error }
}

type Validator<T> = (value: unknown, path: string) => T

function schema<T>(name: string, validate: Validator<T>): RuntimeSchema<T> {
  return {
    name,
    parse(value: unknown): T {
      return validate(value, name)
    },
    safeParse(value: unknown) {
      try {
        return { success: true, data: validate(value, name) }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error : new Error(String(error)) }
      }
    },
  }
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`)
}

function object(value: unknown, path: string): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fail(path, 'expected object')
}

function string(value: unknown, path: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fail(path, 'expected non-empty string')
}

function number(value: unknown, path: string): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fail(path, 'expected finite number')
}

function integer(value: unknown, path: string): number {
  const n = number(value, path)
  return Number.isInteger(n) ? n : fail(path, 'expected integer')
}

function literal<T extends string | number | boolean>(value: unknown, expected: T, path: string): T {
  return value === expected ? expected : fail(path, `expected ${String(expected)}`)
}

function optional<T>(value: unknown, path: string, validate: Validator<T>): T | undefined {
  return value == null ? undefined : validate(value, path)
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) fail(path, 'expected array')
  return value.map((item, index) => string(item, `${path}[${index}]`))
}

function record(value: unknown, path: string): Record<string, unknown> {
  return object(value, path)
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  return typeof value === 'string' && allowed.includes(value)
    ? value
    : fail(path, `expected one of ${allowed.join(', ')}`)
}

function isoDate(value: unknown, path: string): string {
  const text = string(value, path)
  if (Number.isNaN(new Date(text).getTime())) fail(path, 'expected ISO date string')
  return text
}

function contractVersion(value: unknown, path: string): typeof INTELLIGENCE_SCHEMA_VERSION {
  return literal(value, INTELLIGENCE_SCHEMA_VERSION, path)
}

const sources = ['polymarket'] as const
const rawKinds = ['polymarket.market_snapshot', 'polymarket.odds_snapshot', 'polymarket.volume_liquidity_snapshot', 'polymarket.large_trade', 'polymarket.resolution'] as const
const signalKinds = ['polymarket.odds_shift', 'polymarket.volume_spike', 'polymarket.liquidity_expansion', 'polymarket.large_trade', 'polymarket.resolution'] as const
const directions = ['up', 'down', 'neutral', 'unknown'] as const
const baselines = ['random_candidate', 'largest_raw_odds_delta', 'largest_trade_amount'] as const

function entityRef(value: unknown, path: string): RawEvent['entityRef'] {
  const v = object(value, path)
  return {
    marketId: optional(v.marketId, `${path}.marketId`, string),
    slug: optional(v.slug, `${path}.slug`, string),
    conditionId: optional(v.conditionId, `${path}.conditionId`, string),
    assetId: optional(v.assetId, `${path}.assetId`, string),
  }
}

function traceRef(value: unknown, path: string): RawEvent['trace'] {
  const v = object(value, path)
  return {
    source: enumValue(v.source, sources, `${path}.source`),
    sourceId: string(v.sourceId, `${path}.sourceId`),
    fetchedAt: isoDate(v.fetchedAt, `${path}.fetchedAt`),
    url: optional(v.url, `${path}.url`, string),
    rawSnapshotId: optional(v.rawSnapshotId, `${path}.rawSnapshotId`, string),
  }
}

function traceArray(value: unknown, path: string): RawEvent['trace'][] {
  if (!Array.isArray(value)) fail(path, 'expected array')
  return value.map((item, index) => traceRef(item, `${path}[${index}]`))
}

function scoreBreakdown(value: unknown, path: string): ClassifiedSignal['score'] {
  const v = object(value, path)
  return {
    confidence: number(v.confidence, `${path}.confidence`),
    urgency: number(v.urgency, `${path}.urgency`),
    freshness: number(v.freshness, `${path}.freshness`),
    sourceReliability: number(v.sourceReliability, `${path}.sourceReliability`),
    signalWeight: number(v.signalWeight, `${path}.signalWeight`),
    dedupePriority: number(v.dedupePriority, `${path}.dedupePriority`),
  }
}

function outcomeCriterion(value: unknown, path: string): OutcomeCriterion {
  const v = object(value, path)
  const kind = string(v.kind, `${path}.kind`)
  if (kind === 'odds_move') {
    return {
      kind,
      direction: enumValue(v.direction, ['up', 'down'] as const, `${path}.direction`),
      targetDelta: number(v.targetDelta, `${path}.targetDelta`),
      windowHours: number(v.windowHours, `${path}.windowHours`),
    }
  }
  if (kind === 'market_resolution') {
    return {
      kind,
      expectedOutcome: string(v.expectedOutcome, `${path}.expectedOutcome`),
      windowHours: optional(v.windowHours, `${path}.windowHours`, number),
    }
  }
  if (kind === 'volume_or_liquidity_follow_through') {
    return {
      kind,
      targetMultiplier: number(v.targetMultiplier, `${path}.targetMultiplier`),
      windowHours: number(v.windowHours, `${path}.windowHours`),
    }
  }
  return fail(`${path}.kind`, 'unknown outcome criterion kind')
}

function criteria(value: unknown, path: string): OutcomeCriterion[] {
  if (!Array.isArray(value)) fail(path, 'expected array')
  return value.map((item, index) => outcomeCriterion(item, `${path}[${index}]`))
}

export const OutcomeCriterionSchema = schema<OutcomeCriterion>('OutcomeCriterion', outcomeCriterion)

export const RawEventSchema = schema<RawEvent>('RawEvent', (value, path) => {
  const v = object(value, path)
  return {
    schemaVersion: contractVersion(v.schemaVersion, `${path}.schemaVersion`),
    id: string(v.id, `${path}.id`),
    source: enumValue(v.source, sources, `${path}.source`),
    kind: enumValue(v.kind, rawKinds, `${path}.kind`),
    entityRef: entityRef(v.entityRef, `${path}.entityRef`),
    observedAt: isoDate(v.observedAt, `${path}.observedAt`),
    receivedAt: isoDate(v.receivedAt, `${path}.receivedAt`),
    dedupeKey: string(v.dedupeKey, `${path}.dedupeKey`),
    trace: traceRef(v.trace, `${path}.trace`),
    payload: v.payload,
  }
})

export const ClassifiedSignalSchema = schema<ClassifiedSignal>('ClassifiedSignal', (value, path) => {
  const v = object(value, path)
  return {
    schemaVersion: contractVersion(v.schemaVersion, `${path}.schemaVersion`),
    id: string(v.id, `${path}.id`),
    kind: enumValue(v.kind, signalKinds, `${path}.kind`),
    source: enumValue(v.source, sources, `${path}.source`),
    featureSnapshotIds: stringArray(v.featureSnapshotIds, `${path}.featureSnapshotIds`),
    entityRef: entityRef(v.entityRef, `${path}.entityRef`),
    direction: enumValue(v.direction, directions, `${path}.direction`),
    observedAt: isoDate(v.observedAt, `${path}.observedAt`),
    classifiedAt: isoDate(v.classifiedAt, `${path}.classifiedAt`),
    scoringVersion: integer(v.scoringVersion, `${path}.scoringVersion`) as ClassifiedSignal['scoringVersion'],
    ruleId: string(v.ruleId, `${path}.ruleId`),
    score: scoreBreakdown(v.score, `${path}.score`),
    metadata: record(v.metadata, `${path}.metadata`),
    trace: traceArray(v.trace, `${path}.trace`),
  }
})

export const NarrativeCandidateSchema = schema<NarrativeCandidate>('NarrativeCandidate', (value, path) => {
  const v = object(value, path)
  return {
    schemaVersion: contractVersion(v.schemaVersion, `${path}.schemaVersion`),
    id: string(v.id, `${path}.id`),
    source: enumValue(v.source, sources, `${path}.source`),
    signalIds: stringArray(v.signalIds, `${path}.signalIds`),
    entityRef: entityRef(v.entityRef, `${path}.entityRef`),
    title: string(v.title, `${path}.title`),
    thesis: string(v.thesis, `${path}.thesis`),
    whyNow: string(v.whyNow, `${path}.whyNow`),
    invalidation: string(v.invalidation, `${path}.invalidation`),
    narrativeScore: number(v.narrativeScore, `${path}.narrativeScore`),
    scoringVersion: integer(v.scoringVersion, `${path}.scoringVersion`) as NarrativeCandidate['scoringVersion'],
    successCriteria: criteria(v.successCriteria, `${path}.successCriteria`),
    createdAt: isoDate(v.createdAt, `${path}.createdAt`),
  }
})

export const PublishedNarrativeSchema = schema<PublishedNarrative>('PublishedNarrative', (value, path) => {
  const v = object(value, path)
  return {
    ...NarrativeCandidateSchema.parse(value),
    publishedAt: isoDate(v.publishedAt, `${path}.publishedAt`),
    editorVersion: integer(v.editorVersion, `${path}.editorVersion`),
    status: literal(v.status, 'published', `${path}.status`),
  }
})

export const NarrativeOutcomeSchema = schema<NarrativeOutcome>('NarrativeOutcome', (value, path) => {
  const v = object(value, path)
  return {
    schemaVersion: contractVersion(v.schemaVersion, `${path}.schemaVersion`),
    id: string(v.id, `${path}.id`),
    narrativeId: string(v.narrativeId, `${path}.narrativeId`),
    evaluatedAt: isoDate(v.evaluatedAt, `${path}.evaluatedAt`),
    criteria: criteria(v.criteria, `${path}.criteria`),
    result: enumValue(v.result, ['hit', 'miss', 'inconclusive'] as const, `${path}.result`),
    measuredValues: record(v.measuredValues, `${path}.measuredValues`) as NarrativeOutcome['measuredValues'],
    scoringVersion: integer(v.scoringVersion, `${path}.scoringVersion`) as NarrativeOutcome['scoringVersion'],
    notes: optional(v.notes, `${path}.notes`, string),
  }
})

export const BacktestRunSummarySchema = schema<BacktestRunSummary>('BacktestRunSummary', (value, path) => {
  const v = object(value, path)
  const confidenceInterval = optional(v.confidenceInterval, `${path}.confidenceInterval`, (ci, ciPath) => {
    const c = object(ci, ciPath)
    return {
      lower: number(c.lower, `${ciPath}.lower`),
      upper: number(c.upper, `${ciPath}.upper`),
      level: number(c.level, `${ciPath}.level`),
    }
  })
  return {
    schemaVersion: contractVersion(v.schemaVersion, `${path}.schemaVersion`),
    id: string(v.id, `${path}.id`),
    source: enumValue(v.source, sources, `${path}.source`),
    signalKind: enumValue(v.signalKind, signalKinds, `${path}.signalKind`),
    startedAt: isoDate(v.startedAt, `${path}.startedAt`),
    completedAt: optional(v.completedAt, `${path}.completedAt`, isoDate),
    windowStart: isoDate(v.windowStart, `${path}.windowStart`),
    windowEnd: isoDate(v.windowEnd, `${path}.windowEnd`),
    requestedWindowDays: optional(v.requestedWindowDays, `${path}.requestedWindowDays`, number),
    actualWindowDays: number(v.actualWindowDays, `${path}.actualWindowDays`),
    scoringVersion: integer(v.scoringVersion, `${path}.scoringVersion`) as BacktestRunSummary['scoringVersion'],
    baseline: enumValue(v.baseline, baselines, `${path}.baseline`),
    candidateCount: integer(v.candidateCount, `${path}.candidateCount`),
    hitRate: number(v.hitRate, `${path}.hitRate`),
    baselineHitRate: number(v.baselineHitRate, `${path}.baselineHitRate`),
    ...(confidenceInterval ? { confidenceInterval } : {}),
  }
})

export function parseIntelligenceContract<T>(runtimeSchema: RuntimeSchema<T>, value: unknown): T {
  return runtimeSchema.parse(value)
}
