import 'dotenv/config'
import { PolymarketClient } from '@myboon/shared'
import { createPolymarketTools } from './analyst-tools/polymarket.tools.js'
import type { ResearchTool, AnthropicToolDefinition } from './research/types/mcp.js'
import { buildMarketContexts } from './context-builder.js'
import { extractJson } from './json-utils.js'
import type { MarketContext } from './context-builder.js'

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')

if (missing.length > 0) {
  console.error(`[narrative-analyst] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

// --- tool registry setup ---

const polymarketClient = new PolymarketClient()
const analystTools: ResearchTool<any>[] = [
  ...createPolymarketTools(polymarketClient),
]

function toAnthropicDefinitions(tools: ResearchTool<any>[]): AnthropicToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }))
}

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const tool = analystTools.find((t) => t.name === name)
  if (!tool) {
    return { error: `Unknown tool: ${name}` }
  }
  try {
    return await tool.execute(input)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// --- types ---

interface SignalMetadata {
  volume?: number
  yes_price?: number
  no_price?: number
  shift_from?: number
  shift_to?: number
  user?: string
  amount?: number
  side?: string
  outcome?: string
  slug?: string
}

interface Signal {
  id: string
  source: string
  type: string
  topic: string
  slug?: string        // top-level slug (added by #031)
  weight: number
  metadata: SignalMetadata
  created_at: string
  processed?: boolean
}

interface NarrativeCluster {
  cluster: string
  observation: string
  score: number
  signal_count: number
  key_signals: string[]
  slugs?: string[]
  content_type?: string
}

// Anthropic message content block shapes
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

interface AnthropicResponse {
  stop_reason: 'end_turn' | 'tool_use' | string
  content: ContentBlock[]
}

// --- supabase helpers ---

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function supabaseFetch(path: string): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: supabaseHeaders() })
}

async function fetchUnprocessedSignals(): Promise<Signal[]> {
  const url = `${SUPABASE_URL}/rest/v1/signals?processed=eq.false&order=created_at.asc&limit=300`
  const res = await fetch(url, { headers: supabaseHeaders() })
  if (!res.ok) {
    throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<Signal[]>
}

async function markSignalsProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const idList = ids.join(',')
  const url = `${SUPABASE_URL}/rest/v1/signals?id=in.(${idList})`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify({ processed: true }),
  })
  if (!res.ok) {
    throw new Error(`Supabase PATCH failed: ${res.status} ${await res.text()}`)
  }
}

// --- signal formatting ---

function formatDollars(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toLocaleString()}`
}

function formatSignalLine(signal: Signal): string {
  const { type, topic, weight, metadata } = signal

  switch (type) {
    case 'ODDS_SHIFT': {
      const from = metadata.shift_from ?? metadata.yes_price ?? '?'
      const to = metadata.shift_to ?? '?'
      const slug = metadata.slug ? ` [slug: ${metadata.slug}]` : ''
      return `[ODDS_SHIFT] "${topic}"${slug} — yes_price ${from} → ${to} (weight: ${weight})`
    }
    case 'WHALE_BET': {
      const user = metadata.user ?? 'unknown'
      const amount = metadata.amount != null ? formatDollars(metadata.amount) : '?'
      const side = metadata.outcome ?? metadata.side ?? '?'
      const price = metadata.yes_price != null ? ` at yes_price=${metadata.yes_price}` : ''
      const slug = metadata.slug ? ` [slug: ${metadata.slug}]` : ''
      return `[WHALE_BET] "${topic}"${slug} — ${user} bet ${amount} on ${side}${price} (weight: ${weight})`
    }
    case 'MARKET_DISCOVERED': {
      const volume = metadata.volume != null ? formatDollars(metadata.volume) : '?'
      const price = metadata.yes_price != null ? ` yes_price=${metadata.yes_price}` : ''
      const slug = metadata.slug ? ` [slug: ${metadata.slug}]` : ''
      return `[MARKET_DISCOVERED] "${topic}"${slug} — volume ${volume}${price} (weight: ${weight})`
    }
    default: {
      return `[${type}] "${topic}" (weight: ${weight})`
    }
  }
}

// --- minimax call with tool-use loop ---

const MAX_TOOL_ITERATIONS = 10

const ANALYST_RETRY_CODES = new Set([401, 429, 500, 502, 503, 520, 529])
const ANALYST_MAX_RETRIES = 3

async function callMinimax(
  messages: AnthropicMessage[],
  tools: AnthropicToolDefinition[]
): Promise<AnthropicResponse> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < ANALYST_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * Math.pow(2, attempt - 1)
      console.warn(`[narrative-analyst] Retry ${attempt}/${ANALYST_MAX_RETRIES - 1} after ${delayMs}ms...`)
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const res = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': MINIMAX_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        temperature: 0.3,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        tool_choice: { type: 'auto' },
        messages,
      }),
    })

    if (res.ok) {
      return res.json() as Promise<AnthropicResponse>
    }

    const errorText = await res.text()
    lastError = new Error(`MiniMax request failed: ${res.status} ${errorText}`)

    if (!ANALYST_RETRY_CODES.has(res.status)) {
      throw lastError
    }

    console.warn(`[narrative-analyst] Retryable error (attempt ${attempt + 1}): ${res.status} ${errorText.slice(0, 120)}`)
  }

  throw lastError!
}

const SYSTEM_PROMPT =
  'You are a market intelligence analyst monitoring Polymarket prediction markets and notable betting activity. ' +
  'You have tools available to fetch live Polymarket data. ' +
  'Before writing an observation about a specific market, call get_market_snapshot to check current yes/no prices. ' +
  'Focus on interesting or unusual bets — size alone does not make a bet significant. ' +
  'If someone bet on the lower-probability outcome (yes_price < 0.3), flag it as a contrarian position. ' +
  'If someone bet heavily on the higher-probability outcome, note the conviction. ' +
  'Do not label bettors as whales — describe the position and what it signals about market sentiment instead. ' +
  'If a signal contains a conditionId, use get_market_by_condition to resolve the market and get live odds in one call. ' +
  'For each cluster, set content_type using these rules in order: ' +
  '(1) "sports" if slugs match ucl-*, epl-*, nba-*, nfl-*, la-liga-* or topic contains team/match names; ' +
  '(2) "macro" if topic is geopolitics, elections, central bank, trade war, or regime change; ' +
  '(3) "fomo" if signals are dominated by a single wallet placing an unusual large position; ' +
  '(4) "signal" if multiple wallets converge on the same market; ' +
  '(5) "news" if topic references a specific real-world event with market reaction; ' +
  '(6) default to "signal" if none of the above match.'

async function clusterNarratives(
  contexts: MarketContext[]
): Promise<NarrativeCluster[]> {
  const userPrompt = `Below are active prediction markets with recent signal activity. Cluster them into emerging narratives.

Markets:
${JSON.stringify(contexts, null, 2)}

Return a JSON array only — no markdown, no explanation. Each element:
{
  "cluster": "short narrative title",
  "observation": "factual 2-3 sentence analyst note",
  "score": <integer 1-10 urgency/importance>,
  "signal_count": <number of signals in this cluster>,
  "key_signals": ["brief signal 1", "brief signal 2"],
  "slugs": ["slug-one", "slug-two"],
  "content_type": "fomo" | "signal" | "sports" | "macro" | "news" | "crypto"
}`

  const tools = toAnthropicDefinitions(analystTools)
  const messages: AnthropicMessage[] = [{ role: 'user', content: userPrompt }]

  let consecutiveToolFailures = 0
  const MAX_CONSECUTIVE_FAILURES = 3

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await callMinimax(messages, tools)

    // Append assistant response to message history
    if (response.content && response.content.length > 0) {
      messages.push({ role: 'assistant', content: response.content })
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use'
      )

      if (toolUseBlocks.length === 0) break

      const toolResults: ContentBlock[] = []
      let allFailed = true

      for (const block of toolUseBlocks) {
        console.log(`[narrative-analyst] Tool call: ${block.name}(${JSON.stringify(block.input)})`)
        const result = await executeTool(block.name, block.input)
        const resultStr = JSON.stringify(result)
        console.log(`[narrative-analyst] Tool result: ${resultStr}`)
        if (!(result as any)?.error) allFailed = false
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultStr,
        })
      }

      if (allFailed) consecutiveToolFailures++
      else consecutiveToolFailures = 0

      messages.push({ role: 'user', content: toolResults } as AnthropicMessage)

      // If tools keep failing, tell LLM to stop and use signal data directly
      if (consecutiveToolFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log('[narrative-analyst] Tools unavailable — instructing LLM to proceed with signal data')
        messages.push({
          role: 'user',
          content: 'Live market data tools are unavailable. Please proceed using only the signal data provided above and return your JSON analysis now.',
        })
        consecutiveToolFailures = 0
      }

      continue
    }

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((c) => c.type === 'text') as
        | Extract<ContentBlock, { type: 'text' }>
        | undefined
      const text = textBlock?.text ?? ''
      const parsed = extractJson<NarrativeCluster[]>(text, 'narrative-analyst')
      if (!parsed) {
        throw new Error(`[narrative-analyst] Could not parse JSON from LLM response: ${text.slice(0, 300)}`)
      }
      return parsed
    }

    break
  }

  throw new Error(
    `[narrative-analyst] Tool-use loop exceeded ${MAX_TOOL_ITERATIONS} iterations or ended unexpectedly`
  )
}

// --- slug extraction ---

function extractSlugs(keySignals: string[]): string[] {
  const pattern = /\[slug:\s*([^\]]+)\]/g
  const slugs = new Set<string>()
  for (const line of keySignals) {
    let match
    while ((match = pattern.exec(line)) !== null) {
      slugs.add(match[1].trim())
    }
  }
  return [...slugs]
}

// --- supabase narratives output ---

async function saveNarratives(clusters: NarrativeCluster[], signals: Signal[]): Promise<void> {
  const rows = clusters
    .filter((c) => c.score >= 7)
    .filter((c) => c.content_type !== 'sports')  // sports handled exclusively by sports_broadcaster
    .map((c) => ({
      cluster: c.cluster,
      observation: c.observation,
      score: c.score,
      signal_count: c.signal_count,
      signals_snapshot: signals,
      slugs: c.slugs ?? [],
      content_type: c.content_type ?? 'signal',
      status: 'draft',
    }))

  const url = `${SUPABASE_URL}/rest/v1/narratives`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })

  if (!res.ok) {
    throw new Error(`Supabase narratives insert failed: ${res.status} ${await res.text()}`)
  }
}

// --- terminal report ---

function printReport(clusters: NarrativeCluster[], timestamp: string): void {
  console.log('\n' + '='.repeat(60))
  console.log(`[narrative-analyst] Report — ${timestamp}`)
  console.log('='.repeat(60))

  if (clusters.length === 0) {
    console.log('No narrative clusters identified.')
  }

  for (const c of clusters) {
    console.log(`\nCluster : ${c.cluster}`)
    console.log(`Score   : ${c.score}/10  |  Signals: ${c.signal_count}`)
    console.log(`Note    : ${c.observation}`)
    if (c.key_signals.length > 0) {
      console.log('Key     :')
      for (const s of c.key_signals) {
        console.log(`  - ${s}`)
      }
    }
  }

  console.log('\n' + '='.repeat(60) + '\n')
}

// --- main run ---

async function run(): Promise<void> {
  const timestamp = new Date().toISOString()
  console.log(`[narrative-analyst] Running at ${timestamp}`)

  const signals = await fetchUnprocessedSignals()

  if (signals.length === 0) {
    console.log('[narrative-analyst] No unprocessed signals. Skipping LLM call.')
    return
  }

  console.log(`[narrative-analyst] Found ${signals.length} unprocessed signal(s).`)

  const contexts = await buildMarketContexts(signals, supabaseFetch)
  if (contexts.length === 0) {
    console.log('[narrative-analyst] No market contexts built from signals. Skipping LLM call.')
    return
  }
  console.log(`[narrative-analyst] Built ${contexts.length} market context(s) from ${signals.length} signal(s).`)
  const clusters = await clusterNarratives(contexts)

  printReport(clusters, timestamp)
  await saveNarratives(clusters, signals)
  const saved = clusters.filter((c) => c.score >= 7).length
  const skipped = clusters.length - saved
  console.log(`[narrative-analyst] Saved ${saved} narrative(s) to Supabase (status=draft) — skipped ${skipped} below score 7`)

  const ids = signals.map((s) => s.id)
  await markSignalsProcessed(ids)
  console.log(`[narrative-analyst] Marked ${ids.length} signal(s) as processed.`)
}

// --- entry point ---

async function main(): Promise<void> {
  await run().catch((err: unknown) => {
    console.error('[narrative-analyst] Error during run:', err)
  })

  setInterval(() => {
    run().catch((err: unknown) => {
      console.error('[narrative-analyst] Error during run:', err)
    })
  }, 15 * 60 * 1000)
}

main()
