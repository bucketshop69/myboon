import { compactString, normalizeSlug } from './normalization'
import type {
  EntityMemoryType,
  ManualEntityActorKind,
  ManualEntityCommand,
  NormalizedManualEntityCommand,
} from './types'

const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const ACTOR_KINDS = new Set<ManualEntityActorKind>(['dashboard', 'codex', 'agent', 'cli'])
const MEMORY_TYPES = new Set<Exclude<EntityMemoryType, 'source_marker'>>([
  'research_note',
  'market_signal',
  'news_event',
  'social_signal',
  'timeline_event',
  'metric_change',
])
const MAX_MEMORIES = 100

export class ManualEntityValidationError extends Error {
  readonly code = 'manual_entity_validation_failed'

  constructor(message: string) {
    super(message)
    this.name = 'ManualEntityValidationError'
  }
}

export function normalizeManualEntityCommand(
  input: ManualEntityCommand | unknown,
  now = new Date(),
): NormalizedManualEntityCommand {
  const command = record(input, 'Command must be an object.')
  const requestId = requiredText(command.requestId, 'requestId', 128)
  if (!REQUEST_ID_RE.test(requestId)) {
    throw new ManualEntityValidationError('requestId must be 8-128 URL-safe characters.')
  }

  const actorInput = record(command.actor, 'actor must be an object.')
  const actorKind = requiredText(actorInput.kind, 'actor.kind', 32) as ManualEntityActorKind
  if (!ACTOR_KINDS.has(actorKind)) {
    throw new ManualEntityValidationError('actor.kind must be dashboard, codex, agent, or cli.')
  }
  const actorName = requiredText(actorInput.name, 'actor.name', 120)

  const entityInput = record(command.entity, 'entity must be an object.')
  const entityName = requiredText(entityInput.name, 'entity.name', 160)
  const entityType = requiredText(entityInput.type, 'entity.type', 80)
  const entitySlug = normalizeSlug(entityInput.slug, entityName)
  const aliases = uniqueStrings([entityName, ...array(entityInput.aliases)])
  const metadata = optionalRecord(entityInput.metadata, 'entity.metadata')

  const entity: NormalizedManualEntityCommand['entity'] = {
    name: entityName,
    type: entityType,
    slug: entitySlug,
    aliases,
    metadata,
  }
  if (hasOwn(entityInput, 'summary')) {
    entity.summary = entityInput.summary === null ? null : optionalText(entityInput.summary, 'entity.summary', 1200) || null
  }
  if (hasOwn(entityInput, 'status')) {
    entity.status = requiredText(entityInput.status, 'entity.status', 40)
  }
  if (hasOwn(entityInput, 'showInCarousel')) {
    if (typeof entityInput.showInCarousel !== 'boolean') {
      throw new ManualEntityValidationError('entity.showInCarousel must be a boolean.')
    }
    entity.showInCarousel = entityInput.showInCarousel
  }

  const memoryInputs = array(command.memories)
  if (memoryInputs.length > MAX_MEMORIES) {
    throw new ManualEntityValidationError(`A command can contain at most ${MAX_MEMORIES} memories.`)
  }
  const observedFallback = now.toISOString()
  const memories = memoryInputs.map((value, index) => {
    const memory = record(value, `memories[${index}] must be an object.`)
    const memoryType = requiredText(memory.memoryType, `memories[${index}].memoryType`, 40) as Exclude<EntityMemoryType, 'source_marker'>
    if (!MEMORY_TYPES.has(memoryType)) {
      throw new ManualEntityValidationError(`memories[${index}].memoryType is not supported.`)
    }
    const eventAt = timestamp(memory.eventAt, `memories[${index}].eventAt`)
    const observedAt = hasOwn(memory, 'observedAt')
      ? timestamp(memory.observedAt, `memories[${index}].observedAt`)
      : observedFallback
    const sourceUrl = optionalNullableText(memory.sourceUrl, `memories[${index}].sourceUrl`, 2000)
    const confidence = optionalConfidence(memory.confidence, `memories[${index}].confidence`)
    return {
      memoryType,
      title: requiredText(memory.title, `memories[${index}].title`, 240),
      summary: requiredText(memory.summary, `memories[${index}].summary`, 1200),
      body: optionalNullableText(memory.body, `memories[${index}].body`, 20_000),
      eventAt,
      observedAt,
      confidence,
      evidence: array(memory.evidence),
      mentions: uniqueStrings(array(memory.mentions)),
      metrics: optionalRecord(memory.metrics, `memories[${index}].metrics`),
      context: optionalRecord(memory.context, `memories[${index}].context`),
      sourceLabel: optionalText(memory.sourceLabel, `memories[${index}].sourceLabel`, 160) || 'manual',
      sourceUrl,
      sourceRefId: optionalText(memory.sourceRefId, `memories[${index}].sourceRefId`, 2000)
        || sourceUrl
        || `${requestId}:${index + 1}`,
      sourceType: optionalText(memory.sourceType, `memories[${index}].sourceType`, 80) || 'manual_entry',
    }
  })

  return {
    requestId,
    actor: { kind: actorKind, name: actorName },
    entity,
    memories,
  }
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManualEntityValidationError(message)
  }
  return value as Record<string, unknown>
}

function optionalRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) return {}
  return record(value, `${field} must be an object.`)
}

function array(value: unknown): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new ManualEntityValidationError('Expected an array.')
  return value
}

function requiredText(value: unknown, field: string, max: number): string {
  const text = optionalText(value, field, max)
  if (!text) throw new ManualEntityValidationError(`${field} is required.`)
  return text
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new ManualEntityValidationError(`${field} must be text.`)
  const text = compactString(value)
  if (text.length > max) throw new ManualEntityValidationError(`${field} must be at most ${max} characters.`)
  return text
}

function optionalNullableText(value: unknown, field: string, max: number): string | null {
  return optionalText(value, field, max) || null
}

function timestamp(value: unknown, field: string): string {
  const text = requiredText(value, field, 80)
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) throw new ManualEntityValidationError(`${field} must be a valid date.`)
  return parsed.toISOString()
}

function optionalConfidence(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ManualEntityValidationError(`${field} must be a number between 0 and 1.`)
  }
  return value
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const text = compactString(value)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    output.push(text)
  }
  return output
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}
