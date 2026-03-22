import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import { createClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from '../minimax.js'
import type { AnthropicMessage, ContentBlock } from '../minimax.js'
import { nansenTools } from '../analyst-tools/nansen.tools.js'
import type { AnthropicToolDefinition } from '../research/types/mcp.js'

// --- local types ---

export interface SignalRow {
  id: string
  type: string
  weight: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface XPostRow {
  draft_text: string
  agent_type: string
  status: string
  created_at: string
}

export interface DraftPost {
  draft_text: string
  reasoning: string
  signal_ids: string[]
}

// --- system prompts ---

const FOMO_MASTER_SYSTEM_PROMPT = `You are a fast, sharp financial intelligence account on X (Twitter).
Style: Lookonchain — specific numbers, wallet context, story-driven.

Rules:
- Lead with the number or the story: "$26K fresh wallet", "71% win rate bettor", "3rd bet this week"
- No hashtags, no threads (single post only)
- Emoji only if it adds urgency: 🚨 ⚡ 💰 (max 1 per post)
- Sound informed, not hype-y — you're a pro analyst, not a degen
- Always end with the wallet's Polymarket profile URL on its own line: https://polymarket.com/{address}
- When referencing bet history from Nansen, phrase it naturally — not "10-bet whale" but "a wallet that's barely traded before" or "fresh account, only a handful of trades on record"

Examples:
🚨 New wallet dropped $26K on YES for US forces entering Iran by March 31.
   Odds sitting at 18%. Fresh account — this is their opening position.
   https://polymarket.com/profile/0xabc123...

⚡ A wallet with a 71% Polymarket win rate just bet $14K on Trump tariff escalation.
   Third bet on this market this week — total exposure now $38K.
   https://polymarket.com/profile/0xdef456...

You will receive a batch of WHALE_BET signals. Use the nansen_bettor_profile tool
to enrich the best picks with wallet win rate context before writing.

Pick 1-3 of the most interesting stories from the batch. Return JSON:
{
  "posts": [
    { "draft_text": string, "reasoning": string, "signal_ids": string[] }
  ]
}`

const BROADCASTER_SYSTEM_PROMPT = `You are the chief broadcaster for a financial intelligence X account.
You are called immediately after fomo_master writes a draft — you review it before it gets saved.

You will receive:
- The draft post(s) just written by fomo_master
- Last 7 days of x_posts history across all agents (for context on what the account has already covered)

Reject if:
- Duplicate topic already covered well in the last 24h
- Topic has been posted 3+ times this week already
- Post is vague — no specific numbers or wallet context
- Tone is hype-y or unprofessional

Approve if the post adds genuine value and fits the account's timeline.

Return JSON:
{
  "decision": "approved" | "rejected",
  "reasoning": string,
  "feedback": string  // only if rejected — specific instructions for rewrite
}`

// --- state annotation ---

const FomoState = Annotation.Root({
  signals: Annotation<SignalRow[]>,
  timeline: Annotation<XPostRow[]>,
  drafts: Annotation<DraftPost[] | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  broadcaster_feedback: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  broadcaster_decision: Annotation<'approved' | 'rejected' | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  broadcaster_reasoning: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  attempt: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
})

// --- supabase client ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getSupabase() {
  return supabase
}

// --- tool wiring ---

const fomoTools: AnthropicToolDefinition[] = nansenTools
  .filter((t) => t.name === 'nansen_bettor_profile')
  .map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }))

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const tool = nansenTools.find((t) => t.name === name)
  if (!tool) return { error: `Unknown tool: ${name}` }
  try {
    return await tool.execute(input)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// --- generate node ---

const MAX_TOOL_ITERATIONS = 10

async function generateNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const userContent = JSON.stringify({
    signals: state.signals,
    feedback: state.broadcaster_feedback,
  })

  const messages: AnthropicMessage[] = [{ role: 'user', content: userContent }]

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await callMinimax(
      messages,
      fomoTools,
      FOMO_MASTER_SYSTEM_PROMPT,
      { max_tokens: 2048, temperature: 0.7 }
    )

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

      for (const block of toolUseBlocks) {
        console.log(`[fomo_master] Tool call: ${block.name}(${JSON.stringify(block.input)})`)
        const result = await executeTool(block.name, block.input)
        const resultStr = JSON.stringify(result)
        console.log(`[fomo_master] Tool result: ${resultStr}`)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultStr,
        })
      }

      messages.push({ role: 'user', content: toolResults } as AnthropicMessage)
      continue
    }

    // Handle end_turn or max_tokens — both may carry text output
    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      const text = extractText(response)
      if (!text) break
      try {
        const parsed = JSON.parse(text) as { posts: DraftPost[] }
        console.log(`[fomo_master] Generated ${parsed.posts.length} draft(s) (attempt ${state.attempt})`)
        return { drafts: parsed.posts }
      } catch {
        console.warn(`[fomo_master] Failed to parse LLM output (stop_reason=${response.stop_reason}) — skipping`)
        break
      }
    }

    break
  }

  console.warn('[fomo_master] Tool-use loop ended without final output')
  return { drafts: null }
}

// --- broadcast node ---

interface BroadcasterOutput {
  decision: 'approved' | 'rejected'
  reasoning: string
  feedback: string
}

async function broadcastNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const response = await callMinimax(
    [
      {
        role: 'user',
        content: JSON.stringify({ drafts: state.drafts, timeline: state.timeline }),
      },
    ],
    [],
    BROADCASTER_SYSTEM_PROMPT,
    { max_tokens: 1024, temperature: 0.3 }
  )

  let output: BroadcasterOutput
  try {
    output = JSON.parse(extractText(response)) as BroadcasterOutput
  } catch {
    console.warn('[chief_broadcaster] Failed to parse response — defaulting to approved')
    output = { decision: 'approved', reasoning: 'parse error — auto-approved', feedback: '' }
  }
  console.log(`[chief_broadcaster] Decision: ${output.decision} — ${output.reasoning}`)

  if (output.decision === 'rejected') {
    return {
      broadcaster_feedback: output.feedback,
      broadcaster_decision: 'rejected',
      broadcaster_reasoning: output.reasoning,
      attempt: state.attempt + 1,
    }
  }

  return {
    broadcaster_decision: 'approved',
    broadcaster_reasoning: output.reasoning,
    attempt: state.attempt + 1,
  }
}

// --- conditional edge after broadcast ---

const MAX_ATTEMPTS = 3

function broadcastRouter(state: typeof FomoState.State): string {
  if (state.broadcaster_decision === 'approved') return 'save'
  if (state.attempt >= MAX_ATTEMPTS) return 'save_rejected'
  return 'generate'
}

// --- save node ---

async function saveNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const db = getSupabase()
  const now = new Date().toISOString()

  for (const draft of state.drafts ?? []) {
    await db.from('x_posts').insert({
      draft_text: draft.draft_text,
      status: 'draft',
      agent_type: 'fomo_master',
      signal_ids: draft.signal_ids,
      fomo_reasoning: draft.reasoning,
      broadcaster_reasoning: state.broadcaster_reasoning,
      reviewed_at: now,
      reviewed_by: 'chief_broadcaster',
    })
    console.log(`[fomo_master] Saved draft: "${draft.draft_text.slice(0, 60)}..."`)
  }

  return {}
}

// --- save_rejected node ---

async function saveRejectedNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  if (!state.drafts) {
    console.log('[fomo_master] No drafts to save (LLM returned nothing)')
    return {}
  }

  const db = getSupabase()
  const now = new Date().toISOString()

  for (const draft of state.drafts) {
    await db.from('x_posts').insert({
      draft_text: draft.draft_text,
      status: 'rejected',
      agent_type: 'fomo_master',
      signal_ids: draft.signal_ids,
      fomo_reasoning: draft.reasoning,
      broadcaster_reasoning: state.broadcaster_reasoning,
      reviewed_at: now,
      reviewed_by: 'chief_broadcaster',
    })
    console.log(`[fomo_master] Saved rejected draft after ${state.attempt} attempt(s)`)
  }

  return {}
}

// --- graph ---

export const fomoMasterGraph = new StateGraph(FomoState)
  .addNode('generate', generateNode)
  .addNode('broadcast', broadcastNode)
  .addNode('save', saveNode)
  .addNode('save_rejected', saveRejectedNode)
  .addEdge(START, 'generate')
  .addEdge('generate', 'broadcast')
  .addConditionalEdges('broadcast', broadcastRouter, {
    save: 'save',
    save_rejected: 'save_rejected',
    generate: 'generate',
  })
  .addEdge('save', END)
  .addEdge('save_rejected', END)
  .compile()
