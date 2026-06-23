import type { SupabaseClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fetchPolymarketNativeContext, type PolymarketNativeContext } from './market-context'

const execFileAsync = promisify(execFile)

const SOURCE = 'polymarket'
const AREA = 'markets'
const ONE_HOUR_MS = 60 * 60 * 1000
const DEFAULT_BATCH_SIZE = 20
const DEFAULT_SLUG_COOLDOWN_MINUTES = 60
const DEFAULT_RETRY_WINDOW_MINUTES = 4 * 60
const DEFAULT_MAX_RETRY_COUNT = 2
const DEFAULT_STRUCTURE_ONLY_SCORE_MAX = 55
const DEFAULT_THIN_VOLUME_24H_MAX = 1_000
const DEFAULT_THIN_LIQUIDITY_MAX = 1_000
const DEFAULT_HERMES_COMMAND = 'hermes'
const DEFAULT_RESEARCH_MODEL = 'hermes_cli'
const DEFAULT_HERMES_TIMEOUT_MS = 60_000
const DEFAULT_LAST30DAYS_PYTHON = 'python3.12'
const DEFAULT_LAST30DAYS_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_LAST30DAYS_WEB_BACKEND = 'auto'
const DEFAULT_MAX_RESEARCH_ROUNDS = 2
const DEFAULT_MAX_CANDIDATE_AGE_HOURS = 48
const VPS_LAST30DAYS_SCRIPT = '/root/.agents/skills/last30days/scripts/last30days.py'

export interface PolymarketResearcherOptions {
  now?: string
  batchSize?: number
  slugCooldownMinutes?: number
  retryWindowMinutes?: number
  maxRetryCount?: number
  structureOnlyScoreMax?: number
  thinVolume24hMax?: number
  thinLiquidityMax?: number
  backend?: ResearchBackend
  researchModel?: string
  hermesCommand?: string
  researchPlannerHermesToolsets?: string
  researchPlannerHermesIgnoreRules?: boolean
  researchPlannerHermesTimeoutMs?: number
  last30DaysPython?: string
  last30DaysScript?: string
  last30DaysTimeoutMs?: number
  last30DaysWebBackend?: string
  maxResearchRounds?: number
  maxCandidateAgeHours?: number
}

type ResearchBackend = 'hermes_cli'
type ResearchDepth = 'market_structure_only' | 'reuse_prior' | 'deep_web'
type EvidenceQuality = 'strong' | 'medium' | 'weak'
type RecommendedEditorAction = 'publish_candidate' | 'reject_thin' | 'needs_more_research'

type CandidateStatus =
  | 'pending_research'
  | 'researching'
  | 'researched'
  | 'skipped_recently_researched'
  | 'research_failed'
  | 'rejected'
  | 'published'

interface PendingCandidate {
  id: string
  source: string
  area: string
  candidate_type: string
  market_id: string
  slug: string
  title: string
  tag_slug: string
  tag_label: string | null
  observed_at: string
  what_changed: string
  why_flagged: string
  score: number | string
  score_breakdown: unknown
  metrics: unknown
  evidence_refs: unknown
  status: CandidateStatus
  research_retry_count: number | string | null
  research_next_retry_at: string | null
  research_last_error_kind: string | null
}

interface PriorResearch {
  id: string
  candidate_id: string
  slug: string
  research_mode: string
  summary: string
  notes: string
  key_findings: unknown
  evidence_links: unknown
  related_context: unknown
  uncertainty: string
  editor_notes: string
  researched_at: string
  research_family_key: string | null
  research_cluster_key: string | null
  research_depth: ResearchDepth | null
  evidence_quality: EvidenceQuality | null
  catalyst_found: boolean | null
  recommended_editor_action: RecommendedEditorAction | null
  research_backend: string | null
  research_model: string | null
}

interface HermesResearchResult {
  candidate_id: string
  research_mode: string
  market_about?: unknown
  resolution_rules?: unknown
  polymarket_context?: unknown
  external_research?: unknown
  verified_facts?: unknown
  unverified_claims?: unknown
  entities_mentioned?: unknown
  claims_found?: unknown
  relationships_found?: unknown
  open_questions?: unknown
  research_completeness?: unknown
  summary: string
  notes: string
  key_findings: unknown[]
  evidence_links: unknown[]
  related_context: unknown[]
  uncertainty: string
  editor_notes: string
  evidence_quality?: unknown
  catalyst_found?: unknown
  recommended_editor_action?: unknown
}

interface ResearchFailure {
  candidate: PendingCandidate
  error: string
}

interface ResearchAttempt {
  results: Map<string, HermesResearchResult>
  failures: ResearchFailure[]
}

interface Last30DaysSubquery {
  label: string
  search_query: string
  ranking_query: string
  sources: string[]
  weight: number
}

interface Last30DaysPlan {
  intent: string
  freshness_mode: string
  cluster_mode: string
  subqueries: Last30DaysSubquery[]
}

interface ResearchReflectionPlan {
  research_goal: string
  known_from_polymarket: string[]
  do_not_research: string[]
  last30days_topic: string
  lookback_days: number
  search_sources: string[]
  subreddits: string[]
  polymarket_keywords: string[]
  last30days_plan: Last30DaysPlan
  evidence_to_collect: string[]
  expected_entities: string[]
  notes: string
}

interface ResearchBrief {
  research_goal: string
  last30days_topic: string
  lookback_days: number
  search_sources: string[]
  subreddits: string[]
  polymarket_keywords: string[]
  last30days_plan: Last30DaysPlan
  evidence_to_collect: string[]
  expected_entities: string[]
  notes: string
}

interface PlannerResult {
  plan: ResearchReflectionPlan
  raw: string
  error: string | null
}

interface EvidenceLink {
  title: string
  url: string
  note: string
  source?: string
}

interface RejectedEvidence {
  title: string
  url?: string
  source?: string
  reason: string
}

interface FollowUpResearch {
  topic: string
  evidence_to_collect: string[]
  search_sources: string[]
  subreddits: string[]
  polymarket_keywords: string[]
  subqueries: Last30DaysSubquery[]
  notes: string
}

interface EvidenceReview {
  verdict: 'accept' | 'retry' | 'reject'
  evidence_quality: EvidenceQuality
  catalyst_found: boolean
  research_completeness: 'complete' | 'partial' | 'blocked'
  final_summary: string
  key_findings: string[]
  usable_evidence: EvidenceLink[]
  rejected_evidence: RejectedEvidence[]
  missing_evidence: string[]
  follow_up_research: FollowUpResearch | null
  notes: string
  raw: string
  error: string | null
}

interface ResearchRound {
  round: number
  brief: ResearchBrief
  report: Record<string, unknown>
  stderr: string
  args: string[]
  review: EvidenceReview
}

interface TriageDecision {
  candidate: PendingCandidate
  depth: ResearchDepth
  familyKey: string
  clusterKey: string
  prior?: PriorResearch
  reason: string
}

interface EnrichedTriageDecision extends TriageDecision {
  polymarketNativeContext?: PolymarketNativeContext
  polymarketNativeContextError?: string
}

interface ResearchRowInput {
  candidate_id: string
  source: string
  area: string
  slug: string
  title: string
  candidate_type: string
  research_mode: string
  summary: string
  notes: string
  key_findings: unknown[]
  evidence_links: unknown[]
  related_context: unknown[]
  uncertainty: string
  editor_notes: string
  status: 'pending_editor'
  researched_at: string
  updated_at: string
  research_family_key: string
  research_cluster_key: string
  research_depth: ResearchDepth
  evidence_quality: EvidenceQuality
  catalyst_found: boolean
  recommended_editor_action: RecommendedEditorAction
  duplicate_of_research_id: string | null
  research_backend: string
  research_model: string | null
}

export interface PolymarketResearcherResult {
  observedAt: string
  backend: string
  pendingFetched: number
  eligibleForResearch: number
  skippedRecentlyResearched: number
  retriedFailedCandidates: number
  reusedPriorResearch: number
  marketStructureOnly: number
  deepWebResearched: number
  researchRowsWritten: number
  candidatesMarkedResearched: number
  candidatesMarkedFailed: number
  researched: Array<{
    candidateId: string
    slug: string
    researchMode: string
    summary: string
  }>
  skipped: Array<{
    candidateId: string
    slug: string
    reason: string
  }>
  failed: Array<{
    candidateId: string
    slug: string
    error: string
  }>
}

function selectedBackend(partial?: ResearchBackend): ResearchBackend {
  const backend = partial ?? 'hermes_cli'
  if (backend !== 'hermes_cli') throw new Error(`Unsupported Polymarket researcher backend: ${backend}`)
  return backend
}

export function defaultLast30DaysScriptPath(home = process.env.HOME ?? ''): string {
  return home === '/root'
    ? VPS_LAST30DAYS_SCRIPT
    : `${home}/.codex/skills/last30days/scripts/last30days.py`
}

function selectedOptions(partial: PolymarketResearcherOptions): Required<PolymarketResearcherOptions> {
  return {
    now: partial.now ?? new Date().toISOString(),
    batchSize: partial.batchSize ?? DEFAULT_BATCH_SIZE,
    slugCooldownMinutes: partial.slugCooldownMinutes ?? DEFAULT_SLUG_COOLDOWN_MINUTES,
    retryWindowMinutes: partial.retryWindowMinutes ?? DEFAULT_RETRY_WINDOW_MINUTES,
    maxRetryCount: partial.maxRetryCount ?? DEFAULT_MAX_RETRY_COUNT,
    structureOnlyScoreMax: partial.structureOnlyScoreMax ?? DEFAULT_STRUCTURE_ONLY_SCORE_MAX,
    thinVolume24hMax: partial.thinVolume24hMax ?? DEFAULT_THIN_VOLUME_24H_MAX,
    thinLiquidityMax: partial.thinLiquidityMax ?? DEFAULT_THIN_LIQUIDITY_MAX,
    backend: selectedBackend(partial.backend),
    researchModel: partial.researchModel ?? DEFAULT_RESEARCH_MODEL,
    hermesCommand: partial.hermesCommand ?? DEFAULT_HERMES_COMMAND,
    researchPlannerHermesToolsets: partial.researchPlannerHermesToolsets ?? '',
    researchPlannerHermesIgnoreRules: partial.researchPlannerHermesIgnoreRules ?? true,
    researchPlannerHermesTimeoutMs: partial.researchPlannerHermesTimeoutMs ?? DEFAULT_HERMES_TIMEOUT_MS,
    last30DaysPython: partial.last30DaysPython ?? DEFAULT_LAST30DAYS_PYTHON,
    last30DaysScript: partial.last30DaysScript ?? defaultLast30DaysScriptPath(),
    last30DaysTimeoutMs: partial.last30DaysTimeoutMs ?? DEFAULT_LAST30DAYS_TIMEOUT_MS,
    last30DaysWebBackend: partial.last30DaysWebBackend ?? DEFAULT_LAST30DAYS_WEB_BACKEND,
    maxResearchRounds: partial.maxResearchRounds ?? DEFAULT_MAX_RESEARCH_ROUNDS,
    maxCandidateAgeHours: partial.maxCandidateAgeHours ?? DEFAULT_MAX_CANDIDATE_AGE_HOURS,
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalizeStringOption<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback
}

function normalizeEvidenceQuality(value: unknown): EvidenceQuality {
  return normalizeStringOption(value, ['strong', 'medium', 'weak'] as const, 'medium')
}

function normalizeRecommendedEditorAction(value: unknown): RecommendedEditorAction {
  return normalizeStringOption(value, ['publish_candidate', 'reject_thin', 'needs_more_research'] as const, 'needs_more_research')
}

function compatibilityEvidenceQuality(value: unknown): EvidenceQuality {
  const normalized = asString(value).toLowerCase().trim()
  if (normalized === 'complete') return 'strong'
  if (normalized === 'blocked') return 'weak'
  if (normalized === 'partial') return 'medium'
  return normalizeEvidenceQuality(value)
}

function researchPacketForResult(result: HermesResearchResult): Record<string, unknown> {
  return {
    kind: 'research_packet',
    market_about: result.market_about ?? null,
    resolution_rules: result.resolution_rules ?? null,
    polymarket_context: result.polymarket_context ?? null,
    external_research: result.external_research ?? null,
    verified_facts: asArray(result.verified_facts),
    unverified_claims: asArray(result.unverified_claims),
    entities_mentioned: asArray(result.entities_mentioned),
    claims_found: asArray(result.claims_found),
    relationships_found: asArray(result.relationships_found),
    open_questions: asArray(result.open_questions),
    research_completeness: asString(result.research_completeness, 'partial'),
  }
}

function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Continue into fragment extraction.
  }

  const start = cleaned.search(/[{[]/)
  if (start === -1) return null
  const opener = cleaned[start]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let index = start; index < cleaned.length; index += 1) {
    const ch = cleaned[index]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === opener) depth += 1
    else if (ch === closer) depth -= 1
    if (depth === 0) {
      try {
        return JSON.parse(cleaned.slice(start, index + 1)) as T
      } catch {
        return null
      }
    }
  }
  return null
}

function titleFamilyKey(text: string): string {
  const stopWords = new Set(['will', 'the', 'and', 'for', 'with', 'before', 'after', 'this', 'that', 'what', 'when', 'who', 'how', 'many'])
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 8)
    .join('-')
}

function candidateFamilyKeys(candidate: Pick<PendingCandidate, 'slug' | 'title'>): string[] {
  const keys = new Set<string>([`slug:${candidate.slug}`])
  const titleKey = titleFamilyKey(candidate.title ?? candidate.slug)
  if (titleKey) keys.add(`title:${titleKey}`)
  return [...keys]
}

function primaryFamilyKey(candidate: Pick<PendingCandidate, 'slug' | 'title'>): string {
  const keys = candidateFamilyKeys(candidate)
  return keys.find((key) => key.startsWith('title:')) ?? keys[0] ?? `slug:${candidate.slug}`
}

function clusterKeyForCandidate(candidate: PendingCandidate): string {
  return `${SOURCE}:${AREA}:${primaryFamilyKey(candidate)}`
}

const CANDIDATE_SELECT = [
  'id',
  'source',
  'area',
  'candidate_type',
  'market_id',
  'slug',
  'title',
  'tag_slug',
  'tag_label',
  'observed_at',
  'what_changed',
  'why_flagged',
  'score',
  'score_breakdown',
  'metrics',
  'evidence_refs',
  'status',
  'research_retry_count',
  'research_next_retry_at',
  'research_last_error_kind',
].join(', ')

function candidateObservedAfter(options: Required<PolymarketResearcherOptions>): string | null {
  if (!Number.isFinite(options.maxCandidateAgeHours) || options.maxCandidateAgeHours <= 0) return null
  return new Date(new Date(options.now).getTime() - options.maxCandidateAgeHours * 60 * 60 * 1000).toISOString()
}

async function fetchResearchCandidates(
  db: SupabaseClient,
  options: Required<PolymarketResearcherOptions>
): Promise<PendingCandidate[]> {
  const observedAfter = candidateObservedAfter(options)
  let pendingQuery = db
    .from('polymarket_market_candidates')
    .select(CANDIDATE_SELECT)
    .eq('source', SOURCE)
    .eq('area', AREA)
    .eq('status', 'pending_research')
    .order('score', { ascending: false })
    .order('observed_at', { ascending: true })
    .limit(options.batchSize)
  if (observedAfter) pendingQuery = pendingQuery.gte('observed_at', observedAfter)

  const { data: pendingData, error: pendingError } = await pendingQuery

  if (pendingError) throw new Error(`pending candidate fetch failed: ${pendingError.message}`)
  const pending = (pendingData ?? []) as unknown as PendingCandidate[]
  const remaining = options.batchSize - pending.length
  if (remaining <= 0) return pending

  let retryQuery = db
    .from('polymarket_market_candidates')
    .select(CANDIDATE_SELECT)
    .eq('source', SOURCE)
    .eq('area', AREA)
    .eq('status', 'research_failed')
    .lt('research_retry_count', options.maxRetryCount)
    .or(`research_next_retry_at.is.null,research_next_retry_at.lte.${options.now}`)
    .order('research_next_retry_at', { ascending: true, nullsFirst: true })
    .order('score', { ascending: false })
    .limit(remaining)
  if (observedAfter) retryQuery = retryQuery.gte('observed_at', observedAfter)

  const { data: retryData, error: retryError } = await retryQuery

  if (retryError) throw new Error(`retry candidate fetch failed: ${retryError.message}`)
  return [...pending, ...((retryData ?? []) as unknown as PendingCandidate[])]
}

async function fetchRecentResearch(db: SupabaseClient, slugs: string[], familyKeys: string[]): Promise<{
  bySlug: Map<string, PriorResearch[]>
  byFamilyKey: Map<string, PriorResearch[]>
}> {
  const bySlug = new Map<string, PriorResearch[]>()
  const byFamilyKey = new Map<string, PriorResearch[]>()
  if (slugs.length === 0 && familyKeys.length === 0) return { bySlug, byFamilyKey }
  const select = 'id, candidate_id, slug, research_mode, summary, notes, key_findings, evidence_links, related_context, uncertainty, editor_notes, researched_at, research_family_key, research_cluster_key, research_depth, evidence_quality, catalyst_found, recommended_editor_action, research_backend, research_model'
  const uniqueRows = new Map<string, PriorResearch>()

  if (slugs.length > 0) {
    const { data, error } = await db
      .from('polymarket_market_candidate_research')
      .select(select)
      .in('slug', slugs)
      .order('researched_at', { ascending: false })
      .limit(100)

    if (error) throw new Error(`prior research slug fetch failed: ${error.message}`)
    for (const row of data ?? []) uniqueRows.set((row as PriorResearch).id, row as PriorResearch)
  }

  if (familyKeys.length > 0) {
    const { data, error } = await db
      .from('polymarket_market_candidate_research')
      .select(select)
      .in('research_family_key', familyKeys)
      .order('researched_at', { ascending: false })
      .limit(200)

    if (error) throw new Error(`prior research family fetch failed: ${error.message}`)
    for (const row of data ?? []) uniqueRows.set((row as PriorResearch).id, row as PriorResearch)
  }

  for (const research of uniqueRows.values()) {
    const rows = bySlug.get(research.slug) ?? []
    rows.push(research)
    bySlug.set(research.slug, rows)
    if (research.research_family_key) {
      const familyRows = byFamilyKey.get(research.research_family_key) ?? []
      familyRows.push(research)
      byFamilyKey.set(research.research_family_key, familyRows)
    }
  }

  for (const rows of bySlug.values()) rows.sort((a, b) => new Date(b.researched_at).getTime() - new Date(a.researched_at).getTime())
  for (const rows of byFamilyKey.values()) rows.sort((a, b) => new Date(b.researched_at).getTime() - new Date(a.researched_at).getTime())
  return { bySlug, byFamilyKey }
}

function recentPrior(prior: PriorResearch[] | undefined, nowMs: number, cooldownMinutes: number): PriorResearch | null {
  const latest = prior?.[0]
  if (!latest) return null
  const ageMs = nowMs - new Date(latest.researched_at).getTime()
  return ageMs >= 0 && ageMs < cooldownMinutes * 60 * 1000 ? latest : null
}

async function updateCandidateStatus(
  db: SupabaseClient,
  ids: string[],
  status: CandidateStatus,
  observedAt: string,
  researchError?: string | null,
  extraPayload: Record<string, unknown> = {}
): Promise<void> {
  if (ids.length === 0) return
  const payload: Record<string, unknown> = {
    status,
    updated_at: observedAt,
    research_attempted_at: observedAt,
    ...extraPayload,
  }
  if (researchError !== undefined) payload.research_error = researchError

  const { error } = await db
    .from('polymarket_market_candidates')
    .update(payload)
    .in('id', ids)

  if (error) throw new Error(`candidate status update failed: ${error.message}`)
}

function errorKind(error: string): string {
  const normalized = error.toLowerCase()
  if (normalized.includes('timeout') || normalized.includes('timed out')) return 'timeout'
  if (normalized.includes('invalid json') || normalized.includes('valid research result')) return 'invalid_response'
  if (normalized.includes('enoent') || normalized.includes('not found')) return 'backend_unavailable'
  return 'backend_error'
}

function retryCount(candidate: PendingCandidate): number {
  return numberOrNull(candidate.research_retry_count) ?? 0
}

async function updateSuccessfulCandidates(
  db: SupabaseClient,
  ids: string[],
  observedAt: string
): Promise<void> {
  await updateCandidateStatus(db, ids, 'researched', observedAt, null, {
    research_next_retry_at: null,
    research_last_error_kind: null,
  })
}

async function updateFailedCandidate(
  db: SupabaseClient,
  failure: ResearchFailure,
  observedAt: string,
  options: Required<PolymarketResearcherOptions>
): Promise<void> {
  const nextRetryAt = new Date(new Date(observedAt).getTime() + options.retryWindowMinutes * 60 * 1000).toISOString()
  await updateCandidateStatus(db, [failure.candidate.id], 'research_failed', observedAt, failure.error.slice(0, 2000), {
    research_retry_count: retryCount(failure.candidate) + 1,
    research_next_retry_at: nextRetryAt,
    research_last_error_kind: errorKind(failure.error),
  })
}

function metricValue(candidate: PendingCandidate, keys: string[]): number | null {
  if (!candidate.metrics || typeof candidate.metrics !== 'object') return null
  const metrics = candidate.metrics as Record<string, unknown>
  for (const key of keys) {
    const value = numberOrNull(metrics[key])
    if (value != null) return value
  }
  return null
}

function evidenceUrls(candidate: PendingCandidate): string[] {
  return asArray(candidate.evidence_refs)
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      return asString(record.source_url || record.url)
    })
    .filter(Boolean)
}

function hasCurrentContextCue(candidate: PendingCandidate): boolean {
  return /\b(election|fed|cpi|tariff|war|ceasefire|sec|etf|earnings|court|rate|inflation|crypto|bitcoin|ethereum|oil|gold)\b/i.test([
    candidate.slug,
    candidate.title,
    candidate.tag_slug,
    candidate.tag_label,
    candidate.what_changed,
    candidate.why_flagged,
  ].filter(Boolean).join(' '))
}

function classifyResearchDepth(
  candidate: PendingCandidate,
  priorResearch: { bySlug: Map<string, PriorResearch[]>, byFamilyKey: Map<string, PriorResearch[]> },
  nowMs: number,
  options: Required<PolymarketResearcherOptions>
): TriageDecision {
  const familyKey = primaryFamilyKey(candidate)
  const clusterKey = clusterKeyForCandidate(candidate)
  const exactPrior = recentPrior(priorResearch.bySlug.get(candidate.slug), nowMs, options.slugCooldownMinutes)
  if (exactPrior) {
    return { candidate, depth: 'reuse_prior', familyKey, clusterKey, prior: exactPrior, reason: 'recent_exact_slug_research' }
  }

  const familyPrior = recentPrior(priorResearch.byFamilyKey.get(familyKey), nowMs, options.slugCooldownMinutes)
  const score = numberOrNull(candidate.score) ?? 0
  if (familyPrior && score <= Math.max(70, options.structureOnlyScoreMax)) {
    return { candidate, depth: 'reuse_prior', familyKey, clusterKey, prior: familyPrior, reason: 'recent_family_research' }
  }

  const volume24h = metricValue(candidate, ['currentVolume24h', 'volume24h'])
  const volume = metricValue(candidate, ['currentVolume', 'volume'])
  const liquidity = metricValue(candidate, ['liquidity'])
  const thinLiquidity = liquidity == null || liquidity <= options.thinLiquidityMax
  const thinVolume = (volume24h ?? volume ?? 0) <= options.thinVolume24hMax
  if (score <= options.structureOnlyScoreMax && thinVolume && thinLiquidity && !hasCurrentContextCue(candidate)) {
    return { candidate, depth: 'market_structure_only', familyKey, clusterKey, reason: 'low_score_thin_market_structure' }
  }

  return { candidate, depth: 'deep_web', familyKey, clusterKey, reason: 'needs_current_context' }
}

function triageCandidates(
  candidates: PendingCandidate[],
  priorResearch: { bySlug: Map<string, PriorResearch[]>, byFamilyKey: Map<string, PriorResearch[]> },
  nowMs: number,
  options: Required<PolymarketResearcherOptions>
): TriageDecision[] {
  return candidates.map((candidate) => classifyResearchDepth(candidate, priorResearch, nowMs, options))
}

function buildReusePriorRow(decision: TriageDecision, observedAt: string, options: Required<PolymarketResearcherOptions>): ResearchRowInput {
  const candidate = decision.candidate
  const prior = decision.prior
  if (!prior) throw new Error(`reuse_prior triage missing prior research for candidate ${candidate.id}`)
  return {
    candidate_id: candidate.id,
    source: candidate.source,
    area: candidate.area,
    slug: candidate.slug,
    title: candidate.title,
    candidate_type: candidate.candidate_type,
    research_mode: prior.research_mode,
    summary: `Reused recent research from ${prior.slug}: ${prior.summary}`,
    notes: [
      `Reuse reason: ${decision.reason}.`,
      `Current signal: ${candidate.what_changed}`,
      prior.notes,
    ].filter(Boolean).join('\n'),
    key_findings: asArray(prior.key_findings),
    evidence_links: asArray(prior.evidence_links),
    related_context: [
      ...asArray(prior.related_context),
      { kind: 'reused_prior_research', research_id: prior.id, slug: prior.slug, researched_at: prior.researched_at },
    ],
    uncertainty: prior.uncertainty || 'Prior research was reused; verify whether the market moved because of a new catalyst.',
    editor_notes: `This row reused recent ${decision.reason === 'recent_exact_slug_research' ? 'exact-slug' : 'family'} research. Compare the current candidate metrics before publishing. ${prior.editor_notes}`.trim(),
    status: 'pending_editor',
    researched_at: observedAt,
    updated_at: observedAt,
    research_family_key: decision.familyKey,
    research_cluster_key: decision.clusterKey,
    research_depth: 'reuse_prior',
    evidence_quality: prior.evidence_quality ?? 'medium',
    catalyst_found: prior.catalyst_found ?? false,
    recommended_editor_action: prior.recommended_editor_action ?? 'needs_more_research',
    duplicate_of_research_id: prior.id,
    research_backend: options.backend,
    research_model: options.researchModel,
  }
}

function buildMarketStructureRow(decision: TriageDecision, observedAt: string, options: Required<PolymarketResearcherOptions>): ResearchRowInput {
  const candidate = decision.candidate
  const score = numberOrNull(candidate.score) ?? 0
  const urls = evidenceUrls(candidate)
  const priceDelta = metricValue(candidate, ['oddsDelta'])
  const volumeDeltaPct = metricValue(candidate, ['volumeDeltaPct', 'activityDeltaPct'])
  const volume = metricValue(candidate, ['currentVolume', 'currentVolume24h', 'volume'])
  const keyFindings = [
    `${candidate.candidate_type} signal scored ${round(score, 1)} and was routed as market-structure-only.`,
    candidate.what_changed,
    candidate.why_flagged,
    priceDelta != null ? `Observed odds delta: ${round(priceDelta * 100, 2)} percentage points.` : '',
    volumeDeltaPct != null ? `Observed volume/activity delta: ${round(volumeDeltaPct * 100, 1)}%.` : '',
  ].filter(Boolean)

  const weakEvidence = score < 45 || urls.length === 0
  return {
    candidate_id: candidate.id,
    source: candidate.source,
    area: candidate.area,
    slug: candidate.slug,
    title: candidate.title,
    candidate_type: candidate.candidate_type,
    research_mode: 'market_structure',
    summary: `${candidate.title} was triaged without web search because the signal appears mostly mechanical or thin. ${candidate.what_changed}`,
    notes: [
      `Triage reason: ${decision.reason}.`,
      `Score: ${round(score, 1)}.`,
      volume != null ? `Reported market volume/activity metric: ${round(volume, 2)}.` : '',
      `Polymarket evidence refs: ${urls.length > 0 ? urls.join(', ') : 'none supplied'}.`,
    ].filter(Boolean).join('\n'),
    key_findings: keyFindings,
    evidence_links: urls.map((url) => ({ title: 'Polymarket market evidence', url, note: 'Candidate-supplied market reference' })),
    related_context: [{ kind: 'research_triage', depth: 'market_structure_only', family_key: decision.familyKey, cluster_key: decision.clusterKey }],
    uncertainty: 'No external web search was run; this only supports a market-structure editorial decision.',
    editor_notes: weakEvidence
      ? 'Likely reject unless the Editor sees an obvious timely catalyst in the market title or supplied evidence.'
      : 'Use this as a market-structure note; request deeper research if current external context matters.',
    status: 'pending_editor',
    researched_at: observedAt,
    updated_at: observedAt,
    research_family_key: decision.familyKey,
    research_cluster_key: decision.clusterKey,
    research_depth: 'market_structure_only',
    evidence_quality: weakEvidence ? 'weak' : 'medium',
    catalyst_found: false,
    recommended_editor_action: weakEvidence ? 'reject_thin' : 'needs_more_research',
    duplicate_of_research_id: null,
    research_backend: 'local_triage',
    research_model: 'deterministic_market_structure',
  }
}

function sourceNativeFallbackQuestions(candidate: PendingCandidate): string[] {
  return [
    `What is the market "${candidate.title}" about in plain terms?`,
    'What are the exact resolution rules and resolution source from Polymarket?',
    'Are there deadline/date inconsistencies between title, rule text, end date, and event group?',
    'What sibling markets exist in the same parent event, and do they form a date ladder or related outcome set?',
    'What does Polymarket-native structure show: price, liquidity, volume, 24h activity, and freshness?',
    'Based only on Polymarket-native data, what is known, what is unknown, and what external research is needed?',
  ]
}

function compactContext(context: PolymarketNativeContext): Record<string, unknown> {
  return {
    source_url: context.source_url,
    market: context.market,
    market_structure: context.market_structure,
    parent_event: context.parent_event,
    sibling_markets: context.sibling_markets,
  }
}

function buildPlannerPrompt(context: PolymarketNativeContext, candidate: PendingCandidate): string {
  return [
    'You are the myboon Polymarket Research Planner.',
    '',
    'Your job is not to do research. Your job is to create the best focused research brief for the next worker.',
    '',
    'You receive source-native Polymarket context and the candidate observation that triggered research.',
    'Do not ask the next worker to research facts already present in Polymarket-native context.',
    'Ask only for missing external context that could explain why traders may have repriced this market.',
    'The next worker will only receive your research brief, not the full Polymarket context.',
    '',
    'Return strict JSON only. No markdown.',
    '',
    'JSON shape:',
    JSON.stringify({
      research_goal: 'What changed in the last 30 days that could explain the market sentiment or price move?',
      known_from_polymarket: ['facts already known from source-native context'],
      do_not_research: ['Polymarket rules already supplied', 'current odds already supplied'],
      last30days_topic: 'short topic string for last30days.py',
      lookback_days: 30,
      search_sources: ['reddit', 'grounding', 'polymarket'],
      subreddits: ['relevant', 'subreddits'],
      polymarket_keywords: ['keywords'],
      last30days_plan: {
        intent: 'prediction | breaking_news | concept',
        freshness_mode: 'strict_recent | balanced_recent | evergreen_ok',
        cluster_mode: 'story | market | none',
        subqueries: [
          {
            label: 'short_label',
            search_query: 'keyword-heavy query, no temporal phrases',
            ranking_query: 'natural-language question the research should answer',
            sources: ['reddit', 'grounding', 'polymarket'],
            weight: 1,
          },
        ],
      },
      evidence_to_collect: ['specific evidence types to collect'],
      expected_entities: ['entities likely relevant for Entity Memory'],
      notes: 'short instruction to the researcher',
    }, null, 2),
    '',
    'Candidate observation:',
    JSON.stringify({
      id: candidate.id,
      candidate_type: candidate.candidate_type,
      slug: candidate.slug,
      title: candidate.title,
      tag_slug: candidate.tag_slug,
      tag_label: candidate.tag_label,
      observed_at: candidate.observed_at,
      what_changed: candidate.what_changed,
      why_flagged: candidate.why_flagged,
      score: candidate.score,
      score_breakdown: candidate.score_breakdown,
      metrics: candidate.metrics,
    }, null, 2),
    '',
    'Polymarket-native context:',
    JSON.stringify(compactContext(context), null, 2),
  ].join('\n')
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return items.length > 0 ? items : fallback
}

function fallbackReflectionPlan(context: PolymarketNativeContext, candidate: PendingCandidate): ResearchReflectionPlan {
  const title = context.market.title || candidate.title
  const text = [context.market.slug, title, context.parent_event?.title, candidate.tag_slug, candidate.tag_label].join(' ').toLowerCase()
  const isFed = /\bfed\b|\bfomc\b|federal reserve|interest rate|rates?|bps|basis point|inflation|cpi|jobs|powell/.test(text)
  const isPolitics = /\bstarmer\b|\blabou?r\b|\buk\b|\bprime minister\b|\belection\b|\bresign|\bgovernment\b|\bparliament\b/.test(text)

  if (isFed) {
    return {
      research_goal: 'Find what changed in the last 30 days that could explain higher Fed hike, cut, or no-change sentiment for this market.',
      known_from_polymarket: [
        title,
        `Current Yes price: ${context.market_structure.yes_price ?? 'unknown'}`,
        `Parent event: ${context.parent_event?.title ?? 'unknown'}`,
      ],
      do_not_research: ['Market title/rules/resolution mechanics', 'Current Polymarket odds already supplied'],
      last30days_topic: 'Fed rate decision sentiment change',
      lookback_days: 30,
      search_sources: ['reddit', 'grounding', 'polymarket'],
      subreddits: ['FedWatch', 'Economics', 'finance', 'investing', 'wallstreetbets', 'Bogleheads', 'macro', 'stocks'],
      polymarket_keywords: ['fed', 'fomc', 'hike', 'cut', 'inflation', 'rates'],
      last30days_plan: {
        intent: 'prediction',
        freshness_mode: 'strict_recent',
        cluster_mode: 'story',
        subqueries: [
          {
            label: 'market_sentiment_change',
            search_query: 'Fed rate decision odds inflation yields labor market pricing',
            ranking_query: 'What changed in markets or macro data over the last 30 days that could explain the current Fed decision sentiment?',
            sources: ['reddit', 'grounding', 'polymarket'],
            weight: 1,
          },
          {
            label: 'inflation_repricing',
            search_query: 'inflation expectations Treasury yields Fed funds pricing',
            ranking_query: 'Did inflation expectations, Treasury yields, or Fed funds pricing shift in a way that explains the market move?',
            sources: ['reddit', 'grounding'],
            weight: 0.9,
          },
        ],
      },
      evidence_to_collect: ['Fed/FOMC communication', 'inflation data', 'Treasury yield or rate-pricing repricing', 'related Polymarket rate markets'],
      expected_entities: ['Federal Reserve', 'FOMC', 'Fed funds rate', 'US inflation', 'Treasury yields'],
      notes: 'Research the cause of sentiment change, not whether Polymarket is correct.',
    }
  }

  if (isPolitics) {
    return {
      research_goal: 'Find what changed in the last 30 days in verified political reporting or official activity that could explain this market sentiment.',
      known_from_polymarket: [title],
      do_not_research: ['Market title/rules/resolution mechanics', 'Current Polymarket odds already supplied'],
      last30days_topic: `${title} political context`,
      lookback_days: 30,
      search_sources: ['reddit', 'grounding', 'polymarket'],
      subreddits: ['ukpolitics', 'worldnews', 'politics', 'unitedkingdom'],
      polymarket_keywords: title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 8),
      last30days_plan: {
        intent: 'prediction',
        freshness_mode: 'strict_recent',
        cluster_mode: 'story',
        subqueries: [
          {
            label: 'political_catalyst',
            search_query: `${title} resignation leadership challenge polling scandal parliament`,
            ranking_query: 'What recent verified political events or reporting could explain this market sentiment?',
            sources: ['reddit', 'grounding', 'polymarket'],
            weight: 1,
          },
        ],
      },
      evidence_to_collect: ['official statements', 'credible reporting', 'polling', 'parliamentary or party mechanism evidence', 'related market moves'],
      expected_entities: [],
      notes: 'Separate verified political facts from trader speculation.',
    }
  }

  return {
    research_goal: 'Find what changed in the last 30 days that could explain this market sentiment or price move.',
    known_from_polymarket: [title],
    do_not_research: ['Market title/rules/resolution mechanics', 'Current Polymarket odds already supplied'],
    last30days_topic: title,
    lookback_days: 30,
    search_sources: ['reddit', 'grounding', 'polymarket'],
    subreddits: ['Polymarket', 'news', 'worldnews'],
    polymarket_keywords: title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6),
    last30days_plan: {
      intent: 'prediction',
      freshness_mode: 'strict_recent',
      cluster_mode: 'story',
      subqueries: [
        {
          label: 'sentiment_change',
          search_query: title,
          ranking_query: 'What changed in the last 30 days that could explain this market sentiment or price move?',
          sources: ['reddit', 'grounding', 'polymarket'],
          weight: 1,
        },
      ],
    },
    evidence_to_collect: ['current reporting', 'related market moves', 'credible source links'],
    expected_entities: [],
    notes: 'Research the external cause of sentiment change.',
  }
}

function normalizeReflectionPlan(value: Partial<ResearchReflectionPlan> | null, context: PolymarketNativeContext, candidate: PendingCandidate): ResearchReflectionPlan {
  const fallback = fallbackReflectionPlan(context, candidate)
  const rawPlan = value?.last30days_plan
  const rawSubqueries = Array.isArray(rawPlan?.subqueries) && rawPlan.subqueries.length > 0
    ? rawPlan.subqueries
    : fallback.last30days_plan.subqueries
  const subqueries = rawSubqueries
    .map((item, index) => ({
      label: typeof item.label === 'string' && item.label ? item.label : `query_${index + 1}`,
      search_query: typeof item.search_query === 'string' && item.search_query ? item.search_query : fallback.last30days_topic,
      ranking_query: typeof item.ranking_query === 'string' && item.ranking_query ? item.ranking_query : fallback.research_goal,
      sources: asStringArray(item.sources, fallback.search_sources),
      weight: typeof item.weight === 'number' && Number.isFinite(item.weight) ? item.weight : 1,
    }))
    .slice(0, 4)

  return {
    research_goal: typeof value?.research_goal === 'string' && value.research_goal ? value.research_goal : fallback.research_goal,
    known_from_polymarket: asStringArray(value?.known_from_polymarket, fallback.known_from_polymarket),
    do_not_research: asStringArray(value?.do_not_research, fallback.do_not_research),
    last30days_topic: typeof value?.last30days_topic === 'string' && value.last30days_topic ? value.last30days_topic : fallback.last30days_topic,
    lookback_days: typeof value?.lookback_days === 'number' && Number.isFinite(value.lookback_days) ? Math.max(1, Math.min(90, Math.round(value.lookback_days))) : fallback.lookback_days,
    search_sources: asStringArray(value?.search_sources, fallback.search_sources),
    subreddits: asStringArray(value?.subreddits, fallback.subreddits),
    polymarket_keywords: asStringArray(value?.polymarket_keywords, fallback.polymarket_keywords),
    last30days_plan: {
      intent: typeof rawPlan?.intent === 'string' && rawPlan.intent ? rawPlan.intent : fallback.last30days_plan.intent,
      freshness_mode: typeof rawPlan?.freshness_mode === 'string' && rawPlan.freshness_mode ? rawPlan.freshness_mode : fallback.last30days_plan.freshness_mode,
      cluster_mode: typeof rawPlan?.cluster_mode === 'string' && rawPlan.cluster_mode ? rawPlan.cluster_mode : fallback.last30days_plan.cluster_mode,
      subqueries,
    },
    evidence_to_collect: asStringArray(value?.evidence_to_collect, fallback.evidence_to_collect),
    expected_entities: asStringArray(value?.expected_entities, fallback.expected_entities),
    notes: typeof value?.notes === 'string' ? value.notes : fallback.notes,
  }
}

function buildResearchBrief(plan: ResearchReflectionPlan): ResearchBrief {
  return {
    research_goal: plan.research_goal,
    last30days_topic: plan.last30days_topic,
    lookback_days: plan.lookback_days,
    search_sources: plan.search_sources,
    subreddits: plan.subreddits,
    polymarket_keywords: plan.polymarket_keywords,
    last30days_plan: plan.last30days_plan,
    evidence_to_collect: plan.evidence_to_collect,
    expected_entities: plan.expected_entities,
    notes: plan.notes,
  }
}

async function runHermesPlanner(
  context: PolymarketNativeContext,
  candidate: PendingCandidate,
  options: Required<PolymarketResearcherOptions>
): Promise<PlannerResult> {
  const prompt = buildPlannerPrompt(context, candidate)
  const args = options.researchPlannerHermesIgnoreRules ? ['--ignore-rules'] : []
  args.push(...(options.researchPlannerHermesToolsets
    ? ['-t', options.researchPlannerHermesToolsets, '-z', prompt]
    : ['-z', prompt]))

  try {
    const { stdout } = await execFileAsync(options.hermesCommand, args, {
      timeout: options.researchPlannerHermesTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    })
    const parsed = extractJson<Partial<ResearchReflectionPlan>>(stdout)
    return {
      plan: normalizeReflectionPlan(parsed, context, candidate),
      raw: stdout.trim(),
      error: parsed ? null : 'Hermes planner returned non-JSON output; normalized with fallback fields.',
    }
  } catch (error) {
    return {
      plan: fallbackReflectionPlan(context, candidate),
      raw: '',
      error: error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 800) : String(error).slice(0, 800),
    }
  }
}

function hermesArgs(prompt: string, options: Required<PolymarketResearcherOptions>): string[] {
  const args = options.researchPlannerHermesIgnoreRules ? ['--ignore-rules'] : []
  args.push(...(options.researchPlannerHermesToolsets
    ? ['-t', options.researchPlannerHermesToolsets, '-z', prompt]
    : ['-z', prompt]))
  return args
}

function last30DaysArgs(brief: ResearchBrief, planPath: string, options: Required<PolymarketResearcherOptions>): string[] {
  const args = [
    options.last30DaysScript,
    brief.last30days_topic,
    '--emit=json',
    `--days=${brief.lookback_days}`,
    `--search=${brief.search_sources.join(',')}`,
    '--plan',
    planPath,
    `--subreddits=${brief.subreddits.join(',')}`,
    `--web-backend=${options.last30DaysWebBackend}`,
  ]
  if (brief.polymarket_keywords.length > 0) args.push(`--polymarket-keywords=${brief.polymarket_keywords.join(',')}`)
  return args
}

function last30DaysPlanPayload(brief: ResearchBrief): Record<string, unknown> {
  const evidenceInstruction = brief.evidence_to_collect.length > 0
    ? `Prioritize evidence types: ${brief.evidence_to_collect.join('; ')}.`
    : ''
  const entityInstruction = brief.expected_entities.length > 0
    ? `Planner entity hints for retrieval only, not observed mentions: ${brief.expected_entities.join(', ')}.`
    : ''
  const notes = [
    `Research goal: ${brief.research_goal}`,
    brief.notes,
    evidenceInstruction,
    entityInstruction,
  ].filter(Boolean)

  return {
    ...brief.last30days_plan,
    notes,
    subqueries: brief.last30days_plan.subqueries.map((query) => ({
      ...query,
      ranking_query: [
        query.ranking_query,
        `Research goal: ${brief.research_goal}`,
        evidenceInstruction,
      ].filter(Boolean).join(' '),
    })),
  }
}

async function runLast30Days(brief: ResearchBrief, options: Required<PolymarketResearcherOptions>): Promise<{ report: Record<string, unknown>, stderr: string, args: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'myboon-last30days-'))
  const planPath = join(dir, 'plan.json')
  try {
    await writeFile(planPath, JSON.stringify(last30DaysPlanPayload(brief), null, 2))
    const args = last30DaysArgs(brief, planPath, options)
    const { stdout, stderr } = await execFileAsync(options.last30DaysPython, args, {
      timeout: options.last30DaysTimeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        LAST30DAYS_PYTHON: options.last30DaysPython,
      },
    })
    const parsed = extractJson<Record<string, unknown>>(stdout)
    if (!parsed) throw new Error(`last30days returned invalid JSON. stderr=${stderr.slice(0, 500)} stdout=${stdout.slice(0, 1000)}`)
    return { report: parsed, stderr: stderr.trim(), args }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function rawEvidenceCandidates(report: Record<string, unknown>, limit = 12): Record<string, unknown>[] {
  return rankedCandidates(report, limit).map((item) => ({
    title: item.title,
    url: item.url,
    source: item.source,
    snippet: item.snippet,
    explanation: item.explanation,
    final_score: item.final_score,
    subquery_labels: item.subquery_labels,
    source_items: boundedSourceItems(item, 2),
  }))
}

function isFallbackEvidence(item: Record<string, unknown>): boolean {
  const source = asString(item.source).toLowerCase()
  const explanation = asString(item.explanation).toLowerCase()
  return source === 'polymarket'
    || explanation.includes('fallback-local-score')
    || explanation.includes('entity-miss')
}

function fallbackEvidenceReview(brief: ResearchBrief, report: Record<string, unknown>, error: string | null): EvidenceReview {
  const candidates = rawEvidenceCandidates(report)
  const usable = candidates.flatMap((item): EvidenceLink[] => {
    const title = asString(item.title, 'Research evidence')
    const url = asString(item.url)
    const source = asString(item.source)
    if (!url || isFallbackEvidence(item)) return []
    return [{
      title,
      url,
      source: source || undefined,
      note: [source, asString(item.snippet), asString(item.explanation)].filter(Boolean).join(' - '),
    }]
  })
  const rejected = candidates.flatMap((item): RejectedEvidence[] => {
    const title = asString(item.title, 'Rejected evidence')
    const url = asString(item.url)
    const source = asString(item.source) || undefined
    if (!url || !isFallbackEvidence(item)) return []
    return [{
      title,
      url,
      source,
      reason: source === 'polymarket'
        ? 'Polymarket result is related market context, not external proof.'
        : 'Fallback-ranked result was not safe to treat as evidence.',
    }]
  })
  const uniqueSources = new Set(usable.map((item) => item.source).filter(Boolean))
  const quality: EvidenceQuality = usable.length >= 3 && uniqueSources.size >= 2
    ? 'strong'
    : usable.length > 0
      ? 'medium'
      : 'weak'
  const completeness = usable.length >= 3
    ? 'complete'
    : usable.length > 0
      ? 'partial'
      : 'blocked'

  return {
    verdict: usable.length > 0 ? 'accept' : 'reject',
    evidence_quality: quality,
    catalyst_found: usable.length > 0,
    research_completeness: completeness,
    final_summary: usable.length > 0
      ? `${brief.research_goal} Found ${usable.length} usable external evidence link(s).`
      : `${brief.research_goal} No usable external evidence was found.`,
    key_findings: usable.map((item, index) => `${index + 1}. ${item.title}${item.source ? ` - source=${item.source}` : ''}`),
    usable_evidence: usable,
    rejected_evidence: rejected,
    missing_evidence: usable.length > 0 ? [] : ['No direct non-Polymarket evidence answered the research goal.'],
    follow_up_research: null,
    notes: error
      ? `Hermes evidence review failed; deterministic fallback review used. ${error}`
      : 'Deterministic fallback review used.',
    raw: '',
    error,
  }
}

function normalizeEvidenceLinks(value: unknown): EvidenceLink[] {
  return asArray(value)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .flatMap((item): EvidenceLink[] => {
      const title = asString(item.title, 'Research evidence')
      const url = asString(item.url)
      if (!url) return []
      return [{
        title,
        url,
        source: asString(item.source) || undefined,
        note: asString(item.why_it_matters) || asString(item.note) || asString(item.reason),
      }]
    })
    .slice(0, 12)
}

function normalizeRejectedEvidence(value: unknown): RejectedEvidence[] {
  return asArray(value)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      title: asString(item.title, 'Rejected evidence'),
      url: asString(item.url) || undefined,
      source: asString(item.source) || undefined,
      reason: asString(item.reason, 'Reviewer rejected this as insufficient evidence.'),
    }))
    .slice(0, 12)
}

function normalizeSubqueries(value: unknown, fallback: Last30DaysSubquery[]): Last30DaysSubquery[] {
  const rows = asArray(value)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, index) => ({
      label: asString(item.label, `follow_up_${index + 1}`),
      search_query: asString(item.search_query),
      ranking_query: asString(item.ranking_query),
      sources: asStringArray(item.sources, ['reddit', 'grounding']),
      weight: typeof item.weight === 'number' && Number.isFinite(item.weight) ? item.weight : 1,
    }))
    .filter((item) => item.search_query && item.ranking_query)
    .slice(0, 4)
  return rows.length > 0 ? rows : fallback
}

function normalizeFollowUpResearch(value: unknown, prior: ResearchBrief): FollowUpResearch | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const fallbackSubqueries = prior.last30days_plan.subqueries
  const subqueries = normalizeSubqueries(row.subqueries, fallbackSubqueries)
  const topic = asString(row.topic, prior.last30days_topic)
  return {
    topic,
    evidence_to_collect: asStringArray(row.evidence_to_collect, prior.evidence_to_collect),
    search_sources: asStringArray(row.search_sources, prior.search_sources),
    subreddits: asStringArray(row.subreddits, prior.subreddits),
    polymarket_keywords: asStringArray(row.polymarket_keywords, prior.polymarket_keywords),
    subqueries,
    notes: asString(row.notes, 'Follow-up search requested by evidence review.'),
  }
}

function normalizeEvidenceReview(value: Partial<EvidenceReview> | null, brief: ResearchBrief, report: Record<string, unknown>, raw: string, error: string | null): EvidenceReview {
  if (!value) return fallbackEvidenceReview(brief, report, error ?? 'Hermes evidence review returned non-JSON output.')
  const usable = normalizeEvidenceLinks(value.usable_evidence)
  const rejected = normalizeRejectedEvidence(value.rejected_evidence)
  const fallback = fallbackEvidenceReview(brief, report, error)
  const requestedVerdict = normalizeStringOption(value.verdict, ['accept', 'retry', 'reject'] as const, usable.length > 0 ? 'accept' : fallback.verdict)
  const followUp = requestedVerdict === 'retry' ? normalizeFollowUpResearch(value.follow_up_research, brief) : null
  const verdict = usable.length === 0 && requestedVerdict === 'accept'
    ? (followUp ? 'retry' : fallback.verdict)
    : requestedVerdict === 'retry' && !followUp
      ? fallback.verdict
      : requestedVerdict
  const quality = normalizeEvidenceQuality(value.evidence_quality ?? fallback.evidence_quality)
  const completeness = normalizeStringOption(value.research_completeness, ['complete', 'partial', 'blocked'] as const, fallback.research_completeness)
  return {
    verdict,
    evidence_quality: usable.length > 0 ? quality : 'weak',
    catalyst_found: usable.length > 0 && asBoolean(value.catalyst_found, fallback.catalyst_found),
    research_completeness: usable.length > 0 ? completeness : 'blocked',
    final_summary: asString(value.final_summary, fallback.final_summary),
    key_findings: asStringArray(value.key_findings, fallback.key_findings),
    usable_evidence: usable,
    rejected_evidence: rejected.length > 0 ? rejected : fallback.rejected_evidence,
    missing_evidence: asStringArray(value.missing_evidence, fallback.missing_evidence),
    follow_up_research: verdict === 'retry' ? followUp : null,
    notes: asString(value.notes, fallback.notes),
    raw,
    error,
  }
}

function buildEvidenceReviewPrompt(
  context: PolymarketNativeContext,
  candidate: PendingCandidate,
  brief: ResearchBrief,
  report: Record<string, unknown>,
  stderr: string,
  round: number
): string {
  return [
    'You are the myboon Polymarket Researcher doing evidence quality control.',
    '',
    'You are still inside the researcher. Do not write feed copy. Do not make editor/publisher decisions.',
    'Review whether retrieval results actually answer the research goal.',
    '',
    'Classify links strictly:',
    '- usable_evidence: direct evidence for the research goal from Reddit, web/news, official sources, filings, docs, or primary source material.',
    '- rejected_evidence: unrelated results, nearby Polymarket markets, fallback-local-score results, entity-miss results, or generic same-topic links that do not answer the goal.',
    '- Related Polymarket markets can be useful context but are not proof of an external catalyst.',
    '',
    'If evidence is inadequate and one more focused search is likely to help, set verdict="retry" and provide follow_up_research.',
    'If evidence is inadequate and another search is unlikely to help, set verdict="reject".',
    'Set verdict="accept" only when usable_evidence directly supports the research goal.',
    '',
    'Return strict JSON only. No markdown.',
    '',
    'JSON shape:',
    JSON.stringify({
      verdict: 'accept | retry | reject',
      evidence_quality: 'strong | medium | weak',
      catalyst_found: false,
      research_completeness: 'complete | partial | blocked',
      final_summary: 'concise research summary based only on usable evidence',
      key_findings: ['facts learned from usable evidence only'],
      usable_evidence: [{ title: '...', url: '...', source: '...', why_it_matters: '...' }],
      rejected_evidence: [{ title: '...', url: '...', source: '...', reason: '...' }],
      missing_evidence: ['what was not found'],
      follow_up_research: {
        topic: 'better last30days topic',
        evidence_to_collect: ['specific evidence needed'],
        search_sources: ['reddit', 'grounding'],
        subreddits: ['relevant_subreddit'],
        polymarket_keywords: ['keyword'],
        subqueries: [{
          label: 'short_label',
          search_query: 'precise keyword query',
          ranking_query: 'question the next search must answer',
          sources: ['reddit', 'grounding'],
          weight: 1,
        }],
        notes: 'why this follow-up search is better',
      },
      notes: 'review notes',
    }, null, 2),
    '',
    `Research round: ${round}`,
    '',
    'Candidate observation:',
    JSON.stringify({
      id: candidate.id,
      candidate_type: candidate.candidate_type,
      slug: candidate.slug,
      title: candidate.title,
      what_changed: candidate.what_changed,
      why_flagged: candidate.why_flagged,
      metrics: candidate.metrics,
    }, null, 2),
    '',
    'Polymarket-native context:',
    JSON.stringify(compactContext(context), null, 2),
    '',
    'Research brief:',
    JSON.stringify(brief, null, 2),
    '',
    'Retrieval report excerpt:',
    JSON.stringify({
      ...last30DaysReportExcerpt(report),
      raw_evidence_candidates: rawEvidenceCandidates(report),
      diagnostics: { stderr: stderr.slice(0, 1200) },
    }, null, 2),
  ].join('\n')
}

async function runHermesEvidenceReview(
  context: PolymarketNativeContext,
  candidate: PendingCandidate,
  brief: ResearchBrief,
  report: Record<string, unknown>,
  stderr: string,
  options: Required<PolymarketResearcherOptions>,
  round: number
): Promise<EvidenceReview> {
  const prompt = buildEvidenceReviewPrompt(context, candidate, brief, report, stderr, round)
  try {
    const { stdout } = await execFileAsync(options.hermesCommand, hermesArgs(prompt, options), {
      timeout: options.researchPlannerHermesTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    })
    const parsed = extractJson<Partial<EvidenceReview>>(stdout)
    return normalizeEvidenceReview(parsed, brief, report, stdout.trim(), parsed ? null : 'Hermes evidence review returned non-JSON output.')
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 800) : String(error).slice(0, 800)
    return normalizeEvidenceReview(null, brief, report, '', message)
  }
}

function followUpBrief(prior: ResearchBrief, review: EvidenceReview): ResearchBrief {
  const followUp = review.follow_up_research
  if (!followUp) return prior
  return {
    research_goal: prior.research_goal,
    last30days_topic: followUp.topic,
    lookback_days: prior.lookback_days,
    search_sources: followUp.search_sources,
    subreddits: followUp.subreddits,
    polymarket_keywords: followUp.polymarket_keywords,
    last30days_plan: {
      intent: prior.last30days_plan.intent,
      freshness_mode: prior.last30days_plan.freshness_mode,
      cluster_mode: prior.last30days_plan.cluster_mode,
      subqueries: followUp.subqueries,
    },
    evidence_to_collect: followUp.evidence_to_collect,
    expected_entities: prior.expected_entities,
    notes: [prior.notes, followUp.notes].filter(Boolean).join(' Follow-up: '),
  }
}

function finalizeReviewForRound(review: EvidenceReview, round: number, maxRounds: number): EvidenceReview {
  if (review.verdict !== 'retry' || round < maxRounds) return review
  return {
    ...review,
    verdict: 'reject',
    research_completeness: 'blocked',
    evidence_quality: review.usable_evidence.length > 0 ? review.evidence_quality : 'weak',
    catalyst_found: review.usable_evidence.length > 0 && review.catalyst_found,
    notes: [
      review.notes,
      `Max research rounds reached (${maxRounds}); finalizing as reject/blocked instead of retry.`,
    ].filter(Boolean).join(' '),
  }
}

function researchModeForCandidate(candidate: PendingCandidate): string {
  const text = [candidate.slug, candidate.title, candidate.tag_slug, candidate.tag_label].filter(Boolean).join(' ').toLowerCase()
  if (/\bfed\b|\bfomc\b|federal reserve|interest rate|rates?|bps|basis point|inflation|cpi|jobs|powell|bitcoin|ethereum|crypto/.test(text)) return 'macro_crypto'
  if (/\belection\b|\bresign|\bprime minister\b|\bparliament\b|\bgovernment\b|\bstarmer\b|\blabou?r\b/.test(text)) return 'political_churn'
  if (/\boil\b|\bgold\b|\benergy\b|\bwar\b|\bceasefire\b|\bgeopolitical\b/.test(text)) return 'geopolitical_risk'
  if (/\bearnings\b|\bcompany\b|\bceo\b|\bbusiness\b/.test(text)) return 'business_event'
  return 'other'
}

function rankedCandidates(report: Record<string, unknown>, limit: number): Record<string, unknown>[] {
  return asArray(report.ranked_candidates)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .slice(0, limit)
}

function evidenceLinksFromLast30Days(report: Record<string, unknown>): Array<{ title: string, url: string, note: string, source?: string }> {
  const seen = new Set<string>()
  return rankedCandidates(report, 12).flatMap((item) => {
    const title = asString(item.title, 'Research evidence')
    const url = asString(item.url)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{
      title,
      url,
      note: [asString(item.source), asString(item.snippet), asString(item.explanation)].filter(Boolean).join(' - '),
      source: asString(item.source) || undefined,
    }]
  })
}

function sourceCounts(report: Record<string, unknown>): Record<string, number> {
  if (!report.items_by_source || typeof report.items_by_source !== 'object') return {}
  return Object.fromEntries(
    Object.entries(report.items_by_source as Record<string, unknown>)
      .map(([source, rows]) => [source, Array.isArray(rows) ? rows.length : 0])
  )
}

function boundedMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  const metadata = value as Record<string, unknown>
  const allowed = [
    'author',
    'comment_count',
    'comments',
    'end_date',
    'num_comments',
    'outcome_prices',
    'outcomes_remaining',
    'published_at',
    'provenance',
    'question',
    'score',
    'subreddit',
  ]
  return Object.fromEntries(
    allowed
      .filter((key) => key in metadata)
      .map((key) => [key, metadata[key]])
  )
}

function boundedSourceItems(item: Record<string, unknown>, limit = 3): unknown[] {
  return asArray(item.source_items)
    .filter((sourceItem): sourceItem is Record<string, unknown> => Boolean(sourceItem && typeof sourceItem === 'object'))
    .slice(0, limit)
    .map((sourceItem) => ({
      title: sourceItem.title,
      url: sourceItem.url,
      source: sourceItem.source,
      container: sourceItem.container,
      published_at: sourceItem.published_at,
      engagement: sourceItem.engagement,
      snippet: sourceItem.snippet,
      metadata: boundedMetadata(sourceItem.metadata),
      why_relevant: sourceItem.why_relevant,
    }))
}

function boundedRankedCandidate(item: Record<string, unknown>): Record<string, unknown> {
  return {
    title: item.title,
    url: item.url,
    source: item.source,
    snippet: item.snippet,
    explanation: item.explanation,
    final_score: item.final_score,
    freshness: item.freshness,
    engagement: item.engagement,
    local_relevance: item.local_relevance,
    subquery_labels: item.subquery_labels,
    metadata: item.metadata,
    source_items: boundedSourceItems(item),
  }
}

function boundedClusters(report: Record<string, unknown>, limit = 5): unknown[] {
  return asArray(report.clusters)
    .filter((cluster): cluster is Record<string, unknown> => Boolean(cluster && typeof cluster === 'object'))
    .slice(0, limit)
    .map((cluster) => ({
      cluster_id: cluster.cluster_id,
      title: cluster.title,
      score: cluster.score,
      sources: cluster.sources,
      uncertainty: cluster.uncertainty,
      candidate_ids: cluster.candidate_ids,
      representative_ids: cluster.representative_ids,
    }))
}

function last30DaysReportExcerpt(report: Record<string, unknown>): Record<string, unknown> {
  return {
    topic: report.topic,
    generated_at: report.generated_at,
    range_from: report.range_from,
    range_to: report.range_to,
    query_plan: report.query_plan,
    provider_runtime: report.provider_runtime,
    source_counts: sourceCounts(report),
    warnings: report.warnings,
    errors_by_source: report.errors_by_source,
    artifacts: report.artifacts,
    clusters: boundedClusters(report),
    ranked_candidates: rankedCandidates(report, 8).map(boundedRankedCandidate),
  }
}

function last30DaysToResearchResult(
  decision: EnrichedTriageDecision,
  planner: PlannerResult,
  brief: ResearchBrief,
  report: Record<string, unknown>,
  stderr: string,
  args: string[],
  review = fallbackEvidenceReview(brief, report, null),
  rounds: ResearchRound[] = []
): HermesResearchResult {
  const candidate = decision.candidate
  const context = decision.polymarketNativeContext
  const evidenceLinks = review.usable_evidence
  const findings = review.key_findings
  const warnings = asArray(report.warnings).map(String)
  const errorsBySource = report.errors_by_source && typeof report.errors_by_source === 'object'
    ? Object.entries(report.errors_by_source as Record<string, unknown>).map(([source, error]) => `${source}: ${String(error)}`)
    : []
  const searchFailures = [...warnings, ...errorsBySource].filter(Boolean)
  const reviewRoundSummary = rounds.map((round) => ({
    round: round.round,
    verdict: round.review.verdict,
    evidence_quality: round.review.evidence_quality,
    catalyst_found: round.review.catalyst_found,
    usable_evidence_count: round.review.usable_evidence.length,
    rejected_evidence_count: round.review.rejected_evidence.length,
    missing_evidence: round.review.missing_evidence,
    follow_up_research: round.review.follow_up_research,
    last30days_topic: round.brief.last30days_topic,
    source_counts: sourceCounts(round.report),
    warnings: round.report.warnings,
    errors_by_source: round.report.errors_by_source,
    command_args: round.args,
    diagnostics: {
      stderr: round.stderr ? round.stderr.slice(0, 1200) : null,
    },
  }))

  return {
    candidate_id: candidate.id,
    research_mode: researchModeForCandidate(candidate),
    market_about: context?.market.title ?? candidate.title,
    resolution_rules: {
      condition: context?.market.description ?? null,
      deadline: context?.market.end_date ?? null,
      resolution_source: context?.market.resolution_source ?? null,
      rule_notes: context?.source_native_questions ?? sourceNativeFallbackQuestions(candidate),
    },
    polymarket_context: context ? {
      source_native_context: compactContext(context),
      market_structure_summary: context.market_structure,
      parent_event_summary: context.parent_event,
      source_native_findings: planner.plan.known_from_polymarket,
      source_native_do_not_research: planner.plan.do_not_research,
    } : null,
    external_research: {
      needed: true,
      why: brief.research_goal,
      questions: brief.last30days_plan.subqueries.map((query) => query.ranking_query),
      sources_checked: evidenceLinks,
      search_failures: searchFailures,
      last30days_topic: brief.last30days_topic,
      last30days_sources: brief.search_sources,
      source_counts: sourceCounts(report),
      command_args: args,
      diagnostics: {
        stderr: stderr ? stderr.slice(0, 2000) : null,
      },
      planner_error: planner.error,
      planner_expected_entities: brief.expected_entities,
      evidence_review: {
        verdict: review.verdict,
        evidence_quality: review.evidence_quality,
        catalyst_found: review.catalyst_found,
        research_completeness: review.research_completeness,
        rejected_evidence: review.rejected_evidence,
        missing_evidence: review.missing_evidence,
        notes: review.notes,
        error: review.error,
      },
      research_rounds: reviewRoundSummary,
    },
    verified_facts: findings,
    unverified_claims: [],
    entities_mentioned: [],
    claims_found: findings,
    relationships_found: [],
    open_questions: review.missing_evidence,
    research_completeness: review.research_completeness,
    summary: review.final_summary,
    notes: [
      `Research brief: ${brief.research_goal}`,
      `Planner notes: ${brief.notes}`,
      `Evidence to collect: ${brief.evidence_to_collect.join('; ')}`,
      `Subqueries: ${brief.last30days_plan.subqueries.map((query) => `${query.label}: ${query.search_query}`).join(' | ')}`,
      `Evidence review verdict: ${review.verdict}`,
      `Evidence review notes: ${review.notes}`,
      planner.error ? `Planner fallback/error: ${planner.error}` : '',
    ].filter(Boolean).join('\n'),
    key_findings: findings,
    evidence_links: evidenceLinks,
    related_context: [
      { kind: 'reflection_research_brief', ...brief },
      { kind: 'polymarket_source_native_context', context: context ? compactContext(context) : null },
      { kind: 'evidence_review', ...review, raw: review.raw ? review.raw.slice(0, 4000) : '' },
      { kind: 'research_reflection_rounds', rounds: reviewRoundSummary },
      { kind: 'last30days_report_excerpt', ...last30DaysReportExcerpt(report) },
    ],
    uncertainty: searchFailures.length > 0
      ? `Research had source limitations: ${searchFailures.slice(0, 3).join(' | ')}`
      : 'Evidence is limited to the configured last30days sources and ranking output.',
    editor_notes: 'Research packet only. Entity Manager should extract entities/evidence before any feed/editor decision.',
    evidence_quality: review.evidence_quality,
    catalyst_found: review.catalyst_found,
    recommended_editor_action: 'needs_more_research',
  }
}

function normalizeResearchResult(result: HermesResearchResult): HermesResearchResult {
  const verifiedFacts = asArray(result.verified_facts)
  const openQuestions = asArray(result.open_questions)
  const keyFindings = asArray(result.key_findings)
  const relatedContext = asArray(result.related_context)
  const packet = researchPacketForResult(result)
  return {
    candidate_id: asString(result.candidate_id),
    research_mode: asString(result.research_mode, 'market_structure'),
    market_about: result.market_about,
    resolution_rules: result.resolution_rules,
    polymarket_context: result.polymarket_context,
    external_research: result.external_research,
    verified_facts: verifiedFacts,
    unverified_claims: asArray(result.unverified_claims),
    entities_mentioned: asArray(result.entities_mentioned),
    claims_found: asArray(result.claims_found),
    relationships_found: asArray(result.relationships_found),
    open_questions: openQuestions,
    research_completeness: asString(result.research_completeness, 'partial'),
    summary: asString(result.summary),
    notes: asString(result.notes),
    key_findings: keyFindings.length > 0 ? keyFindings : verifiedFacts,
    evidence_links: asArray(result.evidence_links),
    related_context: [packet, ...relatedContext],
    uncertainty: asString(result.uncertainty),
    editor_notes: asString(result.editor_notes) || [
      openQuestions.length > 0 ? `Open questions: ${openQuestions.map(String).join('; ')}` : '',
      asString(result.uncertainty),
    ].filter(Boolean).join('\n'),
    evidence_quality: compatibilityEvidenceQuality(result.evidence_quality ?? result.research_completeness),
    catalyst_found: asBoolean(result.catalyst_found),
    recommended_editor_action: normalizeRecommendedEditorAction(result.recommended_editor_action),
  }
}

async function researchSingleCandidate(
  decision: EnrichedTriageDecision,
  options: Required<PolymarketResearcherOptions>,
  reason: string
): Promise<{ result?: HermesResearchResult, failure?: ResearchFailure }> {
  try {
    if (!decision.polymarketNativeContext) {
      return {
        failure: {
          candidate: decision.candidate,
          error: `Polymarket native context unavailable before ${reason}: ${decision.polymarketNativeContextError ?? 'unknown error'}`,
        },
      }
    }
    const planner = await runHermesPlanner(decision.polymarketNativeContext, decision.candidate, options)
    let brief = buildResearchBrief(planner.plan)
    const rounds: ResearchRound[] = []
    let research: { report: Record<string, unknown>, stderr: string, args: string[] } | null = null
    let review: EvidenceReview | null = null

    for (let round = 1; round <= options.maxResearchRounds; round += 1) {
      research = await runLast30Days(brief, options)
      review = finalizeReviewForRound(await runHermesEvidenceReview(
        decision.polymarketNativeContext,
        decision.candidate,
        brief,
        research.report,
        research.stderr,
        options,
        round
      ), round, options.maxResearchRounds)
      rounds.push({ round, brief, report: research.report, stderr: research.stderr, args: research.args, review })
      if (review.verdict !== 'retry' || !review.follow_up_research || round >= options.maxResearchRounds) break
      brief = followUpBrief(brief, review)
    }

    if (!research || !review) {
      return {
        failure: {
          candidate: decision.candidate,
          error: 'Research reflection loop did not produce a result.',
        },
      }
    }

    const result = normalizeResearchResult(last30DaysToResearchResult(
      decision,
      planner,
      brief,
      research.report,
      research.stderr,
      research.args,
      review,
      rounds
    ))
    return { result }
  } catch (error) {
    return {
      failure: {
        candidate: decision.candidate,
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function researchCandidatesWithFallback(
  decisions: EnrichedTriageDecision[],
  options: Required<PolymarketResearcherOptions>
): Promise<ResearchAttempt> {
  const results = new Map<string, HermesResearchResult>()
  const failures: ResearchFailure[] = []

  for (const decision of decisions) {
    const attempt = await researchSingleCandidate(decision, options, 'reflection research')
    if (attempt.result) results.set(decision.candidate.id, attempt.result)
    if (attempt.failure) failures.push(attempt.failure)
  }

  return { results, failures }
}

async function insertResearchRows(
  db: SupabaseClient,
  rows: ResearchRowInput[]
): Promise<string[]> {
  if (rows.length === 0) return []

  const { error } = await db
    .from('polymarket_market_candidate_research')
    .upsert(rows, { onConflict: 'candidate_id' })

  if (error) throw new Error(`research row insert failed: ${error.message}`)
  return rows.map((row) => row.candidate_id)
}

function buildHermesResearchRows(
  decisions: TriageDecision[],
  results: Map<string, HermesResearchResult>,
  observedAt: string,
  options: Required<PolymarketResearcherOptions>
): ResearchRowInput[] {
  return decisions.flatMap((decision) => {
    const candidate = decision.candidate
    const result = results.get(candidate.id)
    if (!result) return []
    return [{
      candidate_id: candidate.id,
      source: candidate.source,
      area: candidate.area,
      slug: candidate.slug,
      title: candidate.title,
      candidate_type: candidate.candidate_type,
      research_mode: result.research_mode,
      summary: result.summary,
      notes: result.notes,
      key_findings: result.key_findings,
      evidence_links: result.evidence_links,
      related_context: result.related_context,
      uncertainty: result.uncertainty,
      editor_notes: result.editor_notes,
      status: 'pending_editor',
      researched_at: observedAt,
      updated_at: observedAt,
      research_family_key: decision.familyKey,
      research_cluster_key: decision.clusterKey,
      research_depth: 'deep_web',
      evidence_quality: normalizeEvidenceQuality(result.evidence_quality),
      catalyst_found: asBoolean(result.catalyst_found),
      recommended_editor_action: normalizeRecommendedEditorAction(result.recommended_editor_action),
      duplicate_of_research_id: null,
      research_backend: options.backend,
      research_model: options.researchModel,
    }]
  })
}

async function enrichTriageWithPolymarketContext(decisions: TriageDecision[]): Promise<EnrichedTriageDecision[]> {
  return Promise.all(decisions.map(async (decision) => {
    try {
      return {
        ...decision,
        polymarketNativeContext: await fetchPolymarketNativeContext(decision.candidate.slug),
      }
    } catch (error) {
      return {
        ...decision,
        polymarketNativeContextError: error instanceof Error ? error.message : String(error),
      }
    }
  }))
}

async function researchDeepWebCandidates(
  decisions: TriageDecision[],
  _priorResearch: { bySlug: Map<string, PriorResearch[]> },
  options: Required<PolymarketResearcherOptions>
): Promise<ResearchAttempt> {
  const results = new Map<string, HermesResearchResult>()
  const failures: ResearchFailure[] = []
  const enrichedDecisions = await enrichTriageWithPolymarketContext(decisions)
  const byCluster = new Map<string, EnrichedTriageDecision[]>()
  for (const decision of enrichedDecisions) {
    const cluster = byCluster.get(decision.clusterKey) ?? []
    cluster.push(decision)
    byCluster.set(decision.clusterKey, cluster)
  }

  const grouped = [...byCluster.values()].sort((a, b) => b.length - a.length)
  for (const group of grouped) {
    const attempt = await researchCandidatesWithFallback(group, options)
    for (const [id, result] of attempt.results) results.set(id, result)
    failures.push(...attempt.failures)
  }
  return { results, failures }
}

async function markCandidatesResearching(
  db: SupabaseClient,
  decisions: TriageDecision[],
  observedAt: string
): Promise<void> {
  for (const decision of decisions) {
    const { error } = await db
      .from('polymarket_market_candidates')
      .update({
        status: 'researching',
        updated_at: observedAt,
        research_attempted_at: observedAt,
        research_family_key: decision.familyKey,
        research_cluster_key: decision.clusterKey,
        research_depth: decision.depth,
      })
      .eq('id', decision.candidate.id)

    if (error) throw new Error(`candidate researching update failed: ${error.message}`)
  }
}

export async function runPolymarketResearcher(
  db: SupabaseClient,
  partialOptions: PolymarketResearcherOptions = {}
): Promise<PolymarketResearcherResult> {
  const options = selectedOptions(partialOptions)
  const observedAt = options.now
  const nowMs = new Date(observedAt).getTime()

  const candidates = await fetchResearchCandidates(db, options)
  const familyKeys = [...new Set(candidates.map(primaryFamilyKey))]
  const priorResearch = await fetchRecentResearch(db, [...new Set(candidates.map((candidate) => candidate.slug))], familyKeys)
  const triage = triageCandidates(candidates, priorResearch, nowMs, options)

  if (triage.length === 0) {
    return {
      observedAt,
      backend: options.backend,
      pendingFetched: candidates.length,
      eligibleForResearch: 0,
      skippedRecentlyResearched: 0,
      retriedFailedCandidates: 0,
      reusedPriorResearch: 0,
      marketStructureOnly: 0,
      deepWebResearched: 0,
      researchRowsWritten: 0,
      candidatesMarkedResearched: 0,
      candidatesMarkedFailed: 0,
      researched: [],
      skipped: [],
      failed: [],
    }
  }

  await markCandidatesResearching(db, triage, observedAt)

  const reuseRows = triage
    .filter((decision) => decision.depth === 'reuse_prior')
    .map((decision) => buildReusePriorRow(decision, observedAt, options))
  const structureRows = triage
    .filter((decision) => decision.depth === 'market_structure_only')
    .map((decision) => buildMarketStructureRow(decision, observedAt, options))
  const deepDecisions = triage.filter((decision) => decision.depth === 'deep_web')
  const attempt = await researchDeepWebCandidates(deepDecisions, priorResearch, options)
  const hermesRows = buildHermesResearchRows(deepDecisions, attempt.results, observedAt, options)
  const allRows = [...reuseRows, ...structureRows, ...hermesRows]
  const successfulIds = await insertResearchRows(db, allRows)
  const failed = deepDecisions
    .map((decision) => decision.candidate)
    .filter((candidate) => !successfulIds.includes(candidate.id))
    .map((candidate) => attempt.failures.find((failure) => failure.candidate.id === candidate.id) ?? {
      candidate,
      error: 'Research reflection loop did not return a valid result for this candidate.',
    })

  await updateSuccessfulCandidates(db, successfulIds, observedAt)
  for (const failure of failed) {
    await updateFailedCandidate(db, failure, observedAt, options)
  }

  return {
    observedAt,
    backend: options.backend,
    pendingFetched: candidates.length,
    eligibleForResearch: triage.length,
    skippedRecentlyResearched: 0,
    retriedFailedCandidates: candidates.filter((candidate) => candidate.status === 'research_failed').length,
    reusedPriorResearch: reuseRows.length,
    marketStructureOnly: structureRows.length,
    deepWebResearched: hermesRows.length,
    researchRowsWritten: successfulIds.length,
    candidatesMarkedResearched: successfulIds.length,
    candidatesMarkedFailed: failed.length,
    researched: triage.flatMap((decision) => {
      const candidate = decision.candidate
      const row = allRows.find((item) => item.candidate_id === candidate.id)
      if (!row || !successfulIds.includes(candidate.id)) return []
      return [{
        candidateId: candidate.id,
        slug: candidate.slug,
        researchMode: row.research_mode,
        summary: row.summary,
      }]
    }),
    skipped: [],
    failed: failed.map((failure) => ({
      candidateId: failure.candidate.id,
      slug: failure.candidate.slug,
      error: failure.error,
    })),
  }
}

export const __testing = {
  buildMarketStructureRow,
  buildReusePriorRow,
  candidateObservedAfter,
  classifyResearchDepth,
  clusterKeyForCandidate,
  defaultLast30DaysScriptPath,
  errorKind,
  fallbackEvidenceReview,
  finalizeReviewForRound,
  followUpBrief,
  last30DaysPlanPayload,
  last30DaysToResearchResult,
  normalizeEvidenceReview,
  normalizeReflectionPlan,
  primaryFamilyKey,
  recentPrior,
  retryCount,
  titleFamilyKey,
  triageCandidates,
}
