import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import { createClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from '../minimax.js'

// --- types ---

export interface FormattedMatchSignal {
  entry: {
    match: string
    sport: string
    kickoff: string
    slugs: { home: string; away: string; draw?: string }
  }
  phase: 'preview' | 'live' | 'post_match'
  slug: string                              // dedup anchor: "epl-bou-mun-2026-04-05"
  outcomes: Array<{
    label: string
    slug: string
    live_odds: number | null
  }>
  market_history: {
    bet_count: number
    distinct_wallets: number
    total_volume: number
  }
  recent_whale_activity: Array<{
    slug: string
    amount: number
    side: string
  }>
  kickoff_hint: string                      // "~18h away" | "Live now" | "Ended 2h ago"
  formatted_text: string
}

interface PendingDraft {
  slug: string
  phase: string
  draft_text: string
  reasoning: string
  archetype: string
  attempt: number
  edits: Array<{ issue: string; fix: string }>
  last_broadcaster_reasoning: string | null
}

interface ApprovedDraft {
  slug: string
  phase: string
  draft_text: string
  reasoning: string
  broadcaster_reasoning: string | null
}

interface RejectedDraft extends PendingDraft {}

interface BroadcastReview {
  draft_id: string                          // slug:phase composite key
  decision: 'approved' | 'soft_reject' | 'hard_reject'
  reasoning: string
  edits: Array<{ issue: string; fix: string }>
}

interface XPostRow {
  draft_text: string
  agent_type: string
  status: string
  created_at: string
  slug: string | null
}

// --- state ---

const SportsBroadcasterState = Annotation.Root({
  matches: Annotation<FormattedMatchSignal[]>,
  timeline: Annotation<XPostRow[]>,
  drafts_pending: Annotation<PendingDraft[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  drafts_approved: Annotation<ApprovedDraft[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  drafts_rejected: Annotation<RejectedDraft[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  broadcaster_reviews: Annotation<BroadcastReview[] | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
})

// --- supabase ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// --- JSON extraction (3-tier fallback) ---

function extractJson<T>(text: string, label?: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try { return JSON.parse(cleaned) as T } catch { /* fall through */ }

  const start = cleaned.search(/[{[]/)
  if (start === -1) {
    if (label) console.warn(`[${label}] No JSON found:\n${cleaned.slice(0, 300)}`)
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
    if (label) console.warn(`[${label}] Failed all JSON extraction attempts:\n${cleaned.slice(0, 500)}`)
    return null
  }
}

// --- system prompts ---

const WRITER_SYSTEM_PROMPT = `You are the sports broadcaster for a prediction markets intelligence X account.
Your audience: Polymarket bettors, sports fans who follow smart money, people who want market context on big matches.

[Voice]
Observational. Analytical. You frame the match through odds and money flow — not cheerleading.
3-5 lines per post. Each line earns its place. No filler.
Lead with the odds or the money angle, not the score or match narrative.
End with an implication: what does this price or this bet tell us?

[Phase voices]
PREVIEW: Where does the money sit going into this match? What does that price imply about expectations?
  Lead with odds. Include volume context. End with what the market believes.
  Example: "Bournemouth hosting Man Utd on Saturday. United priced at 34% away — the market has them as underdogs on the road. $22K moved on this fixture in the last 48h, weighted toward the home side. The smart money isn't backing the name here."

LIVE: Smart money moving during the match. Size, direction, timing.
  Lead with the bet. Include the odds context (what % is this?). End with the question.
  Example: "$18K went on Man Utd at 34% with kickoff 90 min away. Two wallets, coordinated timing. Either late conviction or someone knows something about the team news."

POST_MATCH: Close the loop. Who did the market have right?
  Lead with the result. Include what the market priced them at. End with what the bettors collected.
  Example: "Man Utd won away at Bournemouth. They were 34% going in. The $18K that backed the away side at that price collected. The market was wrong. The bettors weren't."

[Hard rules]
- No wallet addresses — ever
- Lead with odds % and match context, not team names alone
- No hashtags
- Max 1 emoji: ⚽ for EPL/UCL, none if it doesn't fit
- No "Full context in the feed." or any CTA
- Sports posts stand alone

Return JSON:
{
  "drafts": [
    {
      "draft_id": "<slug>:<phase>",
      "archetype": "PREVIEW | LIVE | POST_MATCH",
      "draft_text": "...",
      "reasoning": "what angle you led with and why"
    }
  ]
}`

const BROADCASTER_SYSTEM_PROMPT = `You are the chief broadcaster reviewing sports posts before they go live.

[You will receive]
Each draft includes: draft_id (slug:phase composite), draft_text, archetype.
You also receive the recent x_posts timeline (sports_broadcaster_* agent_types only).

[Hard reject triggers]
- Same slug + phase already posted (status='posted') in the last 48h — use draft_id to check
- POST_MATCH post where the match hasn't ended yet (draft will note if this is the case)
- Contains wallet addresses
- Contains "Full context in the feed." or any CTA
- No odds percentage mentioned at all

[Soft reject triggers]
- Lead is the team names, not the odds or money angle
- Implication line is missing — post ends on a fact, not a tension
- Tone is hype-y or reads like a sports blog

[Soft reject edits]
Provide as [{ issue, fix }] pairs. Directional fix — tell the writer what to change, not how to write it.

Return JSON:
{
  "reviews": [
    {
      "draft_id": "<slug>:<phase>",
      "decision": "approved | soft_reject | hard_reject",
      "reasoning": "...",
      "edits": [{ "issue": "...", "fix": "..." }]
    }
  ]
}`

// --- write node ---

interface WriterOutput {
  drafts: Array<{ draft_id: string; archetype: string; draft_text: string; reasoning: string }>
}

async function writeNode(
  state: typeof SportsBroadcasterState.State
): Promise<Partial<typeof SportsBroadcasterState.State>> {
  const isRetry = state.drafts_pending.length > 0

  const signalsToWrite = isRetry
    ? state.drafts_pending
    : state.matches.map((m) => ({
        slug: m.slug,
        phase: m.phase,
        draft_text: '',
        reasoning: '',
        archetype: m.phase.toUpperCase(),
        attempt: 0,
        edits: [],
        last_broadcaster_reasoning: null,
      }))

  const userContent: Record<string, unknown> = {
    matches: isRetry
      ? state.drafts_pending.map((p) => {
          const match = state.matches.find((m) => m.slug === p.slug && m.phase === p.phase)
          return { draft_id: `${p.slug}:${p.phase}`, formatted_text: match?.formatted_text ?? '' }
        })
      : state.matches.map((m) => ({
          draft_id: `${m.slug}:${m.phase}`,
          formatted_text: m.formatted_text,
        })),
  }

  let prefix = ''
  if (isRetry) {
    prefix = 'REWRITE REQUESTED. Previous draft and edits are below.\n\n'
    userContent.previous_drafts = state.drafts_pending.map((p) => ({
      draft_id: `${p.slug}:${p.phase}`,
      previous_draft: p.draft_text,
      edits: p.edits,
    }))
  }

  const response = await callMinimax(
    [{ role: 'user', content: prefix + JSON.stringify(userContent) }],
    [],
    WRITER_SYSTEM_PROMPT,
    { temperature: 0.7 }
  )

  const parsed = extractJson<WriterOutput>(extractText(response), 'sports_writer')

  if (!parsed?.drafts?.length) {
    console.warn('[sports_writer] Could not extract drafts from LLM output')
    return { drafts_pending: [] }
  }

  console.log(`[sports_writer] Produced ${parsed.drafts.length} draft(s) (retry=${isRetry})`)

  const pendingMap = new Map(
    (isRetry ? state.drafts_pending : (signalsToWrite as PendingDraft[])).map((p) => [
      `${p.slug}:${p.phase}`,
      p,
    ])
  )

  const newPending: PendingDraft[] = parsed.drafts.map((d) => {
    const [slug, phase] = d.draft_id.split(':')
    const prev = pendingMap.get(d.draft_id)
    return {
      slug,
      phase,
      draft_text: d.draft_text,
      reasoning: d.reasoning,
      archetype: d.archetype ?? phase?.toUpperCase() ?? 'PREVIEW',
      attempt: prev?.attempt ?? 0,
      edits: [],
      last_broadcaster_reasoning: null,
    }
  })

  return { drafts_pending: newPending }
}

// --- broadcast node ---

interface BroadcasterOutput {
  reviews: BroadcastReview[]
}

async function broadcastNode(
  state: typeof SportsBroadcasterState.State
): Promise<Partial<typeof SportsBroadcasterState.State>> {
  const response = await callMinimax(
    [
      {
        role: 'user',
        content: JSON.stringify({
          drafts: state.drafts_pending.map((p) => ({
            draft_id: `${p.slug}:${p.phase}`,
            draft_text: p.draft_text,
            archetype: p.archetype,
          })),
          timeline: state.timeline,
        }),
      },
    ],
    [],
    BROADCASTER_SYSTEM_PROMPT,
    { temperature: 0.3 }
  )

  const parsed = extractJson<BroadcasterOutput>(extractText(response), 'sports_broadcaster')

  if (!parsed?.reviews?.length) {
    console.warn('[sports_broadcaster] Failed to parse response — auto-approving all pending drafts')
    return {
      broadcaster_reviews: state.drafts_pending.map((p) => ({
        draft_id: `${p.slug}:${p.phase}`,
        decision: 'approved' as const,
        reasoning: 'parse error — auto-approved',
        edits: [],
      })),
    }
  }

  for (const r of parsed.reviews) {
    console.log(`[sports_broadcaster] ${r.draft_id}: ${r.decision} — ${r.reasoning}`)
  }

  return { broadcaster_reviews: parsed.reviews }
}

// --- resolve node ---

const MAX_RETRIES = 2

async function resolveNode(
  state: typeof SportsBroadcasterState.State
): Promise<Partial<typeof SportsBroadcasterState.State>> {
  const reviews = state.broadcaster_reviews ?? []
  const pendingMap = new Map(state.drafts_pending.map((p) => [`${p.slug}:${p.phase}`, p]))

  const newApproved: ApprovedDraft[] = []
  const newPending: PendingDraft[] = []
  const newRejected: RejectedDraft[] = []

  for (const review of reviews) {
    const draft = pendingMap.get(review.draft_id)
    if (!draft) {
      console.warn(`[sports_resolve] Review references unknown draft_id: ${review.draft_id}`)
      continue
    }

    if (review.decision === 'approved') {
      newApproved.push({
        slug: draft.slug,
        phase: draft.phase,
        draft_text: draft.draft_text,
        reasoning: draft.reasoning,
        broadcaster_reasoning: review.reasoning,
      })
    } else if (review.decision === 'hard_reject') {
      newRejected.push({ ...draft, last_broadcaster_reasoning: review.reasoning })
    } else {
      const bumped = draft.attempt + 1
      if (bumped <= MAX_RETRIES) {
        newPending.push({ ...draft, attempt: bumped, edits: review.edits ?? [], last_broadcaster_reasoning: review.reasoning })
      } else {
        newRejected.push({ ...draft, last_broadcaster_reasoning: review.reasoning })
      }
    }
  }

  console.log(`[sports_resolve] approved=${newApproved.length}, pending=${newPending.length}, rejected=${newRejected.length}`)

  return { drafts_approved: newApproved, drafts_pending: newPending, drafts_rejected: newRejected }
}

function broadcastRouter(state: typeof SportsBroadcasterState.State): string {
  return state.drafts_pending.length > 0 ? 'write' : 'save'
}

// --- save node ---

async function saveNode(
  state: typeof SportsBroadcasterState.State
): Promise<Partial<typeof SportsBroadcasterState.State>> {
  const now = new Date().toISOString()

  if (!state.drafts_approved.length && !state.drafts_rejected.length) {
    console.log('[sports_broadcaster] No drafts to save')
    return {}
  }

  for (const draft of state.drafts_approved) {
    const agentType = `sports_broadcaster_${draft.phase}`
    await supabase.from('x_posts').insert({
      draft_text: draft.draft_text,
      status: 'draft',
      agent_type: agentType,
      signal_ids: [],
      slug: draft.slug,
      fomo_reasoning: draft.reasoning,
      broadcaster_reasoning: draft.broadcaster_reasoning,
      reviewed_at: now,
      reviewed_by: 'sports_broadcaster',
    })
    console.log(`[sports_broadcaster] Saved approved ${draft.phase} draft for ${draft.slug}`)
  }

  for (const draft of state.drafts_rejected) {
    const agentType = `sports_broadcaster_${draft.phase}`
    await supabase.from('x_posts').insert({
      draft_text: draft.draft_text,
      status: 'rejected',
      agent_type: agentType,
      signal_ids: [],
      slug: draft.slug,
      fomo_reasoning: draft.reasoning,
      broadcaster_reasoning: draft.last_broadcaster_reasoning,
      reviewed_at: now,
      reviewed_by: 'sports_broadcaster',
    })
    console.log(`[sports_broadcaster] Saved rejected ${draft.phase} draft for ${draft.slug}`)
  }

  return {}
}

// --- graph ---

export const sportsBroadcasterGraph = new StateGraph(SportsBroadcasterState)
  .addNode('write', writeNode)
  .addNode('broadcast', broadcastNode)
  .addNode('resolve', resolveNode)
  .addNode('save', saveNode)
  .addEdge(START, 'write')
  .addEdge('write', 'broadcast')
  .addEdge('broadcast', 'resolve')
  .addConditionalEdges('resolve', broadcastRouter, {
    write: 'write',
    save: 'save',
  })
  .addEdge('save', END)
  .compile()
