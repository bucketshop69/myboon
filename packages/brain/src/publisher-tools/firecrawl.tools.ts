import type { ResearchTool } from '../research/types/mcp.js'

export function createFirecrawlTools(apiKey: string): ResearchTool<any>[] {
  const searchNews: ResearchTool<{ query: string; limit?: number }> = {
    name: 'search_news',
    description:
      'Search for recent news articles relevant to a topic using Firecrawl. ' +
      'Returns news from the past 24 hours. Use 2-3 targeted queries per narrative to find relevant context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(args) {
      try {
        const res = await fetch('https://api.firecrawl.dev/v2/search', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: args.query,
            sources: ['web'],
            categories: [],
            tbs: 'qdr:w',
            limit: args.limit ?? 5,
            scrapeOptions: {
              formats: ['markdown'],
              onlyMainContent: true,
              parsers: [],
            },
          }),
        })

        if (!res.ok) {
          return { error: `Firecrawl request failed: ${res.status} ${await res.text()}` }
        }

        const raw = await res.json() as {
          data?: { web?: { title?: string; url?: string; description?: string; markdown?: string }[] }
        }
        const items = raw.data?.web ?? []
        const results = items.map((item) => ({
          title: item.title ?? '',
          url: item.url ?? '',
          description: item.description ?? '',
          content: item.markdown ? item.markdown.slice(0, 1000) : '',
        }))

        return results
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
  }

  return [searchNews]
}
