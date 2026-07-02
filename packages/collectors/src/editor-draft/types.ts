import type { EntityMemoryRecord, EntityRecord } from '../entity-manager/types'

export type EditorDraftAction =
  | 'draft_post'
  | 'watch'
  | 'skip_repetitive'
  | 'needs_more_research'
  | 'merge_with_existing_draft'

export type EditorDraftStatus =
  | 'drafted'
  | 'watching'
  | 'skipped'
  | 'needs_more_research'
  | 'merged'

export type EvidenceQuality = 'strong' | 'medium' | 'weak'

export interface PriorEditorDraft {
  id: string
  entity_id: string
  source_memory_ids: string[]
  source_memory_hash: string
  action: EditorDraftAction
  status: EditorDraftStatus
  title: string | null
  angle: string | null
  summary: string | null
  reasoning: string
  reason_codes: string[]
  created_at: string
}

export interface PublishedHistoryItem {
  id: string
  entity_id: string
  title: string | null
  angle: string | null
  summary: string | null
  content: string | null
  source: string | null
  source_area: string | null
  published_at: string
}

export interface EntityDraftBundle {
  entity: EntityRecord
  newMemories: EntityMemoryRecord[]
  memoryLane: EntityMemoryRecord[]
  priorDrafts: PriorEditorDraft[]
  publishedHistory: PublishedHistoryItem[]
}

export interface AgentEditorDraftDecision {
  action?: unknown
  source_memory_ids?: unknown
  title?: unknown
  angle?: unknown
  summary?: unknown
  body?: unknown
  reasoning?: unknown
  reason_codes?: unknown
  evidence_quality?: unknown
  priority?: unknown
  confidence?: unknown
  merge_target_draft_id?: unknown
  related_draft_ids?: unknown
  follow_up_questions?: unknown
  research_instructions?: unknown
}

export interface AgentEditorDraftResponse {
  decisions: AgentEditorDraftDecision[]
}

export interface NormalizedEditorDraftDecision {
  action: EditorDraftAction
  status: EditorDraftStatus
  sourceMemoryIds: string[]
  sourceMemoryHash: string
  bundleKey: string
  title: string | null
  angle: string | null
  summary: string | null
  body: string | null
  reasoning: string
  reasonCodes: string[]
  evidenceQuality: EvidenceQuality | null
  priority: number | null
  confidence: number | null
  mergeTargetDraftId: string | null
  relatedDraftIds: string[]
  followUpQuestions: string[]
  researchInstructions: string | null
}

export interface EditorDraftInput {
  entity_id: string
  entity_slug: string
  entity_name: string
  entity_type: string
  bundle_key: string
  source_memory_ids: string[]
  source_memory_hash: string
  source: string | null
  source_area: string | null
  action: EditorDraftAction
  status: EditorDraftStatus
  title: string | null
  angle: string | null
  summary: string | null
  body: string | null
  reasoning: string
  reason_codes: string[]
  evidence_quality: EvidenceQuality | null
  priority: number | null
  confidence: number | null
  merge_target_draft_id: string | null
  related_draft_ids: string[]
  follow_up_questions: string[]
  research_instructions: string | null
  backend: string
  model: string | null
  created_at: string
  updated_at: string
}

export interface EditorDraftRecord extends EditorDraftInput {
  id: string
}

export interface EditorDraftStore {
  fetchBundles(options: FetchEditorDraftBundlesOptions): Promise<EntityDraftBundle[]>
  upsertDrafts(drafts: EditorDraftInput[]): Promise<EditorDraftRecord[]>
}

export interface FetchEditorDraftBundlesOptions {
  batchSize: number
  recentMemoryLimit: number
  laneMemoryLimit: number
  priorDraftLimit: number
  publishedHistoryLimit: number
}

export interface EditorDraftProvider {
  decide(bundle: EntityDraftBundle): Promise<AgentEditorDraftDecision>
}
