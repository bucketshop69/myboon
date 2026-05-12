import { createClient } from '@supabase/supabase-js'
import type { ResearchTool } from '../tool-types.js'

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
        const url = `${deps.supabaseUrl}/rest/v1/published_narratives?or=(content_small.ilike.${encoded},content_full.ilike.${encoded})&select=id,content_small,content_full,reasoning,tags,priority,thread_id,created_at&order=created_at.desc&limit=15`
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
          content_full: r.content_full?.slice(0, 600),
          reasoning: r.reasoning?.slice(0, 300),
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

export function createPublisherSupabaseTools(supabaseUrl: string, supabaseKey: string): ResearchTool<any>[] {
  const supabase = createClient(supabaseUrl, supabaseKey)

  return [
    {
      name: 'get_tag_history',
      description:
        'Fetch recent published narratives matching any of the given topic tags. Call this before writing when you identify a topic tag from the narrative signals. Use the results to understand what angle has already been covered — do not repeat the same framing. If this is the 4th UCL card today, find a fresh angle or recommend rejection.',
      inputSchema: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Topic tags to search (e.g. ["iran", "geopolitics"])',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 5, max 10)',
          },
        },
        required: ['tags'],
        additionalProperties: false,
      },
      async execute(args: { tags: string[]; limit?: number }) {
        const cap = Math.min(args.limit ?? 15, 15)
        const { data } = await supabase
          .from('published_narratives')
          .select('id, content_small, reasoning, tags, content_type, created_at')
          .overlaps('tags', args.tags)
          .order('created_at', { ascending: false })
          .limit(cap)
        return (data ?? []).map((r) => ({
          ...r,
          reasoning: r.reasoning?.slice(0, 300),
        }))
      },
    },
  ]
}
