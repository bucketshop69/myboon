import type { PolymarketClient } from '@myboon/shared'
import type { ResearchTool } from '../research/types/mcp.js'

export function createPolymarketTools(client: PolymarketClient): ResearchTool<any>[] {
  const getMarketSnapshot: ResearchTool<{ slug: string }> = {
    name: 'get_market_snapshot',
    description:
      'Fetch live yes/no prices, volume, and end date for a Polymarket market by slug. ' +
      'Call this before writing an observation about a specific market to get current odds.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
    async execute(args) {
      try {
        const snapshot = await client.getMarketSnapshot(args.slug)
        if (!snapshot) {
          return { error: `No snapshot found for slug: ${args.slug}` }
        }
        return {
          slug: args.slug,
          title: snapshot.market.title,
          yesPrice: snapshot.yesPrice,
          noPrice: snapshot.noPrice,
          volume: snapshot.market.volume,
          endDate: snapshot.market.endDate,
          fetchedAt: snapshot.fetchedAt,
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
  }

  const getMarketByCondition: ResearchTool<{ conditionId: string }> = {
    name: 'get_market_by_condition',
    description:
      'Resolve a Polymarket conditionId to full market context including live yes/no prices, volume, and end date. ' +
      'Use this when a signal contains a conditionId instead of a slug. Returns the same data as get_market_snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        conditionId: { type: 'string' },
      },
      required: ['conditionId'],
      additionalProperties: false,
    },
    async execute(args) {
      try {
        const market = await client.getMarketByConditionId(args.conditionId)
        if (!market) {
          return { error: `No market found for conditionId: ${args.conditionId}` }
        }
        const snapshot = await client.getMarketSnapshot(market.slug)
        if (!snapshot) {
          return { slug: market.slug, title: market.title, volume: market.volume, endDate: market.endDate }
        }
        return {
          slug: snapshot.market.slug,
          title: snapshot.market.title,
          yesPrice: snapshot.yesPrice,
          noPrice: snapshot.noPrice,
          volume: snapshot.market.volume,
          endDate: snapshot.market.endDate,
          fetchedAt: snapshot.fetchedAt,
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
  }

  return [getMarketSnapshot, getMarketByCondition]
}
