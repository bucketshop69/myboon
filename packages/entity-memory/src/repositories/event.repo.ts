import type { CreateEntityEventInput, EntityEvent, EventType } from '../types/index.js';
import { createId } from '../utils/ids.js';

export interface QueryTimelineFilters {
  types?: EventType[];
  since?: number;
  until?: number;
  minImportance?: number;
  limit?: number;
}

export class EventRepository {
  private readonly eventsById = new Map<string, EntityEvent>();

  create(input: CreateEntityEventInput): EntityEvent {
    const now = Date.now();
    const event: EntityEvent = {
      id: createId(),
      entityId: input.entityId,
      relatedEntityIds: input.relatedEntityIds,
      timestamp: input.timestamp,
      type: input.type,
      summary: input.summary,
      representationId: input.representationId,
      data: input.data ?? {},
      source: input.source,
      importance: input.importance ?? 5,
      createdAt: now
    };

    this.eventsById.set(event.id, event);
    return event;
  }

  queryTimeline(entityId: string, filters: QueryTimelineFilters = {}): EntityEvent[] {
    const events = [...this.eventsById.values()]
      .filter((event) => event.entityId === entityId)
      .filter((event) => {
        if (filters.types && filters.types.length > 0 && !filters.types.includes(event.type)) {
          return false;
        }
        if (filters.since && event.timestamp < filters.since) {
          return false;
        }
        if (filters.until && event.timestamp > filters.until) {
          return false;
        }
        if (filters.minImportance !== undefined && event.importance < filters.minImportance) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    if (filters.limit !== undefined) {
      return events.slice(0, filters.limit);
    }

    return events;
  }
}
