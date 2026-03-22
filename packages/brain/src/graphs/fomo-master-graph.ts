import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import { createClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from '../minimax.js'

// --- local types ---

export interface FormattedSignal {
  id: string
  type: string
  weight: number
  metadata: Record<string, unknown>
  created_at: string
  nansen_profile: unknown | null
  live_odds: number | null
  market_history: {
    bet_count: number
    distinct_wallets: number
    total_volume: number
  }
  cluster_context: {
    signal_count: number
    distinct_wallets: number
    total_volume: number
    latest_at: string
  } | null
  formatted_text: string
}

export interface RankedSignal extends FormattedSignal {
  rank: number
}

export interface PendingDraft {
  signal_id: string
  draft_text: string
  reasoning: string
  attempt: number
  edits: Array<{ issue: string; fix: string }>
  last_broadcaster_reasoning: string | null
}

export interface DraftPost {
  draft_text: string
  reasoning: string
  signal_id: string
  broadcaster_reasoning: string | null
}

export interface BroadcastReview {
  draft_id: string
  decision: 'approved' | 'soft_reject' | 'hard_reject'
  reasoning: string
  edits: Array<{ issue: string; fix: string }>
}

export interface XPostRow {
  draft_text: string
  agent_type: string
  status: string
  created_at: string
}

// --- state annotation ---

const FomoState = Annotation.Root({
  formatted_signals: Annotation<FormattedSignal[]>,
  posted_timeline: Annotation<XPostRow[]>,
  full_timeline: Annotation<XPostRow[]>,
  ranked_signals: Annotation<RankedSignal[] | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  why_skipped: Annotation<Record<string, string> | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  drafts_approved: Annotation<DraftPost[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  drafts_pending: Annotation<PendingDraft[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  drafts_rejected: Annotation<PendingDraft[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  broadcaster_reviews: Annotation<BroadcastReview[] | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
})

// --- supabase client ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// --- robust JSON extraction ---
// Tries direct parse first, then bracket-matching that skips string contents,
// then truncation repair for incomplete JSON

function extractJson<T>(text: string, label?: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  // Try direct parse first
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // fall through
  }

  // Bracket matching that skips over string contents (handles quotes inside values)
  const start = cleaned.search(/[{[]/)
  if (start === -1) {
    if (label) console.warn(`[${label}] No JSON object found in LLM output:\n${cleaned.slice(0, 300)}`)
    return null
  }

  const opener = cleaned[start]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === opener) depth++
    else if (ch === closer) depth--
    if (depth === 0) {
      try {
        return JSON.parse(cleaned.slice(start, i + 1)) as T
      } catch {
        break
      }
    }
  }

  // Last resort: truncation repair — append closing brackets
  try {
    const fragment = cleaned.slice(start)
    const opens = (fragment.match(/\{/g) ?? []).length - (fragment.match(/\}/g) ?? []).length
    const arrOpens = (fragment.match(/\[/g) ?? []).length - (fragment.match(/\]/g) ?? []).length
    const repaired = fragment + ']'.repeat(Math.max(0, arrOpens)) + '}'.repeat(Math.max(0, opens))
    return JSON.parse(repaired) as T
  } catch {
    if (label) console.warn(`[${label}] Failed all JSON extraction attempts. Raw output:\n${cleaned.slice(0, 500)}`)
    return null
  }
}

// --- system prompts ---

const RANKER_SYSTEM_PROMPT = `You are the editorial director for a financial intelligence X account.
Your job: from a batch of whale bet signals, pick the 1-3 most compelling stories to post about.

Ranking criteria (in order):
1. Contrarian conviction — large bet on a low-probability outcome is the strongest signal
2. Wallet credibility — a high win-rate wallet with proven PnL matters more than an unknown wallet
3. Pattern — multiple wallets betting the same market is a story on its own
4. Size — raw dollar amount (everyone can read this, so it's the weakest differentiator alone)
5. Timing — a fresh bet is more relevant than a stale one

You will receive formatted signal blocks with short IDs (S1, S2, ...). Each block includes: bet direction+odds (for contrarian scoring), Nansen profile (for credibility), market_history (for pattern), and cluster_context (if multiple wallets hit this market).

Return JSON:
{
  "picks": [
    { "signal_id": "S1", "rank": 1, "reasoning": "why this is the best story" }
  ],
  "why_skipped": {
    "S2": "reason this signal was not picked"
  }
}

Include a why_skipped entry for every signal you do NOT pick.`

const WRITER_SYSTEM_PROMPT = `You are a fast, sharp financial intelligence account on X (Twitter).
Style: Lookonchain — specific numbers, wallet context, story-driven.

Rules:
- Lead with the number or the story: "$26K fresh wallet", "71% win rate bettor", "3rd bet this week"
- No hashtags, no threads (single post only)
- Emoji only if it adds urgency: 🚨 ⚡ 💰 (max 1 per post)
- Sound informed, not hype-y — you're a pro analyst, not a degen
- When referencing Nansen data, phrase it naturally — not "10-bet whale" but "a wallet that's barely traded before" or "fresh account"
- NEVER write "Full context in the feed." or any app CTA — the post must stand alone
- NEVER be vague about wallet history — use the actual nansen_profile data (win_rate, trade_count, total_pnl)
- Do NOT include the Polymarket URL — it will be appended automatically

Examples:
🚨 New wallet dropped $26K on YES for US forces entering Iran by March 31.
   Odds sitting at 18%. Fresh account, only a handful of trades on record.

⚡ A wallet with a 71% win rate just bet $14K on Trump tariff escalation.
   Third bet on this market this week — total exposure now $38K.

Negative examples (never produce these):
❌ "A notable wallet made a significant bet on a political market." (vague — no numbers, no context)
❌ "🚀🔥💯 HUGE bet on Iran!" (hype, not analysis)
❌ "Full context in the feed." (CTA — hard reject)

You will receive ranked signal blocks. Write one post per signal.
If this is a retry, you will also receive the previous draft and specific edits from the broadcaster. Apply the direction — the fix field tells you what to change, not how to write it.

Return JSON:
{
  "drafts": [
    { "signal_id": "uuid", "draft_text": "...", "reasoning": "..." }
  ]
}`

const BROADCASTER_SYSTEM_PROMPT = `You are the chief broadcaster for a financial intelligence X account.
You review draft posts as a batch before any are saved.

You will receive:
- Draft posts from the writer
- Last 7 days of x_posts history (all agents, all statuses — for duplicate/frequency detection)

Hard reject (unfixable) if ANY of these:
- Contains "Full context in the feed." or any CTA pointing to an app — auto hard-reject, no exceptions
- Duplicate topic already well-covered in the last 24h
- Same market posted 3+ times this week
- No specific dollar amounts anywhere in the post

Soft reject (fixable, send back for rewrite) if:
- Wallet description is vague ("active in political markets") — must name specific win rate, PnL, or trade count
- The most compelling number is buried — it should be in the first line
- Tone is hype-y or unprofessional (fixable with direction)

Approve only if: specific numbers, named wallet context, fresh topic.

When soft rejecting, provide edits as [{ issue, fix }] pairs.
The fix should be directional — tell the writer what to change, not how to write it.
Example: { "issue": "buried the win rate", "fix": "lead with the 71% win rate before the dollar amount" }

Return JSON:
{
  "reviews": [
    {
      "draft_id": "signal_id",
      "decision": "approved" | "soft_reject" | "hard_reject",
      "reasoning": "...",
      "edits": [{ "issue": "...", "fix": "..." }]
    }
  ]
}`

// --- rank node ---

interface RankerOutput {
  picks: Array<{ signal_id: string; rank: number; reasoning: string }>
  why_skipped: Record<string, string>
}

async function rankNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  // Use short IDs (S1, S2, ...) to reduce UUID hallucination risk from the LLM
  const shortIdMap = new Map(
    state.formatted_signals.map((s, i) => [`S${i + 1}`, s.id])
  )

  const response = await callMinimax(
    [
      {
        role: 'user',
        content: JSON.stringify({
          signals: state.formatted_signals.map((s, i) => ({
            id: `S${i + 1}`,
            formatted_text: s.formatted_text,
          })),
        }),
      },
    ],
    [],
    RANKER_SYSTEM_PROMPT,
    { temperature: 0.3 }
  )

  const parsed = extractJson<RankerOutput>(extractText(response), 'ranker')

  if (!parsed || !parsed.picks?.length) {
    console.log('[ranker] No picks from LLM — routing to END')
    return {
      ranked_signals: [],
      why_skipped: parsed?.why_skipped ?? {},
    }
  }

  // Map short IDs back to actual signal IDs
  const ranked_signals: RankedSignal[] = parsed.picks
    .map((pick) => {
      const actualId = shortIdMap.get(pick.signal_id)
        ?? state.formatted_signals.find((s) => s.id === pick.signal_id)?.id  // fallback: direct UUID match
      const signal = state.formatted_signals.find((s) => s.id === actualId)
      if (!signal) {
        console.warn(`[ranker] Pick references unknown signal_id: ${pick.signal_id}`)
        return null
      }
      return { ...signal, rank: pick.rank }
    })
    .filter((s): s is RankedSignal => s !== null)
    .sort((a, b) => a.rank - b.rank)

  // Map why_skipped short IDs back to actual signal IDs
  const why_skipped: Record<string, string> = {}
  for (const [shortId, reason] of Object.entries(parsed.why_skipped ?? {})) {
    const actualId = shortIdMap.get(shortId) ?? shortId
    why_skipped[actualId] = reason
  }

  console.log(`[ranker] Picked ${ranked_signals.length} signal(s) to write about`)

  return { ranked_signals, why_skipped }
}

// --- rank router ---

function rankRouter(state: typeof FomoState.State): string {
  if (!state.ranked_signals?.length) return END
  return 'write'
}

// --- write node ---

interface WriterOutput {
  drafts: Array<{ signal_id: string; draft_text: string; reasoning: string }>
}

async function writeNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const isRetry = state.drafts_pending.length > 0

  // On retry: write only for pending drafts. On first attempt: write for all ranked signals.
  const signalsToWrite = isRetry
    ? state.drafts_pending
        .map((p) => state.ranked_signals!.find((s) => s.id === p.signal_id))
        .filter((s): s is RankedSignal => s !== null)
    : (state.ranked_signals ?? [])

  const userContent: Record<string, unknown> = {
    signals: signalsToWrite.map((s) => ({ signal_id: s.id, formatted_text: s.formatted_text })),
    posted_timeline: state.posted_timeline,
  }

  let prefix = ''
  if (isRetry) {
    prefix = 'REWRITE REQUESTED. Previous draft and edits are below for each signal.\n\n'
    userContent.previous_drafts = state.drafts_pending.map((p) => ({
      signal_id: p.signal_id,
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

  const parsed = extractJson<WriterOutput>(extractText(response), 'writer')

  if (!parsed?.drafts?.length) {
    console.warn('[writer] Could not extract drafts from LLM output')
    return { drafts_pending: [] }
  }

  console.log(`[writer] Produced ${parsed.drafts.length} draft(s) (retry=${isRetry})`)

  // Carry forward attempt count from pending state (resolveNode already bumped it)
  const pendingMap = new Map(state.drafts_pending.map((p) => [p.signal_id, p]))
  const newPending: PendingDraft[] = parsed.drafts.map((d) => {
    const prev = pendingMap.get(d.signal_id)
    return {
      signal_id: d.signal_id,
      draft_text: d.draft_text,
      reasoning: d.reasoning,
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

async function broadcastNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const response = await callMinimax(
    [
      {
        role: 'user',
        content: JSON.stringify({
          drafts: state.drafts_pending.map((p) => ({
            signal_id: p.signal_id,
            draft_text: p.draft_text,
          })),
          full_timeline: state.full_timeline,
        }),
      },
    ],
    [],
    BROADCASTER_SYSTEM_PROMPT,
    { temperature: 0.3 }
  )

  const parsed = extractJson<BroadcasterOutput>(extractText(response), 'chief_broadcaster')

  if (!parsed?.reviews?.length) {
    console.warn('[chief_broadcaster] Failed to parse response — auto-approving all pending drafts')
    const fallbackReviews: BroadcastReview[] = state.drafts_pending.map((p) => ({
      draft_id: p.signal_id,
      decision: 'approved' as const,
      reasoning: 'parse error — auto-approved',
      edits: [],
    }))
    return { broadcaster_reviews: fallbackReviews }
  }

  for (const r of parsed.reviews) {
    console.log(`[chief_broadcaster] ${r.draft_id}: ${r.decision} — ${r.reasoning}`)
  }

  return { broadcaster_reviews: parsed.reviews }
}

// --- resolve node ---
// Runs once after each broadcast cycle. Splits reviews into approved/pending/rejected
// and writes back bumped attempt counts. This is the only place processBroadcastReviews runs.
// MAX_RETRIES=2 means: initial write (attempt 0) + retry 1 (attempt 1) + retry 2 (attempt 2)
// After attempt 2 is soft-rejected, attempt would become 3 which fails the < MAX_RETRIES check.

const MAX_RETRIES = 2

async function resolveNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const reviews = state.broadcaster_reviews ?? []
  const pendingMap = new Map(state.drafts_pending.map((p) => [p.signal_id, p]))

  const newApproved: DraftPost[] = []
  const newPending: PendingDraft[] = []
  const newRejected: PendingDraft[] = []

  for (const review of reviews) {
    const draft = pendingMap.get(review.draft_id)
    if (!draft) {
      console.warn(`[resolve] Review references unknown draft_id: ${review.draft_id}`)
      continue
    }

    if (review.decision === 'approved') {
      newApproved.push({
        draft_text: draft.draft_text,
        reasoning: draft.reasoning,
        signal_id: draft.signal_id,
        broadcaster_reasoning: review.reasoning,
      })
    } else if (review.decision === 'hard_reject') {
      newRejected.push({ ...draft, last_broadcaster_reasoning: review.reasoning })
    } else {
      // soft_reject — bump attempt, send back to writer if under the limit
      const bumped = draft.attempt + 1
      if (bumped <= MAX_RETRIES) {
        newPending.push({
          ...draft,
          attempt: bumped,
          edits: review.edits ?? [],
          last_broadcaster_reasoning: review.reasoning,
        })
      } else {
        newRejected.push({ ...draft, last_broadcaster_reasoning: review.reasoning })
      }
    }
  }

  console.log(`[resolve] approved=${newApproved.length}, pending=${newPending.length}, rejected=${newRejected.length}`)

  return {
    drafts_approved: newApproved,
    drafts_pending: newPending,
    drafts_rejected: newRejected,
  }
}

// --- broadcast router (after resolve) ---

function broadcastRouter(state: typeof FomoState.State): string {
  return state.drafts_pending.length > 0 ? 'write' : 'save'
}

// --- save node ---

async function saveNode(state: typeof FomoState.State): Promise<Partial<typeof FomoState.State>> {
  const now = new Date().toISOString()

  if (!state.drafts_approved.length && !state.drafts_rejected.length) {
    console.log('[fomo_master] No drafts to save')
    return {}
  }

  for (const draft of state.drafts_approved) {
    const signal = state.formatted_signals.find((s) => s.id === draft.signal_id)
    const address = signal?.metadata?.user as string | undefined
    const draft_text = draft.draft_text.trimEnd() + (address ? '\nhttps://polymarket.com/' + address : '')

    await supabase.from('x_posts').insert({
      draft_text,
      status: 'draft',
      agent_type: 'fomo_master',
      signal_ids: [draft.signal_id],
      fomo_reasoning: draft.reasoning,
      broadcaster_reasoning: draft.broadcaster_reasoning,
      reviewed_at: now,
      reviewed_by: 'chief_broadcaster',
    })
    console.log(`[fomo_master] Saved approved draft: "${draft_text.slice(0, 60)}..."`)
  }

  for (const draft of state.drafts_rejected) {
    const signal = state.formatted_signals.find((s) => s.id === draft.signal_id)
    const address = signal?.metadata?.user as string | undefined
    const draft_text = draft.draft_text.trimEnd() + (address ? '\nhttps://polymarket.com/' + address : '')

    await supabase.from('x_posts').insert({
      draft_text,
      status: 'rejected',
      agent_type: 'fomo_master',
      signal_ids: [draft.signal_id],
      fomo_reasoning: draft.reasoning,
      broadcaster_reasoning: draft.last_broadcaster_reasoning,
      reviewed_at: now,
      reviewed_by: 'chief_broadcaster',
    })
    console.log(`[fomo_master] Saved rejected draft (attempt ${draft.attempt}): "${draft_text.slice(0, 60)}..."`)
  }

  return {}
}

// --- graph ---

export const fomoMasterGraph = new StateGraph(FomoState)
  .addNode('rank', rankNode)
  .addNode('write', writeNode)
  .addNode('broadcast', broadcastNode)
  .addNode('resolve', resolveNode)
  .addNode('save', saveNode)
  .addEdge(START, 'rank')
  .addConditionalEdges('rank', rankRouter, {
    write: 'write',
    [END]: END,
  })
  .addEdge('write', 'broadcast')
  .addEdge('broadcast', 'resolve')
  .addConditionalEdges('resolve', broadcastRouter, {
    write: 'write',
    save: 'save',
  })
  .addEdge('save', END)
  .compile()
