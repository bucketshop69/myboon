import type { EntityService } from '@pnldotfun/entity-memory';
import type { ResearchTool } from '../types/mcp.js';

interface EntityToolDeps {
  entityService: EntityService;
}

export function createEntityTools(deps: EntityToolDeps): ResearchTool<any>[] {
  const resolveEntity: ResearchTool<{ identifier: string }> = {
    name: 'resolve_entity',
    description:
      'Resolve identifier (mint, slug, symbol, or name) to canonical entity. Returns best candidate.',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: { type: 'string' }
      },
      required: ['identifier'],
      additionalProperties: false
    },
    async execute(args) {
      return deps.entityService.resolveIdentifier(args.identifier);
    }
  };

  const createEntity: ResearchTool<{
    name: string;
    symbol?: string;
    type: 'crypto-token' | 'macro-asset' | 'protocol' | 'person' | 'concept' | 'meme';
    slug?: string;
    metadata?: Record<string, unknown>;
  }> = {
    name: 'create_entity',
    description: 'Create a new canonical entity when no match exists.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        symbol: { type: 'string' },
        type: {
          type: 'string',
          enum: ['crypto-token', 'macro-asset', 'protocol', 'person', 'concept', 'meme']
        },
        slug: { type: 'string' },
        metadata: { type: 'object' }
      },
      required: ['name', 'type'],
      additionalProperties: true
    },
    async execute(args) {
      const entity = deps.entityService.createEntity({
        slug: args.slug,
        name: args.name,
        symbol: args.symbol,
        type: args.type,
        verified: false,
        metadata: {
          category: [],
          ...(args.metadata ?? {})
        }
      });
      return { success: true, entity };
    }
  };

  const addRepresentation: ResearchTool<{
    entityId: string;
    type: 'spot-token' | 'perp-contract' | 'lp-pair' | 'lending' | 'staking';
    protocol: string;
    chain?: string;
    context: {
      mint?: string;
      market?: string;
      pair?: string;
      poolAddress?: string;
      metadata?: Record<string, unknown>;
    };
  }> = {
    name: 'add_representation',
    description: 'Add representation metadata (spot/perp/lp) to an existing entity.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        type: {
          type: 'string',
          enum: ['spot-token', 'perp-contract', 'lp-pair', 'lending', 'staking']
        },
        protocol: { type: 'string' },
        chain: { type: 'string' },
        context: { type: 'object' }
      },
      required: ['entityId', 'type', 'protocol', 'context'],
      additionalProperties: false
    },
    async execute(args) {
      const representation = deps.entityService.addRepresentation({
        entityId: args.entityId,
        type: args.type,
        protocol: args.protocol,
        chain: args.chain,
        context: args.context
      });
      return { success: true, representation };
    }
  };

  return [resolveEntity, createEntity, addRepresentation];
}
