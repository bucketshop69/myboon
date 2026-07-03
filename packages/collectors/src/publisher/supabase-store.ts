import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PublishedNarrativeInput,
  PublishedNarrativeRecord,
  PublisherDraftRecord,
  PublisherEntityRecord,
  PublisherMemoryRecord,
  PublisherStore,
  PublisherWriteResult,
} from './types'

const DRAFT_SELECT = 'id, entity_id, entity_slug, entity_name, entity_type, source_memory_ids, source_memory_hash, source, source_area, action, status, title, angle, summary, body, reasoning, evidence_quality, priority, confidence, created_at, updated_at'
const MEMORY_SELECT = 'id, source, source_area, source_type, source_ref_id, source_research_id, title, summary, evidence, context'
const ENTITY_SELECT = 'id, slug, name, type, metadata'
const NARRATIVE_SELECT = 'id, editor_draft_id, created_at, published_at'

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeDraft(row: unknown): PublisherDraftRecord {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    entity_id: String(record.entity_id),
    entity_slug: String(record.entity_slug),
    entity_name: String(record.entity_name),
    entity_type: String(record.entity_type),
    source_memory_ids: asStringArray(record.source_memory_ids),
    source_memory_hash: String(record.source_memory_hash),
    source: nullableString(record.source),
    source_area: nullableString(record.source_area),
    action: String(record.action),
    status: record.status as PublisherDraftRecord['status'],
    title: nullableString(record.title),
    angle: nullableString(record.angle),
    summary: nullableString(record.summary),
    body: nullableString(record.body),
    reasoning: typeof record.reasoning === 'string' ? record.reasoning : '',
    evidence_quality: record.evidence_quality as PublisherDraftRecord['evidence_quality'],
    priority: nullableNumber(record.priority),
    confidence: nullableNumber(record.confidence),
    created_at: String(record.created_at),
    updated_at: String(record.updated_at),
  }
}

function normalizeMemory(row: unknown): PublisherMemoryRecord {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    source: String(record.source),
    source_area: String(record.source_area),
    source_type: String(record.source_type),
    source_ref_id: String(record.source_ref_id),
    source_research_id: String(record.source_research_id),
    title: String(record.title),
    summary: String(record.summary),
    evidence: Array.isArray(record.evidence) ? record.evidence : [],
    context: asRecord(record.context),
  }
}

function normalizeEntity(row: unknown): PublisherEntityRecord {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    slug: String(record.slug),
    name: String(record.name),
    type: String(record.type),
    metadata: asRecord(record.metadata),
  }
}

function normalizeNarrative(row: unknown): PublishedNarrativeRecord {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    editor_draft_id: nullableString(record.editor_draft_id),
    created_at: nullableString(record.created_at) ?? undefined,
    published_at: nullableString(record.published_at) ?? undefined,
  }
}

function isUniqueViolation(error: { code?: string, message?: string } | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|unique/i.test(error.message ?? '')
}

export class SupabasePublisherStore implements PublisherStore {
  constructor(private readonly db: SupabaseClient) {}

  async fetchEligibleDrafts(batchSize: number): Promise<PublisherDraftRecord[]> {
    const { data, error } = await this.db
      .from('editor_drafts')
      .select(DRAFT_SELECT)
      .eq('action', 'draft_post')
      .eq('status', 'drafted')
      .not('title', 'is', null)
      .not('body', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (error) throw new Error(`publisher draft fetch failed: ${error.message}`)
    return (data ?? []).map(normalizeDraft)
  }

  async fetchMemories(memoryIds: string[]): Promise<PublisherMemoryRecord[]> {
    if (memoryIds.length === 0) return []
    const { data, error } = await this.db
      .from('entity_memories')
      .select(MEMORY_SELECT)
      .in('id', memoryIds)

    if (error) throw new Error(`publisher memory fetch failed: ${error.message}`)
    return (data ?? []).map(normalizeMemory)
  }

  async fetchEntity(entityId: string): Promise<PublisherEntityRecord | null> {
    const { data, error } = await this.db
      .from('entities')
      .select(ENTITY_SELECT)
      .eq('id', entityId)
      .maybeSingle()

    if (error) throw new Error(`publisher entity fetch failed: ${error.message}`)
    return data ? normalizeEntity(data) : null
  }

  async publishDraft(publication: PublishedNarrativeInput): Promise<PublisherWriteResult> {
    const existing = await this.findPublishedNarrative(publication.editor_draft_id)
    if (existing) {
      await this.ensureHistory(existing.id, publication)
      await this.markDraftPublished(publication.editor_draft_id, publication.published_at)
      return { narrative: existing, existing: true }
    }

    const payload = {
      title: publication.title,
      content_small: publication.content_small,
      content_full: publication.content_full,
      tags: publication.tags,
      priority: publication.priority,
      actions: publication.actions,
      status: publication.status,
      published_at: publication.published_at,
      editor_draft_id: publication.editor_draft_id,
      entity_id: publication.entity_id,
      entity_slug: publication.entity_slug,
      entity_name: publication.entity_name,
      entity_type: publication.entity_type,
      entity_category: publication.entity_category,
      source_memory_ids: publication.source_memory_ids,
      source_memory_hash: publication.source_memory_hash,
      source: publication.source,
      area: publication.source_area,
      source_area: publication.source_area,
      angle: publication.angle,
      reasoning: publication.reasoning,
      evidence_quality: publication.evidence_quality,
      confidence: publication.confidence,
    }

    const { data, error } = await this.db
      .from('published_narratives')
      .insert(payload)
      .select(NARRATIVE_SELECT)
      .single()

    if (error) {
      if (isUniqueViolation(error)) {
        const racedExisting = await this.findPublishedNarrative(publication.editor_draft_id)
        if (racedExisting) {
          await this.ensureHistory(racedExisting.id, publication)
          await this.markDraftPublished(publication.editor_draft_id, publication.published_at)
          return { narrative: racedExisting, existing: true }
        }
      }
      throw new Error(`publisher narrative insert failed: ${error.message}`)
    }

    const narrative = normalizeNarrative(data)
    await this.ensureHistory(narrative.id, publication)
    await this.markDraftPublished(publication.editor_draft_id, publication.published_at)
    return { narrative, existing: false }
  }

  private async findPublishedNarrative(editorDraftId: string): Promise<PublishedNarrativeRecord | null> {
    const { data, error } = await this.db
      .from('published_narratives')
      .select(NARRATIVE_SELECT)
      .eq('editor_draft_id', editorDraftId)
      .maybeSingle()

    if (error) throw new Error(`publisher existing narrative lookup failed: ${error.message}`)
    return data ? normalizeNarrative(data) : null
  }

  private async ensureHistory(narrativeId: string, publication: PublishedNarrativeInput): Promise<void> {
    const { error } = await this.db
      .from('entity_published_history')
      .upsert({
        published_narrative_id: narrativeId,
        entity_id: publication.entity_id,
        entity_slug: publication.entity_slug,
        title: publication.title,
        angle: publication.angle,
        summary: publication.content_small,
        content: publication.content_full,
        source: publication.source,
        source_area: publication.source_area,
        published_at: publication.published_at,
      }, { onConflict: 'published_narrative_id' })

    if (error) throw new Error(`publisher history upsert failed: ${error.message}`)
  }

  private async markDraftPublished(editorDraftId: string, observedAt: string): Promise<void> {
    const { error } = await this.db
      .from('editor_drafts')
      .update({ status: 'published', updated_at: observedAt })
      .eq('id', editorDraftId)

    if (error) throw new Error(`publisher draft status update failed: ${error.message}`)
  }
}
