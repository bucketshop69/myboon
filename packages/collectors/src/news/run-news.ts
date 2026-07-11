import { HermesWorkerClient } from './hermes-client'
import { runNewsPipelineOnce } from './runner'
import {
  DEFAULT_NEWS_SCOUT_TIMEOUT_MS,
  newsResearchBatchSize,
  positiveInteger,
} from './runtime-config'
import { SqliteNewsStore } from './sqlite-store'

const store = new SqliteNewsStore()

runNewsPipelineOnce({
  store,
  hermes: new HermesWorkerClient(),
  options: {
    batchSize: newsResearchBatchSize(),
    scoutTimeoutMs: positiveInteger(process.env.NEWS_SCOUT_TIMEOUT_MS, DEFAULT_NEWS_SCOUT_TIMEOUT_MS),
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
