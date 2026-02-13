import type { ResearchService } from '@pnldotfun/entity-memory';
import type { ResearchTool } from '../types/mcp.js';

interface MemoryToolDeps {
  researchService: ResearchService;
}

export function createMemoryTools(deps: MemoryToolDeps): ResearchTool<any>[] {
  const checkFreshness: ResearchTool<{ entityId: string; maxAgeMs?: number }> = {
    name: 'check_research_freshness',
    description: 'Check whether cached research exists and is fresh for an entity.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        maxAgeMs: { type: 'number' }
      },
      required: ['entityId'],
      additionalProperties: false
    },
    async execute(args) {
      return deps.researchService.checkResearchFreshness(args.entityId, args.maxAgeMs);
    }
  };

  const getCachedResearch: ResearchTool<{ entityId: string }> = {
    name: 'get_cached_research',
    description: 'Retrieve latest cached research for an entity.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' }
      },
      required: ['entityId'],
      additionalProperties: false
    },
    async execute(args) {
      const research = deps.researchService.getCachedResearch(args.entityId);
      if (!research) {
        return { found: false };
      }
      return { found: true, research };
    }
  };

  const storeResearch: ResearchTool<{
    entityId: string;
    findings: {
      summary: string;
      sentiment?: 'bullish' | 'bearish' | 'neutral' | 'unknown';
      confidence: number;
      risks?: string[];
      opportunities?: string[];
      metadata?: Record<string, unknown>;
    };
    sources: Array<{
      tool: string;
      success: boolean;
      error?: string;
      timestamp?: number;
      dataFreshness?: number;
    }>;
    ttl?: number;
  }> = {
    name: 'store_research_results',
    description: 'Store research findings in memory and emit a research-completed event.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        findings: { type: 'object' },
        sources: { type: 'array' },
        ttl: { type: 'number' }
      },
      required: ['entityId', 'findings', 'sources'],
      additionalProperties: false
    },
    async execute(args) {
      const normalizedSources = args.sources.map((source) => ({
        tool: source.tool,
        success: source.success,
        error: source.error,
        timestamp: source.timestamp ?? Date.now(),
        dataFreshness: source.dataFreshness
      }));

      const result = deps.researchService.completeResearch({
        entityId: args.entityId,
        findings: {
          summary: args.findings.summary,
          sentiment: args.findings.sentiment,
          confidence: args.findings.confidence,
          risks: args.findings.risks ?? [],
          opportunities: args.findings.opportunities ?? [],
          metadata: args.findings.metadata ?? {}
        },
        sources: normalizedSources,
        ttl: args.ttl
      });

      return {
        success: true,
        researchId: result.record.id,
        dataCompleteness: result.dataCompleteness
      };
    }
  };

  return [checkFreshness, getCachedResearch, storeResearch];
}
