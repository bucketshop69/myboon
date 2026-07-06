import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { newsResearchToPacket } from './news-adapter'
import { writeExtraction, markExtractionFailed } from './resolver'
import { HermesEntityExtractionProvider } from './extractor'
import { SupabaseEntityMemoryStore } from './supabase-store'
import { SqliteNewsStore } from '../news/sqlite-store'
import type {
  NewsCandidateObservationRow,
  NewsResearchResultRow,
  NewsStore,
} from '../news/store'
import type {
  EntityMemoryStore,
  ExtractionProvider,
  MemoryLookupKey,
  ResearchPacket,
  WriteExtractionResult,
} from './types'

const DEFAULT_BATCH_SIZE = 20

export interface PendingNewsPacket {
  result: NewsResearchResultRow
  candidate: NewsCandidateObservationRow
  packet: ResearchPacket
}

export interface NewsEntityManagerResult {
  fetched: number
  processed: number
  failed: number
  skippedAlreadyMarked: number
  memoriesWritten: number
  results: WriteExtractionResult[]
  failures: Array<{
    sourceResearchId: string
    error: string
  }>
}

export interface RunNewsEntityManagerInput {
  newsStore: NewsStore
  entityStore: EntityMemoryStore
  extractionProvider: ExtractionProvider
  batchSize?: number
}

interface FetchNewsPacketsResult {
  fetched: number
  skippedAlreadyMarked: number
  packets: PendingNewsPacket[]
}

export async function fetchUnprocessedNewsPackets(input: {
  newsStore: NewsStore
  entityStore: EntityMemoryStore
  batchSize: number
}): Promise<PendingNewsPacket[]> {
  return (await fetchNewsPackets(input)).packets
}

export async function runNewsEntityManager(input: RunNewsEntityManagerInput): Promise<NewsEntityManagerResult> {
  const fetched = await fetchNewsPackets({
    newsStore: input.newsStore,
    entityStore: input.entityStore,
    batchSize: input.batchSize ?? DEFAULT_BATCH_SIZE,
  })
  const results: WriteExtractionResult[] = []
  const failures: NewsEntityManagerResult['failures'] = []
  let memoriesWritten = 0

  for (const item of fetched.packets) {
    try {
      const result = await writeExtraction(input.entityStore, item.packet, input.extractionProvider)
      results.push(result)
      memoriesWritten += result.memoriesWritten
      await input.newsStore.markResearchResultStatus(item.result.id, 'handed_to_entity_memory')
    } catch (error) {
      const message = errorMessage(error)
      const failureResult = await markExtractionFailed(input.entityStore, item.packet, message)
      memoriesWritten += failureResult.memoriesWritten
      failures.push({ sourceResearchId: item.result.id, error: message })
      await input.newsStore.markResearchResultStatus(item.result.id, 'failed_entity_memory')
    }
  }

  return {
    fetched: fetched.fetched,
    processed: results.length,
    failed: failures.length,
    skippedAlreadyMarked: fetched.skippedAlreadyMarked,
    memoriesWritten,
    results,
    failures,
  }
}

async function fetchNewsPackets(input: {
  newsStore: NewsStore
  entityStore: EntityMemoryStore
  batchSize: number
}): Promise<FetchNewsPacketsResult> {
  const limit = Math.max(input.batchSize * 10, 100)
  const pending = await input.newsStore.fetchPendingResearchResults(limit)
  const packets = pending.map((item) => ({
    ...item,
    packet: newsResearchToPacket(item.result, item.candidate),
  }))
  const marked = await fetchMarkedNewsResearchIds(input.entityStore, packets)
  const skippedAlreadyMarked = packets.filter((item) => marked.has(item.result.id)).length
  const unprocessed = packets
    .filter((item) => !marked.has(item.result.id))
    .slice(0, Math.max(0, input.batchSize))

  return {
    fetched: pending.length,
    skippedAlreadyMarked,
    packets: unprocessed,
  }
}

async function fetchMarkedNewsResearchIds(
  entityStore: EntityMemoryStore,
  packets: PendingNewsPacket[]
): Promise<Set<string>> {
  const keys = packets.flatMap((item): MemoryLookupKey[] => ([
    processedMarkerKey(item.packet),
    failedMarkerKey(item.packet),
  ]))
  const memories = await entityStore.findMemories(keys)
  return new Set(memories
    .filter((memory) => (
      memory.source === 'news'
      && memory.memory_type === 'source_marker'
      && (memory.title === 'entity_manager:processed' || memory.title === 'entity_manager:failed')
    ))
    .map((memory) => memory.source_research_id))
}

function processedMarkerKey(packet: ResearchPacket): MemoryLookupKey {
  return markerKey(packet, 'entity_manager:processed')
}

function failedMarkerKey(packet: ResearchPacket): MemoryLookupKey {
  return markerKey(packet, 'entity_manager:failed')
}

function markerKey(packet: ResearchPacket, title: string): MemoryLookupKey {
  return {
    source: 'news',
    sourceArea: packet.sourceArea,
    sourceResearchId: packet.sourceResearchId,
    entityId: null,
    memoryType: 'source_marker',
    title,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

async function main(): Promise<void> {
  loadEnv({ path: '.env' })
  loadEnv({ path: '../../.env' })
  loadEnv()

  const newsStore = new SqliteNewsStore()
  try {
    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    )
    const result = await runNewsEntityManager({
      newsStore,
      entityStore: new SupabaseEntityMemoryStore(supabase),
      extractionProvider: new HermesEntityExtractionProvider(),
      batchSize: positiveInteger(process.env.ENTITY_MANAGER_NEWS_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    newsStore.close()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(errorMessage(error))
    process.exit(1)
  })
}
