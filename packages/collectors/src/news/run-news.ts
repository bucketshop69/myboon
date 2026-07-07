import { HermesWorkerClient } from './hermes-client'
import { runNewsPipelineOnce } from './runner'
import { SqliteNewsStore } from './sqlite-store'

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const store = new SqliteNewsStore()

runNewsPipelineOnce({
  store,
  hermes: new HermesWorkerClient(),
  options: {
    batchSize: positiveInteger(process.env.NEWS_RUNNER_BATCH_SIZE, 1),
    scoutTimeoutMs: positiveInteger(process.env.NEWS_SCOUT_TIMEOUT_MS, 5 * 60_000),
    researchTimeoutMs: positiveInteger(process.env.NEWS_RESEARCH_TIMEOUT_MS, 10 * 60_000),
    staleWorkCutoffMs: positiveInteger(process.env.NEWS_STALE_WORK_CUTOFF_MS, 30 * 60_000),
  },
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2))
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(() => {
    store.close()
  })
