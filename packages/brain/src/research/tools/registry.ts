import type { EntityMemory } from '@pnldotfun/entity-memory';

import { JupiterTokensClient } from '../data-sources/jupiter-tokens.client.js';
import { createDataSourceTools } from './data-source.tools.js';
import { createEntityTools } from './entity.tools.js';
import { createMemoryTools } from './memory.tools.js';
import type { AnthropicToolDefinition, ResearchTool } from '../types/mcp.js';

export interface ResearchToolRegistry {
  tools: ResearchTool<any>[];
  byName: Map<string, ResearchTool<any>>;
  toAnthropicDefinitions: () => AnthropicToolDefinition[];
}

export interface ResearchToolRegistryOptions {
  jupiterApiKey?: string;
}

export function createResearchToolRegistry(
  memory: EntityMemory,
  options?: ResearchToolRegistryOptions
): ResearchToolRegistry {
  const jupiterClient = new JupiterTokensClient({
    apiKey: options?.jupiterApiKey
  });

  const tools: ResearchTool<any>[] = [
    ...createEntityTools({
      entityService: memory.services.entity
    }),
    ...createMemoryTools({
      researchService: memory.services.research
    }),
    ...createDataSourceTools({
      jupiterClient
    })
    // Deferred by product direction:
    // - Extended data-source tools (Helius/Birdeye/Rugcheck/Twitter sentiment/holders)
    // - Entity Query Tools (timeline/related representations beyond core memory ops)
  ];

  const byName = new Map<string, ResearchTool>(tools.map((tool) => [tool.name, tool]));
  return {
    tools,
    byName,
    toAnthropicDefinitions() {
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema
      }));
    }
  };
}
