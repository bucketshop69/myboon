import type { HyperliquidResearchLead, HyperliquidResearchLeadLane } from '@myboon/collectors/hyperliquid/research-leads'

import {
  FEED_V3_SCHEMA_VERSION,
  type Archetype,
  type EditorialDecision,
  type EntityRef,
  type FactTrace,
  type PacketFact,
  type ResearchPacket,
  type Segment,
} from './contracts.js'

export interface EntityResearchNote {
  id: string
  observedAt: string
  leadId: string
  lane: HyperliquidResearchLeadLane
  title: string
  finding: string
  thesisImpact: 'new_note' | 'supports' | 'complicates' | 'contradicts'
  memoryUpdate: string
  nextQuestions: string[]
  receiptRefs: FactTrace[]
}

export interface EntityResearchBook {
  entity: EntityRef
  generatedAt: string
  thesis: string[]
  openQuestions: string[]
  notes: EntityResearchNote[]
  relatedPacketIds: string[]
}

export interface HyperliquidEntityResearchPacket {
  packet: ResearchPacket
  decision: EditorialDecision
  entityBookNote: EntityResearchNote
}

export interface HyperliquidEntityResearchResult {
  generatedAt: string
  source: 'hyperliquid'
  packets: HyperliquidEntityResearchPacket[]
  entityBooks: EntityResearchBook[]
}

export interface HyperliquidEntityResearchOptions {
  now: string
  maxPackets?: number
  includeWatch?: boolean
  existingBooks?: EntityResearchBook[]
  skipExistingNotes?: boolean
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function hoursBetween(fromIso: string, toIso: string): number {
  return Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3_600_000)
}

function leadEntity(lead: HyperliquidResearchLead): EntityRef {
  return {
    type: 'asset',
    id: lead.asset.toUpperCase(),
    canonicalName: lead.asset.toUpperCase(),
  }
}

function walletEntity(lead: HyperliquidResearchLead): EntityRef | null {
  const wallet = lead.metrics.wallet
  if (typeof wallet !== 'string' || wallet.trim().length === 0) return null
  return {
    type: 'wallet',
    id: wallet,
    canonicalName: wallet,
  }
}

function bookId(entity: EntityRef): string {
  return `${entity.type}:${entity.id}`.toLowerCase()
}

function defaultBook(entity: EntityRef, now: string): EntityResearchBook {
  return {
    entity,
    generatedAt: now,
    thesis: [
      `${entity.canonicalName} is being tracked as a market entity. The book should accumulate evidence over time instead of treating every lead as isolated.`,
    ],
    openQuestions: [
      `What usually drives ${entity.canonicalName}: protocol fundamentals, sector beta, venue-specific leverage, or short-term positioning?`,
      `Which signals have historically mattered most for ${entity.canonicalName}?`,
    ],
    notes: [],
    relatedPacketIds: [],
  }
}

function segmentForLane(lane: HyperliquidResearchLeadLane): Segment {
  if (lane === 'funding_pressure') return 'Crowded Trade'
  if (lane === 'watchlist_wallet') return 'Smart Money'
  if (lane === 'volume_spike' || lane === 'price_momentum') return 'Breaking Tape'
  return 'Market Structure'
}

function archetypeForLane(lane: HyperliquidResearchLeadLane): Archetype {
  if (lane === 'funding_pressure') return 'funding_pressure'
  if (lane === 'volume_spike') return 'volume_expansion'
  if (lane === 'price_momentum') return 'price_momentum'
  if (lane === 'watchlist_wallet') return 'watchlist_wallet_behavior'
  return 'entity_research_update'
}

function sourceTrace(lead: HyperliquidResearchLead): FactTrace {
  const receipt = lead.receipts[0]
  return {
    source: receipt?.source ?? 'hyperliquid',
    sourceId: receipt?.sourceId ?? lead.id,
    capturedAt: receipt?.capturedAt ?? lead.observedAt,
    ...(receipt?.rawRef ? { rawRef: receipt.rawRef } : {}),
  }
}

function leadFact(lead: HyperliquidResearchLead): PacketFact {
  return {
    id: `fact:hyperliquid:${lead.id}`,
    normalizedFactIds: [`normalized:hyperliquid:${lead.id}`],
    claim: lead.whatChanged,
    factType: `hyperliquid.${lead.lane}`,
    observedAt: lead.observedAt,
    values: {
      asset: lead.asset,
      lane: lead.lane,
      priority: lead.priority,
      status: lead.status,
      ...lead.metrics,
    },
    receipt: sourceTrace(lead),
    confidence: lead.status === 'research' ? 0.82 : 0.64,
  }
}

function thesisImpact(lead: HyperliquidResearchLead, book: EntityResearchBook): EntityResearchNote['thesisImpact'] {
  if (book.notes.length === 0) return 'new_note'
  if (lead.lane === 'funding_pressure') return 'complicates'
  if (lead.lane === 'volume_spike' || lead.lane === 'price_momentum') return 'supports'
  return 'new_note'
}

function laneJudgment(lead: HyperliquidResearchLead, book: EntityResearchBook): string {
  const entity = lead.asset.toUpperCase()
  const hasPrior = book.notes.length > 0

  if (lead.lane === 'funding_pressure') {
    return hasPrior
      ? `${entity} funding pressure should be read against the existing book: it can confirm demand, but it can also mean the trade is getting crowded.`
      : `${entity} now has a first derivatives-positioning note. Funding pressure suggests traders are paying to hold one side, but it does not explain the cause by itself.`
  }

  if (lead.lane === 'volume_spike') {
    return hasPrior
      ? `${entity} volume expansion adds activity evidence to the existing thesis. Research should check whether this is entity-specific or part of a wider basket move.`
      : `${entity} now has a first activity note. Volume expansion says attention changed, but the book still needs cause, sector context, and follow-through.`
  }

  if (lead.lane === 'price_momentum') {
    return hasPrior
      ? `${entity} price momentum updates the existing book with market confirmation or stress. The key question is whether positioning followed price or only price moved.`
      : `${entity} now has a first price-action note. The move is observable, but the packet should not claim a cause until context is added.`
  }

  if (lead.lane === 'watchlist_wallet') {
    return `${entity} has watched-wallet evidence. Treat this as supporting context unless market structure also confirms the same direction.`
  }

  return `${entity} has a new market-structure note that should be connected to the entity book before writing.`
}

function memoryUpdate(lead: HyperliquidResearchLead, book: EntityResearchBook): string {
  const entity = lead.asset.toUpperCase()
  const judgment = laneJudgment(lead, book)
  return `${entity}: ${judgment} Latest evidence: ${lead.whatChanged}`
}

function packetThesis(lead: HyperliquidResearchLead, book: EntityResearchBook): string {
  const existing = book.thesis[0] ?? `${lead.asset} has no prior thesis yet.`
  return [
    laneJudgment(lead, book),
    `Existing book context: ${existing}`,
  ].join(' ')
}

function whyNow(lead: HyperliquidResearchLead): string {
  const failed = lead.checks.filter((check) => !check.passed)
  if (lead.status === 'research') {
    return `The ${lead.lane.replace(/_/g, ' ')} lead passed the research gate on ${lead.observedAt}.`
  }
  return `This is a watch lead, not a publish lead. It is useful because it nearly met the research gate or adds context, but failed ${failed.length} check(s).`
}

function materialityReasons(lead: HyperliquidResearchLead, book: EntityResearchBook): string[] {
  const passed = lead.checks.filter((check) => check.passed).map((check) => `${check.name}: ${check.value}`)
  const reasons = [
    `${lead.lane.replace(/_/g, ' ')} lead status is ${lead.status}`,
    ...passed.slice(0, 4),
  ]
  if (book.notes.length > 0) reasons.push(`entity book already has ${book.notes.length} prior note(s)`)
  return reasons
}

function uncertainty(lead: HyperliquidResearchLead, book: EntityResearchBook): string[] {
  const failedChecks = lead.checks
    .filter((check) => !check.passed)
    .slice(0, 4)
    .map((check) => `${check.name} failed: ${check.value} vs ${check.threshold}`)
  return [
    ...lead.uncertainty,
    ...failedChecks,
    ...book.openQuestions.slice(0, 2),
  ]
}

function noteFromLead(lead: HyperliquidResearchLead, book: EntityResearchBook): EntityResearchNote {
  return {
    id: `note:hyperliquid:${lead.id}`,
    observedAt: lead.observedAt,
    leadId: lead.id,
    lane: lead.lane,
    title: lead.headline,
    finding: lead.whatChanged,
    thesisImpact: thesisImpact(lead, book),
    memoryUpdate: memoryUpdate(lead, book),
    nextQuestions: lead.suggestedResearchQuestions.length > 0
      ? lead.suggestedResearchQuestions
      : book.openQuestions.slice(0, 3),
    receiptRefs: lead.receipts.length > 0
      ? lead.receipts.map((receipt) => ({
        source: receipt.source,
        sourceId: receipt.sourceId,
        capturedAt: receipt.capturedAt,
        ...(receipt.rawRef ? { rawRef: receipt.rawRef } : {}),
      }))
      : [sourceTrace(lead)],
  }
}

function decisionForPacket(packet: ResearchPacket, lead: HyperliquidResearchLead): EditorialDecision {
  const shouldEscalate = lead.status === 'research' && lead.priority >= 8
  return {
    schemaVersion: FEED_V3_SCHEMA_VERSION,
    packetId: packet.id,
    decision: shouldEscalate ? 'escalate' : 'hold',
    surface: 'none',
    priority: Math.max(1, Math.min(10, Math.round(lead.priority))),
    reason: shouldEscalate
      ? 'Strong research lead; escalate for deeper context before writing.'
      : 'Research packet created for entity memory. Hold until editor/writer stage is enabled.',
  }
}

function packetFromLead(lead: HyperliquidResearchLead, book: EntityResearchBook, now: string): ResearchPacket {
  const entity = leadEntity(lead)
  const wallet = walletEntity(lead)
  const entities = wallet ? [entity, wallet] : [entity]
  const packet: ResearchPacket = {
    schemaVersion: FEED_V3_SCHEMA_VERSION,
    id: `packet:${lead.storyKey}:${normalizePart(lead.observedAt)}`,
    storyCandidateId: `candidate:${lead.storyKey}`,
    storyKey: lead.storyKey,
    segment: segmentForLane(lead.lane),
    archetype: archetypeForLane(lead.lane),
    status: book.notes.length > 0 ? 'developing' : 'new',
    headlineClaim: lead.headline,
    thesis: packetThesis(lead, book),
    whyNow: whyNow(lead),
    whatChanged: lead.whatChanged,
    entities,
    facts: [leadFact(lead)],
    counterEvidence: [],
    materiality: {
      score: clamp01(lead.priority / 10),
      reasons: materialityReasons(lead, book),
    },
    freshness: clamp01(1 - hoursBetween(lead.observedAt, now) / (7 * 24)),
    confidence: clamp01((lead.status === 'research' ? 0.62 : 0.45) + lead.checks.filter((check) => check.passed).length * 0.035),
    uncertainty: uncertainty(lead, book),
    recommendedActions: [{ type: 'perps', asset: lead.asset }],
    successCriteria: [],
    editorialConstraints: [
      'Do not claim causality without external or cross-signal confirmation.',
      'Treat this as research memory until an editor approves publication.',
      'If used later, mention uncertainty instead of implying motive.',
    ],
    createdAt: now,
  }
  return packet
}

function shouldResearchLead(lead: HyperliquidResearchLead, includeWatch: boolean): boolean {
  return lead.status === 'research' || (includeWatch && lead.status === 'watch')
}

export function buildHyperliquidEntityResearch(
  leads: HyperliquidResearchLead[],
  options: HyperliquidEntityResearchOptions
): HyperliquidEntityResearchResult {
  const includeWatch = options.includeWatch ?? true
  const maxPackets = options.maxPackets ?? 25
  const books = new Map<string, EntityResearchBook>()

  for (const existing of options.existingBooks ?? []) {
    books.set(bookId(existing.entity), {
      ...existing,
      notes: [...existing.notes],
      thesis: [...existing.thesis],
      openQuestions: [...existing.openQuestions],
      relatedPacketIds: [...existing.relatedPacketIds],
    })
  }

  const selected = leads
    .filter((lead) => shouldResearchLead(lead, includeWatch))
    .sort((a, b) => b.priority - a.priority || a.observedAt.localeCompare(b.observedAt))
    .slice(0, maxPackets)

  const packets: HyperliquidEntityResearchPacket[] = []
  for (const lead of selected) {
    const entity = leadEntity(lead)
    const id = bookId(entity)
    const book = books.get(id) ?? defaultBook(entity, options.now)
    books.set(id, book)

    if (options.skipExistingNotes && book.notes.some((note) => note.id === `note:hyperliquid:${lead.id}`)) {
      continue
    }

    const packet = packetFromLead(lead, book, options.now)
    const decision = decisionForPacket(packet, lead)
    const note = noteFromLead(lead, book)

    book.notes.push(note)
    book.relatedPacketIds.push(packet.id)
    if (!book.openQuestions.includes(`What changed after this ${lead.lane.replace(/_/g, ' ')} note?`)) {
      book.openQuestions.push(`What changed after this ${lead.lane.replace(/_/g, ' ')} note?`)
    }
    if (lead.status === 'research') {
      const thesis = `${lead.asset.toUpperCase()} has at least one research-grade ${lead.lane.replace(/_/g, ' ')} note.`
      if (!book.thesis.includes(thesis)) book.thesis.push(thesis)
    }

    packets.push({ packet, decision, entityBookNote: note })
  }

  return {
    generatedAt: options.now,
    source: 'hyperliquid',
    packets,
    entityBooks: [...books.values()].sort((a, b) => a.entity.id.localeCompare(b.entity.id)),
  }
}

export function summarizeEntityResearch(result: HyperliquidEntityResearchResult): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const item of result.packets) {
    summary[item.packet.archetype] = (summary[item.packet.archetype] ?? 0) + 1
  }
  return summary
}
