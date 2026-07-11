import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  EntityInput,
  EntityMemoryInput,
  EntityMemoryRecord,
  EntityMemoryStore,
  EntityRecord,
  MemoryLookupKey,
} from './types'

const ENTITY_SELECT = 'id, slug, name, type, aliases, summary, status, show_in_carousel, metadata, created_at, updated_at'
const MEMORY_SELECT = 'id, entity_id, source, source_area, source_type, source_ref_id, source_research_id, memory_type, title, summary, body, event_at, observed_at, confidence, evidence, mentions, metrics, context, created_at, updated_at'

function normalizeEntity(row: unknown): EntityRecord {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    slug: String(record.slug),
    name: String(record.name),
    type: String(record.type),
    aliases: Array.isArray(record.aliases) ? record.aliases.filter((item): item is string => typeof item === 'string') : [],
    summary: typeof record.summary === 'string' ? record.summary : null,
    status: typeof record.status === 'string' ? record.status : 'active',
    show_in_carousel: typeof record.show_in_carousel === 'boolean' ? record.show_in_carousel : false,
    metadata: record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? record.metadata as Record<string, unknown>
      : {},
    created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : undefined,
  }
}

function normalizeMemory(row: unknown): EntityMemoryRecord {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    entity_id: typeof record.entity_id === 'string' ? record.entity_id : null,
    source: String(record.source),
    source_area: String(record.source_area),
    source_type: String(record.source_type),
    source_ref_id: String(record.source_ref_id),
    source_research_id: String(record.source_research_id),
    memory_type: record.memory_type as EntityMemoryRecord['memory_type'],
    title: String(record.title),
    summary: String(record.summary),
    body: typeof record.body === 'string' ? record.body : null,
    event_at: typeof record.event_at === 'string' ? record.event_at : null,
    observed_at: String(record.observed_at),
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    evidence: Array.isArray(record.evidence) ? record.evidence : [],
    mentions: Array.isArray(record.mentions)
      ? record.mentions.filter((item): item is string => typeof item === 'string')
      : [],
    metrics: record.metrics && typeof record.metrics === 'object' && !Array.isArray(record.metrics)
      ? record.metrics as Record<string, unknown>
      : {},
    context: record.context && typeof record.context === 'object' && !Array.isArray(record.context)
      ? record.context as Record<string, unknown>
      : {},
    created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : undefined,
  }
}

export class SupabaseEntityMemoryStore implements EntityMemoryStore {
  constructor(private readonly db: SupabaseClient) {}

  async findEntities(slugs: string[], aliases: string[]): Promise<EntityRecord[]> {
    const byId = new Map<string, EntityRecord>()
    const uniqueSlugs = [...new Set(slugs)]
    if (uniqueSlugs.length > 0) {
      const { data, error } = await this.db
        .from('entities')
        .select(ENTITY_SELECT)
        .in('slug', uniqueSlugs)
      if (error) throw new Error(`entity slug lookup failed: ${error.message}`)
      for (const row of data ?? []) {
        const entity = normalizeEntity(row)
        byId.set(entity.id, entity)
      }
    }

    for (const alias of [...new Set(aliases)]) {
      const { data, error } = await this.db
        .from('entities')
        .select(ENTITY_SELECT)
        .contains('aliases', JSON.stringify([alias]))
        .limit(20)
      if (error) throw new Error(`entity alias lookup failed: ${error.message}`)
      for (const row of data ?? []) {
        const entity = normalizeEntity(row)
        byId.set(entity.id, entity)
      }
    }

    return [...byId.values()]
  }

  async createEntities(entities: EntityInput[]): Promise<EntityRecord[]> {
    if (entities.length === 0) return []
    const { data, error } = await this.db
      .from('entities')
      .upsert(entities, { onConflict: 'slug', defaultToNull: false })
      .select(ENTITY_SELECT)
    if (error) throw new Error(`entity upsert failed: ${error.message}`)
    return (data ?? []).map(normalizeEntity)
  }

  async updateEntity(entity: EntityRecord): Promise<EntityRecord> {
    const { data, error } = await this.db
      .from('entities')
      .update({
        aliases: entity.aliases,
        summary: entity.summary,
        status: entity.status,
        show_in_carousel: entity.show_in_carousel,
        metadata: entity.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entity.id)
      .select(ENTITY_SELECT)
      .single()
    if (error) throw new Error(`entity update failed: ${error.message}`)
    return normalizeEntity(data)
  }

  async findMemories(keys: MemoryLookupKey[]): Promise<EntityMemoryRecord[]> {
    const byKey = new Map<string, MemoryLookupKey>()
    for (const key of keys) {
      byKey.set([
        key.source,
        key.sourceArea,
        key.sourceResearchId,
        key.entityId ?? '',
        key.memoryType,
        key.title,
      ].join('|'), key)
    }
    const sourceResearchIds = [...new Set([...byKey.values()].map((key) => key.sourceResearchId))]
    if (sourceResearchIds.length === 0) return []
    const { data, error } = await this.db
      .from('entity_memories')
      .select(MEMORY_SELECT)
      .in('source_research_id', sourceResearchIds)
    if (error) throw new Error(`entity memory lookup failed: ${error.message}`)
    const wanted = new Set(byKey.keys())
    return (data ?? [])
      .map(normalizeMemory)
      .filter((memory) => wanted.has([
        memory.source,
        memory.source_area,
        memory.source_research_id,
        memory.entity_id ?? '',
        memory.memory_type,
        memory.title,
      ].join('|')))
  }

  async upsertMemories(memories: EntityMemoryInput[]): Promise<EntityMemoryRecord[]> {
    if (memories.length === 0) return []
    const { data, error } = await this.db
      .from('entity_memories')
      .upsert(memories, {
        onConflict: 'source,source_area,source_research_id,entity_id,memory_type,title',
      })
      .select(MEMORY_SELECT)
    if (error) throw new Error(`entity memory upsert failed: ${error.message}`)
    return (data ?? []).map(normalizeMemory)
  }
}

export const __testing = {
  ENTITY_SELECT,
  normalizeEntity,
}
