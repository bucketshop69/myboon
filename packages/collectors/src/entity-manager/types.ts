export type EntityMemoryType =
  | 'research_note'
  | 'market_signal'
  | 'news_event'
  | 'social_signal'
  | 'timeline_event'
  | 'metric_change'
  | 'source_marker'

export type SourceProcessingStatus = 'processed' | 'failed'

export interface ResearchPacket {
  id: string
  source: string
  sourceArea: string
  sourceResearchId: string
  sourceType: string
  sourceRefId: string
  title: string
  summary: string
  body: string
  observedAt: string
  eventAt?: string | null
  url?: string | null
  evidence: unknown[]
  metrics: Record<string, unknown>
  context: Record<string, unknown>
}

export interface PrimaryEntityCandidate {
  name: string
  type: string
  slug?: string
  aliases?: string[]
  summary?: string
  createIfMissing?: boolean
  createReason?: string
  metadata?: Record<string, unknown>
}

export interface EntityMemoryCandidate {
  entitySlug: string
  memoryType: EntityMemoryType
  title: string
  summary: string
  body?: string
  eventAt?: string | null
  observedAt?: string
  confidence?: number
  evidence?: unknown[]
  mentions?: string[]
  metrics?: Record<string, unknown>
  context?: Record<string, unknown>
}

export interface EntityMemoryExtraction {
  primaryEntities: PrimaryEntityCandidate[]
  memories: EntityMemoryCandidate[]
}

export interface ExtractionProvider {
  extract(packet: ResearchPacket): Promise<EntityMemoryExtraction>
}

export interface EntityRecord {
  id: string
  slug: string
  name: string
  type: string
  aliases: string[]
  summary: string | null
  status: string
  show_in_carousel: boolean
  metadata: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface EntityInput {
  slug: string
  name: string
  type: string
  aliases: string[]
  summary: string | null
  status: string
  metadata: Record<string, unknown>
}

export interface EntityTimelineItem {
  summary: string
  event_at: string
}

export interface EntityMemoryRecord {
  id: string
  entity_id: string | null
  source: string
  source_area: string
  source_type: string
  source_ref_id: string
  source_research_id: string
  memory_type: EntityMemoryType
  title: string
  summary: string
  body: string | null
  event_at: string | null
  observed_at: string
  confidence: number | null
  evidence: unknown[]
  mentions: string[]
  metrics: Record<string, unknown>
  context: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface EntityMemoryInput {
  entity_id: string | null
  source: string
  source_area: string
  source_type: string
  source_ref_id: string
  source_research_id: string
  memory_type: EntityMemoryType
  title: string
  summary: string
  body: string | null
  event_at: string | null
  observed_at: string
  confidence: number | null
  evidence: unknown[]
  mentions: string[]
  metrics: Record<string, unknown>
  context: Record<string, unknown>
}

export interface EntityMemoryStore {
  findEntities(slugs: string[], aliases: string[]): Promise<EntityRecord[]>
  createEntities(entities: EntityInput[]): Promise<EntityRecord[]>
  updateEntity(entity: EntityRecord): Promise<EntityRecord>
  findMemories(keys: MemoryLookupKey[]): Promise<EntityMemoryRecord[]>
  upsertMemories(memories: EntityMemoryInput[]): Promise<EntityMemoryRecord[]>
}

export interface MemoryLookupKey {
  source: string
  sourceArea: string
  sourceResearchId: string
  entityId: string | null
  memoryType: EntityMemoryType
  title: string
}

export interface ResolvedEntity {
  candidate: PrimaryEntityCandidate
  entity: EntityRecord
  created: boolean
}

export interface WriteExtractionResult {
  sourceResearchId: string
  entitiesCreated: number
  entitiesReused: number
  memoriesWritten: number
  markerStatus: SourceProcessingStatus
}
