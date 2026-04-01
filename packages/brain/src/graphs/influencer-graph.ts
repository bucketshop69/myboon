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

// --- JSON extraction with truncation repair (handles unterminated strings from LLM) ---

function extractJson<T>(text: string, label?: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try { return JSON.parse(cleaned) as T } catch { /* fall through */ }

  const start = cleaned.search(/[{[]/)
  if (start === -1) {
    if (label) console.warn(`[${label}] No JSON object found:\n${cleaned.slice(0, 300)}`)
    return null
  }

  const opener = cleaned[start]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0, inString = false, escape = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === opener) depth++
    else if (ch === closer) depth--
    if (depth === 0) {
      try { return JSON.parse(cleaned.slice(start, i + 1)) as T } catch { break }
    }
  }

  // Truncation repair — close any unclosed braces/arrays
  try {
    const fragment = cleaned.slice(start)
    const opens = (fragment.match(/\{/g) ?? []).length - (fragment.match(/\}/g) ?? []).length
    const arrOpens = (fragment.match(/\[/g) ?? []).length - (fragment.match(/\]/g) ?? []).length
    const repaired = fragment + ']'.repeat(Math.max(0, arrOpens)) + '}'.repeat(Math.max(0, opens))
    return JSON.parse(repaired) as T
  } catch {
    if (label) console.warn(`[${label}] All JSON extraction attempts failed:\n${cleaned.slice(0, 500)}`)
    return null
  }
}

// --- influencer LLM call ---

async function runInfluencerLLM(narrative: PublishedNarrative): Promise<{ draft_text: string; reasoning: string }> {
  const response = await callMinimax(
    [{ role: 'user', content: JSON.stringify(narrative) }],
    [],
    INFLUENCER_SYSTEM_PROMPT,
    { max_tokens: 512, temperature: 0.5 }
  )
  const parsed = extractJson<{ draft_text: string; reasoning: string }>(extractText(response), 'influencer')
  if (!parsed?.draft_text) throw new Error('[influencer] LLM returned unparseable JSON')
  return parsed
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
