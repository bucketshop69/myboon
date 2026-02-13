import { EventRepository } from '../repositories/event.repo.js';
import { ResearchRepository } from '../repositories/research.repo.js';
import type {
  CreateEntityResearchInput,
  Entity,
  EntityResearch,
  FreshnessResult,
  ResearchResult,
  ResearchSource
} from '../types/index.js';
import { EntityRepository } from '../repositories/entity.repo.js';
import { RepresentationRepository } from '../repositories/representation.repo.js';

const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 24 * 60 * 60;
const MIN_SUCCESSFUL_SOURCES = 2;

export class ResearchService {
  constructor(
    private readonly entities: EntityRepository,
    private readonly representations: RepresentationRepository,
    private readonly events: EventRepository,
    private readonly research: ResearchRepository
  ) {}

  getDefaultTtlSeconds(entity: Entity): number {
    if (entity.type === 'meme') {
      return 10 * 60;
    }
    if (entity.type === 'crypto-token') {
      return 60 * 60;
    }
    if (entity.type === 'macro-asset') {
      return 4 * 60 * 60;
    }
    return 30 * 60;
  }

  checkResearchFreshness(entityId: string, maxAgeMs = 60 * 60 * 1000): FreshnessResult {
    return this.research.checkFreshness(entityId, maxAgeMs);
  }

  getCachedResearch(entityId: string): EntityResearch | null {
    return this.research.getLatest(entityId);
  }

  storeResearchResults(
    entityId: string,
    input: Omit<CreateEntityResearchInput, 'entityId' | 'ttl'> & { ttl?: number }
  ): EntityResearch {
    const entity = this.entities.findById(entityId);
    if (!entity) {
      throw new Error(`Cannot store research: entity not found (${entityId})`);
    }

    const ttl = this.clampTtl(input.ttl ?? this.getDefaultTtlSeconds(entity));
    const researchRecord = this.research.create({
      entityId,
      findings: input.findings,
      sources: input.sources,
      ttl
    });

    return researchRecord;
  }

  completeResearch(params: {
    entityId: string;
    findings: CreateEntityResearchInput['findings'];
    sources: ResearchSource[];
    ttl?: number;
  }): { record: EntityResearch; dataCompleteness: number } {
    const successfulSources = params.sources.filter((source) => source.success);
    const dataCompleteness = this.calculateDataCompleteness(successfulSources.length, params.sources.length);

    const finalizedFindings =
      successfulSources.length < MIN_SUCCESSFUL_SOURCES
        ? {
            summary: 'Insufficient data sources available',
            sentiment: 'unknown' as const,
            confidence: 20,
            risks: ['Limited data available'],
            opportunities: [],
            metadata: {}
          }
        : params.findings;

    this.events.create({
      entityId: params.entityId,
      timestamp: Date.now(),
      type: 'research-completed',
      summary: `Research completed: ${finalizedFindings.summary}`,
      data: {
        confidence: finalizedFindings.confidence,
        dataCompleteness
      },
      source: {
        type: 'manual',
        confidence: 100
      },
      importance: 5
    });

    const ttlOverride =
      successfulSources.length < MIN_SUCCESSFUL_SOURCES
        ? 10 * 60
        : params.ttl;

    const record = this.storeResearchResults(params.entityId, {
      findings: finalizedFindings,
      sources: params.sources,
      ttl: ttlOverride
    });

    return { record, dataCompleteness };
  }

  toResearchResult(entityId: string): ResearchResult | null {
    const entity = this.entities.findById(entityId);
    if (!entity) {
      return null;
    }

    const latest = this.research.getLatest(entityId);
    if (!latest) {
      return null;
    }

    const representations = this.representations.findManyByEntityId(entityId, true);
    const recentEvents = this.events.queryTimeline(entityId, { limit: 20 });
    const successfulSources = latest.sources.filter((source) => source.success);
    const dataCompleteness = this.calculateDataCompleteness(successfulSources.length, latest.sources.length);
    const confidence = latest.findings.confidence;
    const riskScore = this.deriveRiskScore(latest);

    return {
      entityId: entity.id,
      slug: entity.slug,
      symbol: entity.symbol,
      summary: latest.findings.summary,
      sentiment: latest.findings.sentiment ?? 'unknown',
      confidence,
      riskScore,
      risks: latest.findings.risks,
      opportunities: latest.findings.opportunities,
      urgency: this.deriveUrgency(confidence, riskScore),
      tradeable: confidence >= 40 && riskScore < 80,
      dataCompleteness,
      sources: latest.sources,
      representations,
      recentEvents,
      timestamp: latest.timestamp,
      expiresAt: latest.expiresAt
    };
  }

  private clampTtl(ttl: number): number {
    return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Math.floor(ttl)));
  }

  private calculateDataCompleteness(successful: number, total: number): number {
    if (total <= 0) {
      return 0;
    }
    return Math.round((successful / total) * 100);
  }

  private deriveRiskScore(latest: EntityResearch): number {
    const rugcheckScore = Number(latest.findings.metadata.rugcheckScore ?? 50);
    const concentration = Number(latest.findings.metadata.top10Concentration ?? 0);
    const baseRisk = 100 - rugcheckScore;
    const concentrationRisk = Math.min(40, concentration * 0.5);
    return Math.max(0, Math.min(100, Math.round(baseRisk + concentrationRisk)));
  }

  private deriveUrgency(
    confidence: number,
    riskScore: number
  ): ResearchResult['urgency'] {
    if (confidence >= 80 && riskScore < 40) {
      return 'immediate';
    }
    if (confidence >= 65 && riskScore < 60) {
      return 'high';
    }
    if (confidence >= 40) {
      return 'medium';
    }
    return 'low';
  }
}
