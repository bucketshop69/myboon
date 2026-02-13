import type {
  CreateEntityResearchInput,
  EntityResearch,
  FreshnessResult
} from '../types/index.js';
import { createId } from '../utils/ids.js';

export class ResearchRepository {
  private readonly researchById = new Map<string, EntityResearch>();

  create(input: CreateEntityResearchInput): EntityResearch {
    const timestamp = input.timestamp ?? Date.now();
    const research: EntityResearch = {
      id: createId(),
      entityId: input.entityId,
      timestamp,
      ttl: input.ttl,
      expiresAt: timestamp + input.ttl * 1000,
      findings: input.findings,
      sources: input.sources,
      createdAt: Date.now()
    };

    this.researchById.set(research.id, research);
    return research;
  }

  getLatest(entityId: string): EntityResearch | null {
    const records = [...this.researchById.values()]
      .filter((record) => record.entityId === entityId)
      .sort((a, b) => b.timestamp - a.timestamp);

    return records[0] ?? null;
  }

  checkFreshness(entityId: string, maxAgeMs: number): FreshnessResult {
    const latest = this.getLatest(entityId);
    if (!latest) {
      return { exists: false, fresh: false };
    }

    const now = Date.now();
    const age = now - latest.timestamp;
    const fresh = age < maxAgeMs && now < latest.expiresAt;
    return {
      exists: true,
      fresh,
      age,
      expiresAt: latest.expiresAt
    };
  }
}
