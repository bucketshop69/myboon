import 'dotenv/config'
// TODO: re-enable search_news when a Firecrawl replacement is available
// import { createFirecrawlTools } from './publisher-tools/firecrawl.tools.js'
import { createSupabaseTools } from './publisher-tools/supabase.tools.js'
import type { ResearchTool, AnthropicToolDefinition } from './research/types/mcp.js'

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY
// TODO: re-enable when search_news tool is restored
// const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')
// if (!FIRECRAWL_API_KEY) missing.push('FIRECRAWL_API_KEY')

if (missing.length > 0) {
  console.error(`[publisher] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

// --- tool registry setup ---

const publisherTools: ResearchTool<any>[] = [
  ...createSupabaseTools({ supabaseUrl: SUPABASE_URL!, supabaseKey: SUPABASE_SERVICE_ROLE_KEY! }),
  // TODO: re-enable search_news when a replacement for Firecrawl is in place
  // ...createFirecrawlTools(FIRECRAWL_API_KEY!),
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
  const tool = publisherTools.find((t) => t.name === name)
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

interface Narrative {
  id: string
  cluster: string
  observation: string
  score: number
  signal_count: number
  key_signals: string[]
  status: string
  created_at: string
}

interface NarrativeAction {
  type: 'predict' | 'perps'
  slug?: string   // predict: polymarket slug
  asset?: string  // perps: base asset e.g. "BTC"
}

interface PublishedOutput {
  content_small: string
  content_full: string
  reasoning: string
  tags: string[]
  priority: number
  publisher_score: number
  actions: NarrativeAction[]
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

async function fetchDraftNarratives(): Promise<Narrative[]> {
  const url = `${SUPABASE_URL}/rest/v1/narratives?status=eq.draft&score=gte.7&order=score.desc&limit=20`
  const res = await fetch(url, { headers: supabaseHeaders() })
  if (!res.ok) {
    throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<Narrative[]>
}

async function insertPublishedNarrative(
  narrativeId: string,
  output: PublishedOutput
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/published_narratives`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      narrative_id: narrativeId,
      content_small: output.content_small,
      content_full: output.content_full,
      reasoning: output.reasoning,
      tags: output.tags,
      priority: output.priority,
      actions: output.actions ?? [],
    }),
  })

  if (!res.ok) {
    throw new Error(`Supabase published_narratives insert failed: ${res.status} ${await res.text()}`)
  }
}

async function markNarrativeStatus(narrativeId: string, status: 'published' | 'rejected'): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/narratives?id=eq.${narrativeId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify({ status }),
  })

  if (!res.ok) {
    throw new Error(`Supabase narratives PATCH failed: ${res.status} ${await res.text()}`)
  }
}

// --- system prompt ---

const SPORTS_KEYWORDS = /\b(cricket|football|soccer|esports|tennis|nba|nfl|nhl|mlb|epl|ipl|t20|odi|fifa|ufc|mma|rugby|golf|f1|formula.?1|counter.?strike|cs2|dota|league.?of.?legends|valorant|esl|blast|major|grand.?slam|champions.?league|premier.?league|la.?liga|bundesliga|serie.?a)\b/i

function isSportsNarrative(cluster: string): boolean {
  return SPORTS_KEYWORDS.test(cluster)
}

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return 'You are a market intelligence publisher with a co-researcher role. You receive a narrative cluster from prediction market signals and must decide whether it is worth publishing.\n\n' +
  `Today's date is ${today}. Use this to assess how fresh and time-sensitive the signals are.\n\n` +
  'You have one research tool:\n' +
  '- search_published: checks our own published database for related content. Always call this first.\n' +
  '  Returns: content_small, content_full, reasoning, tags, priority, created_at for each match.\n\n' +
  // TODO: restore search_news tool description when a replacement for Firecrawl is available
  'Your job:\n\n' +
  '1. Call search_published to check if we already covered this topic.\n' +
  '   Read the full content_full and reasoning of any matches — then decide:\n' +
  '   - Same story, nothing materially changed → reject as duplicate.\n' +
  '   - Same story but odds/positioning shifted significantly → publish as an update. Reference the previous piece and lead with what moved (e.g. "Iran ceasefire odds jumped from 60% to 80% in under 2 hours").\n' +
  '   - No match → evaluate on its own merits.\n' +
  '2. Give the narrative a publisher_score (1-10). Only narratives you score >= 8 will be saved. Be selective — not everything is worth publishing.\n' +
  '3. Produce:\n\n' +
  'content_small: 2-4 sentences, punchy, no fluff. Lookonchain style but smarter. State the position, what it signals, why it matters. Written for a trader who has 5 seconds. No markdown. Do not use the word "whale" or "whales" — describe the position and conviction instead (e.g. "smart money", "a $50K position", "concentrated bets").\n\n' +
  'content_full: Deep analysis connecting prediction market signals to real-world context. Use your own knowledge to add context where relevant. Link related themes (e.g. Iran bets + oil prices = same meta-narrative). Do not make up news.\n\n' +
  'reasoning: Internal note — why you scored it the way you did, what research you found, how you connected the dots.\n\n' +
  'tags: 2-5 lowercase tags (e.g. "iran", "election", "crypto", "oil", "fed", "ai", "geopolitics", "sports").\n\n' +
  'priority: Integer 1-10. Higher = more urgent/time-sensitive.\n\n' +
  'publisher_score: Integer 1-10. Your honest assessment of this narrative\'s publish-worthiness. >= 8 gets published.\n\n' +
  'actions: Array of action targets extracted from the key signals. Each action lets the user act directly on the narrative.\n' +
  '  - For Polymarket signals: extract the slug from [slug: xxx] patterns in the key signals. Use { "type": "predict", "slug": "the-slug" }\n' +
  '  - For perps/crypto price signals: use { "type": "perps", "asset": "BTC" } — asset is just the base symbol, no pair or suffix.\n' +
  '  - Include up to 3 actions, most relevant first. Empty array if no clear action target.\n\n' +
  'Important: For sports narratives (cricket, football, esports, tennis, etc.) skip the search tools entirely — write content_small and content_full from the signal data only.\n\n' +
  'Return a single JSON object. No markdown, no explanation.'
}

// --- minimax call ---

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
      system: buildSystemPrompt(),
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

// --- tool-use loop per narrative ---

const MAX_TOOL_ITERATIONS = 10
const MAX_CONSECUTIVE_FAILURES = 3

async function publishNarrative(narrative: Narrative): Promise<PublishedOutput> {
  const keySignals = (narrative.key_signals ?? []).join('\n')
  const isSports = isSportsNarrative(narrative.cluster)
  const userPrompt =
    `Narrative cluster: ${narrative.cluster}\n` +
    `Analyst observation: ${narrative.observation}\n` +
    `Score: ${narrative.score}/10\n` +
    `Signal count: ${narrative.signal_count}\n` +
    `Key signals: ${keySignals}\n\n` +
    (isSports
      ? `This is a sports narrative. Do NOT use any search tools. Write content_small and content_full from the signal data only, then produce your JSON output.`
      : `Evaluate this narrative. Use your research tools as needed, then produce your JSON output.`)

  const tools = isSports ? [] : toAnthropicDefinitions(publisherTools)
  const messages: AnthropicMessage[] = [{ role: 'user', content: userPrompt }]

  let consecutiveToolFailures = 0

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
        console.log(`[publisher] Tool call: ${block.name}(${JSON.stringify(block.input)})`)
        const result = await executeTool(block.name, block.input)
        const resultStr = JSON.stringify(result)
        console.log(`[publisher] Tool result: ${resultStr.slice(0, 200)}${resultStr.length > 200 ? '...' : ''}`)
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

      // If tools keep failing, tell LLM to proceed without news
      if (consecutiveToolFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log('[publisher] News tools unavailable — instructing LLM to proceed without news context')
        messages.push({
          role: 'user',
          content: 'News search tools are unavailable. Please proceed using only the signal data provided above and return your JSON output now.',
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
      return JSON.parse(clean) as PublishedOutput
    }

    break
  }

  throw new Error(
    `[publisher] Tool-use loop exceeded ${MAX_TOOL_ITERATIONS} iterations or ended unexpectedly for narrative: ${narrative.cluster}`
  )
}

// --- terminal report ---

function printReport(published: Array<{ narrative: Narrative; output: PublishedOutput }>, timestamp: string): void {
  console.log('\n' + '='.repeat(60))
  console.log(`[publisher] Report — ${timestamp}`)
  console.log('='.repeat(60))

  if (published.length === 0) {
    console.log('No narratives published this run.')
  }

  for (const { narrative, output } of published) {
    console.log(`\nCluster  : ${narrative.cluster}`)
    console.log(`Priority : ${output.priority}/10`)
    console.log(`Tags     : ${output.tags.join(', ')}`)
    console.log(`Card     : ${output.content_small}`)
  }

  console.log('\n' + '='.repeat(60) + '\n')
}

// --- main run ---

async function run(): Promise<void> {
  const timestamp = new Date().toISOString()
  console.log(`[publisher] Running at ${timestamp}`)

  const narratives = await fetchDraftNarratives()

  if (narratives.length === 0) {
    console.log('[publisher] No draft narratives. Skipping LLM call.')
    return
  }

  console.log(`[publisher] Found ${narratives.length} draft narrative(s).`)

  const published: Array<{ narrative: Narrative; output: PublishedOutput }> = []

  for (const narrative of narratives) {
    console.log(`[publisher] Processing: "${narrative.cluster}"`)
    try {
      const output = await publishNarrative(narrative)
      if (output.publisher_score >= 8) {
        await insertPublishedNarrative(narrative.id, output)
        await markNarrativeStatus(narrative.id, 'published')
        published.push({ narrative, output })
        console.log(`[publisher] Published: "${narrative.cluster}" (publisher_score ${output.publisher_score}, priority ${output.priority})`)
      } else {
        await markNarrativeStatus(narrative.id, 'rejected')
        console.log(`[publisher] Rejected: "${narrative.cluster}" (publisher_score ${output.publisher_score} < 8)`)
      }
    } catch (err) {
      console.error(`[publisher] Failed to process narrative "${narrative.cluster}":`, err)
    }
  }

  printReport(published, timestamp)
  console.log(`[publisher] Done — ${published.length}/${narratives.length} narrative(s) published.`)
}

// --- entry point ---

async function main(): Promise<void> {
  await run().catch((err: unknown) => {
    console.error('[publisher] Error during run:', err)
  })

  setInterval(() => {
    run().catch((err: unknown) => {
      console.error('[publisher] Error during run:', err)
    })
  }, 30 * 60 * 1000)
}

main()
