import type { EntityMemoryRecord, EntityTimelineItem } from './types'

function timelineDate(memory: EntityMemoryRecord): string {
  return memory.event_at ?? memory.observed_at
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

/**
 * Maps one Entity's internal memories to the minimal public timeline contract.
 * Source-processing markers and memories from other Entities never cross this boundary.
 */
export function buildEntityTimeline(
  entityId: string,
  memories: EntityMemoryRecord[]
): EntityTimelineItem[] {
  return memories
    .filter((memory) => memory.entity_id === entityId && memory.memory_type !== 'source_marker')
    .map((memory) => ({
      summary: memory.summary,
      event_at: timelineDate(memory),
    }))
    .sort((left, right) => timestamp(left.event_at) - timestamp(right.event_at))
}
