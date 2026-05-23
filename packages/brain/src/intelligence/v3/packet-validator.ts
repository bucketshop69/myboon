import type { EditorialDecision, EntityRef, PacketFact, PacketValidationResult, ResearchPacket } from './contracts.js'

const storyKeyPattern = /^[a-z0-9]+:[a-z0-9-]+:.+/i

const segments = ['Smart Money', 'Breaking Tape', 'Receipt Check', 'Thread Update'] as const
const archetypes = ['smart_money_position', 'wallet_repeat_action'] as const
const statuses = ['new', 'update', 'developing', 'killed'] as const
const decisions = ['publish', 'update', 'hold', 'merge', 'suppress', 'escalate'] as const
const surfaces = ['feed_card', 'thread', 'push_alert', 'daily_report', 'market_detail', 'none'] as const
const sources = ['polymarket'] as const

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isScore(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value)
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function hasEntity(entities: unknown[], type: EntityRef['type']): boolean {
  return entities.some((entity) => {
    const e = object(entity)
    return e?.type === type && hasText(e.id)
  })
}

function factHasNumericValue(fact: Record<string, unknown>): boolean {
  const values = object(fact.values)
  return Boolean(values && Object.values(values).some((value) => typeof value === 'number' && Number.isFinite(value)))
}

function claimLooksNumeric(claim: unknown): boolean {
  return typeof claim === 'string' && /[$€£]?\d|%|\bc\b/i.test(claim)
}

function allNumericPacketTextIsBacked(packet: Record<string, unknown>, facts: unknown[]): boolean {
  const text = [packet.headlineClaim, packet.thesis, packet.whyNow, packet.whatChanged]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  if (!claimLooksNumeric(text)) return true
  return facts.some((fact) => {
    const f = object(fact)
    return f ? factHasNumericValue(f) : false
  })
}

function entityValue(entities: unknown[], type: EntityRef['type']): string | null {
  const found = entities.map(object).find((entity) => entity?.type === type && hasText(entity.id))
  return typeof found?.id === 'string' ? found.id : null
}

function factValue(fact: Record<string, unknown>, key: string): string | null {
  const values = object(fact.values)
  const value = values?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function validateFact(factValueRaw: unknown, path: string, errors: string[]): void {
  const fact = object(factValueRaw)
  if (!fact) {
    errors.push(`${path} must be an object`)
    return
  }

  if (!hasText(fact.id)) errors.push(`${path}.id is required`)
  if (!Array.isArray(fact.normalizedFactIds) || fact.normalizedFactIds.length === 0) {
    errors.push(`${path}.normalizedFactIds must contain at least one id`)
  }
  if (!hasText(fact.claim)) errors.push(`${path}.claim is required`)
  if (!hasText(fact.factType)) errors.push(`${path}.factType is required`)
  if (!isIsoDate(fact.observedAt)) errors.push(`${path}.observedAt must be an ISO date`)
  if (!isScore(fact.confidence)) errors.push(`${path}.confidence must be between 0 and 1`)

  const receipt = object(fact.receipt)
  if (!receipt) {
    errors.push(`${path}.receipt is required`)
  } else {
    if (!isOneOf(receipt.source, sources)) errors.push(`${path}.receipt.source must be one of ${sources.join(', ')}`)
    if (!hasText(receipt.sourceId)) errors.push(`${path}.receipt.sourceId is required`)
    if (!isIsoDate(receipt.capturedAt)) errors.push(`${path}.receipt.capturedAt must be an ISO date`)
  }

  if (!object(fact.values)) {
    errors.push(`${path}.values must be an object`)
  } else if (claimLooksNumeric(fact.claim) && !factHasNumericValue(fact)) {
    errors.push(`${path}.values must include a numeric value for numeric claim "${String(fact.claim)}"`)
  }
}

export function validateResearchPacket(packetInput: unknown, decisionInput?: unknown): PacketValidationResult {
  const errors: string[] = []
  const packet = object(packetInput)

  if (!packet) {
    return { valid: false, errors: ['packet must be an object'] }
  }

  if (packet.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (!hasText(packet.id)) errors.push('id is required')
  if (!hasText(packet.storyCandidateId)) errors.push('storyCandidateId is required')
  if (!hasText(packet.storyKey)) errors.push('storyKey is required')
  if (hasText(packet.storyKey) && !storyKeyPattern.test(packet.storyKey)) {
    errors.push('storyKey must include source and archetype prefixes')
  }
  if (!isOneOf(packet.segment, segments)) errors.push(`segment must be one of ${segments.join(', ')}`)
  if (!isOneOf(packet.archetype, archetypes)) errors.push(`archetype must be one of ${archetypes.join(', ')}`)
  if (!isOneOf(packet.status, statuses)) errors.push(`status must be one of ${statuses.join(', ')}`)
  if (!hasText(packet.headlineClaim)) errors.push('headlineClaim is required')
  if (!hasText(packet.thesis)) errors.push('thesis is required')
  if (!hasText(packet.whyNow)) errors.push('whyNow is required')
  if (!hasText(packet.whatChanged)) errors.push('whatChanged is required')
  if (!isIsoDate(packet.createdAt)) errors.push('createdAt must be an ISO date')
  if (!isScore(packet.freshness)) errors.push('freshness must be between 0 and 1')
  if (!isScore(packet.confidence)) errors.push('confidence must be between 0 and 1')

  const materiality = object(packet.materiality)
  if (!materiality || !isScore(materiality.score)) errors.push('materiality.score must be between 0 and 1')
  if (!Array.isArray(materiality?.reasons)) errors.push('materiality.reasons must be an array')

  const entities = readArray(packet.entities)
  if (!Array.isArray(packet.entities) || entities.length === 0) errors.push('entities must not be empty')
  if (!hasEntity(entities, 'wallet')) errors.push('wallet.repeat_action packet requires a wallet entity')
  if (!hasEntity(entities, 'market')) errors.push('wallet.repeat_action packet requires a market entity')

  const facts = readArray(packet.facts)
  if (!Array.isArray(packet.facts)) {
    errors.push('facts must be an array')
  } else {
    facts.forEach((fact, index) => validateFact(fact, `facts[${index}]`, errors))
  }

  const counterEvidence = readArray(packet.counterEvidence)
  if (!Array.isArray(packet.counterEvidence)) {
    errors.push('counterEvidence must be an array')
  } else {
    counterEvidence.forEach((fact, index) => validateFact(fact, `counterEvidence[${index}]`, errors))
  }

  if (!Array.isArray(packet.uncertainty)) errors.push('uncertainty must be an array')
  if (!Array.isArray(packet.recommendedActions)) errors.push('recommendedActions must be an array')
  if (!Array.isArray(packet.successCriteria)) errors.push('successCriteria must be an array')
  if (!Array.isArray(packet.editorialConstraints)) errors.push('editorialConstraints must be an array')
  if (!allNumericPacketTextIsBacked(packet, facts)) {
    errors.push('numeric packet text must be backed by numeric fact values')
  }

  const walletTradeFacts = facts.filter((fact) => object(fact)?.factType === 'wallet.trade')
  const walletId = entityValue(entities, 'wallet')
  const marketId = entityValue(entities, 'market')
  for (const [index, factRaw] of walletTradeFacts.entries()) {
    const fact = object(factRaw)
    if (!fact) continue
    const wallet = factValue(fact, 'wallet')
    const marketSlug = factValue(fact, 'marketSlug') ?? factValue(fact, 'marketId')
    if (walletId && wallet && wallet !== walletId) errors.push(`wallet.trade fact ${index} wallet does not match packet wallet entity`)
    if (marketId && marketSlug && marketSlug !== marketId) errors.push(`wallet.trade fact ${index} market does not match packet market entity`)
  }

  const decision = object(decisionInput)
  if (decisionInput != null && !decision) {
    errors.push('decision must be an object')
  }

  if (decision) {
    if (decision.schemaVersion !== 1) errors.push('decision.schemaVersion must be 1')
    if (decision.packetId !== packet.id) errors.push('decision.packetId must match packet.id')
    if (!isOneOf(decision.decision, decisions)) errors.push(`decision.decision must be one of ${decisions.join(', ')}`)
    if (!isOneOf(decision.surface, surfaces)) errors.push(`decision.surface must be one of ${surfaces.join(', ')}`)
    if (!hasText(decision.reason)) errors.push('decision.reason is required')
    if (!isFiniteNumber(decision.priority) || decision.priority < 1 || decision.priority > 10) {
      errors.push('decision.priority must be between 1 and 10')
    }
    if (decision.decision === 'publish') {
      if (walletTradeFacts.length < 2) errors.push('publishable wallet.repeat_action packet requires at least two wallet.trade facts')
      if (!Array.isArray(packet.successCriteria) || packet.successCriteria.length === 0) {
        errors.push('publish decision requires successCriteria')
      }
    }
    if (decision.decision === 'suppress' && decision.surface !== 'none') {
      errors.push('suppress decision must use surface none')
    }
    if (decision.decision === 'suppress' && readArray(materiality?.reasons).length === 0 && readArray(packet.uncertainty).length === 0) {
      errors.push('suppress decision requires materiality reasons or uncertainty')
    }
    if (decision.decision === 'hold' && readArray(packet.uncertainty).length === 0) {
      errors.push('hold decision requires uncertainty')
    }
    if (decision.decision === 'merge' && !hasText(packet.threadId)) {
      errors.push('merge decision requires packet.threadId')
    }
    if (decision.decision === 'update' && !hasText(packet.threadId)) {
      errors.push('update decision requires packet.threadId')
    }
    if (decision.decision === 'update' && decision.surface !== 'thread') {
      errors.push('update decision must use surface thread')
    }
  }

  return { valid: errors.length === 0, errors }
}

export function validateApprovedResearchPacket(packet: unknown, decision: unknown): PacketValidationResult {
  const errors = validateResearchPacket(packet, decision).errors
  const d = object(decision)
  if (!d || d.decision !== 'publish') {
    errors.push('approved writer handoff requires a publish decision')
  }
  return { valid: errors.length === 0, errors }
}

export function validateRenderableResearchPacket(packet: unknown, decision: unknown): PacketValidationResult {
  const errors = validateResearchPacket(packet, decision).errors
  const d = object(decision)
  if (!d || (d.decision !== 'publish' && d.decision !== 'update')) {
    errors.push('renderable writer handoff requires a publish or update decision')
  }
  return { valid: errors.length === 0, errors }
}

export function assertValidResearchPacket(packet: unknown, decision?: unknown): ResearchPacket {
  const result = validateResearchPacket(packet, decision)
  if (!result.valid) {
    throw new Error(`ResearchPacket validation failed: ${result.errors.join('; ')}`)
  }
  return packet as ResearchPacket
}

export function assertApprovedResearchPacket(packet: unknown, decision: unknown): ResearchPacket {
  const result = validateApprovedResearchPacket(packet, decision)
  if (!result.valid) {
    throw new Error(`ResearchPacket approval failed: ${result.errors.join('; ')}`)
  }
  return packet as ResearchPacket
}

export function assertRenderableResearchPacket(packet: unknown, decision: unknown): ResearchPacket {
  const result = validateRenderableResearchPacket(packet, decision)
  if (!result.valid) {
    throw new Error(`ResearchPacket renderability failed: ${result.errors.join('; ')}`)
  }
  return packet as ResearchPacket
}
