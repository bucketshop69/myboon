import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import { createClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from '../minimax.js'
import type { PublishedNarrative } from '../publisher-types.js'

// --- influencer system prompt ---

const INFLUENCER_SYSTEM_PROMPT = `You are a sharp financial intelligence writer for X (Twitter). 
Write a single post draft for the narrative provided.

Rules:
- Maximum 280 characters (enforced in code — do not worry about counting)
- No hashtags
- No emojis unless content_type is "fomo" or "sports" tag present (max 1)
- Lead with the insight, not the source ("$120K across UCL knockout markets" not "We tracked a whale...")
- End with soft CTA if space allows: "Full context in the feed."
- content_type "fomo" → punchy, specific numbers, urgency
- content_type "signal" → trend framing ("Smart money has been...")
- content_type "news" → factual hook, then market reaction

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
  const trimmed = output.draft_text.slice(0, 280)
  return { draft_text: trimmed }
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
