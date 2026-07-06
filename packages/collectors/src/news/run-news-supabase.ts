import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { SupabasePipelineLedgerStore, withPipelineRun } from '../pipeline-ledger'
import { HermesWorkerClient } from './hermes-client'
import { runNewsPipelineOnce } from './runner'
import { SupabaseNewsStore } from './supabase-store'

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
  const batchSize = positiveInteger(process.env.NEWS_RUNNER_BATCH_SIZE, 1)
  const scoutTimeoutMs = positiveInteger(process.env.NEWS_SCOUT_TIMEOUT_MS, 5 * 60_000)
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
