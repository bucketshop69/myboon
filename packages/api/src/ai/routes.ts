import { createHash } from 'crypto'
import { Hono } from 'hono'

export type AiRoutesOptions = {
  supabaseUrl: string
  serviceRoleKey: string
  provider: string
  apiKey?: string
  baseUrl: string
  model: string
}
export function createAiRoutes(options: AiRoutesOptions): Hono {
  const routes = new Hono()
  const SUPABASE_URL = options.supabaseUrl
  const SUPABASE_SERVICE_ROLE_KEY = options.serviceRoleKey
  const AI_EXPLANATION_PROVIDER = options.provider
  const AI_EXPLANATION_API_KEY = options.apiKey
  const AI_EXPLANATION_BASE_URL = options.baseUrl
  const AI_EXPLANATION_MODEL = options.model

  function supabaseHeaders(): Record<string, string> {
    return {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    }
  }

  async function supabaseFetch(path: string): Promise<Response> {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: supabaseHeaders() })
  }

  async function supabaseWrite(
    path: string,
    method: 'POST' | 'PATCH',
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: { ...supabaseHeaders(), ...extraHeaders },
      body: JSON.stringify(body),
    })
  }

  type AiExplanationRow = {
    id: string
    content_id: string
    content_type: string
    source_hash: string
    explanation: string
    model: string | null
    created_at: string
    updated_at: string
  }

  function normalizeExplainInput(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return ''
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
  }

  function sourceHashFor(title: string, content: string): string {
    return createHash('sha256').update(`${title}\n\n${content}`).digest('hex')
  }

  async function generateSimpleExplanation(title: string, content: string): Promise<string> {
    if (!AI_EXPLANATION_API_KEY) {
      throw new Error('AI provider is not configured')
    }

    const system = 'You explain crypto, prediction-market, sports, or finance news to beginners. Output ONLY the final user-facing explanation. Do not include analysis, chain-of-thought, bullet planning, preambles, or labels. Use simple language, avoid jargon, and do not give financial advice. Keep it to 2-4 short sentences.'
    const user = `Title: ${title || 'Untitled'}\n\nContent: ${content}`
    const isMiniMax = AI_EXPLANATION_PROVIDER === 'minimax'
    const attempts = isMiniMax ? 2 : 1
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const res = await fetch(`${AI_EXPLANATION_BASE_URL.replace(/\/$/, '')}/${isMiniMax ? 'messages' : 'chat/completions'}`, {
        method: 'POST',
        headers: isMiniMax ? {
          'x-api-key': AI_EXPLANATION_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        } : {
          Authorization: `Bearer ${AI_EXPLANATION_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(isMiniMax ? {
          model: AI_EXPLANATION_MODEL,
          temperature: 0.2,
          max_tokens: 240,
          system,
          messages: [{ role: 'user', content: user }],
        } : {
          model: AI_EXPLANATION_MODEL,
          temperature: 0.2,
          max_tokens: 240,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        lastError = new Error(`AI provider failed (${res.status}) ${body.slice(0, 180)}`.trim())
        if (attempt < attempts && [429, 500, 502, 503, 520, 529].includes(res.status)) continue
        throw lastError
      }

      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>
        content?: Array<{ type?: string; text?: string }>
      }
      const text = isMiniMax
        ? data.content?.find((block) => block.type === 'text')?.text?.trim()
        : data.choices?.[0]?.message?.content?.trim()
      const cleaned = text
        ?.replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^\s*(?:Let me|I need to|Breaking down|Analysis:)[\s\S]*?(?:\n\s*\n|$)/i, '')
        .replace(/\s+\n/g, '\n')
        .trim()
      if (cleaned) return cleaned

      lastError = new Error('AI provider returned an empty explanation')
    }

    throw lastError ?? new Error('AI provider returned an empty explanation')
  }

  // POST /ai/explain-simply
  routes.post('/explain-simply', async (c) => {
    let body: Record<string, unknown>
    try {
      body = await c.req.json() as Record<string, unknown>
    } catch {
      return c.json({ error: 'Bad request' }, 400)
    }

    const contentId = normalizeExplainInput(body.contentId, 180)
    const contentType = normalizeExplainInput(body.contentType, 40) || 'narrative'
    const title = normalizeExplainInput(body.title, 240)
    const content = normalizeExplainInput(body.content, 6000)

    if (!contentId || !content) {
      return c.json({ error: 'contentId and content are required' }, 400)
    }

    const sourceHash = sourceHashFor(title, content)

    try {
      const cacheRes = await supabaseFetch(
        `ai_explanations?content_id=eq.${encodeURIComponent(contentId)}&source_hash=eq.${encodeURIComponent(sourceHash)}&select=*&limit=1`
      )

      if (cacheRes.ok) {
        const rows = await cacheRes.json() as AiExplanationRow[]
        const cached = Array.isArray(rows) ? rows[0] : null
        if (cached?.explanation) {
          return c.json({
            id: cached.id,
            explanation: cached.explanation,
            cached: true,
            model: cached.model,
            createdAt: cached.created_at,
          })
        }
      } else {
        console.error(`[api] Supabase ai_explanations read error ${cacheRes.status}: ${await cacheRes.text()}`)
      }

      const explanation = await generateSimpleExplanation(title, content)
      const insertRes = await supabaseWrite(
        'ai_explanations?on_conflict=content_id,source_hash',
        'POST',
        {
          content_id: contentId,
          content_type: contentType,
          source_hash: sourceHash,
          explanation,
          model: AI_EXPLANATION_MODEL,
        },
        { Prefer: 'resolution=merge-duplicates,return=representation' },
      )

      if (!insertRes.ok) {
        console.error(`[api] Supabase ai_explanations write error ${insertRes.status}: ${await insertRes.text()}`)
        return c.json({ explanation, cached: false, model: AI_EXPLANATION_MODEL })
      }

      const rows = await insertRes.json() as AiExplanationRow[]
      const saved = Array.isArray(rows) ? rows[0] : null
      return c.json({
        id: saved?.id,
        explanation: saved?.explanation ?? explanation,
        cached: false,
        model: saved?.model ?? AI_EXPLANATION_MODEL,
        createdAt: saved?.created_at,
      })
    } catch (err) {
      console.error('[api] Unexpected error in POST /ai/explain-simply:', err)
      return c.json({ error: 'Could not generate explanation right now. Please try again later.' }, 503)
    }
  })

  return routes
}
