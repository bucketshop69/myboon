import type { Entity } from '../types/index.js';
import { ResearchService } from './research.service.js';

export class CacheService {
  constructor(private readonly researchService: ResearchService) {}

  getTtlForEntity(entity: Entity): number {
    return this.researchService.getDefaultTtlSeconds(entity);
  }

  isFresh(entityId: string, maxAgeMs: number): boolean {
    return this.researchService.checkResearchFreshness(entityId, maxAgeMs).fresh;
  }
}
