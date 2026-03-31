/**
 * Publisher LLM loop — extracted from publisher.ts for use by the LangGraph publisher node.
 *
 * This module contains the tool-calling loop that calls MiniMax, handles tool use,
 * and parses the final JSON output into a PublishedOutput.
 */

import { callMinimax } from './minimax.js'
import type { AnthropicMessage, AnthropicToolDefinition, ContentBlock } from './minimax.js'
import type { PublishedOutput, CriticOutput, Narrative } from './publisher-types.js'
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
    'You are a market intelligence publisher with a co-researcher role. You receive a narrative cluster from prediction market signals and must decide whether it is worth publishing.\n\n' +
    `Today's date is ${today}. Use this to assess how fresh and time-sensitive the signals are.\n\n` +
    'You have two research tools:\n' +
    '- search_published: checks our own published database for related content. Always call this first.\n' +
    '  Returns: content_small, content_full, reasoning, tags, priority, created_at for each match.\n' +
    '- get_tag_history: fetches recent narratives matching topic tags. Call this to understand what angle has already been covered.\n\n' +
    'Your job:\n\n' +
    '1. Call search_published and get_tag_history to check if we already covered this topic.\n' +
    '   Read the full content_full and reasoning of any matches — then decide:\n' +
    '   - Same story, nothing materially changed → reject as duplicate.\n' +
    '   - Same story but odds/positioning shifted significantly → publish as an update. Reference the previous piece and lead with what moved (e.g. "Iran ceasefire odds jumped from 60% to 80% in under 2 hours").\n' +
    '   - No match → evaluate on its own merits.\n' +
    '2. Give the narrative a publisher_score (1-10). Only narratives you score >= 8 will be saved. Be selective — not everything is worth publishing.\n' +
    '3. Classify content_type (pick the FIRST match):\n' +
    '   - "sports": narrative is about a match, tournament, or sports prediction market (UCL, EPL, NBA, NFL, etc.)\n' +
    '   - "macro": narrative is about geopolitics, elections, central bank decisions, trade war, or regime change\n' +
    '   - "fomo": lead is a specific unusual position from one wallet ("A $50K position appeared on...")\n' +
    '   - "signal": lead is a pattern across multiple actors ("Smart money has been consistently buying NO on...")\n' +
    '   - "news": lead is a real-world event with immediate market reaction\n' +
    '   - "crypto": lead is about token prices, DEX flows, or on-chain crypto activity\n\n' +
    '4. Produce:\n\n' +
    'content_small: 2-4 sentences, punchy, no fluff. Lookonchain style but smarter. State the position, what it signals, why it matters. Written for a trader who has 5 seconds. No markdown. Do not use the word "whale" or "whales" — describe the position and conviction instead (e.g. "smart money", "a $50K position", "concentrated bets").\n\n' +
    'content_full: Deep analysis connecting prediction market signals to real-world context. Use your own knowledge to add context where relevant. Link related themes (e.g. Iran bets + oil prices = same meta-narrative). Do not make up news.\n\n' +
    'reasoning: Internal note — why you scored it the way you did, what research you found, how you connected the dots.\n\n' +
    'tags: 2-5 lowercase tags (e.g. "iran", "election", "crypto", "oil", "fed", "ai", "geopolitics", "sports").\n\n' +
    'priority: Integer 1-10. Higher = more urgent/time-sensitive.\n\n' +
    'publisher_score: Integer 1-10. Your honest assessment of this narrative\'s publish-worthiness. >= 8 gets published.\n\n' +
    'content_type: One of "fomo", "signal", "sports", "macro", "news", "crypto" — see classification rules above.\n\n' +
    'actions: Array of action targets. Predict actions are pre-populated from market slugs — do not add or change them. You may add perps actions only for crypto price signals: { "type": "perps", "asset": "BTC" } — asset is the base symbol only, no pair or suffix. Empty array if no perps action applies.\n\n' +
    'SPORTS:\n' +
    'For sports narratives (cricket, football, esports, tennis, etc.):\n' +
    '- Skip the search tools — write from the signal data only.\n' +
    '- Sports moves fast. Your readers want the play, not the backstory.\n' +
    '- Lead with what happened and what the market did: "After Sporting CP\'s comeback, YES odds jumped from 20% to 65%."\n\n' +
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
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      const output = JSON.parse(clean) as PublishedOutput

      // Build predict actions deterministically from analyst-extracted slugs
      const llmPerpsActions = (output.actions ?? []).filter((a) => a.type === 'perps')
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
