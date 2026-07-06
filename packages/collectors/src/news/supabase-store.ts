import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PriorNewsObservation } from './types'
import type {
  CreateNewsSourceRunInput,
  MarkNewsSourceRunInput,
  NewsCandidateObservationInput,
  NewsCandidateObservationRow,
  NewsCandidateObservationStatus,
  NewsResearchResultInput,
  NewsResearchResultRow,
  NewsResearchResultStatus,
  NewsSourceRunRow,
  NewsStore,
  PendingNewsResearchResult,
  PersistedNewsDedupeOutcome,
  RecordNewsResearchFailureInput,
  RecoverStaleNewsWorkInput,
  RecoverStaleNewsWorkResult,
} from './store'

const SOURCE_RUN_SELECT = [
  'id',
  'job_id',
  'source_id',
  'source_name',
  'source_type',
  'url_id',
  'url_label',
  'source_url',
  'task_type',
  'status',
  'observed_at',
  'started_at',
  'finished_at',
  'candidates_found',
  'candidates_new',
  'candidates_unchanged',
  'candidates_materially_changed',
  'candidates_invalid',
  'raw_response',
  'validated_payload',
  'error',
  'attempt_count',
  'next_retry_at',
  'created_at',
  'updated_at',
].join(', ')

const CANDIDATE_SELECT = [
  'id',
  'source_run_id',
  'source_id',
  'source_name',
  'url_id',
  'url_label',
  'source_url',
  'canonical_article_url',
  'headline',
  'visible_summary',
  'published_at',
  'observed_at',
  'headline_hash',
  'summary_hash',
  'content_hash',
  'article_identity_key',
  'observation_dedupe_key',
  'dedupe_outcome',
  'status',
  'last_research_job_id',
  'research_worker_status',
  'research_error',
  'research_raw_response',
  'research_stderr',
  'raw_candidate',
  'created_at',
  'updated_at',
].join(', ')

const RESEARCH_RESULT_SELECT = [
  'id',
  'candidate_observation_id',
  'source_id',
  'source_name',
  'url_id',
  'url_label',
  'source_url',
  'canonical_article_url',
  'article_identity_key',
  'observation_dedupe_key',
  'research_job_id',
  'status',
  'response_status',
  'source_signal',
  'research_summary',
  'article_claims',
  'verified_facts',
  'unresolved_claims',
  'entity_hints',
  'evidence',
  'open_questions',
  'limitations',
  'errors',
  'raw_response',
  'researched_at',
  'created_at',
  'updated_at',
].join(', ')

const RESEARCH_RESULT_PENDING_SELECT = RESEARCH_RESULT_SELECT
  .split(', ')
  .filter((column) => column !== 'raw_response')
  .join(', ')

const MAX_ERROR_LENGTH = 4000
const MAX_RAW_RESPONSE_LENGTH = 16000
const MAX_STDERR_LENGTH = 8000

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function jsonArray(value: unknown): unknown[] {
  const parsed = parseJsonIfString(value)
  return Array.isArray(parsed) ? parsed : []
}

function jsonObject(value: unknown): Record<string, unknown> {
  const parsed = parseJsonIfString(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

function boundedText(value: string | null | undefined, maxLength: number): string | null {
  if (value === undefined || value === null) return null
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`
}

function nowIso(): string {
  return new Date().toISOString()
}

function isPersistedOutcome(value: string): value is PersistedNewsDedupeOutcome {
  return value === 'new_candidate' || value === 'known_materially_changed'
}

function isUniqueViolation(error: { code?: string, message?: string } | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|unique/i.test(error.message ?? '')
}

function mapSourceRunRow(row: unknown): NewsSourceRunRow {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    jobId: String(record.job_id),
    sourceId: String(record.source_id),
    sourceName: String(record.source_name),
    sourceType: 'curated_news',
    urlId: String(record.url_id),
    urlLabel: String(record.url_label),
    sourceUrl: String(record.source_url),
    taskType: 'source_scout',
    status: String(record.status) as NewsSourceRunRow['status'],
    observedAt: stringOrNull(record.observed_at),
    startedAt: stringOrNull(record.started_at),
    finishedAt: stringOrNull(record.finished_at),
    candidatesFound: numberValue(record.candidates_found),
    candidatesNew: numberValue(record.candidates_new),
    candidatesUnchanged: numberValue(record.candidates_unchanged),
    candidatesMateriallyChanged: numberValue(record.candidates_materially_changed),
    candidatesInvalid: numberValue(record.candidates_invalid),
    rawResponse: record.raw_response ?? null,
    validatedPayload: record.validated_payload ?? null,
    error: stringOrNull(record.error),
    attemptCount: numberValue(record.attempt_count),
    nextRetryAt: stringOrNull(record.next_retry_at),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  }
}

function mapCandidateObservationRow(row: unknown): NewsCandidateObservationRow {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    sourceRunId: stringOrNull(record.source_run_id),
    sourceId: String(record.source_id),
    sourceName: String(record.source_name),
    urlId: String(record.url_id),
    urlLabel: String(record.url_label),
    sourceUrl: String(record.source_url),
    canonicalArticleUrl: String(record.canonical_article_url),
    headline: String(record.headline),
    visibleSummary: stringOrNull(record.visible_summary),
    publishedAt: stringOrNull(record.published_at),
    observedAt: String(record.observed_at),
    headlineHash: String(record.headline_hash),
    summaryHash: stringOrNull(record.summary_hash),
    contentHash: String(record.content_hash),
    articleIdentityKey: String(record.article_identity_key),
    observationDedupeKey: String(record.observation_dedupe_key),
    dedupeOutcome: String(record.dedupe_outcome) as PersistedNewsDedupeOutcome,
    status: String(record.status) as NewsCandidateObservationRow['status'],
    lastResearchJobId: stringOrNull(record.last_research_job_id),
    researchWorkerStatus: stringOrNull(record.research_worker_status),
    researchError: stringOrNull(record.research_error),
    researchRawResponse: stringOrNull(record.research_raw_response),
    researchStderr: stringOrNull(record.research_stderr),
    rawCandidate: jsonObject(record.raw_candidate) as unknown as NewsCandidateObservationRow['rawCandidate'],
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  }
}

function mapResearchResultRow(row: unknown): NewsResearchResultRow {
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    candidateObservationId: String(record.candidate_observation_id),
    sourceId: String(record.source_id),
    sourceName: String(record.source_name),
    urlId: String(record.url_id),
    urlLabel: String(record.url_label),
    sourceUrl: String(record.source_url),
    canonicalArticleUrl: String(record.canonical_article_url),
    articleIdentityKey: String(record.article_identity_key),
    observationDedupeKey: String(record.observation_dedupe_key),
    researchJobId: String(record.research_job_id),
    status: String(record.status) as NewsResearchResultRow['status'],
    responseStatus: String(record.response_status) as NewsResearchResultRow['responseStatus'],
    sourceSignal: jsonObject(record.source_signal) as NewsResearchResultRow['sourceSignal'],
    researchSummary: jsonObject(record.research_summary) as NewsResearchResultRow['researchSummary'],
    articleClaims: jsonArray(record.article_claims) as NewsResearchResultRow['articleClaims'],
    verifiedFacts: jsonArray(record.verified_facts) as NewsResearchResultRow['verifiedFacts'],
    unresolvedClaims: jsonArray(record.unresolved_claims) as NewsResearchResultRow['unresolvedClaims'],
    entityHints: jsonArray(record.entity_hints) as NewsResearchResultRow['entityHints'],
    evidence: jsonArray(record.evidence) as NewsResearchResultRow['evidence'],
    openQuestions: jsonArray(record.open_questions) as NewsResearchResultRow['openQuestions'],
    limitations: jsonArray(record.limitations) as NewsResearchResultRow['limitations'],
    errors: jsonArray(record.errors) as NewsResearchResultRow['errors'],
    rawResponse: jsonObject(record.raw_response) as unknown as NewsResearchResultRow['rawResponse'],
    researchedAt: String(record.researched_at),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  }
}

export class SupabaseNewsStore implements NewsStore {
  constructor(private readonly db: SupabaseClient) {}

  async createSourceRun(input: CreateNewsSourceRunInput): Promise<NewsSourceRunRow> {
    const id = randomUUID()
    const { data, error } = await this.db
      .from('news_source_runs')
      .insert({
        id,
        job_id: input.jobId,
        source_id: input.source.sourceId,
        source_name: input.source.sourceName,
        source_type: input.source.sourceType,
        url_id: input.sourceUrl.urlId,
        url_label: input.sourceUrl.label,
        source_url: input.sourceUrl.url,
        task_type: input.taskType ?? 'source_scout',
        status: input.status ?? 'queued',
        observed_at: input.observedAt ?? null,
        started_at: input.startedAt ?? null,
      })
      .select(SOURCE_RUN_SELECT)
      .single()

    if (error) throw new Error(`news_source_runs create failed: ${error.message}`)
    return mapSourceRunRow(data)
  }

  async markSourceRun(input: MarkNewsSourceRunInput): Promise<void> {
    const payload: Record<string, unknown> = {
      updated_at: nowIso(),
    }
    if (input.status !== undefined) payload.status = input.status
    if (input.observedAt !== undefined) payload.observed_at = input.observedAt
    if (input.startedAt !== undefined) payload.started_at = input.startedAt
    if (input.finishedAt !== undefined) payload.finished_at = input.finishedAt
    if (input.counters?.candidatesFound !== undefined) payload.candidates_found = input.counters.candidatesFound
    if (input.counters?.candidatesNew !== undefined) payload.candidates_new = input.counters.candidatesNew
    if (input.counters?.candidatesUnchanged !== undefined) payload.candidates_unchanged = input.counters.candidatesUnchanged
    if (input.counters?.candidatesMateriallyChanged !== undefined) {
      payload.candidates_materially_changed = input.counters.candidatesMateriallyChanged
    }
    if (input.counters?.candidatesInvalid !== undefined) payload.candidates_invalid = input.counters.candidatesInvalid
    if (input.rawResponse !== undefined) payload.raw_response = input.rawResponse
    if (input.validatedPayload !== undefined) payload.validated_payload = input.validatedPayload
    if (input.error !== undefined) payload.error = boundedText(input.error, MAX_ERROR_LENGTH)
    if (input.attemptCount !== undefined) payload.attempt_count = input.attemptCount
    if (input.nextRetryAt !== undefined) payload.next_retry_at = input.nextRetryAt

    const { data, error } = await this.db
      .from('news_source_runs')
      .update(payload)
      .eq('id', input.id)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(`news_source_runs mark failed: ${error.message}`)
    if (!data) throw new Error(`news_source_runs mark failed: source run ${input.id} not found`)
  }

  async fetchPriorObservations(
    sourceId: string,
    canonicalArticleUrls: string[]
  ): Promise<PriorNewsObservation[]> {
    const urls = [...new Set(canonicalArticleUrls.filter(Boolean))]
    if (urls.length === 0) return []

    const { data, error } = await this.db
      .from('news_candidate_observations')
      .select('source_id, url_id, canonical_article_url, headline_hash, summary_hash, article_identity_key, observation_dedupe_key, observed_at')
      .eq('source_id', sourceId)
      .in('canonical_article_url', urls)
      .order('observed_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw new Error(`news_candidate_observations prior lookup failed: ${error.message}`)
    return (data ?? []).map((row: unknown) => {
      const record = row as Record<string, unknown>
      return {
        sourceId: String(record.source_id),
        urlId: String(record.url_id),
        canonicalArticleUrl: String(record.canonical_article_url),
        headlineHash: String(record.headline_hash),
        summaryHash: stringOrNull(record.summary_hash),
        articleIdentityKey: String(record.article_identity_key),
        observationDedupeKey: String(record.observation_dedupe_key),
        observedAt: String(record.observed_at),
      }
    })
  }

  async insertCandidateObservations(
    inputs: NewsCandidateObservationInput[]
  ): Promise<NewsCandidateObservationRow[]> {
    const persistedInputs = inputs.filter((input) => isPersistedOutcome(input.dedupeOutcome))
    if (persistedInputs.length === 0) return []

    const payloads = persistedInputs.map((input) => ({
      id: randomUUID(),
      source_run_id: input.sourceRunId ?? null,
      source_id: input.source.sourceId,
      source_name: input.source.sourceName,
      url_id: input.sourceUrl.urlId,
      url_label: input.sourceUrl.label,
      source_url: input.sourceUrl.url,
      canonical_article_url: input.fingerprint.canonicalArticleUrl,
      headline: input.candidate.headline,
      visible_summary: input.candidate.summary ?? null,
      published_at: input.candidate.published_at ?? null,
      observed_at: input.observedAt,
      headline_hash: input.fingerprint.headlineHash,
      summary_hash: input.fingerprint.summaryHash,
      content_hash: input.fingerprint.contentHash,
      article_identity_key: input.fingerprint.articleIdentityKey,
      observation_dedupe_key: input.fingerprint.observationDedupeKey,
      dedupe_outcome: input.dedupeOutcome,
      status: input.status ?? 'pending_research',
      raw_candidate: input.candidate,
    }))

    const { error } = await this.db
      .from('news_candidate_observations')
      .upsert(payloads, {
        onConflict: 'observation_dedupe_key',
        ignoreDuplicates: true,
      })

    if (error) throw new Error(`news_candidate_observations insert failed: ${error.message}`)
    return this.candidateRowsByDedupeKeys(persistedInputs.map((input) => input.fingerprint.observationDedupeKey))
  }

  async fetchCandidateObservation(id: string): Promise<NewsCandidateObservationRow | null> {
    return this.candidateRowById(id)
  }

  async fetchPendingCandidateObservations(limit: number): Promise<NewsCandidateObservationRow[]> {
    const { data, error } = await this.db
      .from('news_candidate_observations')
      .select(CANDIDATE_SELECT)
      .eq('status', 'pending_research')
      .order('observed_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(Math.max(0, limit))

    if (error) throw new Error(`news_candidate_observations pending fetch failed: ${error.message}`)
    return (data ?? []).map(mapCandidateObservationRow)
  }

  async markCandidateObservationStatus(id: string, status: NewsCandidateObservationStatus): Promise<void> {
    const { error } = await this.db
      .from('news_candidate_observations')
      .update({
        status,
        updated_at: nowIso(),
      })
      .eq('id', id)

    if (error) throw new Error(`news_candidate_observations status update failed: ${error.message}`)
  }

  async markCandidateResearchStarted(id: string, jobId: string): Promise<void> {
    const { error } = await this.db
      .from('news_candidate_observations')
      .update({
        status: 'researching',
        last_research_job_id: jobId,
        research_worker_status: null,
        research_error: null,
        research_raw_response: null,
        research_stderr: null,
        updated_at: nowIso(),
      })
      .eq('id', id)

    if (error) throw new Error(`news_candidate_observations research start failed: ${error.message}`)
  }

  async recordCandidateResearchFailure(input: RecordNewsResearchFailureInput): Promise<void> {
    const { error } = await this.db
      .from('news_candidate_observations')
      .update({
        status: 'failed_research',
        last_research_job_id: input.jobId,
        research_worker_status: input.workerStatus ?? null,
        research_error: boundedText(input.error, MAX_ERROR_LENGTH),
        research_raw_response: boundedText(input.rawResponse, MAX_RAW_RESPONSE_LENGTH),
        research_stderr: boundedText(input.stderr, MAX_STDERR_LENGTH),
        updated_at: nowIso(),
      })
      .eq('id', input.id)

    if (error) throw new Error(`news_candidate_observations research failure record failed: ${error.message}`)
  }

  async recoverStaleWork(input: RecoverStaleNewsWorkInput): Promise<RecoverStaleNewsWorkResult> {
    const [sourceRunsRecovered, candidatesRecovered] = await Promise.all([
      this.recoverStaleSourceRuns(input.sourceRunCutoffIso),
      this.recoverStaleCandidates(input.candidateCutoffIso),
    ])
    return { sourceRunsRecovered, candidatesRecovered }
  }

  async insertResearchResult(input: NewsResearchResultInput): Promise<NewsResearchResultRow> {
    const payload = {
      id: randomUUID(),
      candidate_observation_id: input.candidate.id,
      source_id: input.candidate.sourceId,
      source_name: input.candidate.sourceName,
      url_id: input.candidate.urlId,
      url_label: input.candidate.urlLabel,
      source_url: input.candidate.sourceUrl,
      canonical_article_url: input.candidate.canonicalArticleUrl,
      article_identity_key: input.candidate.articleIdentityKey,
      observation_dedupe_key: input.candidate.observationDedupeKey,
      research_job_id: input.response.job_id,
      status: input.status ?? 'pending_entity_memory',
      response_status: input.response.status,
      source_signal: input.response.source_signal,
      research_summary: input.response.research_summary,
      article_claims: input.response.article_claims,
      verified_facts: input.response.verified_facts,
      unresolved_claims: input.response.unresolved_claims,
      entity_hints: input.response.entity_hints,
      evidence: input.response.evidence,
      open_questions: input.response.open_questions,
      limitations: input.response.limitations,
      errors: input.response.errors,
      raw_response: input.response,
      researched_at: input.researchedAt,
    }

    let row: NewsResearchResultRow | null = null
    const { data, error } = await this.db
      .from('news_research_results')
      .insert(payload)
      .select(RESEARCH_RESULT_SELECT)
      .single()

    if (error) {
      if (!isUniqueViolation(error)) {
        throw new Error(`news_research_results insert failed: ${error.message}`)
      }
      row = await this.researchResultByCandidateOrJob(input.candidate.id, input.response.job_id)
    } else {
      row = mapResearchResultRow(data)
    }

    if (!row) throw new Error('news_research_results insert failed: research result lookup failed after insert')

    await this.markCandidateObservationStatus(input.candidate.id, 'researched')
    return row
  }

  async fetchResearchResult(id: string): Promise<NewsResearchResultRow | null> {
    return this.researchResultById(id)
  }

  async fetchPendingResearchResults(limit: number): Promise<PendingNewsResearchResult[]> {
    const { data, error } = await this.db
      .from('news_research_results')
      .select(RESEARCH_RESULT_PENDING_SELECT)
      .eq('status', 'pending_entity_memory')
      .order('researched_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(Math.max(0, limit))

    if (error) throw new Error(`news_research_results pending fetch failed: ${error.message}`)
    const results = (data ?? []).map(mapResearchResultRow)
    const candidates = await this.candidateRowsByIds([...new Set(results.map((row) => row.candidateObservationId))])

    return results.flatMap((result) => {
      const candidate = candidates.get(result.candidateObservationId)
      return candidate ? [{ result, candidate }] : []
    })
  }

  async markResearchResultStatus(id: string, status: NewsResearchResultStatus): Promise<void> {
    const { error } = await this.db
      .from('news_research_results')
      .update({
        status,
        updated_at: nowIso(),
      })
      .eq('id', id)

    if (error) throw new Error(`news_research_results status update failed: ${error.message}`)
  }

  private async candidateRowsByDedupeKeys(keys: string[]): Promise<NewsCandidateObservationRow[]> {
    const uniqueKeys = [...new Set(keys)]
    if (uniqueKeys.length === 0) return []
    const { data, error } = await this.db
      .from('news_candidate_observations')
      .select(CANDIDATE_SELECT)
      .in('observation_dedupe_key', uniqueKeys)
      .order('observed_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw new Error(`news_candidate_observations insert lookup failed: ${error.message}`)
    return (data ?? []).map(mapCandidateObservationRow)
  }

  private async candidateRowsByIds(ids: string[]): Promise<Map<string, NewsCandidateObservationRow>> {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) return new Map()
    const { data, error } = await this.db
      .from('news_candidate_observations')
      .select(CANDIDATE_SELECT)
      .in('id', uniqueIds)

    if (error) throw new Error(`news_candidate_observations candidate context fetch failed: ${error.message}`)
    const byId = new Map<string, NewsCandidateObservationRow>()
    for (const row of data ?? []) {
      const candidate = mapCandidateObservationRow(row)
      byId.set(candidate.id, candidate)
    }
    return byId
  }

  private async candidateRowById(id: string): Promise<NewsCandidateObservationRow | null> {
    const { data, error } = await this.db
      .from('news_candidate_observations')
      .select(CANDIDATE_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(`news_candidate_observations fetch failed: ${error.message}`)
    return data ? mapCandidateObservationRow(data) : null
  }

  private async researchResultById(id: string): Promise<NewsResearchResultRow | null> {
    const { data, error } = await this.db
      .from('news_research_results')
      .select(RESEARCH_RESULT_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(`news_research_results fetch failed: ${error.message}`)
    return data ? mapResearchResultRow(data) : null
  }

  private async researchResultByCandidateOrJob(
    candidateObservationId: string,
    researchJobId: string
  ): Promise<NewsResearchResultRow | null> {
    const byCandidate = await this.researchResultByCandidateObservation(candidateObservationId)
    if (byCandidate) return byCandidate
    return this.researchResultByResearchJob(researchJobId)
  }

  private async researchResultByCandidateObservation(candidateObservationId: string): Promise<NewsResearchResultRow | null> {
    const { data, error } = await this.db
      .from('news_research_results')
      .select(RESEARCH_RESULT_SELECT)
      .eq('candidate_observation_id', candidateObservationId)
      .maybeSingle()

    if (error) throw new Error(`news_research_results candidate lookup failed: ${error.message}`)
    return data ? mapResearchResultRow(data) : null
  }

  private async researchResultByResearchJob(researchJobId: string): Promise<NewsResearchResultRow | null> {
    const { data, error } = await this.db
      .from('news_research_results')
      .select(RESEARCH_RESULT_SELECT)
      .eq('research_job_id', researchJobId)
      .maybeSingle()

    if (error) throw new Error(`news_research_results job lookup failed: ${error.message}`)
    return data ? mapResearchResultRow(data) : null
  }

  private async recoverStaleSourceRuns(cutoffIso: string): Promise<number> {
    const { data, error } = await this.db
      .from('news_source_runs')
      .select('id, error, finished_at')
      .eq('status', 'running')
      .lt('updated_at', cutoffIso)

    if (error) throw new Error(`news stale source run recovery lookup failed: ${error.message}`)
    const staleRows = data ?? []
    await Promise.all(staleRows.map(async (row: unknown) => {
      const record = row as Record<string, unknown>
      const { error: updateError } = await this.db
        .from('news_source_runs')
        .update({
          status: 'failed_transient',
          finished_at: stringOrNull(record.finished_at) ?? nowIso(),
          error: stringOrNull(record.error) ?? 'Recovered stale running source run after worker restart.',
          updated_at: nowIso(),
        })
        .eq('id', String(record.id))
      if (updateError) throw new Error(`news stale source run recovery update failed: ${updateError.message}`)
    }))
    return staleRows.length
  }

  private async recoverStaleCandidates(cutoffIso: string): Promise<number> {
    const { data, error } = await this.db
      .from('news_candidate_observations')
      .select('id, research_error')
      .eq('status', 'researching')
      .lt('updated_at', cutoffIso)

    if (error) throw new Error(`news stale candidate recovery lookup failed: ${error.message}`)
    const staleRows = data ?? []
    await Promise.all(staleRows.map(async (row: unknown) => {
      const record = row as Record<string, unknown>
      const { error: updateError } = await this.db
        .from('news_candidate_observations')
        .update({
          status: 'pending_research',
          research_error: stringOrNull(record.research_error) ?? 'Recovered stale researching candidate after worker restart.',
          updated_at: nowIso(),
        })
        .eq('id', String(record.id))
      if (updateError) throw new Error(`news stale candidate recovery update failed: ${updateError.message}`)
    }))
    return staleRows.length
  }
}

export const __newsSupabaseTesting = {
  CANDIDATE_SELECT,
  RESEARCH_RESULT_SELECT,
  SOURCE_RUN_SELECT,
}
