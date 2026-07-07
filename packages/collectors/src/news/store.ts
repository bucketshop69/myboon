import type {
  NewsCandidateFingerprint,
  NewsDedupeOutcome,
  NewsResearchResponse,
  NewsScoutCandidate,
  NewsScoutResponse,
  NewsSourceConfig,
  NewsSourceUrlConfig,
  PriorNewsObservation,
} from './types'

export type NewsSourceRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'result_validated'
  | 'candidates_classified'
  | 'candidates_ingested'
  | 'failed_transient'
  | 'retry_scheduled'
  | 'failed_permanent'

export type NewsCandidateObservationStatus =
  | 'pending_research'
  | 'research_queued'
  | 'researching'
  | 'researched'
  | 'handed_to_entity_memory'
  | 'rejected'
  | 'failed_research'

export type PersistedNewsDedupeOutcome = 'new_candidate' | 'known_materially_changed'
export type NewsResearchResultStatus =
  | 'pending_entity_memory'
  | 'not_ready_for_entity_memory'
  | 'handed_to_entity_memory'
  | 'failed_entity_memory'

export function initialNewsResearchResultStatus(
  responseStatus: NewsResearchResponse['status']
): NewsResearchResultStatus {
  return responseStatus === 'ready_for_entity_memory'
    ? 'pending_entity_memory'
    : 'not_ready_for_entity_memory'
}

export interface NewsSourceRunCounters {
  candidatesFound: number
  candidatesNew: number
  candidatesUnchanged: number
  candidatesMateriallyChanged: number
  candidatesInvalid: number
}

export interface CreateNewsSourceRunInput {
  jobId: string
  source: NewsSourceConfig
  sourceUrl: NewsSourceUrlConfig
  taskType?: 'source_scout'
  status?: NewsSourceRunStatus
  observedAt?: string | null
  startedAt?: string | null
}

export interface MarkNewsSourceRunInput {
  id: string
  status?: NewsSourceRunStatus
  observedAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  counters?: Partial<NewsSourceRunCounters>
  rawResponse?: unknown
  validatedPayload?: NewsScoutResponse | Record<string, unknown> | null
  error?: string | null
  attemptCount?: number
  nextRetryAt?: string | null
}

export interface NewsSourceRunRow {
  id: string
  jobId: string
  sourceId: string
  sourceName: string
  sourceType: 'curated_news'
  urlId: string
  urlLabel: string
  sourceUrl: string
  taskType: 'source_scout'
  status: NewsSourceRunStatus
  observedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  candidatesFound: number
  candidatesNew: number
  candidatesUnchanged: number
  candidatesMateriallyChanged: number
  candidatesInvalid: number
  rawResponse: unknown
  validatedPayload: unknown
  error: string | null
  attemptCount: number
  nextRetryAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NewsCandidateObservationInput {
  sourceRunId?: string | null
  source: NewsSourceConfig
  sourceUrl: NewsSourceUrlConfig
  candidate: NewsScoutCandidate
  fingerprint: NewsCandidateFingerprint
  dedupeOutcome: NewsDedupeOutcome
  observedAt: string
  status?: NewsCandidateObservationStatus
}

export interface NewsCandidateObservationRow {
  id: string
  sourceRunId: string | null
  sourceId: string
  sourceName: string
  urlId: string
  urlLabel: string
  sourceUrl: string
  canonicalArticleUrl: string
  headline: string
  visibleSummary: string | null
  publishedAt: string | null
  observedAt: string
  headlineHash: string
  summaryHash: string | null
  contentHash: string
  articleIdentityKey: string
  observationDedupeKey: string
  dedupeOutcome: PersistedNewsDedupeOutcome
  status: NewsCandidateObservationStatus
  lastResearchJobId: string | null
  researchWorkerStatus: string | null
  researchError: string | null
  researchRawResponse: string | null
  researchStderr: string | null
  rawCandidate: NewsScoutCandidate
  createdAt: string
  updatedAt: string
}

export interface RecordNewsResearchFailureInput {
  id: string
  jobId: string
  workerStatus?: string | null
  error: string
  rawResponse?: string | null
  stderr?: string | null
}

export interface RecoverStaleNewsWorkInput {
  sourceRunCutoffIso: string
  candidateCutoffIso: string
}

export interface RecoverStaleNewsWorkResult {
  sourceRunsRecovered: number
  candidatesRecovered: number
}

export interface NewsResearchResultInput {
  candidate: NewsCandidateObservationRow
  response: NewsResearchResponse
  researchedAt: string
  status?: NewsResearchResultStatus
}

export interface NewsResearchResultRow {
  id: string
  candidateObservationId: string
  sourceId: string
  sourceName: string
  urlId: string
  urlLabel: string
  sourceUrl: string
  canonicalArticleUrl: string
  articleIdentityKey: string
  observationDedupeKey: string
  researchJobId: string
  status: NewsResearchResultStatus
  responseStatus: NewsResearchResponse['status']
  sourceSignal: NewsResearchResponse['source_signal']
  researchSummary: NewsResearchResponse['research_summary']
  articleClaims: NewsResearchResponse['article_claims']
  verifiedFacts: NewsResearchResponse['verified_facts']
  unresolvedClaims: NewsResearchResponse['unresolved_claims']
  entityHints: NewsResearchResponse['entity_hints']
  evidence: NewsResearchResponse['evidence']
  openQuestions: NewsResearchResponse['open_questions']
  limitations: NewsResearchResponse['limitations']
  errors: NewsResearchResponse['errors']
  rawResponse: NewsResearchResponse
  researchedAt: string
  createdAt: string
  updatedAt: string
}

export interface PendingNewsResearchResult {
  result: NewsResearchResultRow
  candidate: NewsCandidateObservationRow
}

export interface NewsStore {
  createSourceRun(input: CreateNewsSourceRunInput): Promise<NewsSourceRunRow>
  markSourceRun(input: MarkNewsSourceRunInput): Promise<void>
  fetchPriorObservations(
    sourceId: string,
    canonicalArticleUrls: string[]
  ): Promise<PriorNewsObservation[]>
  insertCandidateObservations(
    inputs: NewsCandidateObservationInput[]
  ): Promise<NewsCandidateObservationRow[]>
  fetchCandidateObservation(id: string): Promise<NewsCandidateObservationRow | null>
  fetchPendingCandidateObservations(limit: number): Promise<NewsCandidateObservationRow[]>
  markCandidateObservationStatus(id: string, status: NewsCandidateObservationStatus): Promise<void>
  markCandidateResearchStarted(id: string, jobId: string): Promise<void>
  recordCandidateResearchFailure(input: RecordNewsResearchFailureInput): Promise<void>
  recoverStaleWork(input: RecoverStaleNewsWorkInput): Promise<RecoverStaleNewsWorkResult>
  insertResearchResult(input: NewsResearchResultInput): Promise<NewsResearchResultRow>
  fetchResearchResult(id: string): Promise<NewsResearchResultRow | null>
  fetchPendingResearchResults(limit: number): Promise<PendingNewsResearchResult[]>
  markResearchResultStatus(id: string, status: NewsResearchResultStatus): Promise<void>
}
