import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { influencerGraph } from './graphs/influencer-graph.js'
import type { PublishedNarrative } from './publisher-types.js'

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')

if (missing.length > 0) {
  console.error(`[influencer] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

export async function runInfluencer(): Promise<void> {
  console.log(`[influencer] Running at ${new Date().toISOString()}`)

  const { data: posted } = await supabase
    .from('x_posts')
    .select('narrative_id')
    .not('narrative_id', 'is', null)

  const postedIds = (posted ?? []).map((r) => r.narrative_id as string)

  let query = supabase
    .from('published_narratives')
    .select('id, content_small, content_full, tags, content_type, actions')
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  if (postedIds.length > 0) {
    query = query.not('id', 'in', `(${postedIds.map((id) => `"${id}"`).join(',')})`)
  }

  const { data: narratives, error } = await query

  if (error) {
    console.error('[influencer] Failed to fetch narratives:', error)
    return
  }

  if (!narratives?.length) {
    console.log('[influencer] No new narratives to process')
    return
  }

  console.log(`[influencer] Found ${narratives.length} narrative(s) to process.`)

  for (const narrative of narratives as PublishedNarrative[]) {
    try {
      await influencerGraph.invoke({ narrative })
    } catch (err) {
      console.error(`[influencer] Failed to process narrative ${narrative.id}:`, err)
    }
  }

  console.log(`[influencer] Done — processed ${narratives.length} narrative(s).`)
}
