import type { SupabaseClient } from '@supabase/supabase-js'
import { buildEntityDraftBundles } from './input-builder'
import type { EntityMemoryRecord, EntityRecord } from '../entity-manager/types'
import type {
  EntityDraftBundle,
  EditorDraftInput,
  EditorDraftRecord,
  EditorDraftStore,
  FetchEditorDraftBundlesOptions,
  PriorEditorDraft,
  PublishedHistoryItem,
} from './types'

const ENTITY_SELECT = 'id, slug, name, type, aliases, summary, status, metadata, created_at, updated_at'
const MEMORY_SELECT = 'id, entity_id, source, source_area, source_type, source_ref_id, source_research_id, memory_type, title, summary, body, event_at, observed_at, confidence, evidence, mentions, metrics, context, created_at, updated_at'
const DRAFT_SELECT = 'id, entity_id, entity_slug, entity_name, entity_type, bundle_key, source_memory_ids, source_memory_hash, source, source_area, action, status, title, angle, summary, body, reasoning, reason_codes, evidence_quality, priority, confidence, merge_target_draft_id, related_draft_ids, follow_up_questions, research_instructions, backend, model, created_at, updated_at'
const ENTITY_PUBLISHED_HISTORY_TABLE = 'entity_published_history'
const LOOKUP_CHUNK_SIZE = 25

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeEntity(row: unknown): EntityRecord {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    slug: String(record.slug),
    name: String(record.name),
    type: String(record.type),
    aliases: asStringArray(record.aliases),
    summary: typeof record.summary === 'string' ? record.summary : null,
    status: typeof record.status === 'string' ? record.status : 'active',
    metadata: asRecord(record.metadata),
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
    mentions: asStringArray(record.mentions),
    metrics: asRecord(record.metrics),
    context: asRecord(record.context),
    created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : undefined,
  }
}

function normalizePriorDraft(row: unknown): PriorEditorDraft {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    entity_id: String(record.entity_id),
    source_memory_ids: asStringArray(record.source_memory_ids),
    source_memory_hash: String(record.source_memory_hash),
    action: record.action as PriorEditorDraft['action'],
    status: record.status as PriorEditorDraft['status'],
    title: typeof record.title === 'string' ? record.title : null,
    angle: typeof record.angle === 'string' ? record.angle : null,
    summary: typeof record.summary === 'string' ? record.summary : null,
    reasoning: typeof record.reasoning === 'string' ? record.reasoning : '',
    reason_codes: asStringArray(record.reason_codes),
    created_at: String(record.created_at),
  }
}

function normalizeDraftRecord(row: unknown): EditorDraftRecord {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    entity_id: String(record.entity_id),
    entity_slug: String(record.entity_slug),
    entity_name: String(record.entity_name),
    entity_type: String(record.entity_type),
    bundle_key: String(record.bundle_key),
    source_memory_ids: asStringArray(record.source_memory_ids),
    source_memory_hash: String(record.source_memory_hash),
    source: typeof record.source === 'string' ? record.source : null,
    source_area: typeof record.source_area === 'string' ? record.source_area : null,
    action: record.action as EditorDraftRecord['action'],
    status: record.status as EditorDraftRecord['status'],
    title: typeof record.title === 'string' ? record.title : null,
    angle: typeof record.angle === 'string' ? record.angle : null,
    summary: typeof record.summary === 'string' ? record.summary : null,
    body: typeof record.body === 'string' ? record.body : null,
    reasoning: String(record.reasoning),
    reason_codes: asStringArray(record.reason_codes),
    evidence_quality: record.evidence_quality as EditorDraftRecord['evidence_quality'],
    priority: typeof record.priority === 'number' ? record.priority : null,
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    merge_target_draft_id: typeof record.merge_target_draft_id === 'string' ? record.merge_target_draft_id : null,
    related_draft_ids: asStringArray(record.related_draft_ids),
    follow_up_questions: asStringArray(record.follow_up_questions),
    research_instructions: typeof record.research_instructions === 'string' ? record.research_instructions : null,
    backend: String(record.backend),
    model: typeof record.model === 'string' ? record.model : null,
    created_at: String(record.created_at),
    updated_at: String(record.updated_at),
  }
}

function normalizePublishedHistory(row: unknown): PublishedHistoryItem {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    entity_id: String(record.entity_id),
    title: typeof record.title === 'string' ? record.title : null,
    angle: typeof record.angle === 'string' ? record.angle : null,
    summary: typeof record.summary === 'string' ? record.summary : null,
    content: typeof record.content === 'string' ? record.content : null,
    source: typeof record.source === 'string' ? record.source : null,
    source_area: typeof record.source_area === 'string' ? record.source_area : null,
    published_at: String(record.published_at ?? record.created_at),
  }
}

function isMissingPublishedHistoryTable(error: { code?: string, message?: string } | null): boolean {
  if (!error) return false
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return text.includes('42p01')
    || text.includes('42703')
    || text.includes('pgrst')
    || text.includes('could not find')
    || text.includes('does not exist')
}

async function fetchRecentMemories(
  db: SupabaseClient,
  limit: number
): Promise<EntityMemoryRecord[]> {
  const { data, error } = await db
    .from('entity_memories')
    .select(MEMORY_SELECT)
    .not('entity_id', 'is', null)
    .neq('memory_type', 'source_marker')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`editor draft memory fetch failed: ${error.message}`)
  return (data ?? []).map(normalizeMemory)
}

async function fetchEntities(db: SupabaseClient, entityIds: string[]): Promise<EntityRecord[]> {
  if (entityIds.length === 0) return []
  const { data, error } = await db
    .from('entities')
    .select(ENTITY_SELECT)
    .in('id', entityIds)
  if (error) throw new Error(`editor draft entity fetch failed: ${error.message}`)
  return (data ?? []).map(normalizeEntity)
}

async function fetchMemoriesForEntities(
  db: SupabaseClient,
  entityIds: string[],
  limit: number
): Promise<EntityMemoryRecord[]> {
  const rows = await Promise.all(entityIds.map(async (entityId) => {
    const { data, error } = await db
      .from('entity_memories')
      .select(MEMORY_SELECT)
      .eq('entity_id', entityId)
      .neq('memory_type', 'source_marker')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`editor draft lane fetch failed: ${error.message}`)
    return (data ?? []).map(normalizeMemory)
  }))
  return rows.flat()
}

async function fetchPriorDrafts(
  db: SupabaseClient,
  entityIds: string[],
  limit: number
): Promise<PriorEditorDraft[]> {
  const rows = await Promise.all(entityIds.map(async (entityId) => {
    const { data, error } = await db
      .from('editor_drafts')
      .select('id, entity_id, source_memory_ids, source_memory_hash, action, status, title, angle, summary, reasoning, reason_codes, created_at')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`editor draft prior draft fetch failed: ${error.message}`)
    return (data ?? []).map(normalizePriorDraft)
  }))
  return rows.flat()
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

function sourceMemoryContainsFilter(memoryIds: string[]): string {
  return memoryIds
    .map((id) => `source_memory_ids.cs.${JSON.stringify([id])}`)
    .join(',')
}

async function fetchReviewedMemoryIds(
  db: SupabaseClient,
  memoryIds: string[]
): Promise<Set<string>> {
  const reviewed = new Set<string>()
  const uniqueMemoryIds = unique(memoryIds)
  if (uniqueMemoryIds.length === 0) return reviewed

  for (const memoryIdChunk of chunks(uniqueMemoryIds, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('editor_drafts')
      .select('source_memory_ids')
      .or(sourceMemoryContainsFilter(memoryIdChunk))

    if (error) throw new Error(`editor draft reviewed memory lookup failed: ${error.message}`)
    for (const row of data ?? []) {
      for (const id of asStringArray((row as { source_memory_ids?: unknown }).source_memory_ids)) {
        if (memoryIdChunk.includes(id)) reviewed.add(id)
      }
    }
  }

  return reviewed
}

async function fetchPublishedHistory(
  db: SupabaseClient,
  entityIds: string[],
  limit: number
): Promise<PublishedHistoryItem[]> {
  if (entityIds.length === 0 || limit <= 0) return []

  const rows: PublishedHistoryItem[] = []
  for (const entityId of entityIds) {
    const { data, error } = await db
      .from(ENTITY_PUBLISHED_HISTORY_TABLE)
      .select('id, entity_id, title, angle, summary, content, source, source_area, published_at, created_at')
      .eq('entity_id', entityId)
      .order('published_at', { ascending: false })
      .limit(limit)

    if (error) {
      // V1 only loads published history from an entity-addressable table. The
      // current feed table is not entity-addressable, so missing table/column
      // errors intentionally produce an empty history.
      if (isMissingPublishedHistoryTable(error)) return []
      throw new Error(`editor draft published history fetch failed: ${error.message}`)
    }
    rows.push(...(data ?? []).map(normalizePublishedHistory))
  }
  return rows
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export class SupabaseEditorDraftStore implements EditorDraftStore {
  constructor(private readonly db: SupabaseClient) {}

  async fetchBundles(options: FetchEditorDraftBundlesOptions): Promise<EntityDraftBundle[]> {
    const recentFetchLimit = Math.max(options.batchSize * options.recentMemoryLimit * 10, options.batchSize)
    const recentMemories = await fetchRecentMemories(this.db, recentFetchLimit)
    const reviewed = await fetchReviewedMemoryIds(this.db, recentMemories.map((memory) => memory.id))
    const eligibleEntityIds = unique(
      recentMemories
        .filter((memory) => memory.entity_id && !reviewed.has(memory.id))
        .map((memory) => memory.entity_id as string)
    ).slice(0, options.batchSize)

    if (eligibleEntityIds.length === 0) return []

    const [entities, laneMemories, priorDrafts, publishedHistory] = await Promise.all([
      fetchEntities(this.db, eligibleEntityIds),
      fetchMemoriesForEntities(this.db, eligibleEntityIds, options.laneMemoryLimit),
      fetchPriorDrafts(this.db, eligibleEntityIds, options.priorDraftLimit),
      fetchPublishedHistory(this.db, eligibleEntityIds, options.publishedHistoryLimit),
    ])

    return buildEntityDraftBundles(
      entities,
      laneMemories,
      priorDrafts,
      publishedHistory,
      {
        recentMemoryLimit: options.recentMemoryLimit,
        laneMemoryLimit: options.laneMemoryLimit,
      }
    ).slice(0, options.batchSize)
  }

  async upsertDrafts(drafts: EditorDraftInput[]): Promise<EditorDraftRecord[]> {
    if (drafts.length === 0) return []
    const records = await Promise.all(drafts.map(async (draft) => {
      const { data: existing, error: existingError } = await this.db
        .from('editor_drafts')
        .select('id')
        .eq('bundle_key', draft.bundle_key)
        .maybeSingle()

      if (existingError) throw new Error(`editor draft lookup failed: ${existingError.message}`)

      if (existing) {
        const { created_at: _createdAt, ...updatePayload } = draft
        const { data, error } = await this.db
          .from('editor_drafts')
          .update(updatePayload)
          .eq('bundle_key', draft.bundle_key)
          .select(DRAFT_SELECT)
          .single()
        if (error) throw new Error(`editor draft update failed: ${error.message}`)
        return normalizeDraftRecord(data)
      }

      const { data, error } = await this.db
        .from('editor_drafts')
        .insert(draft)
        .select(DRAFT_SELECT)
        .single()
      if (error) throw new Error(`editor draft insert failed: ${error.message}`)
      return normalizeDraftRecord(data)
    }))
    return records
  }
}
