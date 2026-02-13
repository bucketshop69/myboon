import type { CreateEntityInput, Entity, EntityType } from '../types/index.js';
import { createId, normalizeSymbol } from '../utils/ids.js';

export interface EntitySearchFilters {
  type?: EntityType;
  symbol?: string;
  verified?: boolean;
  category?: string;
}

export class EntityRepository {
  private readonly entitiesById = new Map<string, Entity>();
  private readonly idBySlug = new Map<string, string>();

  create(input: CreateEntityInput): Entity {
    const now = Date.now();
    const existingId = this.idBySlug.get(input.slug);
    if (existingId) {
      throw new Error(`Entity slug already exists: ${input.slug}`);
    }

    const entity: Entity = {
      id: createId(),
      slug: input.slug,
      name: input.name,
      symbol: normalizeSymbol(input.symbol),
      type: input.type,
      verified: input.verified ?? false,
      verifiedBy: input.verifiedBy,
      metadata: {
        category: input.metadata?.category ?? [],
        ...(input.metadata ?? {})
      },
      createdAt: now,
      updatedAt: now
    };

    this.entitiesById.set(entity.id, entity);
    this.idBySlug.set(entity.slug, entity.id);
    return entity;
  }

  findById(id: string): Entity | null {
    return this.entitiesById.get(id) ?? null;
  }

  findBySlug(slug: string): Entity | null {
    const id = this.idBySlug.get(slug);
    return id ? this.findById(id) : null;
  }

  findBySymbol(symbol: string): Entity[] {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) {
      return [];
    }

    return [...this.entitiesById.values()].filter((entity) => entity.symbol === normalized);
  }

  searchByName(query: string): Entity[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return [...this.entitiesById.values()].filter((entity) =>
      entity.name.toLowerCase().includes(normalizedQuery)
    );
  }

  search(filters: EntitySearchFilters): Entity[] {
    return [...this.entitiesById.values()].filter((entity) => {
      if (filters.type && entity.type !== filters.type) {
        return false;
      }
      if (filters.symbol && entity.symbol !== normalizeSymbol(filters.symbol)) {
        return false;
      }
      if (filters.verified !== undefined && entity.verified !== filters.verified) {
        return false;
      }
      if (filters.category) {
        const categories = entity.metadata.category ?? [];
        if (!categories.includes(filters.category)) {
          return false;
        }
      }
      return true;
    });
  }

  update(entityId: string, updates: Partial<Omit<Entity, 'id' | 'createdAt'>>): Entity {
    const current = this.findById(entityId);
    if (!current) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    if (updates.slug && updates.slug !== current.slug) {
      const existingId = this.idBySlug.get(updates.slug);
      if (existingId) {
        throw new Error(`Entity slug already exists: ${updates.slug}`);
      }
      this.idBySlug.delete(current.slug);
      this.idBySlug.set(updates.slug, current.id);
    }

    const next: Entity = {
      ...current,
      ...updates,
      symbol: updates.symbol !== undefined ? normalizeSymbol(updates.symbol) : current.symbol,
      metadata: updates.metadata ? { ...current.metadata, ...updates.metadata } : current.metadata,
      updatedAt: Date.now()
    };

    this.entitiesById.set(entityId, next);
    return next;
  }

  all(): Entity[] {
    return [...this.entitiesById.values()];
  }
}
