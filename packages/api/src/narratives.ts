import { Hono } from 'hono'

export interface NarrativeRoutesConfig {
  supabaseUrl: string
  serviceRoleKey: string
  fetch?: typeof globalThis.fetch
}

export interface FeedItemDto {
  updateKey: string
  title: string
  summary: string
  publishedAt: string
}

export interface FeedDetailDto extends FeedItemDto {
  content: string
}

interface NarrativeRow {
  id: string
  title: string
  content_small: string
  content_full?: string
  published_at: string
}

const LIST_SELECT = 'id,title,content_small,published_at'
const DETAIL_SELECT = 'id,title,content_small,content_full,published_at'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_OFFSET = 10_000
const REQUEST_TIMEOUT_MS = 10_000

export function createNarrativeRoutes(config: NarrativeRoutesConfig): Hono {
  const app = new Hono()
  const restBaseUrl = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1`
  const fetchImpl = config.fetch ?? globalThis.fetch

  function supabaseHeaders(): Record<string, string> {
    return {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    }
  }

  async function readNarratives(params: URLSearchParams): Promise<Response> {
    const url = new URL(`${restBaseUrl}/published_narratives`)
    params.forEach((value, key) => url.searchParams.append(key, value))
    return fetchImpl(url, {
      headers: supabaseHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }

  app.get('/', async (c) => {
    const limit = boundedInteger(c.req.query('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
    const offset = boundedInteger(c.req.query('offset'), 0, 0, MAX_OFFSET)
    const params = publicNarrativeFilters(LIST_SELECT)
    params.set('order', 'published_at.desc,id.desc')
    params.set('limit', String(limit))
    params.set('offset', String(offset))

    try {
      const response = await readNarratives(params)
      if (!response.ok) {
        await logUpstreamFailure('GET /narratives', response)
        return c.json({ error: 'Internal server error' }, 500)
      }

      const rows = await response.json() as unknown
      if (!Array.isArray(rows)) throw new Error('Supabase returned a non-array response')

      return c.json(rows.flatMap((row) => {
        const item = toFeedItem(row)
        return item ? [item] : []
      }))
    } catch (error) {
      console.error('[api] Unexpected error in GET /narratives:', error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  app.get('/:updateKey', async (c) => {
    const updateKey = c.req.param('updateKey')
    if (!UUID_RE.test(updateKey)) {
      return c.json({ error: 'Bad request' }, 400)
    }

    const params = publicNarrativeFilters(DETAIL_SELECT)
    params.set('id', `eq.${updateKey}`)
    params.set('limit', '1')

    try {
      const response = await readNarratives(params)
      if (!response.ok) {
        await logUpstreamFailure('GET /narratives/:updateKey', response)
        return c.json({ error: 'Internal server error' }, 500)
      }

      const rows = await response.json() as unknown
      if (!Array.isArray(rows)) throw new Error('Supabase returned a non-array response')
      if (rows.length === 0) return c.json({ error: 'Not found' }, 404)

      const detail = toFeedDetail(rows[0])
      return detail
        ? c.json(detail)
        : c.json({ error: 'Not found' }, 404)
    } catch (error) {
      console.error(`[api] Unexpected error in GET /narratives/${updateKey}:`, error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  return app
}

function publicNarrativeFilters(select: string): URLSearchParams {
  const params = new URLSearchParams()
  params.set('select', select)
  params.set('status', 'eq.published')
  params.set('entity_id', 'not.is.null')
  params.set('title', 'not.is.null')
  params.set('content_small', 'not.is.null')
  params.set('content_full', 'not.is.null')
  params.set('published_at', 'not.is.null')
  return params
}

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return fallback
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function toFeedItem(value: unknown): FeedItemDto | null {
  const row = narrativeRow(value, false)
  if (!row) return null
  return {
    updateKey: row.id,
    title: row.title,
    summary: row.content_small,
    publishedAt: row.published_at,
  }
}

function toFeedDetail(value: unknown): FeedDetailDto | null {
  const row = narrativeRow(value, true)
  if (!row) return null
  return {
    updateKey: row.id,
    title: row.title,
    summary: row.content_small,
    content: row.content_full!,
    publishedAt: row.published_at,
  }
}

function narrativeRow(value: unknown, requireFullContent: boolean): NarrativeRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const row = value as Record<string, unknown>
  const requiredFields = ['id', 'title', 'content_small', 'published_at'] as const
  for (const field of requiredFields) {
    if (typeof row[field] !== 'string' || row[field].trim().length === 0) {
      return null
    }
  }
  if (!UUID_RE.test(row.id as string) || !Number.isFinite(Date.parse(row.published_at as string))) return null
  if (requireFullContent && (typeof row.content_full !== 'string' || row.content_full.trim().length === 0)) {
    return null
  }

  return {
    id: (row.id as string).trim(),
    title: (row.title as string).trim(),
    content_small: (row.content_small as string).trim(),
    content_full: typeof row.content_full === 'string' ? row.content_full.trim() : undefined,
    published_at: (row.published_at as string).trim(),
  }
}

async function logUpstreamFailure(context: string, response: Response): Promise<void> {
  const detail = (await response.text()).slice(0, 500)
  console.error(`[api] Supabase error in ${context}: ${response.status}: ${detail}`)
}
