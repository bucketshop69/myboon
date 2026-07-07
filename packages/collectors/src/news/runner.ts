import { activeNewsSourceUrls, activeNewsSources, newsSources } from './config'
import { classifyNewsCandidate } from './dedupe'
import { canonicalArticleUrl, fingerprintScoutCandidate } from './fingerprint'
import { buildResearchPrompt, buildResearchRequest, parseResearchResponse } from './research-contract'
import { buildScoutPrompt, buildScoutRequest, parseScoutResponse } from './scout-contract'
import type { NewsCandidateObservationInput, NewsStore, RecoverStaleNewsWorkResult } from './store'
import type {
  HermesWorkerRequest,
  HermesWorkerResult,
  NewsScoutCandidate,
  NewsSourceConfig,
  NewsSourceUrlConfig,
} from './types'

export interface NewsRunnerOptions {
  scoutTimeoutMs: number
  researchTimeoutMs: number
  batchSize: number
  maxResearchAttempts: number
  staleWorkCutoffMs: number
  now?: Date
}

export interface NewsRunnerFailure {
  stage: 'scout' | 'research'
  sourceId?: string
  urlId?: string
  candidateId?: string
  error: string
}

export interface NewsScoutRunResult {
  sourceId: string
  urlId: string
  sourceRunId: string
  jobId: string
  status: 'succeeded' | 'failed'
  candidatesFound: number
  candidatesNew: number
  candidatesUnchanged: number
  candidatesMateriallyChanged: number
  candidatesInvalid: number
  candidateObservationsInserted: number
  jsonValidationFailures: number
  failures: NewsRunnerFailure[]
}

export interface NewsResearchRunResult {
  researchCandidatesFetched: number
  researchProcessed: number
  researchSucceeded: number
  researchFailed: number
  researchResultsInserted: number
  jsonValidationFailures: number
  failures: NewsRunnerFailure[]
}

export interface NewsPipelineRunResult {
  recoveredStaleSourceRuns: number
  recoveredStaleResearchCandidates: number
  sourcesChecked: number
  sourceUrlsChecked: number
  scoutRuns: number
  scoutSucceeded: number
  scoutFailed: number
  candidatesFound: number
  candidatesNew: number
  candidatesUnchanged: number
  candidatesMateriallyChanged: number
  candidatesInvalid: number
  candidateObservationsInserted: number
  researchCandidatesFetched: number
  researchProcessed: number
  researchSucceeded: number
  researchFailed: number
  researchResultsInserted: number
  jsonValidationFailures: number
  failures: NewsRunnerFailure[]
}

type HermesRunner = {
  run(request: HermesWorkerRequest): Promise<HermesWorkerResult>
}

const DEFAULT_NEWS_RUNNER_OPTIONS: NewsRunnerOptions = {
  scoutTimeoutMs: 5 * 60_000,
  researchTimeoutMs: 10 * 60_000,
  batchSize: 1,
  maxResearchAttempts: 2,
  staleWorkCutoffMs: 30 * 60_000,
}

export async function recoverStaleNewsWork(
  store: NewsStore,
  options: Partial<Pick<NewsRunnerOptions, 'now' | 'staleWorkCutoffMs'>> = {}
): Promise<RecoverStaleNewsWorkResult> {
  const now = options.now ?? new Date()
  const cutoffMs = options.staleWorkCutoffMs ?? DEFAULT_NEWS_RUNNER_OPTIONS.staleWorkCutoffMs
  const cutoffIso = new Date(now.getTime() - cutoffMs).toISOString()
  return store.recoverStaleWork({
    sourceRunCutoffIso: cutoffIso,
    candidateCutoffIso: cutoffIso,
  })
}

export async function runNewsScoutForSourceUrl(input: {
  store: NewsStore
  hermes: HermesRunner
  source: NewsSourceConfig
  sourceUrl: NewsSourceUrlConfig
  options?: Partial<NewsRunnerOptions>
}): Promise<NewsScoutRunResult> {
  const options = newsRunnerOptions(input.options)
  const request = buildScoutRequest(input.source, input.sourceUrl, options.now)
  const sourceRun = await input.store.createSourceRun({
    jobId: request.job_id,
    source: input.source,
    sourceUrl: input.sourceUrl,
    status: 'queued',
    observedAt: request.requested_at,
  })

  await input.store.markSourceRun({
    id: sourceRun.id,
    status: 'running',
    startedAt: request.requested_at,
  })

  const baseResult: NewsScoutRunResult = {
    sourceId: input.source.sourceId,
    urlId: input.sourceUrl.urlId,
    sourceRunId: sourceRun.id,
    jobId: request.job_id,
    status: 'failed',
    candidatesFound: 0,
    candidatesNew: 0,
    candidatesUnchanged: 0,
    candidatesMateriallyChanged: 0,
    candidatesInvalid: 0,
    candidateObservationsInserted: 0,
    jsonValidationFailures: 0,
    failures: [],
  }

  try {
    const worker = await input.hermes.run({
      jobId: request.job_id,
      taskType: 'source_scout',
      prompt: buildScoutPrompt(request),
      timeoutMs: options.scoutTimeoutMs,
    })
    if (worker.status !== 'succeeded') {
      throw new Error(`Hermes scout ${worker.status}: ${worker.stderr.slice(0, 500)}`)
    }
    await input.store.markSourceRun({
      id: sourceRun.id,
      status: 'succeeded',
      rawResponse: worker.stdout,
    })

    const response = parseScoutResponse(worker.stdout, {
      jobId: request.job_id,
      sourceId: input.source.sourceId,
      urlId: input.sourceUrl.urlId,
    })
    await input.store.markSourceRun({
      id: sourceRun.id,
      status: 'result_validated',
      validatedPayload: response,
    })

    const classifications = await classifyCandidates(
      input.store,
      input.source.sourceId,
      input.sourceUrl.urlId,
      response.candidates
    )
    const insertInputs: NewsCandidateObservationInput[] = classifications
      .filter((item) => item.decision.fingerprint && (
        item.decision.outcome === 'new_candidate'
        || item.decision.outcome === 'known_materially_changed'
      ))
      .map((item) => ({
        sourceRunId: sourceRun.id,
        source: input.source,
        sourceUrl: input.sourceUrl,
        candidate: item.candidate,
        fingerprint: item.decision.fingerprint!,
        dedupeOutcome: item.decision.outcome,
        observedAt: item.candidate.observed_at ?? response.source_observed.observed_at,
      }))

    const candidatesNew = classifications.filter((item) => item.decision.outcome === 'new_candidate').length
    const candidatesUnchanged = classifications.filter((item) => item.decision.outcome === 'known_unchanged').length
    const candidatesMateriallyChanged = classifications.filter((item) => item.decision.outcome === 'known_materially_changed').length
    const candidatesInvalid = classifications.filter((item) => item.decision.outcome === 'ignored_invalid_candidate').length

    await input.store.markSourceRun({
      id: sourceRun.id,
      status: 'candidates_classified',
      counters: {
        candidatesFound: response.candidates.length,
        candidatesNew,
        candidatesUnchanged,
        candidatesMateriallyChanged,
        candidatesInvalid,
      },
    })

    const inserted = await input.store.insertCandidateObservations(insertInputs)
    await input.store.markSourceRun({
      id: sourceRun.id,
      status: 'candidates_ingested',
      finishedAt: new Date().toISOString(),
    })

    return {
      ...baseResult,
      status: 'succeeded',
      candidatesFound: response.candidates.length,
      candidatesNew,
      candidatesUnchanged,
      candidatesMateriallyChanged,
      candidatesInvalid,
      candidateObservationsInserted: inserted.length,
    }
  } catch (error) {
    const message = errorMessage(error)
    const isValidation = /response|schema|JSON|candidate|source_id|url_id|job_id/i.test(message)
    await input.store.markSourceRun({
      id: sourceRun.id,
      status: isValidation ? 'failed_permanent' : 'failed_transient',
      finishedAt: new Date().toISOString(),
      error: message,
    })
    return {
      ...baseResult,
      jsonValidationFailures: isValidation ? 1 : 0,
      failures: [{
        stage: 'scout',
        sourceId: input.source.sourceId,
        urlId: input.sourceUrl.urlId,
        error: message,
      }],
    }
  }
}

export async function runPendingNewsResearch(input: {
  store: NewsStore
  hermes: HermesRunner
  options?: Partial<NewsRunnerOptions>
}): Promise<NewsResearchRunResult> {
  const options = newsRunnerOptions(input.options)
  const candidates = await input.store.fetchPendingCandidateObservations(options.batchSize)
  const result: NewsResearchRunResult = {
    researchCandidatesFetched: candidates.length,
    researchProcessed: 0,
    researchSucceeded: 0,
    researchFailed: 0,
    researchResultsInserted: 0,
    jsonValidationFailures: 0,
    failures: [],
  }

  for (const candidate of candidates) {
    result.researchProcessed += 1
    const request = buildResearchRequest(candidate, options.now)
    await input.store.markCandidateResearchStarted(candidate.id, request.job_id)
    let worker: HermesWorkerResult | null = null
    try {
      worker = await input.hermes.run({
        jobId: request.job_id,
        taskType: 'source_aware_research',
        prompt: buildResearchPrompt(request),
        timeoutMs: options.researchTimeoutMs,
      })
      if (worker.status !== 'succeeded') {
        throw new Error(`Hermes research ${worker.status}: ${worker.stderr.slice(0, 500)}`)
      }
      const response = parseResearchResponse(worker.stdout, {
        jobId: request.job_id,
        candidateId: candidate.id,
        sourceId: candidate.sourceId,
        urlId: candidate.urlId,
      })
      await input.store.insertResearchResult({
        candidate,
        response,
        researchedAt: response.source_signal.observed_at || request.requested_at,
      })
      result.researchSucceeded += 1
      result.researchResultsInserted += 1
    } catch (error) {
      const message = errorMessage(error)
      const isValidation = /response|schema|JSON|candidate_id|source_id|url_id|job_id/i.test(message)
      await input.store.recordCandidateResearchFailure({
        id: candidate.id,
        jobId: request.job_id,
        workerStatus: worker?.status ?? null,
        error: message,
        rawResponse: worker?.stdout ?? null,
        stderr: worker?.stderr ?? null,
      })
      result.researchFailed += 1
      result.jsonValidationFailures += isValidation ? 1 : 0
      result.failures.push({
        stage: 'research',
        sourceId: candidate.sourceId,
        urlId: candidate.urlId,
        candidateId: candidate.id,
        error: message,
      })
    }
  }

  return result
}

export async function runNewsPipelineOnce(input: {
  store: NewsStore
  hermes: HermesRunner
  sources?: NewsSourceConfig[]
  options?: Partial<NewsRunnerOptions>
}): Promise<NewsPipelineRunResult> {
  const options = newsRunnerOptions(input.options)
  const recovered = await recoverStaleNewsWork(input.store, {
    now: options.now,
    staleWorkCutoffMs: options.staleWorkCutoffMs,
  })
  const activeSources = activeNewsSources(input.sources ?? newsSources())
  const summary = emptyPipelineResult()
  summary.recoveredStaleSourceRuns = recovered.sourceRunsRecovered
  summary.recoveredStaleResearchCandidates = recovered.candidatesRecovered
  summary.sourcesChecked = activeSources.length

  for (const source of activeSources) {
    for (const sourceUrl of activeNewsSourceUrls(source)) {
      summary.sourceUrlsChecked += 1
      summary.scoutRuns += 1
      const scout = await runNewsScoutForSourceUrl({
        store: input.store,
        hermes: input.hermes,
        source,
        sourceUrl,
        options,
      })
      summary.scoutSucceeded += scout.status === 'succeeded' ? 1 : 0
      summary.scoutFailed += scout.status === 'failed' ? 1 : 0
      summary.candidatesFound += scout.candidatesFound
      summary.candidatesNew += scout.candidatesNew
      summary.candidatesUnchanged += scout.candidatesUnchanged
      summary.candidatesMateriallyChanged += scout.candidatesMateriallyChanged
      summary.candidatesInvalid += scout.candidatesInvalid
      summary.candidateObservationsInserted += scout.candidateObservationsInserted
      summary.jsonValidationFailures += scout.jsonValidationFailures
      summary.failures.push(...scout.failures)
    }
  }

  const research = await runPendingNewsResearch({
    store: input.store,
    hermes: input.hermes,
    options,
  })
  summary.researchCandidatesFetched = research.researchCandidatesFetched
  summary.researchProcessed = research.researchProcessed
  summary.researchSucceeded = research.researchSucceeded
  summary.researchFailed = research.researchFailed
  summary.researchResultsInserted = research.researchResultsInserted
  summary.jsonValidationFailures += research.jsonValidationFailures
  summary.failures.push(...research.failures)

  return summary
}

function newsRunnerOptions(partial: Partial<NewsRunnerOptions> = {}): NewsRunnerOptions {
  return {
    ...DEFAULT_NEWS_RUNNER_OPTIONS,
    ...partial,
  }
}

async function classifyCandidates(
  store: NewsStore,
  sourceId: string,
  urlId: string,
  candidates: NewsScoutCandidate[]
): Promise<Array<{
  candidate: NewsScoutCandidate
  decision: ReturnType<typeof classifyNewsCandidate>
}>> {
  const canonicalUrls = candidates.flatMap((candidate) => {
    try {
      return [canonicalArticleUrl(candidate.article_url)]
    } catch {
      return []
    }
  })
  const prior = await store.fetchPriorObservations(sourceId, canonicalUrls)
  return candidates.map((candidate) => ({
    candidate,
    decision: classifyNewsCandidate(sourceId, urlId, candidate, prior),
  }))
}

function emptyPipelineResult(): NewsPipelineRunResult {
  return {
    recoveredStaleSourceRuns: 0,
    recoveredStaleResearchCandidates: 0,
    sourcesChecked: 0,
    sourceUrlsChecked: 0,
    scoutRuns: 0,
    scoutSucceeded: 0,
    scoutFailed: 0,
    candidatesFound: 0,
    candidatesNew: 0,
    candidatesUnchanged: 0,
    candidatesMateriallyChanged: 0,
    candidatesInvalid: 0,
    candidateObservationsInserted: 0,
    researchCandidatesFetched: 0,
    researchProcessed: 0,
    researchSucceeded: 0,
    researchFailed: 0,
    researchResultsInserted: 0,
    jsonValidationFailures: 0,
    failures: [],
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
