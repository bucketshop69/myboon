import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { SupabasePipelineLedgerStore, withPipelineRun } from '../pipeline-ledger'
import { SupabaseNewsStore } from '../news/supabase-store'
import { HermesEntityExtractionProvider } from './extractor'
import { runNewsEntityManager } from './run-news'
import { SupabaseEntityMemoryStore } from './supabase-store'

const DEFAULT_BATCH_SIZE = 20

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

  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  )
  const batchSize = positiveInteger(process.env.ENTITY_MANAGER_NEWS_BATCH_SIZE, DEFAULT_BATCH_SIZE)
  const hermesTimeoutMs = positiveInteger(process.env.ENTITY_MANAGER_HERMES_TIMEOUT_MS, 60_000)

  const result = await withPipelineRun(
    new SupabasePipelineLedgerStore(supabase),
    {
      source: 'news',
      sourceArea: 'curated_news',
      stage: 'news.entity_manager',
      metadata: {
        batchSize,
        storage: 'supabase',
      },
    },
    () => runNewsEntityManager({
      newsStore: new SupabaseNewsStore(supabase),
      entityStore: new SupabaseEntityMemoryStore(supabase),
      extractionProvider: new HermesEntityExtractionProvider({ timeoutMs: hermesTimeoutMs }),
      batchSize,
    })
  )

  console.log(JSON.stringify(result, null, 2))
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
