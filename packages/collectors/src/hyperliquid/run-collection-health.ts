import { config as loadEnv } from 'dotenv'
import { createCollectionLeadSupabaseClient } from './collection-lead-store.js'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

interface CollectionRunRow {
  id: string
  source: string
  collector: string
  status: string
  started_at: string
  finished_at: string | null
  summary: unknown
  artifact_path: string | null
  error: string | null
}

interface CollectionLeadRow {
  source: string
  collector: string
  lane: string
  asset: string
  status: string
  priority: number
  observed_at: string
  headline: string
  story_key: string
}

async function countLeads(status: 'research' | 'watch' | 'ignore'): Promise<number> {
  const db = createCollectionLeadSupabaseClient()
  const { count, error } = await db
    .from('collection_leads')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'hyperliquid')
    .eq('status', status)

  if (error) throw new Error(`collection_leads ${status} count failed: ${error.message}`)
  return count ?? 0
}

async function main(): Promise<void> {
  const db = createCollectionLeadSupabaseClient()

  const { data: runs, error: runsError } = await db
    .from('collection_runs')
    .select('id,source,collector,status,started_at,finished_at,summary,artifact_path,error')
    .eq('source', 'hyperliquid')
    .order('started_at', { ascending: false })
    .limit(10)

  if (runsError) throw new Error(`collection_runs health query failed: ${runsError.message}`)

  const { data: leads, error: leadsError } = await db
    .from('collection_leads')
    .select('source,collector,lane,asset,status,priority,observed_at,headline,story_key')
    .eq('source', 'hyperliquid')
    .in('status', ['research', 'watch'])
    .order('priority', { ascending: false })
    .order('observed_at', { ascending: false })
    .limit(15)

  if (leadsError) throw new Error(`collection_leads health query failed: ${leadsError.message}`)

  const [research, watch, ignore] = await Promise.all([
    countLeads('research'),
    countLeads('watch'),
    countLeads('ignore'),
  ])

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    leadCounts: { research, watch, ignore },
    recentRuns: (runs ?? []) as CollectionRunRow[],
    topResearchOrWatchLeads: (leads ?? []) as CollectionLeadRow[],
  }, null, 2))
}

main().catch((err) => {
  console.error('[hyperliquid-collection-health] Fatal error:', err)
  process.exit(1)
})
