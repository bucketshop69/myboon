import type { SupabaseClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SOURCE = 'polymarket'
const AREA = 'markets'
const DEFAULT_EDITOR_TIMEOUT_MS = 10 * 60 * 1000

type ResearchStatus =
  | 'pending_editor'
  | 'editing'
  | 'edited'
  | 'rejected'
  | 'needs_more_research'
  | 'published'

type EditorDecisionValue = 'publish' | 'reject' | 'needs_more_research'
type EditorDecisionStatus = 'pending_publisher' | 'rejected' | 'needs_more_research'
type EvidenceQuality = 'strong' | 'medium' | 'weak'
type TopicConfidence = 'high' | 'medium' | 'low'

export interface PolymarketEditorOptions {
  now?: string
  batchSize?: number
  recentDecisionLimit?: number
  backend?: 'cli_agent'
  editorCommand?: string
  editorToolsets?: string
  editorTimeoutMs?: number
}

interface PendingResearchRow {
  id: string
  candidate_id: string
  source: string
  area: string
  slug: string
  title: string
  candidate_type: string
  research_mode: string
  summary: string
  notes: string
  key_findings: unknown
  evidence_links: unknown
  related_context: unknown
  uncertainty: string
  editor_notes: string
  status: ResearchStatus
  researched_at: string
}

interface RecentEditorDecision {
  id: string
  decision: EditorDecisionValue
  status: string
  angle: string | null
  why_this_matters: string | null
  reasoning: string
  reason_codes: unknown
  evidence_quality: EvidenceQuality
  primary_topic: string | null
  related_topics: unknown
  research_ids: unknown
  created_at: string
}

interface AgentEditorDecision {
  research_ids: unknown
  decision: string
  angle?: unknown
  why_this_matters?: unknown
  reasoning?: unknown
  reason_codes?: unknown
  evidence_quality?: unknown
  primary_topic?: unknown
  related_topics?: unknown
  topic_confidence?: unknown
  publisher_notes?: unknown
  follow_up_questions?: unknown
  research_instructions?: unknown
}

interface AgentEditorResponse {
  decisions: AgentEditorDecision[]
}

interface NormalizedEditorDecision {
  research_ids: string[]
  decision: EditorDecisionValue
  status: EditorDecisionStatus
  angle: string | null
  why_this_matters: string | null
  reasoning: string
  reason_codes: string[]
  evidence_quality: EvidenceQuality
  primary_topic: string | null
  related_topics: string[]
  topic_confidence: TopicConfidence | null
  publisher_notes: string | null
  follow_up_questions: string[]
  research_instructions: string | null
}

interface InsertedEditorDecision {
  id: string
  research_ids: unknown
  decision: EditorDecisionValue
  status: EditorDecisionStatus
  angle: string | null
}

export interface PolymarketEditorResult {
  observedAt: string
  backend: string
  pendingFetched: number
  decisionsWritten: number
  researchRowsEdited: number
  researchRowsRejected: number
  researchRowsNeedsMoreResearch: number
  decisions: Array<{
    id: string
    decision: EditorDecisionValue
    status: EditorDecisionStatus
    researchIds: string[]
    angle: string | null
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

function selectedBackend(partial?: 'cli_agent'): 'cli_agent' {
  const envBackend = process.env.POLYMARKET_EDITOR_BACKEND
  const backend = partial ?? envBackend ?? 'cli_agent'
  if (backend !== 'cli_agent') throw new Error(`Unsupported Polymarket editor backend: ${backend}`)
  return backend
}

function selectedOptions(partial: PolymarketEditorOptions): Required<PolymarketEditorOptions> {
  return {
    now: partial.now ?? new Date().toISOString(),
    batchSize: partial.batchSize ?? envNumber('POLYMARKET_EDITOR_BATCH_SIZE', 20),
    recentDecisionLimit: partial.recentDecisionLimit ?? envNumber('POLYMARKET_EDITOR_RECENT_DECISION_LIMIT', 30),
    backend: selectedBackend(partial.backend),
    editorCommand: partial.editorCommand ?? envString('POLYMARKET_EDITOR_COMMAND', 'hermes'),
    editorToolsets: partial.editorToolsets ?? envString('POLYMARKET_EDITOR_TOOLSETS', 'web'),
    editorTimeoutMs: partial.editorTimeoutMs ?? envNumber('POLYMARKET_EDITOR_TIMEOUT_MS', DEFAULT_EDITOR_TIMEOUT_MS),
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim()
  return text ? text : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asString(item).trim())
    .filter(Boolean)
}

function normalizeEvidenceQuality(value: unknown): EvidenceQuality {
  const normalized = asString(value).toLowerCase().trim()
  if (normalized === 'strong' || normalized === 'medium' || normalized === 'weak') return normalized
  return 'weak'
}

function normalizeTopicConfidence(value: unknown): TopicConfidence | null {
  const normalized = asString(value).toLowerCase().trim()
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized
  return null
}

function normalizeDecision(value: unknown): EditorDecisionValue {
  const normalized = asString(value).toLowerCase().trim()
  if (normalized === 'publish' || normalized === 'reject' || normalized === 'needs_more_research') return normalized
  return 'reject'
}

function statusForDecision(decision: EditorDecisionValue): EditorDecisionStatus {
  if (decision === 'publish') return 'pending_publisher'
  if (decision === 'needs_more_research') return 'needs_more_research'
  return 'rejected'
}

function researchStatusForDecision(decision: EditorDecisionValue): ResearchStatus {
  if (decision === 'publish') return 'edited'
  if (decision === 'needs_more_research') return 'needs_more_research'
  return 'rejected'
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

async function fetchPendingResearch(db: SupabaseClient, batchSize: number): Promise<PendingResearchRow[]> {
  const { data, error } = await db
    .from('polymarket_market_candidate_research')
    .select('id, candidate_id, source, area, slug, title, candidate_type, research_mode, summary, notes, key_findings, evidence_links, related_context, uncertainty, editor_notes, status, researched_at')
    .eq('source', SOURCE)
    .eq('area', AREA)
    .eq('status', 'pending_editor')
    .order('researched_at', { ascending: true })
    .limit(batchSize)

  if (error) throw new Error(`pending editor research fetch failed: ${error.message}`)
  return (data ?? []) as PendingResearchRow[]
}

async function fetchRecentDecisions(db: SupabaseClient, limit: number): Promise<RecentEditorDecision[]> {
  const { data, error } = await db
    .from('polymarket_market_editor_decisions')
    .select('id, decision, status, angle, why_this_matters, reasoning, reason_codes, evidence_quality, primary_topic, related_topics, research_ids, created_at')
    .eq('source', SOURCE)
    .eq('area', AREA)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`recent editor decision fetch failed: ${error.message}`)
  return (data ?? []) as RecentEditorDecision[]
}

async function updateResearchStatus(
  db: SupabaseClient,
  ids: string[],
  status: ResearchStatus,
  observedAt: string
): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db
    .from('polymarket_market_candidate_research')
    .update({ status, updated_at: observedAt })
    .in('id', ids)

  if (error) throw new Error(`research status update failed: ${error.message}`)
}

async function loadStablePrompt(): Promise<string> {
  return readFile(join(__dirname, 'editor-prompt.md'), 'utf8')
}

function buildEditorPrompt(researchRows: PendingResearchRow[], recentDecisions: RecentEditorDecision[]): string {
  const payload = {
    research_rows: researchRows.map((row) => ({
      id: row.id,
      candidate_id: row.candidate_id,
      slug: row.slug,
      title: row.title,
      candidate_type: row.candidate_type,
      research_mode: row.research_mode,
      summary: row.summary,
      notes: row.notes,
      key_findings: row.key_findings,
      evidence_links: row.evidence_links,
      related_context: row.related_context,
      uncertainty: row.uncertainty,
      researcher_editor_notes: row.editor_notes,
      researched_at: row.researched_at,
    })),
    recent_editor_decisions: recentDecisions.map((decision) => ({
      id: decision.id,
      decision: decision.decision,
      status: decision.status,
      angle: decision.angle,
      why_this_matters: decision.why_this_matters,
      reasoning: decision.reasoning,
      reason_codes: decision.reason_codes,
      evidence_quality: decision.evidence_quality,
      primary_topic: decision.primary_topic,
      related_topics: decision.related_topics,
      research_ids: decision.research_ids,
      created_at: decision.created_at,
    })),
  }

  return [
    '## Stable Instructions',
    '{{STABLE_PROMPT}}',
    '',
    '## Dynamic Editor Batch',
    'Review the following Polymarket research rows.',
    '',
    'Group rows when that produces a better editorial decision. Return one decision per group or standalone row.',
    '',
    'Return strict JSON in this exact shape:',
    JSON.stringify({
      decisions: [
        {
          research_ids: ['research uuid'],
          decision: 'publish | reject | needs_more_research',
          angle: 'editorial thesis for publisher, not final copy',
          why_this_matters: 'why this is useful now',
          reasoning: 'plain-language decision reasoning',
          reason_codes: ['open_ended_code'],
          evidence_quality: 'strong | medium | weak',
          primary_topic: 'topic or null',
          related_topics: ['topic'],
          topic_confidence: 'high | medium | low',
          publisher_notes: 'what publisher should preserve or avoid',
          follow_up_questions: [],
          research_instructions: '',
        },
      ],
    }, null, 2),
    '',
    'Batch payload:',
    JSON.stringify(payload, null, 2),
  ].join('\n')
}

async function runEditorAgent(prompt: string, options: Required<PolymarketEditorOptions>): Promise<AgentEditorResponse> {
  const stablePrompt = await loadStablePrompt()
  const fullPrompt = prompt.replace('{{STABLE_PROMPT}}', stablePrompt)
  const args = options.editorToolsets
    ? ['-t', options.editorToolsets, '-z', fullPrompt]
    : ['-z', fullPrompt]
  const { stdout, stderr } = await execFileAsync(
    options.editorCommand,
    args,
    {
      timeout: options.editorTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    }
  )

  const parsed = extractJson<AgentEditorResponse>(stdout)
  if (!parsed || !Array.isArray(parsed.decisions)) {
    throw new Error(`Editor returned invalid JSON. stderr=${stderr.slice(0, 500)} stdout=${stdout.slice(0, 1000)}`)
  }

  return parsed
}

function normalizeEditorDecision(decision: AgentEditorDecision, validResearchIds: Set<string>): NormalizedEditorDecision | null {
  const researchIds = asStringArray(decision.research_ids)
    .filter((id, index, ids) => validResearchIds.has(id) && ids.indexOf(id) === index)
  if (researchIds.length === 0) return null

  const normalizedDecision = normalizeDecision(decision.decision)
  const reasoning = asString(decision.reasoning).trim()

  return {
    research_ids: researchIds,
    decision: normalizedDecision,
    status: statusForDecision(normalizedDecision),
    angle: asNullableString(decision.angle),
    why_this_matters: asNullableString(decision.why_this_matters),
    reasoning: reasoning || 'Editor did not provide detailed reasoning.',
    reason_codes: asStringArray(decision.reason_codes),
    evidence_quality: normalizeEvidenceQuality(decision.evidence_quality),
    primary_topic: asNullableString(decision.primary_topic),
    related_topics: asStringArray(decision.related_topics),
    topic_confidence: normalizeTopicConfidence(decision.topic_confidence),
    publisher_notes: asNullableString(decision.publisher_notes),
    follow_up_questions: asStringArray(decision.follow_up_questions),
    research_instructions: asNullableString(decision.research_instructions),
  }
}

function addFallbackDecisions(
  decisions: NormalizedEditorDecision[],
  pendingRows: PendingResearchRow[]
): NormalizedEditorDecision[] {
  const covered = new Set(decisions.flatMap((decision) => decision.research_ids))
  const fallback = pendingRows
    .filter((row) => !covered.has(row.id))
    .map((row): NormalizedEditorDecision => ({
      research_ids: [row.id],
      decision: 'needs_more_research',
      status: 'needs_more_research',
      angle: null,
      why_this_matters: null,
      reasoning: 'Editor did not return a decision for this research row.',
      reason_codes: ['missing_editor_decision'],
      evidence_quality: 'weak',
      primary_topic: null,
      related_topics: [],
      topic_confidence: null,
      publisher_notes: null,
      follow_up_questions: ['Why was this row omitted from the editor decision batch?'],
      research_instructions: 'Review the omitted row and provide enough context for an editor decision.',
    }))

  return [...decisions, ...fallback]
}

function assignResearchRowsOnce(
  decisions: NormalizedEditorDecision[],
  pendingRows: PendingResearchRow[]
): NormalizedEditorDecision[] {
  const assigned = new Set<string>()
  const unique = decisions.flatMap((decision) => {
    const researchIds = decision.research_ids.filter((id) => {
      if (assigned.has(id)) return false
      assigned.add(id)
      return true
    })
    if (researchIds.length === 0) return []
    return [{ ...decision, research_ids: researchIds }]
  })

  return addFallbackDecisions(unique, pendingRows)
}

async function insertEditorDecisions(
  db: SupabaseClient,
  decisions: NormalizedEditorDecision[],
  observedAt: string
): Promise<InsertedEditorDecision[]> {
  if (decisions.length === 0) return []
  const rows = decisions.map((decision) => ({
    source: SOURCE,
    area: AREA,
    research_ids: decision.research_ids,
    decision: decision.decision,
    status: decision.status,
    angle: decision.angle,
    why_this_matters: decision.why_this_matters,
    reasoning: decision.reasoning,
    reason_codes: decision.reason_codes,
    evidence_quality: decision.evidence_quality,
    primary_topic: decision.primary_topic,
    related_topics: decision.related_topics,
    topic_confidence: decision.topic_confidence,
    publisher_notes: decision.publisher_notes,
    follow_up_questions: decision.follow_up_questions,
    research_instructions: decision.research_instructions,
    created_at: observedAt,
    updated_at: observedAt,
  }))

  const { data, error } = await db
    .from('polymarket_market_editor_decisions')
    .insert(rows)
    .select('id, research_ids, decision, status, angle')

  if (error) throw new Error(`editor decision insert failed: ${error.message}`)
  return (data ?? []) as InsertedEditorDecision[]
}

async function updateResearchRowsForDecisions(
  db: SupabaseClient,
  decisions: NormalizedEditorDecision[],
  observedAt: string
): Promise<void> {
  for (const decision of decisions) {
    await updateResearchStatus(db, decision.research_ids, researchStatusForDecision(decision.decision), observedAt)
  }
}

export async function runPolymarketEditor(
  db: SupabaseClient,
  partialOptions: PolymarketEditorOptions = {}
): Promise<PolymarketEditorResult> {
  const options = selectedOptions(partialOptions)
  const observedAt = options.now

  const pendingResearch = await fetchPendingResearch(db, options.batchSize)
  if (pendingResearch.length === 0) {
    return {
      observedAt,
      backend: options.backend,
      pendingFetched: 0,
      decisionsWritten: 0,
      researchRowsEdited: 0,
      researchRowsRejected: 0,
      researchRowsNeedsMoreResearch: 0,
      decisions: [],
    }
  }

  await updateResearchStatus(db, pendingResearch.map((row) => row.id), 'editing', observedAt)

  let decisions: NormalizedEditorDecision[]
  let inserted: InsertedEditorDecision[]
  try {
    const recentDecisions = await fetchRecentDecisions(db, options.recentDecisionLimit)
    const response = await runEditorAgent(buildEditorPrompt(pendingResearch, recentDecisions), options)
    const validResearchIds = new Set(pendingResearch.map((row) => row.id))
    const normalized = response.decisions
      .map((decision) => normalizeEditorDecision(decision, validResearchIds))
      .filter((decision): decision is NormalizedEditorDecision => Boolean(decision))
    decisions = assignResearchRowsOnce(normalized, pendingResearch)
    inserted = await insertEditorDecisions(db, decisions, observedAt)
    await updateResearchRowsForDecisions(db, decisions, observedAt)
  } catch (error) {
    await updateResearchStatus(db, pendingResearch.map((row) => row.id), 'pending_editor', observedAt)
    throw error
  }

  return {
    observedAt,
    backend: options.backend,
    pendingFetched: pendingResearch.length,
    decisionsWritten: inserted.length,
    researchRowsEdited: decisions
      .filter((decision) => decision.decision === 'publish')
      .reduce((total, decision) => total + decision.research_ids.length, 0),
    researchRowsRejected: decisions
      .filter((decision) => decision.decision === 'reject')
      .reduce((total, decision) => total + decision.research_ids.length, 0),
    researchRowsNeedsMoreResearch: decisions
      .filter((decision) => decision.decision === 'needs_more_research')
      .reduce((total, decision) => total + decision.research_ids.length, 0),
    decisions: inserted.map((decision) => ({
      id: decision.id,
      decision: decision.decision,
      status: decision.status,
      researchIds: asStringArray(decision.research_ids),
      angle: decision.angle,
    })),
  }
}
