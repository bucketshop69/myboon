/**
 * Publisher LLM loop — extracted from publisher.ts for use by the LangGraph publisher node.
 *
 * This module contains the tool-calling loop that calls MiniMax, handles tool use,
 * and parses the final JSON output into a PublishedOutput.
 */

import { callMinimax } from './minimax.js'
import type { AnthropicMessage, AnthropicToolDefinition, ContentBlock } from './minimax.js'
import type { PublishedOutput, CriticOutput, Narrative } from './publisher-types.js'
import { extractJson } from './json-utils.js'
import type { ResearchTool } from './research/types/mcp.js'
import { createSupabaseTools, createPublisherSupabaseTools } from './publisher-tools/supabase.tools.js'

// --- env (read at module load, caller validates) ---

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// --- tool registry ---

export function buildPublisherTools(): ResearchTool<any>[] {
  return [
    ...createSupabaseTools({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_SERVICE_ROLE_KEY }),
    ...createPublisherSupabaseTools(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  ]
}

function toAnthropicDefinitions(tools: ResearchTool<any>[]): AnthropicToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }))
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  tools: ResearchTool<any>[]
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name)
  if (!tool) return { error: `Unknown tool: ${name}` }
  try {
    return await tool.execute(input)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// --- sports detection ---

const SPORTS_KEYWORDS = /\b(cricket|football|soccer|esports|tennis|nba|nfl|nhl|mlb|epl|ipl|t20|odi|fifa|ufc|mma|rugby|golf|f1|formula.?1|counter.?strike|cs2|dota|league.?of.?legends|valorant|esl|blast|major|grand.?slam|champions.?league|premier.?league|la.?liga|bundesliga|serie.?a)\b/i

export function isSportsNarrative(cluster: string): boolean {
  return SPORTS_KEYWORDS.test(cluster)
}

// --- system prompt ---

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return (
    'You are a market intelligence publisher. You receive narrative clusters from prediction market signals and decide whether to publish.\n\n' +
    `Today's date is ${today}. Use this to assess freshness and time-sensitivity.\n\n` +
    'You have two research tools:\n' +
    '- search_published: checks our published database for related content. Always call this first.\n' +
    '- get_tag_history: fetches recent narratives matching topic tags.\n\n' +
    'STEP 1 — DEDUP CHECK:\n' +
    'Call search_published and get_tag_history. Then decide:\n' +
    '- Same story, nothing materially changed → reject as duplicate.\n' +
    '- Same story but odds/positioning shifted significantly → publish as update, lead with what moved.\n' +
    '- Same wallet featured 3+ times in last 24h → reject unless this is a genuinely new market or thesis.\n' +
    '- No match → evaluate on its own merits.\n\n' +
    'STEP 2 — SCORE:\n' +
    'publisher_score (1-10). Only >= 8 gets published. Be selective.\n\n' +
    'STEP 3 — CLASSIFY content_type (first match):\n' +
    '- "sports": match, tournament, or sports prediction market\n' +
    '- "macro": geopolitics, elections, central bank, trade war, regime change\n' +
    '- "fomo": specific unusual position from one wallet\n' +
    '- "signal": pattern across multiple actors or time\n' +
    '- "news": real-world event with immediate market reaction\n' +
    '- "crypto": token prices, DEX flows, on-chain activity\n\n' +
    'STEP 4 — WRITE:\n\n' +
    'content_small — THE CARD. This is what users see scrolling the feed. Rules:\n' +
    '- 2-3 SHORT lines. Each line is one punchy fact.\n' +
    '- HARD LIMIT: 100-150 characters total. Count them. If over 150 → rewrite shorter.\n' +
    '- This is a phone notification, not a paragraph. Be brutal about brevity.\n' +
    '- Lead depends on content_type:\n' +
    '  • fomo/signal → lead with the number: "$500K against Hormuz at 99%"\n' +
    '  • macro/news → lead with the thesis: "Fed cut odds collapsed"\n' +
    '  • sports → lead with what happened: "Real Madrid odds flipped"\n' +
    '  • crypto → either works\n' +
    '- End with a short punchline that lands.\n' +
    '- Name the wallet — use Polymarket username or short address. NEVER "a tracked wallet".\n' +
    '- No markdown. No jargon. No analyst-speak.\n' +
    '- Write like you\'re texting a trader friend. Sharp, punchy, zero filler.\n\n' +
    'EXAMPLES of good content_small (note the length — all under 150 chars):\n\n' +
    'fomo: "0x5c26 is short 34.5M $CHIP ($4.75M).\\nDown $1.82M and still holding.\\nLiquidation: $0.217"\n\n' +
    'signal: "epsteinfiles dropped $12.3K on MicroStrategy holding 1M+ BTC.\\nOnly bets MSTR markets. Won them all."\n\n' +
    'macro: "Japan exports +11.7% YoY.\\nChina drove it: +17.7%, chips and metals.\\nDemand is back."\n\n' +
    'crypto: "0x65B4 sold 10,829 ETH at $2,300.\\nBought 7,448 back at $2,350.\\nSold the bottom."\n\n' +
    'content_full — THE DETAIL. 2-3 sentences. Max 400 characters.\n' +
    '- Add context that content_small doesn\'t have.\n' +
    '- Why this matters NOW (deadline, catalyst, timing).\n' +
    '- Conversational. End with why the reader should care.\n' +
    '- Do NOT repeat content_small. New info only.\n' +
    '- Do NOT make up news.\n\n' +
    'reasoning: Internal note — why you scored it, dedup decision.\n\n' +
    'tags: 2-5 lowercase (e.g. "iran", "fed", "crypto", "btc", "sports").\n\n' +
    'priority: Integer 1-10. USE THE FULL RANGE:\n' +
    '  1-3: routine market movement, low urgency, common pattern\n' +
    '  4-5: notable but not time-sensitive, interesting angle\n' +
    '  6-7: significant move, clear catalyst, worth watching\n' +
    '  8-9: major event, large position, time-sensitive\n' +
    '  10: breaking, massive, once-a-week level event\n' +
    'Most narratives should be 4-6. Only 1-2 per day should hit 8+. If everything is 8, nothing is.\n\n' +
    'content_type: One of "fomo", "signal", "sports", "macro", "news", "crypto".\n\n' +
    'actions: Predict actions are pre-populated from slugs — do not change them. You may add perps actions for crypto: { "type": "perps", "asset": "BTC" }. Empty array if none.\n\n' +
    'SPORTS:\n' +
    '- Skip search tools — write from signal data only.\n' +
    '- Lead with what happened and what the market did.\n\n' +
    'Return a single JSON object. No markdown, no explanation.'
  )
}

// --- main tool-calling loop ---

const MAX_TOOL_ITERATIONS = 10
const MAX_CONSECUTIVE_FAILURES = 3

/**
 * Run the publisher LLM tool-calling loop for a single narrative.
 *
 * @param narrative - The draft narrative to process
 * @param tagHistory - Results from get_tag_history (pre-fetched by graph state)
 * @param previousCritic - Optional critic output from previous attempt (for revision guidance)
 */
export async function runPublisherLLM(
  narrative: Narrative,
  tagHistory: unknown[],
  previousCritic: CriticOutput | null
): Promise<PublishedOutput> {
  const publisherTools = buildPublisherTools()
  const keySignals = (narrative.key_signals ?? []).join('\n')
  const isSports = isSportsNarrative(narrative.cluster)
  const slugsLine = (narrative.slugs ?? []).length > 0
    ? `Market slugs: ${narrative.slugs.join(', ')}\n`
    : ''

  let criticGuidance = ''
  if (previousCritic && previousCritic.verdict === 'revise') {
    criticGuidance =
      `\n\nCRITIC FEEDBACK (previous attempt flagged for revision):\n` +
      `Issues: ${previousCritic.issues.join('; ')}\n` +
      (previousCritic.reasoning ? `Reasoning: ${previousCritic.reasoning}\n` : '') +
      `Address these issues in your revised output.\n`
  }

  const tagHistoryLine = tagHistory.length > 0
    ? `\nRecent tag history (already published on these topics):\n${JSON.stringify(tagHistory, null, 2)}\n`
    : ''

  const userPrompt =
    `Narrative cluster: ${narrative.cluster}\n` +
    `Analyst observation: ${narrative.observation}\n` +
    `Score: ${narrative.score}/10\n` +
    `Signal count: ${narrative.signal_count}\n` +
    slugsLine +
    `Key signals: ${keySignals}\n` +
    tagHistoryLine +
    criticGuidance +
    (isSports
      ? `\nThis is a sports narrative. Do NOT use any search tools. Write content_small and content_full from the signal data only, then produce your JSON output.`
      : `\nEvaluate this narrative. Use your research tools as needed, then produce your JSON output.`)

  const tools = isSports ? [] : toAnthropicDefinitions(publisherTools)
  const messages: AnthropicMessage[] = [{ role: 'user', content: userPrompt }]

  let consecutiveToolFailures = 0

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await callMinimax(messages, tools, buildSystemPrompt(), { max_tokens: 8192 })

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
        const result = await executeTool(block.name, block.input, publisherTools)
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

      if (consecutiveToolFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log('[publisher] Tools unavailable — instructing LLM to proceed without tool context')
        messages.push({
          role: 'user',
          content: 'Research tools are unavailable. Please proceed using only the signal data provided above and return your JSON output now.',
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
      const output = extractJson<PublishedOutput>(text, 'publisher-llm')
      if (!output) {
        throw new Error(`[publisher-llm] Could not parse JSON from LLM response: ${text.slice(0, 300)}`)
      }

      // Ensure required fields have defaults
      output.content_small = output.content_small ?? ''
      output.content_full = output.content_full ?? ''
      output.tags = output.tags ?? []
      output.actions = output.actions ?? []
      output.priority = output.priority ?? 5
      output.publisher_score = output.publisher_score ?? 0

      // Build predict actions deterministically from analyst-extracted slugs
      const llmPerpsActions = output.actions.filter((a) => a.type === 'perps')
      const predictActions = (narrative.slugs ?? []).map((slug) => ({
        type: 'predict' as const,
        slug,
      }))
      output.actions = [...predictActions, ...llmPerpsActions]

      return output
    }

    break
  }

  throw new Error(
    `[publisher] Tool-use loop exceeded ${MAX_TOOL_ITERATIONS} iterations or ended unexpectedly for narrative: ${narrative.cluster}`
  )
}
