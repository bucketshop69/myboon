import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import type { PublishedOutput, CriticOutput, Narrative } from '../publisher-types.js'
import { runPublisherLLM } from '../publisher-llm.js'
import { callMinimax, extractText } from '../minimax.js'

const MAX_REVISIONS = 2

// --- critic system prompt ---

const CRITIC_SYSTEM_PROMPT = `You are a Senior Editor reviewing a draft from your Editor-in-Chief.

Your job is NOT to rewrite their work. Your job is to catch obvious problems and ensure quality before publication.

---

CHECK FOR THESE PROBLEMS:

1. CLARITY: Does the content_small make immediate sense? Or does it require re-reading?

2. ANGLE FRESHNESS: Looking at tag_history, is this essentially the same story with no new information?
   (e.g., same wallets, same position, nothing materially moved — odds, IO, actors)
   → Only flag if it's genuinely a rehash, not if the angle is meaningfully different.

3. LEAD QUALITY: Does the opening grab attention?
   - Weak opens: "A wallet placed...", "A tracked wallet...", "We tracked a whale..."
   - Strong leads start with the insight: "$50K on UCL markets" not "A wallet bet on UCL"
   → Only flag if the lead is genuinely weak, not as a preference.

4. CLASSIFICATION: Does the content_type match what was written?
   - "sports" → match, tournament, or sports prediction market narrative
   - "macro" → geopolitics, elections, central bank, trade war, regime change
   - "fomo" → a specific, unusual position or bet from one wallet
   - "signal" → a pattern across multiple actors or time
   - "news" → a real-world event with immediate market reaction
   - "crypto" → token prices, DEX flows, on-chain crypto activity
   → Only flag if it's clearly misclassified, not a minor edge case.

5. TONE: Does this sound sharp and informed? No hype, no fluff, no markdown.

---

IMPORTANT:

- Do NOT micromanage. The Editor-in-Chief has editorial discretion.
- If something is genuinely good, say "approve" and move on.
- Only flag real problems, not preferences.

---

Return JSON with exactly this shape:
{
  "verdict": "approve" | "revise" | "reject",
  "issues": string[],
  "reasoning": string | null
}

reasoning: explain WHY you flagged the issue so the publisher can fix it themselves. Set to null if verdict is "approve".
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
  return JSON.parse(extractText(response)) as CriticOutput
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
