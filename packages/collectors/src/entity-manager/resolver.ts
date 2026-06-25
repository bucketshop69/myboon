import { normalizeSlug } from './normalization'
import type {
  EntityInput,
  EntityMemoryInput,
  EntityMemoryStore,
  ExtractionProvider,
  EntityMemoryCandidate,
  PrimaryEntityCandidate,
  ResearchPacket,
  ResolvedEntity,
  SourceProcessingStatus,
  WriteExtractionResult,
} from './types'

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const text = value.trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    output.push(text)
  }
  return output
}

function entitySlug(candidate: PrimaryEntityCandidate): string {
  return normalizeSlug(candidate.slug, candidate.name)
}

function aliasesFor(candidate: PrimaryEntityCandidate): string[] {
  return unique([candidate.name, ...(candidate.aliases ?? [])])
}

function entityInput(candidate: PrimaryEntityCandidate): EntityInput {
  return {
    slug: entitySlug(candidate),
    name: candidate.name.trim(),
    type: candidate.type.trim() || 'unknown',
    aliases: aliasesFor(candidate),
    summary: candidate.summary?.trim() || null,
    status: 'active',
    metadata: {
      ...(candidate.metadata ?? {}),
      create_reason: candidate.createReason || undefined,
    },
  }
}

function aliasesIntersect(left: string[], right: string[]): boolean {
  const rightSet = new Set(right.map((item) => item.toLowerCase()))
  return left.some((item) => rightSet.has(item.toLowerCase()))
}

function findMatchingEntity(
  candidate: PrimaryEntityCandidate,
  existing: Awaited<ReturnType<EntityMemoryStore['findEntities']>>[number][]
): Awaited<ReturnType<EntityMemoryStore['findEntities']>>[number] | null {
  const slug = entitySlug(candidate)
  const aliases = aliasesFor(candidate)
  return existing.find((entity) => entity.slug === slug || aliasesIntersect(entity.aliases ?? [], aliases)) ?? null
}

async function resolvePrimaryEntities(store: EntityMemoryStore, candidates: PrimaryEntityCandidate[]): Promise<ResolvedEntity[]> {
  const deduped = new Map<string, PrimaryEntityCandidate>()
  for (const candidate of candidates.slice(0, 3)) {
    if (!candidate.name.trim()) continue
    deduped.set(entitySlug(candidate), candidate)
  }
  const inputs = [...deduped.values()]
  if (inputs.length === 0) return []

  const slugs = inputs.map(entitySlug)
  const aliases = inputs.flatMap(aliasesFor)
  const existing = await store.findEntities(slugs, aliases)
  const resolved: ResolvedEntity[] = []
  const toCreate: EntityInput[] = []
  const createCandidates: PrimaryEntityCandidate[] = []

  for (const candidate of inputs) {
    const match = findMatchingEntity(candidate, existing)
    if (match) {
      const mergedAliases = unique([...(match.aliases ?? []), ...aliasesFor(candidate)])
      const nextMetadata = { ...(match.metadata ?? {}), ...(candidate.metadata ?? {}) }
      const needsUpdate = mergedAliases.length !== (match.aliases ?? []).length
        || (!match.summary && candidate.summary)
        || JSON.stringify(nextMetadata) !== JSON.stringify(match.metadata ?? {})
      const entity = needsUpdate
        ? await store.updateEntity({
          ...match,
          aliases: mergedAliases,
          summary: match.summary || candidate.summary || null,
          metadata: nextMetadata,
        })
        : match
      resolved.push({ candidate, entity, created: false })
    } else if (candidate.createIfMissing !== false) {
      toCreate.push(entityInput(candidate))
      createCandidates.push(candidate)
    }
  }

  const created = await store.createEntities(toCreate)
  for (let index = 0; index < created.length; index += 1) {
    resolved.push({ candidate: createCandidates[index], entity: created[index], created: true })
  }
  return resolved
}

function memoryInput(packet: ResearchPacket, memory: EntityMemoryCandidate, entityId: string): EntityMemoryInput {
  return {
    entity_id: entityId,
    source: packet.source,
    source_area: packet.sourceArea,
    source_type: packet.sourceType,
    source_ref_id: packet.sourceRefId,
    source_research_id: packet.sourceResearchId,
    memory_type: memory.memoryType,
    title: memory.title.trim(),
    summary: memory.summary.trim(),
    body: memory.body?.trim() || null,
    event_at: memory.eventAt || packet.eventAt || packet.observedAt,
    observed_at: memory.observedAt || packet.observedAt,
    confidence: memory.confidence ?? null,
    evidence: memory.evidence ?? packet.evidence,
    mentions: unique(memory.mentions ?? []),
    metrics: { ...packet.metrics, ...(memory.metrics ?? {}) },
    context: {
      source_title: packet.title,
      source_url: packet.url ?? null,
      ...(memory.context ?? {}),
    },
  }
}

function markerMemory(packet: ResearchPacket, status: SourceProcessingStatus, detail: string): EntityMemoryInput {
  return {
    entity_id: null,
    source: packet.source,
    source_area: packet.sourceArea,
    source_type: packet.sourceType,
    source_ref_id: packet.sourceRefId,
    source_research_id: packet.sourceResearchId,
    memory_type: 'source_marker',
    title: `entity_manager:${status}`,
    summary: detail,
    body: null,
    event_at: packet.eventAt ?? packet.observedAt,
    observed_at: packet.observedAt,
    confidence: null,
    evidence: [],
    mentions: [],
    metrics: {},
    context: { status, packet_id: packet.id },
  }
}

export async function writeExtraction(
  store: EntityMemoryStore,
  packet: ResearchPacket,
  extractionProvider: ExtractionProvider
): Promise<WriteExtractionResult> {
  const extraction = await extractionProvider.extract(packet)
  const resolvedEntities = await resolvePrimaryEntities(store, extraction.primaryEntities)
  const bySlug = new Map(resolvedEntities.map((resolved) => [entitySlug(resolved.candidate), resolved.entity.id]))
  const memoryInputs = extraction.memories.flatMap((memory) => {
    const entityId = bySlug.get(memory.entitySlug)
    return entityId ? [memoryInput(packet, memory, entityId)] : []
  })
  memoryInputs.push(markerMemory(packet, 'processed', `Processed Entity Manager packet ${packet.id}.`))

  const existing = await store.findMemories(memoryInputs.map((memory) => ({
    source: memory.source,
    sourceArea: memory.source_area,
    sourceResearchId: memory.source_research_id,
    entityId: memory.entity_id,
    memoryType: memory.memory_type,
    title: memory.title,
  })))
  const existingKeys = new Set(existing.map((memory) => [
    memory.source,
    memory.source_area,
    memory.source_research_id,
    memory.entity_id ?? '',
    memory.memory_type,
    memory.title,
  ].join('|')))
  const newMemories = memoryInputs.filter((memory) => !existingKeys.has([
    memory.source,
    memory.source_area,
    memory.source_research_id,
    memory.entity_id ?? '',
    memory.memory_type,
    memory.title,
  ].join('|')))
  const written = await store.upsertMemories(newMemories)

  return {
    sourceResearchId: packet.sourceResearchId,
    entitiesCreated: resolvedEntities.filter((resolved) => resolved.created).length,
    entitiesReused: resolvedEntities.filter((resolved) => !resolved.created).length,
    memoriesWritten: written.length,
    markerStatus: 'processed',
  }
}

export async function markExtractionFailed(
  store: EntityMemoryStore,
  packet: ResearchPacket,
  error: string
): Promise<WriteExtractionResult> {
  const written = await store.upsertMemories([markerMemory(packet, 'failed', error.slice(0, 1000))])
  return {
    sourceResearchId: packet.sourceResearchId,
    entitiesCreated: 0,
    entitiesReused: 0,
    memoriesWritten: written.length,
    markerStatus: 'failed',
  }
}

export const __testing = {
  resolvePrimaryEntities,
  markerMemory,
}
