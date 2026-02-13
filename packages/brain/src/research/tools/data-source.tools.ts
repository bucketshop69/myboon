import { JupiterTokensClient } from '../data-sources/jupiter-tokens.client.js';
import type { ResearchTool } from '../types/mcp.js';

interface DataSourceToolDeps {
  jupiterClient: JupiterTokensClient;
}

export function createDataSourceTools(deps: DataSourceToolDeps): ResearchTool<any>[] {
  const getTokenMetadata: ResearchTool<{ mint: string }> = {
    name: 'get_token_metadata',
    description:
      'Fetch SPL token metadata and market context by mint using Jupiter Tokens API V2.',
    inputSchema: {
      type: 'object',
      properties: {
        mint: { type: 'string' }
      },
      required: ['mint'],
      additionalProperties: false
    },
    async execute(args) {
      const token = await deps.jupiterClient.getTokenByMint(args.mint);
      if (!token) {
        return {
          found: false,
          mint: args.mint.trim(),
          source: 'jupiter-tokens-v2'
        };
      }

      return {
        found: true,
        mint: token.mint,
        token
      };
    }
  };

  return [getTokenMetadata];
}
