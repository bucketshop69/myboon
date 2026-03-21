import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { fomoMasterGraph } from './graphs/fomo-master-graph.js'

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')

if (missing.length > 0) {
  console.error(`[fomo_master] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

export async function runFomoMaster(): Promise<void> {
  console.log(`[fomo_master] Running at ${new Date().toISOString()}`)

  // Step 1: fetch signal IDs already consumed in recent x_posts
  const { data: recentPosts } = await supabase
    .from('x_posts')
    .select('signal_ids')
    .eq('agent_type', 'fomo_master')
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  const consumedIds = new Set<string>(
    (recentPosts ?? []).flatMap((p) => p.signal_ids ?? [])
  )

  // Step 2: fetch high-weight whale bets from last 4h
  const { data: signals, error } = await supabase
    .from('signals')
    .select('*')
    .eq('type', 'WHALE_BET')
    .gte('weight', 8)
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('[fomo_master] Failed to fetch signals:', error)
    return
  }

  const unprocessed = (signals ?? []).filter((s) => !consumedIds.has(s.id))

  if (!unprocessed.length) {
    console.log('[fomo_master] No new high-weight signals to process')
    return
  }

  console.log(`[fomo_master] Found ${unprocessed.length} signal(s) to process.`)

  // Step 3: fetch last 7 days of x_posts for broadcaster context
  const { data: timeline } = await supabase
    .from('x_posts')
    .select('draft_text, agent_type, status, created_at')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })

  // Step 4: invoke graph with full signal batch + timeline
  try {
    await fomoMasterGraph.invoke({ signals: unprocessed, timeline: timeline ?? [] })
  } catch (err) {
    console.error('[fomo_master] Graph error:', err)
  }

  console.log('[fomo_master] Done.')
}
