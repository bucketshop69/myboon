export interface InternalEntityListResponse {
  entities: InternalEntityListItem[]
  nextCursor: string | null
}

export interface InternalEntityListItem {
  id: string
  slug: string
  name: string
  type: string
  status: string
  showInCarousel: boolean
  aliases: string[]
  summary: string | null
  memoryCount: number
  latestMemoryAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InternalEntityDetailResponse {
  entity: InternalEntityDetail
  stats: InternalEntityStats
  relatedEntities: InternalRelatedEntity[]
  publishedHistory: InternalPublishedHistoryItem[]
}

export interface InternalEntityDetail {
  id: string
  slug: string
  name: string
  type: string
  status: string
  showInCarousel: boolean
  aliases: string[]
  summary: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface InternalEntityStats {
  memoryCount: number
  latestMemoryAt: string | null
  sourceCount: number
  evidenceCount: number
  relatedEntityCount: number
  publishedNarrativeCount: number
}

export interface InternalRelatedEntity {
  id: string
  slug: string
  name: string
  type: string
  reason: string
  sharedMemoryCount: number
  latestObservedAt: string | null
  inference: 'direct' | 'inferred'
}

export interface InternalPublishedHistoryItem {
  id: string
  publishedNarrativeId: string
  title: string | null
  angle: string | null
  source: string | null
  sourceArea: string | null
  publishedAt: string
}

export interface InternalEntityTimelineResponse {
  memories: InternalEntityMemoryItem[]
  nextCursor: string | null
}

export interface InternalEntityMemoryItem {
  id: string
  entityId: string
  source: string
  sourceArea: string
  sourceType: string
  sourceRefId: string
  sourceResearchId: string
  memoryType: string
  title: string
  summary: string
  body: string | null
  eventAt: string | null
  observedAt: string
  confidence: number | null
  evidence: unknown[]
  mentions: unknown[]
  metrics: Record<string, unknown>
  context: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ManualEntityCommand {
  requestId: string
  actor: { kind: 'dashboard'; name: string }
  entity: {
    name: string
    type: string
    slug?: string
    aliases?: string[]
    summary?: string
    showInCarousel?: boolean
  }
  memories: Array<{
    memoryType: 'research_note' | 'market_signal' | 'news_event' | 'social_signal' | 'timeline_event' | 'metric_change'
    title: string
    summary: string
    body?: string
    eventAt: string
    sourceLabel?: string
    sourceUrl?: string
  }>
}

export interface ManualEntityPreviewResponse {
  requestId: string
  command: ManualEntityCommand
  entity: {
    action: 'create' | 'update' | 'reuse'
    existingEntityId: string | null
    slug: string
    name: string
    type: string
    aliases: string[]
    summary: string | null
    status: string
    showInCarousel: boolean
    changes: string[]
  }
  memories: Array<{
    index: number
    action: 'create' | 'skip_duplicate'
    title: string
    summary: string
    eventAt: string
    memoryType: string
  }>
  warnings: string[]
  planHash: string
}

export interface ManualEntityApplyResponse {
  requestId: string
  entity: { id: string; slug: string; name: string }
  memoriesWritten: number
  duplicateMemoriesSkipped: number
  replayed: boolean
}
