import { NansenClient } from '@myboon/shared'
import type { ResearchTool } from '../research/types/mcp.js'

const nansenClient = new NansenClient({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  nansenApiKey: process.env.NANSEN_API_KEY!,
})

export const nansenTools: ResearchTool<any>[] = [
  {
    name: 'nansen_bettor_profile',
    description:
      'Fetch the Polymarket prediction track record for a wallet address. Returns win rate, total realized PnL, and trade count. Use this when a WHALE_BET or PM_MARKET_SURGE signal includes a wallet address — it tells you whether to trust the signal.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'EVM wallet address (0x...)' },
      },
      required: ['address'],
      additionalProperties: false,
    },
    async execute(args: { address: string }) {
      try {
        return await nansenClient.bettorProfile(args.address)
      } catch (err) {
        console.error('[nansen-tools] nansen_bettor_profile error:', err)
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
  },
  {
    name: 'nansen_market_depth',
    description:
      'Fetch top position holders and orderbook for a Polymarket market by its numeric market ID. Use this when analysing a narrative to understand who is positioned on each side and how concentrated the market is. Returns holders array and orderbook bids/asks.',
    inputSchema: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Numeric Polymarket market ID (e.g. "1484949")' },
      },
      required: ['market_id'],
      additionalProperties: false,
    },
    async execute(args: { market_id: string }) {
      try {
        return await nansenClient.marketDepth(args.market_id)
      } catch (err) {
        console.error('[nansen-tools] nansen_market_depth error:', err)
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
  },
]
