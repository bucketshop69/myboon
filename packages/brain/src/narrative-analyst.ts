import 'dotenv/config'
import { PolymarketClient } from '@pnldotfun/shared'
import { createPolymarketTools } from './analyst-tools/polymarket.tools.js'
import type { ResearchTool, AnthropicToolDefinition } from './research/types/mcp.js'

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
const analystTools: ResearchTool<any>[] = createPolymarketTools(polymarketClient)

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

async function callMinimax(
  messages: AnthropicMessage[],
  tools: AnthropicToolDefinition[]
): Promise<AnthropicResponse> {
  const res = await fetch('https://api.minimax.io/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': MINIMAX_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.5',
      temperature: 0.3,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      tool_choice: { type: 'auto' },
      messages,
    }),
  })

  if (!res.ok) {
    throw new Error(`MiniMax request failed: ${res.status} ${await res.text()}`)
  }

  return res.json() as Promise<AnthropicResponse>
}

const SYSTEM_PROMPT =
  'You are a market intelligence analyst monitoring Polymarket prediction markets and notable betting activity. ' +
  'You have tools available to fetch live Polymarket data. ' +
  'Before writing an observation about a specific market, call get_market_snapshot to check current yes/no prices. ' +
  'Focus on interesting or unusual bets — size alone does not make a bet significant. ' +
  'If someone bet on the lower-probability outcome (yes_price < 0.3), flag it as a contrarian position. ' +
  'If someone bet heavily on the higher-probability outcome, note the conviction. ' +
  'Do not label bettors as whales — describe the position and what it signals about market sentiment instead. ' +
  'If a signal contains a conditionId, use get_market_by_condition to resolve the market and get live odds in one call.'

async function clusterNarratives(
  signalLines: string[]
): Promise<NarrativeCluster[]> {
  const userPrompt = `Below are recent signals from Polymarket. Cluster them into emerging narratives.

Signals:
${signalLines.join('\n')}

Return a JSON array only — no markdown, no explanation. Each element:
{
  "cluster": "short narrative title",
  "observation": "factual 2-3 sentence analyst note",
  "score": <integer 1-10 urgency/importance>,
  "signal_count": <number of signals in this cluster>,
  "key_signals": ["brief signal 1", "brief signal 2"]
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
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      return JSON.parse(clean) as NarrativeCluster[]
    }

    break
  }

  throw new Error(
    `[narrative-analyst] Tool-use loop exceeded ${MAX_TOOL_ITERATIONS} iterations or ended unexpectedly`
  )
}

// --- supabase narratives output ---

async function saveNarratives(clusters: NarrativeCluster[], signals: Signal[]): Promise<void> {
  const rows = clusters.map((c) => ({
    cluster: c.cluster,
    observation: c.observation,
    score: c.score,
    signal_count: c.signal_count,
    signals_snapshot: signals,
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

  const signalLines = signals.map(formatSignalLine)
  const clusters = await clusterNarratives(signalLines)

  printReport(clusters, timestamp)
  await saveNarratives(clusters, signals)
  console.log(`[narrative-analyst] Saved ${clusters.length} narrative(s) to Supabase (status=draft)`)

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
