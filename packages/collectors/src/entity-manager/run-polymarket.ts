import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { SupabasePipelineLedgerStore, withPipelineRun } from '../pipeline-ledger'
import { HermesEntityExtractionProvider } from './extractor'
import { polymarketResearchToPacket, type PolymarketCandidateContext, type PolymarketResearchRow } from './polymarket-adapter'
import { writeExtraction, markExtractionFailed } from './resolver'
import { SupabaseEntityMemoryStore } from './supabase-store'
import type { ExtractionProvider, ResearchPacket, WriteExtractionResult } from './types'

const DEFAULT_BATCH_SIZE = 20
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000

export interface RunPolymarketEntityManagerOptions {
  batchSize?: number
  extractionProvider?: ExtractionProvider
}

export interface PolymarketEntityManagerCliConfig {
  batchSize: number
  intervalMs: number
  runOnce: boolean
  hermesTimeoutMs: number
}

export interface PolymarketEntityManagerResult {
  fetched: number
  processed: number
  failed: number
  results: WriteExtractionResult[]
  failures: Array<{ sourceResearchId: string, error: string }>
}

export const POLYMARKET_ENTITY_MANAGER_RESEARCH_SELECT = [
  'id',
  'candidate_id',
  'source',
  'area',
  'slug',
  'title',
  'candidate_type',
  'research_mode',
  'summary',
  'notes',
  'key_findings',
  'evidence_links',
  'uncertainty',
  'editor_notes',
  'researched_at',
  'research_family_key',
  'research_cluster_key',
  'research_depth',
  'evidence_quality',
  'catalyst_found',
  'recommended_editor_action',
  'research_backend',
  'research_model',
].join(', ')

const CANDIDATE_SELECT = [
  'id',
  'market_id',
  'slug',
  'title',
  'tag_slug',
  'tag_label',
  'observed_at',
  'what_changed',
  'why_flagged',
  'score',
  'score_breakdown',
  'metrics',
  'evidence_refs',
].join(', ')

async function fetchProcessedResearchIds(db: SupabaseClient, researchIds: string[]): Promise<Set<string>> {
  if (researchIds.length === 0) return new Set()
  const { data, error } = await db
    .from('entity_memories')
    .select('source_research_id')
    .eq('source', 'polymarket')
    .eq('source_area', 'markets')
    .eq('memory_type', 'source_marker')
    .in('source_research_id', researchIds)
    .in('title', ['entity_manager:processed', 'entity_manager:failed'])
  if (error) throw new Error(`entity manager marker lookup failed: ${error.message}`)
  return new Set((data ?? []).map((row) => String((row as { source_research_id: unknown }).source_research_id)))
}

async function fetchResearchRows(db: SupabaseClient, limit: number, offset = 0): Promise<PolymarketResearchRow[]> {
  const { data, error } = await db
    .from('polymarket_market_candidate_research')
    .select(POLYMARKET_ENTITY_MANAGER_RESEARCH_SELECT)
    .eq('source', 'polymarket')
    .eq('area', 'markets')
    .eq('status', 'pending_editor')
    .order('researched_at', { ascending: true })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`polymarket research fetch failed: ${error.message}`)
  return (data ?? []) as unknown as PolymarketResearchRow[]
}

async function fetchCandidateContext(db: SupabaseClient, candidateIds: string[]): Promise<Map<string, PolymarketCandidateContext>> {
  if (candidateIds.length === 0) return new Map()
  const { data, error } = await db
    .from('polymarket_market_candidates')
    .select(CANDIDATE_SELECT)
    .in('id', candidateIds)
  if (error) throw new Error(`polymarket candidate context fetch failed: ${error.message}`)
  const byId = new Map<string, PolymarketCandidateContext>()
  for (const row of data ?? []) {
    const candidate = row as unknown as PolymarketCandidateContext
    byId.set(candidate.id, candidate)
  }
  return byId
}

export async function fetchUnprocessedPolymarketPackets(
  db: SupabaseClient,
  batchSize: number
): Promise<ResearchPacket[]> {
  const pageSize = Math.max(batchSize * 10, 100)
  const maxPages = 50
  const unprocessed: PolymarketResearchRow[] = []

  for (let page = 0; page < maxPages && unprocessed.length < batchSize; page += 1) {
    const offset = page * pageSize
    const rows = await fetchResearchRows(db, pageSize, offset)
    if (rows.length === 0) break

    const processed = await fetchProcessedResearchIds(db, rows.map((row) => row.id))
    unprocessed.push(...rows.filter((row) => !processed.has(row.id)))

    if (rows.length < pageSize) break
  }

  const selected = unprocessed.slice(0, batchSize)
  const candidates = await fetchCandidateContext(db, [...new Set(selected.map((row) => row.candidate_id))])
  return selected.map((row) => polymarketResearchToPacket(row, candidates.get(row.candidate_id) ?? null))
}

export async function runPolymarketEntityManager(
  db: SupabaseClient,
  options: RunPolymarketEntityManagerOptions = {}
): Promise<PolymarketEntityManagerResult> {
  const batchSize = options.batchSize ?? 20
  const extractionProvider = options.extractionProvider ?? new HermesEntityExtractionProvider()
  const store = new SupabaseEntityMemoryStore(db)
  const packets = await fetchUnprocessedPolymarketPackets(db, batchSize)
  const results: WriteExtractionResult[] = []
  const failures: Array<{ sourceResearchId: string, error: string }> = []

  for (const packet of packets) {
    try {
      results.push(await writeExtraction(store, packet, extractionProvider))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ sourceResearchId: packet.sourceResearchId, error: message })
      await markExtractionFailed(store, packet, message)
    }
  }

  return {
    fetched: packets.length,
    processed: results.length,
    failed: failures.length,
    results,
    failures,
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function envFlag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

export function polymarketEntityManagerCliConfig(env: NodeJS.ProcessEnv = process.env): PolymarketEntityManagerCliConfig {
  return {
    batchSize: positiveInteger(env.ENTITY_MANAGER_POLYMARKET_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    intervalMs: positiveInteger(env.ENTITY_MANAGER_POLYMARKET_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    runOnce: envFlag(env.ENTITY_MANAGER_POLYMARKET_RUN_ONCE),
    hermesTimeoutMs: positiveInteger(env.ENTITY_MANAGER_HERMES_TIMEOUT_MS, 60_000),
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function runAndLog(db: SupabaseClient, config: PolymarketEntityManagerCliConfig): Promise<void> {
  const result = await withPipelineRun(
    new SupabasePipelineLedgerStore(db),
    {
      source: 'polymarket',
      sourceArea: 'markets',
      stage: 'polymarket.entity_manager',
      metadata: {
        batchSize: config.batchSize,
      },
    },
    () => runPolymarketEntityManager(db, {
      batchSize: config.batchSize,
      extractionProvider: new HermesEntityExtractionProvider({ timeoutMs: config.hermesTimeoutMs }),
    })
  )
  console.log(JSON.stringify(result, null, 2))
}

async function main(): Promise<void> {
  loadEnv({ path: '.env' })
  loadEnv({ path: '../../.env' })
  loadEnv()

  const config = polymarketEntityManagerCliConfig()
  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  )

  await runAndLog(supabase, config)
  if (config.runOnce) return

  setInterval(() => {
    runAndLog(supabase, config).catch((err) => {
      console.error('[entity-manager:polymarket] run failed:', err)
    })
  }, config.intervalMs)
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[entity-manager:polymarket] fatal:', err)
    process.exit(1)
  })
}
