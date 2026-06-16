import type { SupabaseClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SOURCE = 'polymarket'
const AREA = 'markets'
const ONE_HOUR_MS = 60 * 60 * 1000
const DEFAULT_HERMES_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_RETRY_WINDOW_MINUTES = 4 * 60
const DEFAULT_MAX_RETRY_COUNT = 2
const DEFAULT_STRUCTURE_ONLY_SCORE_MAX = 55
const DEFAULT_THIN_VOLUME_24H_MAX = 1_000
const DEFAULT_THIN_LIQUIDITY_MAX = 1_000

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
  hermesToolsets?: string
  hermesTimeoutMs?: number
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

interface HermesResearchResponse {
  results: HermesResearchResult[]
}

interface ResearchFailure {
  candidate: PendingCandidate
  error: string
}

interface ResearchAttempt {
  results: Map<string, HermesResearchResult>
  failures: ResearchFailure[]
}

interface TriageDecision {
  candidate: PendingCandidate
  depth: ResearchDepth
  familyKey: string
  clusterKey: string
  prior?: PriorResearch
  reason: string
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

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? parsed : fallback
}

function envString(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value ? value : fallback
}

function selectedBackend(partial?: ResearchBackend): ResearchBackend {
  const envBackend = process.env.POLYMARKET_RESEARCHER_BACKEND
  const backend = partial ?? envBackend ?? 'hermes_cli'
  if (backend !== 'hermes_cli') throw new Error(`Unsupported Polymarket researcher backend: ${backend}`)
  return backend
}

function selectedOptions(partial: PolymarketResearcherOptions): Required<PolymarketResearcherOptions> {
  return {
    now: partial.now ?? new Date().toISOString(),
    batchSize: partial.batchSize ?? envNumber('POLYMARKET_RESEARCHER_BATCH_SIZE', 20),
    slugCooldownMinutes: partial.slugCooldownMinutes ?? envNumber('POLYMARKET_RESEARCHER_SLUG_COOLDOWN_MINUTES', 60),
    retryWindowMinutes: partial.retryWindowMinutes ?? envNumber('POLYMARKET_RESEARCHER_RETRY_WINDOW_MINUTES', DEFAULT_RETRY_WINDOW_MINUTES),
    maxRetryCount: partial.maxRetryCount ?? envNumber('POLYMARKET_RESEARCHER_MAX_RETRY_COUNT', DEFAULT_MAX_RETRY_COUNT),
    structureOnlyScoreMax: partial.structureOnlyScoreMax ?? envNumber('POLYMARKET_RESEARCHER_STRUCTURE_ONLY_SCORE_MAX', DEFAULT_STRUCTURE_ONLY_SCORE_MAX),
    thinVolume24hMax: partial.thinVolume24hMax ?? envNumber('POLYMARKET_RESEARCHER_THIN_VOLUME_24H_MAX', DEFAULT_THIN_VOLUME_24H_MAX),
    thinLiquidityMax: partial.thinLiquidityMax ?? envNumber('POLYMARKET_RESEARCHER_THIN_LIQUIDITY_MAX', DEFAULT_THIN_LIQUIDITY_MAX),
    backend: selectedBackend(partial.backend),
    researchModel: partial.researchModel ?? envString('POLYMARKET_RESEARCHER_MODEL', 'hermes_cli'),
    hermesCommand: partial.hermesCommand ?? envString('POLYMARKET_RESEARCHER_HERMES_COMMAND', 'hermes'),
    hermesToolsets: partial.hermesToolsets ?? envString('POLYMARKET_RESEARCHER_HERMES_TOOLSETS', 'web'),
    hermesTimeoutMs: partial.hermesTimeoutMs ?? envNumber('POLYMARKET_RESEARCHER_HERMES_TIMEOUT_MS', DEFAULT_HERMES_TIMEOUT_MS),
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

async function fetchResearchCandidates(
  db: SupabaseClient,
  options: Required<PolymarketResearcherOptions>
): Promise<PendingCandidate[]> {
  const { data: pendingData, error: pendingError } = await db
    .from('polymarket_market_candidates')
    .select(CANDIDATE_SELECT)
    .eq('source', SOURCE)
    .eq('area', AREA)
    .eq('status', 'pending_research')
    .order('score', { ascending: false })
    .order('observed_at', { ascending: true })
    .limit(options.batchSize)

  if (pendingError) throw new Error(`pending candidate fetch failed: ${pendingError.message}`)
  const pending = (pendingData ?? []) as unknown as PendingCandidate[]
  const remaining = options.batchSize - pending.length
  if (remaining <= 0) return pending

  const { data: retryData, error: retryError } = await db
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

async function loadStablePrompt(): Promise<string> {
  return readFile(join(__dirname, 'researcher-prompt.md'), 'utf8')
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

function buildHermesPrompt(decisions: TriageDecision[], priorResearch: { bySlug: Map<string, PriorResearch[]> }): string {
  const priorBySlug = Object.fromEntries(
    decisions.map(({ candidate }) => [
      candidate.slug,
      (priorResearch.bySlug.get(candidate.slug) ?? []).slice(0, 3),
    ])
  )

  const payload = {
    candidates: decisions.map(({ candidate, familyKey, clusterKey }) => ({
      id: candidate.id,
      candidate_type: candidate.candidate_type,
      slug: candidate.slug,
      title: candidate.title,
      research_depth: 'deep_web',
      research_family_key: familyKey,
      research_cluster_key: clusterKey,
      tag_slug: candidate.tag_slug,
      tag_label: candidate.tag_label,
      observed_at: candidate.observed_at,
      what_changed: candidate.what_changed,
      why_flagged: candidate.why_flagged,
      score: candidate.score,
      score_breakdown: candidate.score_breakdown,
      metrics: candidate.metrics,
      evidence_refs: candidate.evidence_refs,
    })),
    prior_research_by_slug: priorBySlug,
  }

  return [
    '## Stable Instructions',
    '{{STABLE_PROMPT}}',
    '',
    '## Dynamic Research Batch',
    'Research the following Polymarket market candidates.',
    '',
    'Use the batch to understand nearby context, but return one result per candidate.',
    '',
    'Return strict JSON in this exact shape:',
    JSON.stringify({
      results: [
        {
          candidate_id: 'candidate uuid',
          research_mode: 'geopolitical_risk | macro_crypto | commodity_spillover | business_event | political_churn | market_structure',
          summary: 'short editor-facing summary of what research found',
          notes: 'concise research notes; no final feed copy',
          key_findings: ['finding 1', 'finding 2'],
          evidence_links: [{ title: 'source title', url: 'https://...', note: 'why it matters' }],
          related_context: ['nearby market, asset, theme, or caveat'],
          uncertainty: 'what is unknown or weak',
          editor_notes: 'what the Editor should inspect or be careful about',
          evidence_quality: 'strong | medium | weak',
          catalyst_found: true,
          recommended_editor_action: 'publish_candidate | reject_thin | needs_more_research',
        },
      ],
    }, null, 2),
    '',
    'Batch payload:',
    JSON.stringify(payload, null, 2),
  ].join('\n')
}

async function runHermesResearch(prompt: string, options: Required<PolymarketResearcherOptions>): Promise<HermesResearchResponse> {
  const stablePrompt = await loadStablePrompt()
  const fullPrompt = prompt.replace('{{STABLE_PROMPT}}', stablePrompt)
  const args = options.hermesToolsets
    ? ['-t', options.hermesToolsets, '-z', fullPrompt]
    : ['-z', fullPrompt]
  const { stdout, stderr } = await execFileAsync(
    options.hermesCommand,
    args,
    {
      timeout: options.hermesTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    }
  )

  const parsed = extractJson<HermesResearchResponse>(stdout)
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error(`Hermes returned invalid JSON. stderr=${stderr.slice(0, 500)} stdout=${stdout.slice(0, 1000)}`)
  }

  return parsed
}

function normalizeResearchResult(result: HermesResearchResult): HermesResearchResult {
  return {
    candidate_id: asString(result.candidate_id),
    research_mode: asString(result.research_mode, 'market_structure'),
    summary: asString(result.summary),
    notes: asString(result.notes),
    key_findings: asArray(result.key_findings),
    evidence_links: asArray(result.evidence_links),
    related_context: asArray(result.related_context),
    uncertainty: asString(result.uncertainty),
    editor_notes: asString(result.editor_notes),
    evidence_quality: normalizeEvidenceQuality(result.evidence_quality),
    catalyst_found: asBoolean(result.catalyst_found),
    recommended_editor_action: normalizeRecommendedEditorAction(result.recommended_editor_action),
  }
}

function normalizeResearchResults(response: HermesResearchResponse): Map<string, HermesResearchResult> {
  return new Map(
    response.results
      .map(normalizeResearchResult)
      .filter((result) => result.candidate_id && result.summary)
      .map((result) => [result.candidate_id, result])
  )
}

async function researchSingleCandidate(
  decision: TriageDecision,
  priorResearch: { bySlug: Map<string, PriorResearch[]> },
  options: Required<PolymarketResearcherOptions>,
  reason: string
): Promise<{ result?: HermesResearchResult, failure?: ResearchFailure }> {
  try {
    const response = await runHermesResearch(buildHermesPrompt([decision], priorResearch), options)
    const result = normalizeResearchResults(response).get(decision.candidate.id)
    if (!result) {
      return {
        failure: {
          candidate: decision.candidate,
          error: `Hermes did not return a valid research result for this candidate after ${reason}.`,
        },
      }
    }
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
  decisions: TriageDecision[],
  priorResearch: { bySlug: Map<string, PriorResearch[]> },
  options: Required<PolymarketResearcherOptions>
): Promise<ResearchAttempt> {
  try {
    const response = await runHermesResearch(buildHermesPrompt(decisions, priorResearch), options)
    const results = normalizeResearchResults(response)
    const failures: ResearchFailure[] = []
    const missing = decisions.filter((decision) => !results.has(decision.candidate.id))

    for (const decision of missing) {
      const retry = await researchSingleCandidate(decision, priorResearch, options, 'missing from batch response')
      if (retry.result) results.set(decision.candidate.id, retry.result)
      if (retry.failure) failures.push(retry.failure)
    }

    return { results, failures }
  } catch (error) {
    const batchError = error instanceof Error ? error.message : String(error)
    const results = new Map<string, HermesResearchResult>()
    const failures: ResearchFailure[] = []

    for (const decision of decisions) {
      const retry = await researchSingleCandidate(decision, priorResearch, options, 'batch failure')
      if (retry.result) results.set(decision.candidate.id, retry.result)
      if (retry.failure) {
        failures.push({
          candidate: decision.candidate,
          error: `${retry.failure.error} Batch error was: ${batchError}`,
        })
      }
    }

    return { results, failures }
  }
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

async function researchDeepWebCandidates(
  decisions: TriageDecision[],
  priorResearch: { bySlug: Map<string, PriorResearch[]> },
  options: Required<PolymarketResearcherOptions>
): Promise<ResearchAttempt> {
  const results = new Map<string, HermesResearchResult>()
  const failures: ResearchFailure[] = []
  const byCluster = new Map<string, TriageDecision[]>()
  for (const decision of decisions) {
    const cluster = byCluster.get(decision.clusterKey) ?? []
    cluster.push(decision)
    byCluster.set(decision.clusterKey, cluster)
  }

  const grouped = [...byCluster.values()].sort((a, b) => b.length - a.length)
  for (const group of grouped) {
    const attempt = await researchCandidatesWithFallback(group, priorResearch, options)
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
      error: 'Hermes did not return a valid research result for this candidate.',
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
  classifyResearchDepth,
  clusterKeyForCandidate,
  errorKind,
  primaryFamilyKey,
  recentPrior,
  retryCount,
  titleFamilyKey,
  triageCandidates,
}
