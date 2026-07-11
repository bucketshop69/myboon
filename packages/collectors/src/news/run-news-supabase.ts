import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { SupabasePipelineLedgerStore, withPipelineRun } from '../pipeline-ledger'
import { HermesWorkerClient } from './hermes-client'
import { runNewsPipelineOnce } from './runner'
import {
  DEFAULT_NEWS_SCOUT_TIMEOUT_MS,
  newsResearchBatchSize,
  positiveInteger,
} from './runtime-config'
import { SupabaseNewsStore } from './supabase-store'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function main(): Promise<void> {
  loadEnv({ path: '.env' })
  loadEnv({ path: '../../.env' })
  loadEnv()

  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  )
  const batchSize = newsResearchBatchSize()
  const scoutTimeoutMs = positiveInteger(process.env.NEWS_SCOUT_TIMEOUT_MS, DEFAULT_NEWS_SCOUT_TIMEOUT_MS)
  const researchTimeoutMs = positiveInteger(process.env.NEWS_RESEARCH_TIMEOUT_MS, 10 * 60_000)
  const staleWorkCutoffMs = positiveInteger(process.env.NEWS_STALE_WORK_CUTOFF_MS, 30 * 60_000)

  const result = await withPipelineRun(
    new SupabasePipelineLedgerStore(supabase),
    {
      source: 'news',
      sourceArea: 'curated_news',
      stage: 'news.collector',
      metadata: {
        batchSize,
        storage: 'supabase',
      },
    },
    () => runNewsPipelineOnce({
      store: new SupabaseNewsStore(supabase),
      hermes: new HermesWorkerClient(),
      options: {
        batchSize,
        scoutTimeoutMs,
        researchTimeoutMs,
        staleWorkCutoffMs,
      },
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
