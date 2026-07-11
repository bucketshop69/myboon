import { activeNewsSourceUrls, activeNewsSources, newsSources } from './config'
import { HermesWorkerClient } from './hermes-client'
import { DEFAULT_NEWS_SCOUT_TIMEOUT_MS } from './runtime-config'
import {
  buildScoutPrompt,
  buildScoutRequest,
  parseScoutResponse,
} from './scout-contract'
import type {
  HermesWorkerResult,
  NewsScoutResponse,
  NewsSourceConfig,
  NewsSourceUrlConfig,
} from './types'

export interface NewsScoutPreviewOptions {
  sourceId?: string
  urlId?: string
  now?: Date
  timeoutMs?: number
  sources?: NewsSourceConfig[]
  client?: HermesWorkerClient
}

export interface NewsScoutPreviewResult {
  sourceId: string
  urlId: string
  jobId: string
  workerStatus: HermesWorkerResult['status']
  status: NewsScoutResponse['status']
  candidateCount: number
  candidates: Array<{
    headline: string
    articleUrl: string
  }>
  stderr: string
  durationMs: number
}

export async function runNewsScoutPreview(
  options: NewsScoutPreviewOptions = {}
): Promise<NewsScoutPreviewResult> {
  const { source, sourceUrl } = selectSourceAndUrl(options)
  const request = buildScoutRequest(source, sourceUrl, options.now)
  const prompt = buildScoutPrompt(request)
  const client = options.client ?? new HermesWorkerClient()
  const workerResult = await client.run({
    jobId: request.job_id,
    taskType: 'source_scout',
    prompt,
    timeoutMs: options.timeoutMs ?? DEFAULT_NEWS_SCOUT_TIMEOUT_MS,
  })

  if (workerResult.status !== 'succeeded') {
    throw new Error(`Scout preview Hermes worker ${workerResult.status}. stderr=${workerResult.stderr.slice(0, 500)}`)
  }

  const response = parseScoutResponse(workerResult.stdout, {
    jobId: request.job_id,
    sourceId: source.sourceId,
    urlId: sourceUrl.urlId,
  })

  return {
    sourceId: source.sourceId,
    urlId: sourceUrl.urlId,
    jobId: request.job_id,
    workerStatus: workerResult.status,
    status: response.status,
    candidateCount: response.candidates.length,
    candidates: response.candidates.map((candidate) => ({
      headline: candidate.headline,
      articleUrl: candidate.article_url,
    })),
    stderr: workerResult.stderr,
    durationMs: workerResult.durationMs,
  }
}

function selectSourceAndUrl(options: NewsScoutPreviewOptions): {
  source: NewsSourceConfig
  sourceUrl: NewsSourceUrlConfig
} {
  const sources = activeNewsSources(options.sources ?? newsSources())
  const source = options.sourceId
    ? sources.find((candidate) => candidate.sourceId === options.sourceId)
    : sources[0]
  if (!source) throw new Error(`No active news source found${options.sourceId ? ` for ${options.sourceId}` : ''}`)

  const urls = activeNewsSourceUrls(source)
  const sourceUrl = options.urlId
    ? urls.find((candidate) => candidate.urlId === options.urlId)
    : urls[0]
  if (!sourceUrl) throw new Error(`No active news source URL found${options.urlId ? ` for ${options.urlId}` : ''}`)

  return { source, sourceUrl }
}
