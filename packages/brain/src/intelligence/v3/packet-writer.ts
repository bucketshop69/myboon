import type { ContentType, NarrativeAction, PublishedOutput } from '../../publisher-types.js'
import type { EditorialDecision, FactValue, PacketFact, ResearchPacket } from './contracts.js'
import { assertRenderableResearchPacket } from './packet-validator.js'

const contentTypes = ['fomo', 'signal', 'sports', 'macro', 'news', 'crypto'] as const
const unsupportedCausalityPatterns = [
  /\bbecause\b/i,
  /\bdue to\b/i,
  /\bcaused\b/i,
  /\bproves?\b/i,
  /\binsider\b/i,
  /\bleaked?\b/i,
  /\bcoordinated\b/i,
  /\bknows?\b/i,
] as const

export interface PacketWriterFact {
  id: string
  claim: string
  factType: string
  observedAt: string
  values: Record<string, FactValue>
  receipt: {
    source: string
    sourceId: string
    capturedAt: string
    rawRef?: string
  }
}

export interface PacketWriterInput {
  packetId: string
  storyKey: string
  storyCandidateId: string
  threadId?: string
  segment: ResearchPacket['segment']
  archetype: ResearchPacket['archetype']
  headlineClaim: string
  thesis: string
  whyNow: string
  whatChanged: string
  materiality: ResearchPacket['materiality']
  freshness: number
  confidence: number
  uncertainty: string[]
  facts: PacketWriterFact[]
  counterEvidence: PacketWriterFact[]
  allowedActions: NarrativeAction[]
  successCriteria: ResearchPacket['successCriteria']
  editorialConstraints: string[]
  decision: EditorialDecision
}

export interface PacketBackedPublishedRow {
  content_small: string
  content_full: string
  reasoning: string
  tags: string[]
  priority: number
  actions: NarrativeAction[]
  content_type: ContentType
  thread_id: string | null
  schema_version: number
  success_criteria: ResearchPacket['successCriteria']
  packet_id: string
  story_key: string
  story_candidate_id: string
  evidence_refs: Array<{
    factId: string
    source: string
    sourceId: string
    capturedAt: string
    rawRef?: string
  }>
}

export interface PacketOutputValidationResult {
  valid: boolean
  errors: string[]
}

function factForWriter(fact: PacketFact): PacketWriterFact {
  return {
    id: fact.id,
    claim: fact.claim,
    factType: fact.factType,
    observedAt: fact.observedAt,
    values: fact.values,
    receipt: {
      source: fact.receipt.source,
      sourceId: fact.receipt.sourceId,
      capturedAt: fact.receipt.capturedAt,
      ...(fact.receipt.rawRef ? { rawRef: fact.receipt.rawRef } : {}),
    },
  }
}

export function createPacketWriterInput(packet: ResearchPacket, decision: EditorialDecision): PacketWriterInput {
  assertRenderableResearchPacket(packet, decision)
  return {
    packetId: packet.id,
    storyKey: packet.storyKey,
    storyCandidateId: packet.storyCandidateId,
    ...(packet.threadId ? { threadId: packet.threadId } : {}),
    segment: packet.segment,
    archetype: packet.archetype,
    headlineClaim: packet.headlineClaim,
    thesis: packet.thesis,
    whyNow: packet.whyNow,
    whatChanged: packet.whatChanged,
    materiality: packet.materiality,
    freshness: packet.freshness,
    confidence: packet.confidence,
    uncertainty: packet.uncertainty,
    facts: packet.facts.map(factForWriter),
    counterEvidence: packet.counterEvidence.map(factForWriter),
    allowedActions: packet.recommendedActions.map((action) => action.type === 'perps'
      ? { type: action.type, asset: action.asset ?? '' }
      : { type: action.type, slug: action.slug ?? '' }),
    successCriteria: packet.successCriteria,
    editorialConstraints: packet.editorialConstraints,
    decision,
  }
}

export function buildPacketWriterPrompt(input: PacketWriterInput): string {
  return [
    'Write final feed output using only the approved ResearchPacket below.',
    'Do not discover new facts, calculate new numbers, infer motive, add unsupported causality, or attach actions outside allowedActions.',
    'If a number is not present in facts, materiality, confidence, freshness, or successCriteria, do not use it.',
    '',
    JSON.stringify({
      packetId: input.packetId,
      storyKey: input.storyKey,
      segment: input.segment,
      archetype: input.archetype,
      headlineClaim: input.headlineClaim,
      thesis: input.thesis,
      whyNow: input.whyNow,
      whatChanged: input.whatChanged,
      materiality: input.materiality,
      freshness: input.freshness,
      confidence: input.confidence,
      uncertainty: input.uncertainty,
      facts: input.facts,
      counterEvidence: input.counterEvidence,
      allowedActions: input.allowedActions,
      successCriteria: input.successCriteria,
      editorialConstraints: input.editorialConstraints,
    }, null, 2),
    '',
    'Return JSON matching PublishedOutput: content_small, content_full, reasoning, tags, priority, publisher_score, actions, content_type.',
  ].join('\n')
}

function collectNumericValues(value: unknown, output: number[]): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    output.push(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectNumericValues(item, output))
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectNumericValues(item, output))
  }
}

function normalizeNumberText(value: string): number | null {
  const cleaned = value.replace(/[$,]/g, '').trim().toLowerCase()
  const suffix = cleaned.endsWith('k') ? 'k' : cleaned.endsWith('m') ? 'm' : ''
  const core = suffix ? cleaned.slice(0, -1) : cleaned
  const parsed = Number(core)
  if (!Number.isFinite(parsed)) return null
  if (suffix === 'k') return parsed * 1_000
  if (suffix === 'm') return parsed * 1_000_000
  return parsed
}

function numericMentions(text: string): number[] {
  const matches = [...text.matchAll(/[$]?\d[\d,]*(?:\.\d+)?\s*[kKmM]?/g)]
  return matches
    .filter((match) => {
      const index = match.index ?? 0
      return text.slice(index, index + 2).toLowerCase() !== '0x'
    })
    .map((match) => normalizeNumberText(match[0]))
    .filter((value): value is number => value != null)
}

function isAllowedNumber(value: number, allowed: number[]): boolean {
  return allowed.some((allowedValue) => {
    if (Math.abs(value - allowedValue) < 0.0001) return true
    if (allowedValue > 0 && allowedValue < 1 && Math.abs(value - allowedValue * 100) < 0.01) return true
    if (allowedValue >= 1000 && Math.abs(value - Math.round(allowedValue)) < 0.01) return true
    return false
  })
}

function actionsEqual(a: NarrativeAction, b: NarrativeAction): boolean {
  return a.type === b.type && a.slug === b.slug && a.asset === b.asset
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value)
}

function isPlainAction(value: unknown): value is NarrativeAction {
  const action = object(value)
  if (!action) return false
  const keys = Object.keys(action).sort().join(',')
  if (action.type === 'predict') return keys === 'slug,type' && hasText(action.slug)
  if (action.type === 'perps') return keys === 'asset,type' && hasText(action.asset)
  return false
}

function outputText(output: Record<string, unknown>): string {
  return [output.content_small, output.content_full, output.reasoning]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

function packetText(input: PacketWriterInput): string {
  return [
    input.headlineClaim,
    input.thesis,
    input.whyNow,
    input.whatChanged,
    ...input.materiality.reasons,
    ...input.uncertainty,
    ...input.editorialConstraints,
    ...input.facts.map((fact) => fact.claim),
    ...input.counterEvidence.map((fact) => fact.claim),
  ].join(' ')
}

function hasUnsupportedCausality(input: PacketWriterInput, text: string): boolean {
  const sourceText = packetText(input)
  return unsupportedCausalityPatterns.some((pattern) => pattern.test(text) && !pattern.test(sourceText))
}

export function validatePacketBackedOutput(
  input: PacketWriterInput,
  outputInput: unknown
): PacketOutputValidationResult {
  const errors: string[] = []
  const output = object(outputInput)

  if (!output) {
    return { valid: false, errors: ['output must be an object'] }
  }

  if (!hasText(output.content_small)) errors.push('content_small is required')
  if (!hasText(output.content_full)) errors.push('content_full is required')
  if (!hasText(output.reasoning)) errors.push('reasoning is required')
  if (!Array.isArray(output.tags)) errors.push('tags must be an array')
  if (!Array.isArray(output.actions)) errors.push('actions must be an array')
  if (!isOneOf(output.content_type, contentTypes)) {
    errors.push(`content_type must be one of ${contentTypes.join(', ')}`)
  }
  if (typeof output.priority !== 'number' || !Number.isFinite(output.priority) || output.priority < 1 || output.priority > 10) {
    errors.push('priority must be between 1 and 10')
  }
  if (typeof output.publisher_score !== 'number' || !Number.isFinite(output.publisher_score) || output.publisher_score < 1 || output.publisher_score > 10) {
    errors.push('publisher_score must be between 1 and 10')
  }

  for (const action of Array.isArray(output.actions) ? output.actions : []) {
    if (!isPlainAction(action)) {
      errors.push(`invalid action shape: ${JSON.stringify(action)}`)
      continue
    }
    if (!input.allowedActions.some((allowed) => actionsEqual(allowed, action))) {
      errors.push(`unsupported action: ${JSON.stringify(action)}`)
    }
  }

  const allowedNumbers: number[] = []
  collectNumericValues(input.facts.map((fact) => fact.values), allowedNumbers)
  collectNumericValues(input.counterEvidence.map((fact) => fact.values), allowedNumbers)
  collectNumericValues(input.materiality, allowedNumbers)
  collectNumericValues(input.successCriteria, allowedNumbers)
  allowedNumbers.push(input.freshness, input.confidence, input.decision.priority)
  allowedNumbers.push(...numericMentions(packetText(input)))

  for (const mention of numericMentions(outputText(output))) {
    if (!isAllowedNumber(mention, allowedNumbers)) {
      errors.push(`unsupported numeric claim: ${mention}`)
    }
  }

  if (hasUnsupportedCausality(input, outputText(output))) {
    errors.push('unsupported causal or motive claim')
  }

  return { valid: errors.length === 0, errors }
}

export function assertPacketBackedOutput(input: PacketWriterInput, output: unknown): PublishedOutput {
  const result = validatePacketBackedOutput(input, output)
  if (!result.valid) {
    throw new Error(`Packet-backed output validation failed: ${result.errors.join('; ')}`)
  }
  return output as PublishedOutput
}

export function toPacketBackedPublishedRow(
  input: PacketWriterInput,
  output: PublishedOutput
): PacketBackedPublishedRow {
  assertPacketBackedOutput(input, output)
  return {
    content_small: output.content_small,
    content_full: output.content_full,
    reasoning: output.reasoning,
    tags: output.tags,
    priority: output.priority,
    actions: output.actions,
    content_type: output.content_type,
    thread_id: input.threadId ?? null,
    schema_version: 1,
    success_criteria: input.successCriteria,
    packet_id: input.packetId,
    story_key: input.storyKey,
    story_candidate_id: input.storyCandidateId,
    evidence_refs: [...input.facts, ...input.counterEvidence].map((fact) => ({
      factId: fact.id,
      source: fact.receipt.source,
      sourceId: fact.receipt.sourceId,
      capturedAt: fact.receipt.capturedAt,
      ...(fact.receipt.rawRef ? { rawRef: fact.receipt.rawRef } : {}),
    })),
  }
}
