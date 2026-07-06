import type {
  NewsScoutCandidate,
  NewsScoutRequest,
  NewsScoutResponse,
  NewsSourceConfig,
  NewsSourceUrlConfig,
} from './types'

const SCOUT_REQUEST_SCHEMA = 'myboon.hermes.scout_request.v1'
const SCOUT_RESPONSE_SCHEMA = 'myboon.hermes.scout_response.v1'

export interface ExpectedScoutResponse {
  jobId: string
  sourceId: string
  urlId: string
}

export function buildScoutRequest(
  source: NewsSourceConfig,
  sourceUrl: NewsSourceUrlConfig,
  now = new Date()
): NewsScoutRequest {
  const requestedAt = now.toISOString()
  return {
    schema_version: SCOUT_REQUEST_SCHEMA,
    job_id: `news_scout_${source.sourceId}_${sourceUrl.urlId}_${now.getTime()}`,
    task: {
      type: 'source_scout',
    },
    source: {
      source_id: source.sourceId,
      name: source.sourceName,
      source_type: source.sourceType,
      status: source.status,
    },
    source_url: {
      url_id: sourceUrl.urlId,
      label: sourceUrl.label,
      url: sourceUrl.url,
      status: sourceUrl.status,
    },
    requested_at: requestedAt,
    response_rules: {
      return_json_only: true,
      do_not_publish: true,
      do_not_make_trade_recommendations: true,
    },
  }
}

export function buildScoutPrompt(request: NewsScoutRequest): string {
  return [
    'You are the myboon source scout worker.',
    '',
    'Task:',
    'Inspect the provided curated news source URL with browser-backed tools and',
    'return candidate news signals for myboon.',
    '',
    'Rules:',
    '- Return JSON only.',
    '- Avoid prose outside JSON whenever possible.',
    '- Do not publish.',
    '- Do not give trade recommendations.',
    '- Do not score, rank, judge, or filter candidates.',
    '- Do not invent URLs, timestamps, summaries, or entities.',
    '- Prefer structured page text, links, metadata, and visible article cards.',
    '- Use screenshots only as fallback context, never as the only evidence when URL/text exists.',
    '',
    'Request JSON:',
    JSON.stringify(request, null, 2),
    '',
    'Return schema:',
    JSON.stringify(exampleScoutResponse(request), null, 2),
  ].join('\n')
}

export function parseScoutResponse(
  stdout: string,
  expected: ExpectedScoutResponse
): NewsScoutResponse {
  const parsed = extractJsonObject(stdout)

  if (!isRecord(parsed)) throw new Error('Scout response must be a JSON object')
  if (parsed.schema_version !== SCOUT_RESPONSE_SCHEMA) {
    throw new Error(`Scout response schema_version must be ${SCOUT_RESPONSE_SCHEMA}`)
  }
  if (parsed.job_id !== expected.jobId) throw new Error('Scout response job_id did not match request')
  if (parsed.source_id !== expected.sourceId) throw new Error('Scout response source_id did not match request')
  if (parsed.url_id !== expected.urlId) throw new Error('Scout response url_id did not match request')
  if (!isScoutStatus(parsed.status)) throw new Error('Scout response status is invalid')
  if (!isRecord(parsed.source_observed)) throw new Error('Scout response missing source_observed')
  validateSourceObserved(parsed.source_observed, expected)
  if (!Array.isArray(parsed.candidates)) throw new Error('Scout response candidates must be an array')
  parsed.candidates.forEach(validateCandidate)
  if (!Array.isArray(parsed.errors) || !parsed.errors.every((error) => typeof error === 'string')) {
    throw new Error('Scout response errors must be a string array')
  }

  return parsed as unknown as NewsScoutResponse
}

function exampleScoutResponse(request: NewsScoutRequest): NewsScoutResponse {
  return {
    schema_version: SCOUT_RESPONSE_SCHEMA,
    job_id: request.job_id,
    source_id: request.source.source_id,
    url_id: request.source_url.url_id,
    status: 'success',
    source_observed: {
      url: request.source_url.url,
      observed_at: request.requested_at,
      access_method: 'browser',
      access_status: 'ok',
    },
    candidates: [{
      headline: 'Article headline exactly as observed',
      article_url: 'https://example.com/article',
      summary: 'Brief factual summary from the source page.',
      published_at: request.requested_at,
      observed_at: request.requested_at,
      author: 'Observed author if visible',
      section: 'Observed section if visible',
      evidence: ['Visible article card, link, or metadata used for this observation'],
    }],
    errors: [],
  }
}

function validateSourceObserved(
  sourceObserved: Record<string, unknown>,
  _expected: ExpectedScoutResponse
): void {
  for (const key of ['url', 'observed_at']) {
    if (typeof sourceObserved[key] !== 'string' || !sourceObserved[key]) {
      throw new Error(`Scout response source_observed.${key} must be a non-empty string`)
    }
  }
  for (const key of ['access_method', 'access_status']) {
    if (sourceObserved[key] != null && typeof sourceObserved[key] !== 'string') {
      throw new Error(`Scout response source_observed.${key} must be a string when present`)
    }
  }
}

function validateCandidate(candidate: unknown, index: number): void {
  if (!isRecord(candidate)) throw new Error(`Scout response candidate ${index} must be an object`)
  if (typeof candidate.headline !== 'string' || !candidate.headline.trim()) {
    throw new Error(`Scout response candidate ${index} missing headline`)
  }
  if (typeof candidate.article_url !== 'string' || !candidate.article_url.trim()) {
    throw new Error(`Scout response candidate ${index} missing article_url`)
  }
  if (candidate.evidence != null && (
    !Array.isArray(candidate.evidence)
    || !candidate.evidence.every((item) => typeof item === 'string')
  )) {
    throw new Error(`Scout response candidate ${index} evidence must be a string array when present`)
  }
}

function extractJsonObject(stdout: string): unknown {
  let sawObjectCandidate = false
  let firstParsedObject: Record<string, unknown> | null = null

  for (let start = 0; start < stdout.length; start += 1) {
    if (stdout[start] !== '{') continue
    sawObjectCandidate = true

    const end = findJsonObjectEnd(stdout, start)
    if (end == null) continue

    try {
      const parsed = JSON.parse(stdout.slice(start, end + 1))
      if (isRecord(parsed)) {
        if (!firstParsedObject) firstParsedObject = parsed
        if (parsed.schema_version === SCOUT_RESPONSE_SCHEMA) return parsed
      }
    } catch {
      // Keep scanning; Hermes can print prose containing braces before the response.
    }
  }

  if (firstParsedObject) return firstParsedObject
  if (sawObjectCandidate) throw new Error('Scout response did not contain a valid JSON object')
  throw new Error('Scout response did not contain a JSON object')
}

function findJsonObjectEnd(text: string, start: number): number | null {
  let depth = 0
  let inString = false
  let escape = false

  for (let index = start; index < text.length; index += 1) {
    const ch = text[index]
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

    if (ch === '{') depth += 1
    if (ch === '}') depth -= 1
    if (depth === 0) return index
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isScoutStatus(value: unknown): value is NewsScoutResponse['status'] {
  return value === 'success' || value === 'partial' || value === 'failed'
}

export const __testing = {
  SCOUT_REQUEST_SCHEMA,
  SCOUT_RESPONSE_SCHEMA,
  extractJsonObject,
}
