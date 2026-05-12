// Shared MiniMax API helper used by the brain agents.

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface AnthropicResponse {
  stop_reason: 'end_turn' | 'tool_use' | string
  content: ContentBlock[]
}

export interface AnthropicToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

export interface CallMinimaxOptions {
  max_tokens?: number
  temperature?: number
}

const TOKEN_WARN_THRESHOLD = 40_000
const RETRY_STATUS_CODES = new Set([401, 429, 500, 502, 503, 520, 529])
const MAX_RETRIES = 5

export function estimateTokens(messages: AnthropicMessage[], systemPrompt: string): number {
  const systemChars = systemPrompt.length
  const messageChars = messages.reduce((sum, m) => {
    if (typeof m.content === 'string') return sum + m.content.length
    return sum + m.content.reduce((s, b) => {
      if (b.type === 'text') return s + b.text.length
      if (b.type === 'tool_use') return s + JSON.stringify(b.input).length
      if (b.type === 'tool_result') return s + b.content.length
      return s
    }, 0)
  }, 0)
  return Math.ceil((systemChars + messageChars) / 4)
}

/**
 * Call the MiniMax API (Anthropic-compatible endpoint).
 * Retries up to 5 times with exponential backoff + jitter on 5xx / 401 / 429 errors.
 */
export async function callMinimax(
  messages: AnthropicMessage[],
  tools: AnthropicToolDefinition[],
  systemPrompt: string,
  opts: CallMinimaxOptions = {}
): Promise<AnthropicResponse> {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set')

  const estimatedTokens = estimateTokens(messages, systemPrompt)
  if (estimatedTokens > TOKEN_WARN_THRESHOLD) {
    console.warn(`[minimax] Large context warning: ~${estimatedTokens.toLocaleString()} tokens before LLM call`)
  }

  const body: Record<string, unknown> = {
    model: 'MiniMax-M2.7',
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 4096,
    system: systemPrompt,
    messages,
  }

  if (tools.length > 0) {
    body.tools = tools
    body.tool_choice = { type: 'auto' }
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const jitter = Math.floor(Math.random() * 2000) // 0-2s random jitter
      const delayMs = 2000 * Math.pow(2, attempt - 1) + jitter // 2-4s, 4-6s, 8-10s, 16-18s
      console.warn(`[minimax] Retry ${attempt}/${MAX_RETRIES - 1} after ${delayMs}ms...`)
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const res = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      return res.json() as Promise<AnthropicResponse>
    }

    const errorText = await res.text()
    lastError = new Error(`MiniMax request failed: ${res.status} ${errorText}`)

    if (!RETRY_STATUS_CODES.has(res.status)) {
      // 4xx (except 429) are not retryable
      throw lastError
    }

    console.warn(`[minimax] Retryable error (attempt ${attempt + 1}): ${res.status} ${errorText.slice(0, 120)}`)
  }

  throw lastError!
}

/**
 * Extract the first text block from a MiniMax response and strip markdown fences.
 */
export function extractText(response: AnthropicResponse): string {
  const textBlock = response.content.find((c) => c.type === 'text') as
    | Extract<ContentBlock, { type: 'text' }>
    | undefined
  const text = textBlock?.text ?? ''
  return text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
}
