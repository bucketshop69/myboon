import type { EvidenceQuality } from '../editor-draft/types'

export type PublisherDraftStatus =
  | 'drafted'
  | 'watching'
  | 'skipped'
  | 'needs_more_research'
  | 'merged'
  | 'published'

export interface PublisherDraftRecord {
  id: string
  entity_id: string
  entity_slug: string
  entity_name: string
  entity_type: string
  source_memory_ids: string[]
  source_memory_hash: string
  source: string | null
  source_area: string | null
  action: string
  status: PublisherDraftStatus
  title: string | null
  angle: string | null
  summary: string | null
  body: string | null
  reasoning: string
  evidence_quality: EvidenceQuality | null
  priority: number | null
  confidence: number | null
  created_at: string
  updated_at: string
}

export interface PublisherMemoryRecord {
  id: string
  source: string
  source_area: string
  source_type: string
  source_ref_id: string
  source_research_id: string
  title: string
  summary: string
  evidence: unknown[]
  context: Record<string, unknown>
}

export interface PublisherEntityRecord {
  id: string
  slug: string
  name: string
  type: string
  metadata: Record<string, unknown>
}

export type PublishedAction =
  | { type: 'predict', label: string, slug: string }
  | { type: 'perps', label: string, venue: string, asset: string }
  | { type: 'link', label: string, url: string }

export interface PublishedNarrativeInput {
  editor_draft_id: string
  title: string
  content_small: string
  content_full: string
  priority: number
  actions: PublishedAction[]
  tags: string[]
  status: 'published'
  published_at: string
  entity_id: string
  entity_slug: string
  entity_name: string
  entity_type: string
  entity_category: string | null
  source_memory_ids: string[]
  source_memory_hash: string
  source: string | null
  source_area: string | null
  angle: string | null
  reasoning: string
  evidence_quality: EvidenceQuality | null
  confidence: number | null
}

export interface PublishedNarrativeRecord {
  id: string
  editor_draft_id: string | null
  created_at?: string
  published_at?: string
}

export interface PublisherWriteResult {
  narrative: PublishedNarrativeRecord
  existing: boolean
}

export interface PublisherStore {
  fetchEligibleDrafts(batchSize: number): Promise<PublisherDraftRecord[]>
  fetchMemories(memoryIds: string[]): Promise<PublisherMemoryRecord[]>
  fetchEntity(entityId: string): Promise<PublisherEntityRecord | null>
  publishDraft(publication: PublishedNarrativeInput): Promise<PublisherWriteResult>
}
