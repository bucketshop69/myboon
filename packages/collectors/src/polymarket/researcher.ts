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

export interface PolymarketResearcherOptions {
  now?: string
  batchSize?: number
  slugCooldownMinutes?: number
  backend?: 'hermes_cli'
  hermesCommand?: string
  hermesToolsets?: string
  hermesTimeoutMs?: number
}

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
}

interface PriorResearch {
  candidate_id: string
  slug: string
  research_mode: string
  summary: string
  key_findings: unknown
  evidence_links: unknown
  related_context: unknown
  uncertainty: string
  editor_notes: string
  researched_at: string
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
}

interface HermesResearchResponse {
  results: HermesResearchResult[]
}

export interface PolymarketResearcherResult {
  observedAt: string
  backend: string
  pendingFetched: number
  eligibleForResearch: number
  skippedRecentlyResearched: number
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

function selectedBackend(partial?: 'hermes_cli'): 'hermes_cli' {
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
    backend: selectedBackend(partial.backend),
    hermesCommand: partial.hermesCommand ?? process.env.POLYMARKET_RESEARCHER_HERMES_COMMAND ?? 'hermes',
    hermesToolsets: partial.hermesToolsets ?? process.env.POLYMARKET_RESEARCHER_HERMES_TOOLSETS ?? '',
    hermesTimeoutMs: partial.hermesTimeoutMs ?? envNumber('POLYMARKET_RESEARCHER_HERMES_TIMEOUT_MS', DEFAULT_HERMES_TIMEOUT_MS),
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
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

async function fetchPendingCandidates(db: SupabaseClient, batchSize: number): Promise<PendingCandidate[]> {
  const { data, error } = await db
    .from('polymarket_market_candidates')
    .select('id, source, area, candidate_type, market_id, slug, title, tag_slug, tag_label, observed_at, what_changed, why_flagged, score, score_breakdown, metrics, evidence_refs, status')
    .eq('source', SOURCE)
    .eq('area', AREA)
    .eq('status', 'pending_research')
    .order('score', { ascending: false })
    .order('observed_at', { ascending: true })
    .limit(batchSize)

  if (error) throw new Error(`pending candidate fetch failed: ${error.message}`)
  return (data ?? []) as PendingCandidate[]
}

async function fetchRecentResearch(db: SupabaseClient, slugs: string[]): Promise<Map<string, PriorResearch[]>> {
  const bySlug = new Map<string, PriorResearch[]>()
  if (slugs.length === 0) return bySlug

  const { data, error } = await db
    .from('polymarket_market_candidate_research')
    .select('candidate_id, slug, research_mode, summary, key_findings, evidence_links, related_context, uncertainty, editor_notes, researched_at')
    .in('slug', slugs)
    .order('researched_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`prior research fetch failed: ${error.message}`)
  for (const row of data ?? []) {
    const research = row as PriorResearch
    const rows = bySlug.get(research.slug) ?? []
    rows.push(research)
    bySlug.set(research.slug, rows)
  }
  return bySlug
}

function isRecentlyResearched(candidate: PendingCandidate, priorResearch: Map<string, PriorResearch[]>, nowMs: number, cooldownMinutes: number): boolean {
  const latest = priorResearch.get(candidate.slug)?.[0]
  if (!latest) return false
  const ageMs = nowMs - new Date(latest.researched_at).getTime()
  return ageMs >= 0 && ageMs < cooldownMinutes * 60 * 1000
}

async function updateCandidateStatus(
  db: SupabaseClient,
  ids: string[],
  status: CandidateStatus,
  observedAt: string,
  researchError?: string | null
): Promise<void> {
  if (ids.length === 0) return
  const payload: Record<string, string | null> = {
    status,
    updated_at: observedAt,
    research_attempted_at: observedAt,
  }
  if (researchError !== undefined) payload.research_error = researchError

  const { error } = await db
    .from('polymarket_market_candidates')
    .update(payload)
    .in('id', ids)

  if (error) throw new Error(`candidate status update failed: ${error.message}`)
}

async function loadStablePrompt(): Promise<string> {
  return readFile(join(__dirname, 'researcher-prompt.md'), 'utf8')
}

function buildHermesPrompt(candidates: PendingCandidate[], priorResearch: Map<string, PriorResearch[]>): string {
  const priorBySlug = Object.fromEntries(
    candidates.map((candidate) => [
      candidate.slug,
      (priorResearch.get(candidate.slug) ?? []).slice(0, 3),
    ])
  )

  const payload = {
    candidates: candidates.map((candidate) => ({
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
  }
}

async function insertResearchRows(
  db: SupabaseClient,
  candidates: PendingCandidate[],
  results: Map<string, HermesResearchResult>,
  observedAt: string
): Promise<string[]> {
  const rows = candidates.flatMap((candidate) => {
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
    }]
  })

  if (rows.length === 0) return []

  const { error } = await db
    .from('polymarket_market_candidate_research')
    .upsert(rows, { onConflict: 'candidate_id' })

  if (error) throw new Error(`research row insert failed: ${error.message}`)
  return rows.map((row) => row.candidate_id)
}

export async function runPolymarketResearcher(
  db: SupabaseClient,
  partialOptions: PolymarketResearcherOptions = {}
): Promise<PolymarketResearcherResult> {
  const options = selectedOptions(partialOptions)
  const observedAt = options.now
  const nowMs = new Date(observedAt).getTime()

  const candidates = await fetchPendingCandidates(db, options.batchSize)
  const priorResearch = await fetchRecentResearch(db, [...new Set(candidates.map((candidate) => candidate.slug))])

  const skipped = candidates.filter((candidate) => isRecentlyResearched(candidate, priorResearch, nowMs, options.slugCooldownMinutes))
  const eligible = candidates.filter((candidate) => !skipped.includes(candidate))

  await updateCandidateStatus(db, skipped.map((candidate) => candidate.id), 'skipped_recently_researched', observedAt)

  if (eligible.length === 0) {
    return {
      observedAt,
      backend: options.backend,
      pendingFetched: candidates.length,
      eligibleForResearch: 0,
      skippedRecentlyResearched: skipped.length,
      researchRowsWritten: 0,
      candidatesMarkedResearched: 0,
      candidatesMarkedFailed: 0,
      researched: [],
      skipped: skipped.map((candidate) => ({
        candidateId: candidate.id,
        slug: candidate.slug,
        reason: 'recently_researched',
      })),
      failed: [],
    }
  }

  await updateCandidateStatus(db, eligible.map((candidate) => candidate.id), 'researching', observedAt)

  let response: HermesResearchResponse
  try {
    response = await runHermesResearch(buildHermesPrompt(eligible, priorResearch), options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateCandidateStatus(db, eligible.map((candidate) => candidate.id), 'research_failed', observedAt, message.slice(0, 2000))
    return {
      observedAt,
      backend: options.backend,
      pendingFetched: candidates.length,
      eligibleForResearch: eligible.length,
      skippedRecentlyResearched: skipped.length,
      researchRowsWritten: 0,
      candidatesMarkedResearched: 0,
      candidatesMarkedFailed: eligible.length,
      researched: [],
      skipped: skipped.map((candidate) => ({ candidateId: candidate.id, slug: candidate.slug, reason: 'recently_researched' })),
      failed: eligible.map((candidate) => ({ candidateId: candidate.id, slug: candidate.slug, error: message })),
    }
  }

  const normalizedResults = new Map(
    response.results
      .map(normalizeResearchResult)
      .filter((result) => result.candidate_id && result.summary)
      .map((result) => [result.candidate_id, result])
  )
  const successfulIds = await insertResearchRows(db, eligible, normalizedResults, observedAt)
  const failed = eligible.filter((candidate) => !successfulIds.includes(candidate.id))

  await updateCandidateStatus(db, successfulIds, 'researched', observedAt, null)
  await updateCandidateStatus(
    db,
    failed.map((candidate) => candidate.id),
    'research_failed',
    observedAt,
    'Hermes did not return a valid research result for this candidate.'
  )

  return {
    observedAt,
    backend: options.backend,
    pendingFetched: candidates.length,
    eligibleForResearch: eligible.length,
    skippedRecentlyResearched: skipped.length,
    researchRowsWritten: successfulIds.length,
    candidatesMarkedResearched: successfulIds.length,
    candidatesMarkedFailed: failed.length,
    researched: eligible.flatMap((candidate) => {
      const result = normalizedResults.get(candidate.id)
      if (!result || !successfulIds.includes(candidate.id)) return []
      return [{
        candidateId: candidate.id,
        slug: candidate.slug,
        researchMode: result.research_mode,
        summary: result.summary,
      }]
    }),
    skipped: skipped.map((candidate) => ({ candidateId: candidate.id, slug: candidate.slug, reason: 'recently_researched' })),
    failed: failed.map((candidate) => ({
      candidateId: candidate.id,
      slug: candidate.slug,
      error: 'Hermes did not return a valid research result for this candidate.',
    })),
  }
}
