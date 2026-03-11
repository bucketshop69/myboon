import type { ResearchTool } from '../research/types/mcp.js'

interface SupabaseToolsDeps {
  supabaseUrl: string
  supabaseKey: string
}

export function createSupabaseTools(deps: SupabaseToolsDeps): ResearchTool<any>[] {
  const headers = {
    apikey: deps.supabaseKey,
    Authorization: `Bearer ${deps.supabaseKey}`,
    'Content-Type': 'application/json',
  }

  const searchPublished: ResearchTool<{ query: string }> = {
    name: 'search_published',
    description:
      'Search already-published narratives in our database by keyword or topic. ' +
      'Use this first before searching external news — check if we already covered this topic. ' +
      'Returns recent published narratives with matching tags or cluster names.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic or keyword to search for in published narratives' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(args) {
      try {
        const encoded = encodeURIComponent(`%${args.query}%`)
        const url = `${deps.supabaseUrl}/rest/v1/published_narratives?or=(content_small.ilike.${encoded},content_full.ilike.${encoded})&select=id,content_small,content_full,reasoning,tags,priority,created_at&order=created_at.desc&limit=5`
        const res = await fetch(url, { headers })

        if (!res.ok) {
          return { error: `Supabase search failed: ${res.status}` }
        }

        const rows = await res.json() as Array<{
          id: string
          content_small: string
          content_full: string
          reasoning: string
          tags: string[]
          priority: number
          created_at: string
        }>

        return rows.map((r) => ({
          id: r.id,
          content_small: r.content_small,
          content_full: r.content_full,
          reasoning: r.reasoning,
          tags: r.tags,
          priority: r.priority,
          created_at: r.created_at,
        }))
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
  }

  return [searchPublished]
}
