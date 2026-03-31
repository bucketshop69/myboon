import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import { createClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from '../minimax.js'
import type { PublishedNarrative } from '../publisher-types.js'

// --- influencer system prompt ---

const INFLUENCER_SYSTEM_PROMPT = `You are a sharp financial intelligence writer for X (Twitter).
Write a single post draft for the narrative provided. 3-5 lines. No hashtags.

Voice per content_type:
- "fomo" → punchy, numbers-first, urgency. No CTA. The post stands alone.
- "signal" → trend frame ("Smart money has been..."). End with: "Full context in the feed."
- "sports" → match preview voice. Lead with "[Team] at [odds]%". Max 1 sports emoji (⚽ 🏀 🏈). End with: "Full context in the feed."
- "macro" → authoritative, analytical. "The market is pricing [event] differently than the news." End with: "Full context in the feed."
- "news" → factual hook first, then market reaction. End with: "Full context in the feed."
- "crypto" → on-chain angle, specific flows or positions. End with: "Full context in the feed."

Rules:
- Lead with the insight, not the source
- No wallet language ("a wallet placed...") for sports or macro content
- Max 1 emoji total, only if it genuinely adds to the post

Return JSON: { "draft_text": string, "reasoning": string }`

// --- state annotation ---

const InfluencerState = Annotation.Root({
  narrative: Annotation<PublishedNarrative>,
  draft_text: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
})

// --- supabase client (module-level, fails fast at startup) ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getSupabase() {
  return supabase
}

// --- influencer LLM call ---

async function runInfluencerLLM(narrative: PublishedNarrative): Promise<{ draft_text: string; reasoning: string }> {
  const response = await callMinimax(
    [{ role: 'user', content: JSON.stringify(narrative) }],
    [],
    INFLUENCER_SYSTEM_PROMPT,
    { max_tokens: 512, temperature: 0.5 }
  )
  return JSON.parse(extractText(response)) as { draft_text: string; reasoning: string }
}

// --- nodes ---

async function generateNode(state: typeof InfluencerState.State): Promise<Partial<typeof InfluencerState.State>> {
  const output = await runInfluencerLLM(state.narrative)
  return { draft_text: output.draft_text }
}

async function saveNode(state: typeof InfluencerState.State): Promise<Partial<typeof InfluencerState.State>> {
  const supabase = getSupabase()
  await supabase.from('x_posts').insert({
    narrative_id: state.narrative.id,
    draft_text: state.draft_text!,
    status: 'draft',
  })
  console.log(`[influencer] Draft created for narrative ${state.narrative.id}`)
  return {}
}

// --- graph ---

export const influencerGraph = new StateGraph(InfluencerState)
  .addNode('generate', generateNode)
  .addNode('save', saveNode)
  .addEdge(START, 'generate')
  .addEdge('generate', 'save')
  .addEdge('save', END)
  .compile()
