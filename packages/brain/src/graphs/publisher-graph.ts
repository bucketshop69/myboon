import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import type { PublishedOutput, CriticOutput, Narrative } from '../publisher-types.js'
import { runPublisherLLM } from '../publisher-llm.js'
import { callMinimax, extractText } from '../minimax.js'

// Robust JSON extraction — same pattern as influencer-graph and fomo-master-graph.
// Handles LLM markdown fences, trailing text, and truncated responses.
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

const MAX_REVISIONS = 2

// --- critic system prompt ---

const CRITIC_SYSTEM_PROMPT = `You are a Senior Editor reviewing a draft before publication.

Your job is to catch problems and enforce format rules. Do NOT rewrite — flag issues so the publisher can fix them.

---

HARD RULES (reject or revise if broken):

1. content_small FORMAT:
   - Must be 3-4 short lines, each a standalone fact. NOT a paragraph.
   - Total must be under 200 characters.
   - If it reads as a dense block of text → revise.

2. content_small LEAD:
   - NEVER starts with "A wallet...", "A tracked wallet...", "We tracked..."
   - fomo/signal → must lead with number or position: "$500K against Hormuz"
   - macro/news → must lead with thesis: "Fed rate cut odds collapsed"
   - sports → must lead with what happened: "Real Madrid odds flipped"
   - If the lead is generic or buries the number → revise.

3. content_small PUNCHLINE:
   - Must end with a short one-liner that lands: "And they're still holding." / "Maybe he knows something."
   - If it just trails off with analysis → revise.

4. TONE:
   - Must sound like a trader texting a friend, not an analyst writing a report.
   - Flag: "scenario bifurcation", "conditional resolution pathways", "asymmetric payoff structure", "structurally significant"
   - If it reads like a Bloomberg terminal note → revise.

5. NO JARGON in content_small. Save technical framing for content_full only.

---

SOFT CHECKS (flag only if clearly broken):

6. ANGLE FRESHNESS: Looking at tag_history, is this the same story with nothing new?
   Same wallet featured 3+ times recently on same topic → reject.

7. CLASSIFICATION: Does content_type match? Only flag if clearly wrong.

8. content_full: Should be 3-5 sentences, conversational. If it's a research paper → revise.

---

- If the draft is genuinely good, say "approve" and move on.
- Only flag real problems.

Return JSON:
{
  "verdict": "approve" | "revise" | "reject",
  "issues": string[],
  "reasoning": string | null
}

reasoning: null if approve. Otherwise explain WHY so publisher can fix it.
Only return the JSON object — no other text.`

// --- state annotation ---

const PublisherState = Annotation.Root({
  narrative: Annotation<Narrative>,
  draft: Annotation<PublishedOutput | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  tag_history: Annotation<unknown[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  critic: Annotation<CriticOutput | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  attempts: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
})

// --- nodes ---

async function publisherNode(state: typeof PublisherState.State): Promise<Partial<typeof PublisherState.State>> {
  const draft = await runPublisherLLM(state.narrative, state.tag_history, state.critic)
  return { draft, attempts: state.attempts + 1 }
}

async function criticNode(state: typeof PublisherState.State): Promise<Partial<typeof PublisherState.State>> {
  const critic = await runCriticLLM(state.draft!, state.tag_history)
  console.log(`[publisher] Critic verdict: ${critic.verdict}${critic.issues.length > 0 ? ' — ' + critic.issues.join(', ') : ''}`)
  return { critic }
}

async function runCriticLLM(
  draft: PublishedOutput,
  tagHistory: unknown[]
): Promise<CriticOutput> {
  const response = await callMinimax(
    [{ role: 'user', content: JSON.stringify({ draft, tag_history: tagHistory }) }],
    [],
    CRITIC_SYSTEM_PROMPT,
    { max_tokens: 512, temperature: 0.1 }
  )
  const parsed = extractJson<CriticOutput>(extractText(response), 'critic')
  if (!parsed?.verdict) {
    console.warn('[critic] Could not parse response — defaulting to approve')
    return { verdict: 'approve', issues: [], reasoning: null }
  }
  return parsed
}

// --- conditional edge ---

function routeAfterCritic(state: typeof PublisherState.State): 'revise' | 'done' {
  if (state.critic?.verdict === 'approve') return 'done'
  if (state.critic?.verdict === 'reject') return 'done'
  if (state.attempts >= MAX_REVISIONS) return 'done'
  return 'revise'
}

// --- graph ---

export const publisherGraph = new StateGraph(PublisherState)
  .addNode('publisher', publisherNode)
  .addNode('editor', criticNode)
  .addEdge(START, 'publisher')
  .addEdge('publisher', 'editor')
  .addConditionalEdges('editor', routeAfterCritic, {
    revise: 'publisher',
    done: END,
  })
  .compile()
