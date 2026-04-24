import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import type { PublishedOutput, CriticOutput, Narrative } from '../publisher-types.js'
import { runPublisherLLM } from '../publisher-llm.js'
import { callMinimax, extractText } from '../minimax.js'
import { extractJson } from '../json-utils.js'

const MAX_REVISIONS = 2

// --- critic system prompt ---

const CRITIC_SYSTEM_PROMPT = `You are a Senior Editor reviewing a draft before publication.

Your job is to catch problems and enforce format rules. Do NOT rewrite — flag issues so the publisher can fix them.

---

HARD RULES (reject or revise if broken):

1. content_small LENGTH:
   - MUST be 100-150 characters total. Count them.
   - If over 150 characters → revise. This is non-negotiable.
   - 2-3 short lines, each a standalone fact. NOT a paragraph.

2. content_small LEAD:
   - NEVER starts with "A wallet...", "A tracked wallet...", "We tracked..."
   - fomo/signal → must lead with number or position: "$500K against Hormuz"
   - macro/news → must lead with thesis: "Fed cut odds collapsed"
   - sports → must lead with what happened: "Real Madrid odds flipped"
   - If the lead is generic or buries the number → revise.

3. content_small PUNCHLINE:
   - Must end with a short one-liner that lands.
   - If it just trails off with analysis → revise.

4. TONE:
   - Must sound like a trader texting a friend, not an analyst writing a report.
   - Instant reject words: "scenario bifurcation", "conditional resolution pathways", "asymmetric payoff structure", "structurally significant", "notably", "underscores"
   - If it reads like a Bloomberg terminal note → revise.

5. content_full LENGTH:
   - Max 400 characters, 2-3 sentences.
   - If it's a research paper or over 400 chars → revise.
   - Must add NEW info, not repeat content_small.

6. PRIORITY SCORE:
   - Most narratives should be 4-6. If priority is 8+ it needs a clear reason (breaking event, massive position, time-critical).
   - If priority is 8+ without justification → revise down.

---

SOFT CHECKS (flag only if clearly broken):

7. ANGLE FRESHNESS: Same wallet featured 3+ times recently on same topic → reject.
8. CLASSIFICATION: Does content_type match? Only flag if clearly wrong.

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
