import { HermesWorkerClient } from './hermes-client'
import {
  buildResearchPrompt,
  buildResearchRequest,
  parseResearchResponse,
} from './research-contract'
import type { NewsCandidateObservationRow } from './store'
import type { HermesWorkerResult, NewsResearchResponse } from './types'

const DEFAULT_RESEARCH_TIMEOUT_MS = 300_000

export interface NewsResearchPreviewOptions {
  candidate: NewsCandidateObservationRow
  now?: Date
  timeoutMs?: number
  client?: HermesWorkerClient
}

export interface NewsResearchPreviewResult {
  candidateId: string
  sourceId: string
  urlId: string
  jobId: string
  workerStatus: HermesWorkerResult['status']
  status: NewsResearchResponse['status']
  articleClaimCount: number
  verifiedFactCount: number
  unresolvedClaimCount: number
  entityHintCount: number
  evidenceCount: number
  openQuestionCount: number
  durationMs: number
}

export async function runNewsResearchPreview(
  options: NewsResearchPreviewOptions
): Promise<NewsResearchPreviewResult> {
  const request = buildResearchRequest(options.candidate, options.now)
  const prompt = buildResearchPrompt(request)
  const client = options.client ?? new HermesWorkerClient()
  const workerResult = await client.run({
    jobId: request.job_id,
    taskType: 'source_aware_research',
    prompt,
    timeoutMs: options.timeoutMs ?? DEFAULT_RESEARCH_TIMEOUT_MS,
  })

  if (workerResult.status !== 'succeeded') {
    throw new Error(`Research preview Hermes worker ${workerResult.status}. stderr=${workerResult.stderr.slice(0, 500)}`)
  }

  const response = parseResearchResponse(workerResult.stdout, {
    jobId: request.job_id,
    candidateId: options.candidate.id,
    sourceId: options.candidate.sourceId,
    urlId: options.candidate.urlId,
  })

  return {
    candidateId: options.candidate.id,
    sourceId: options.candidate.sourceId,
    urlId: options.candidate.urlId,
    jobId: request.job_id,
    workerStatus: workerResult.status,
    status: response.status,
    articleClaimCount: response.article_claims.length,
    verifiedFactCount: response.verified_facts.length,
    unresolvedClaimCount: response.unresolved_claims.length,
    entityHintCount: response.entity_hints.length,
    evidenceCount: response.evidence.length,
    openQuestionCount: response.open_questions.length,
    durationMs: workerResult.durationMs,
  }
}
