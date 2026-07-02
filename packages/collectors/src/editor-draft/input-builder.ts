import type { EntityMemoryRecord, EntityRecord } from '../entity-manager/types'
import type { EntityDraftBundle, PriorEditorDraft, PublishedHistoryItem } from './types'

export interface BuildBundleOptions {
  recentMemoryLimit: number
  laneMemoryLimit: number
  reviewedMemoryIds?: Set<string>
}

function memoryIntakeTime(memory: EntityMemoryRecord): number {
  return Date.parse(memory.created_at || memory.observed_at || memory.event_at || '') || 0
}

function isLaneMemory(memory: EntityMemoryRecord): boolean {
  return Boolean(memory.entity_id) && memory.memory_type !== 'source_marker'
}

export function reviewedMemoryIds(priorDrafts: PriorEditorDraft[]): Set<string> {
  return new Set(priorDrafts.flatMap((draft) => draft.source_memory_ids))
}

export function unreviewedMemories(
  memories: EntityMemoryRecord[],
  priorDrafts: PriorEditorDraft[],
  directlyReviewedMemoryIds: Set<string> = new Set()
): EntityMemoryRecord[] {
  const reviewed = reviewedMemoryIds(priorDrafts)
  for (const id of directlyReviewedMemoryIds) reviewed.add(id)
  return memories
    .filter((memory) => isLaneMemory(memory) && !reviewed.has(memory.id))
    .sort((a, b) => memoryIntakeTime(b) - memoryIntakeTime(a))
}

export function buildEntityDraftBundles(
  entities: EntityRecord[],
  memories: EntityMemoryRecord[],
  priorDrafts: PriorEditorDraft[],
  publishedHistory: PublishedHistoryItem[],
  options: BuildBundleOptions
): EntityDraftBundle[] {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))
  const memoriesByEntity = new Map<string, EntityMemoryRecord[]>()
  const draftsByEntity = new Map<string, PriorEditorDraft[]>()
  const publishedByEntity = new Map<string, PublishedHistoryItem[]>()

  for (const memory of memories.filter(isLaneMemory)) {
    if (!memory.entity_id) continue
    const group = memoriesByEntity.get(memory.entity_id) ?? []
    group.push(memory)
    memoriesByEntity.set(memory.entity_id, group)
  }

  for (const draft of priorDrafts) {
    const group = draftsByEntity.get(draft.entity_id) ?? []
    group.push(draft)
    draftsByEntity.set(draft.entity_id, group)
  }

  for (const item of publishedHistory) {
    const group = publishedByEntity.get(item.entity_id) ?? []
    group.push(item)
    publishedByEntity.set(item.entity_id, group)
  }

  const bundles: EntityDraftBundle[] = []
  for (const [entityId, entityMemories] of memoriesByEntity.entries()) {
    const entity = entityById.get(entityId)
    if (!entity) continue
    const drafts = (draftsByEntity.get(entityId) ?? [])
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    const newMemories = unreviewedMemories(
      entityMemories,
      drafts,
      options.reviewedMemoryIds
    ).slice(0, options.recentMemoryLimit)
    if (newMemories.length === 0) continue

    bundles.push({
      entity,
      newMemories,
      memoryLane: entityMemories
        .slice()
        .sort((a, b) => memoryIntakeTime(b) - memoryIntakeTime(a))
        .slice(0, options.laneMemoryLimit),
      priorDrafts: drafts,
      publishedHistory: (publishedByEntity.get(entityId) ?? [])
        .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)),
    })
  }

  return bundles.sort((a, b) => memoryIntakeTime(b.newMemories[0]) - memoryIntakeTime(a.newMemories[0]))
}
