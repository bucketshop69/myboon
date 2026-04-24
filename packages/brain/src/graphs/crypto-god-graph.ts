import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import { createClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from '../minimax.js'
import { extractJson } from '../json-utils.js'

// --- types ---

export interface FormattedSignal {
  id: string
  type: string
  weight: number
  metadata: Record<string, unknown>
  created_at: string
  live_price: string | null
  live_funding: string | null
  live_oi: string | null
  cluster_context: {
    signal_count: number
    total_oi_drop_usd: number
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
  symbol: string    // from signal.metadata.symbol — attached by writeNode, not LLM
  archetype: string // from LLM writer output
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

// --- state ---

const CryptoGodState = Annotation.Root({
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

// --- playbook ---

const PLAYBOOK = `
ARCHETYPE EXAMPLES — 4-5 lines. Observational voice. Build tension through facts, end with implication.
Study the structure, not the words.

--- WIPEOUT (LIQUIDATION_CASCADE) ---
Lead with the size. Then the speed. Then what it means.

GOOD:
$4.2M in BTC longs just got wiped on Pacific.
Price dropped 8.2% in 2 hours. OI fell 15.8% in the same window.
That's not organic selling — that's stop losses eating stop losses.
The cascade usually ends when it runs out of margin to liquidate.

GOOD:
ETH OI on Pacific just dropped $1.8M in a single 2-hour window.
Price up 6%. So it wasn't longs — shorts just got cleared out.
Now OI is lower and price is higher. Less resistance from here.

BAD:
"BTC longs were liquidated on Pacific as price fell." [Data, no weight.]

--- CROWDED (FUNDING_SPIKE) ---
Lead with the rate. Then what it costs per period. Then the tension.

GOOD:
BTC perp funding on Pacific: 0.015%/hr. That's 131% annualized.
Longs are paying shorts every 8 hours just to hold the position.
At some point, the carry cost kills the trade before the thesis plays out.
This market has been crowded here before. It didn't end well.

GOOD:
ETH funding just hit 0.012%/hr on Pacific — 105% annualized.
Every 8 hours, longs pay shorts. That's a slow tax on conviction.
When funding stays this high, one of two things happens:
price moves to flush the longs, or the longs give up and close.

BAD:
"ETH funding rate is elevated on Pacific at 0.012%/hr." [No story, no stakes.]

--- POSITIONING (OI_SURGE) ---
Lead with the size entering. Then the speed. Then the open question.

GOOD:
ETH open interest on Pacific up $400K in 2 hours. That's a 33% increase.
New margin entering a market this fast usually has a view.
Nobody moves $400K into a perp position without a reason.

GOOD:
SOL OI on Pacific just jumped 28% in one 2-hour window.
$320K in fresh margin, one direction.
This market just got a lot more interesting.

BAD:
"SOL open interest increased on Pacific." [Nothing to think about.]
`

// --- system prompts ---

const RANKER_SYSTEM_PROMPT = `You are the editorial director for a crypto intelligence X account covering perp markets.
From a batch of Pacific Protocol signals, pick the 1-3 most compelling stories to post about.

Ranking criteria (in order):
1. Size — largest USD value liquidated or OI change (most visceral, most readable)
2. Velocity — happened fastest relative to the size (urgency)
3. Corroboration — funding spike AND OI surge on same symbol = bigger story than either alone
4. Symbol tier — BTC/ETH over altcoins when signal strength is equal

You will receive formatted signal blocks with short IDs (S1, S2, ...).

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

const WRITER_SYSTEM_PROMPT = `You are the writer for a crypto intelligence X account covering perp markets on Pacific Protocol.
Your audience: on-chain traders, perp degens, people who want to know what's moving before it hits the timeline.

[Voice]
Observational. Not hype. 4-5 lines. Each line earns its place.
Build tension through facts. Let the implication land in the final line.
The reader should finish thinking "huh" — not "okay, so what."

[Archetypes — first match wins from signal data]
1. WIPEOUT: signal type is LIQUIDATION_CASCADE
2. CROWDED: signal type is FUNDING_SPIKE
3. POSITIONING: signal type is OI_SURGE

[Examples per archetype]
${PLAYBOOK}

[Hard rules]
- 4-5 lines. No more.
- No hashtags
- Max 1 emoji if it genuinely adds urgency (🚨 ⚡) — never 🚀🔥
- NEVER write "Full context in the feed." or any CTA
- NEVER be vague — use the actual USD amounts and percentages from the signal block
- Do NOT invent data not present in the signal block
- Do NOT include any URL — appended automatically

On retry: previous draft and broadcaster edits will be included. Apply the direction given.

Return JSON:
{
  "drafts": [
    {
      "signal_id": "uuid",
      "archetype": "WIPEOUT | CROWDED | POSITIONING",
      "draft_text": "...",
      "reasoning": "why this archetype, what you led with"
    }
  ]
}`

const BROADCASTER_SYSTEM_PROMPT = `You are the chief broadcaster for a crypto intelligence X account covering perp markets.
You review draft posts as a batch before any are saved.

[You will receive]
Each draft includes: signal_id, draft_text, symbol (e.g. "BTC"), archetype (WIPEOUT / CROWDED / POSITIONING).
You also receive the last 7 days of x_posts history for duplicate and frequency detection.

[CRITICAL: count only POSTED content toward frequency limits]
The timeline includes posts with status: posted, draft, rejected.
ONLY count status='posted' toward frequency limits.
Rejected drafts were NEVER published — do not treat them as coverage.
A symbol that only has rejected drafts in history is a fresh topic.

[Duplicate detection — angle fingerprint]
An angle is: {symbol}:{archetype}. Same symbol, different archetype = DIFFERENT story.

Hard reject if:
- The same {symbol}:{archetype} combination has status='posted' in the last 24h
- OR the same symbol has been posted 3+ times this week with the SAME archetype

Approve if:
- Same symbol, different archetype = fresh angle → approve
- Same symbol, same archetype, but >24h since last status='posted' → approve
- No prior status='posted' on this symbol = always approve

[Hard reject triggers]
- Same {symbol}:{archetype} posted (status='posted') in last 24h
- No specific USD amounts or percentages in the post
- Contains "Full context in the feed." or any CTA

[Soft reject triggers]
- Funding rate mentioned without annualized context (e.g. "0.015%/hr" with no annualized equivalent)
- Most compelling number is buried — it should be in the first line
- Tone is hype-y ("explosive", "insane", "to the moon")
- Vague about direction — WIPEOUT post must say whether longs or shorts got liquidated

[Soft reject edits]
Provide as [{ issue, fix }] pairs. Directional — tell the writer what to change, not how to write it.

Return JSON:
{
  "reviews": [
    {
      "draft_id": "signal_id",
      "decision": "approved | soft_reject | hard_reject",
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

async function rankNode(state: typeof CryptoGodState.State): Promise<Partial<typeof CryptoGodState.State>> {
  const shortIdMap = new Map(
    state.formatted_signals.map((s, i) => [`S${i + 1}`, s.id])
  )

  const response = await callMinimax(
    [{
      role: 'user',
      content: JSON.stringify({
        signals: state.formatted_signals.map((s, i) => ({
          id: `S${i + 1}`,
          formatted_text: s.formatted_text,
        })),
      }),
    }],
    [],
    RANKER_SYSTEM_PROMPT,
    { temperature: 0.3 }
  )

  const parsed = extractJson<RankerOutput>(extractText(response), 'ranker')

  if (!parsed || !parsed.picks?.length) {
    console.log('[crypto_god/ranker] No picks from LLM — routing to END')
    return { ranked_signals: [], why_skipped: parsed?.why_skipped ?? {} }
  }

  const ranked_signals: RankedSignal[] = parsed.picks
    .map((pick) => {
      const actualId = shortIdMap.get(pick.signal_id)
        ?? state.formatted_signals.find((s) => s.id === pick.signal_id)?.id
      const signal = state.formatted_signals.find((s) => s.id === actualId)
      if (!signal) {
        console.warn(`[crypto_god/ranker] Pick references unknown signal_id: ${pick.signal_id}`)
        return null
      }
      return { ...signal, rank: pick.rank }
    })
    .filter((s): s is RankedSignal => s !== null)
    .sort((a, b) => a.rank - b.rank)

  const why_skipped: Record<string, string> = {}
  for (const [shortId, reason] of Object.entries(parsed.why_skipped ?? {})) {
    const actualId = shortIdMap.get(shortId) ?? shortId
    why_skipped[actualId] = reason
  }

  console.log(`[crypto_god/ranker] Picked ${ranked_signals.length} signal(s)`)
  return { ranked_signals, why_skipped }
}

function rankRouter(state: typeof CryptoGodState.State): string {
  if (!state.ranked_signals?.length) return END
  return 'write'
}

// --- write node ---

interface WriterOutput {
  drafts: Array<{ signal_id: string; archetype: string; draft_text: string; reasoning: string }>
}

async function writeNode(state: typeof CryptoGodState.State): Promise<Partial<typeof CryptoGodState.State>> {
  const isRetry = state.drafts_pending.length > 0

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
    console.warn('[crypto_god/writer] Could not extract drafts from LLM output')
    return { drafts_pending: [] }
  }

  console.log(`[crypto_god/writer] Produced ${parsed.drafts.length} draft(s) (retry=${isRetry})`)

  const signalMap = new Map(state.ranked_signals!.map((s) => [s.id, s]))
  const pendingMap = new Map(state.drafts_pending.map((p) => [p.signal_id, p]))

  const newPending: PendingDraft[] = parsed.drafts.map((d) => {
    const signal = signalMap.get(d.signal_id)
    const symbol = (signal?.metadata?.symbol as string | undefined) ?? ''
    const prev = pendingMap.get(d.signal_id)
    return {
      signal_id: d.signal_id,
      draft_text: d.draft_text,
      reasoning: d.reasoning,
      archetype: d.archetype ?? 'POSITIONING',
      symbol,
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

async function broadcastNode(state: typeof CryptoGodState.State): Promise<Partial<typeof CryptoGodState.State>> {
  const response = await callMinimax(
    [{
      role: 'user',
      content: JSON.stringify({
        drafts: state.drafts_pending.map((p) => ({
          signal_id: p.signal_id,
          draft_text: p.draft_text,
          symbol: p.symbol,
          archetype: p.archetype,
        })),
        full_timeline: state.full_timeline,
      }),
    }],
    [],
    BROADCASTER_SYSTEM_PROMPT,
    { temperature: 0.3 }
  )

  const parsed = extractJson<BroadcasterOutput>(extractText(response), 'chief_broadcaster')

  if (!parsed?.reviews?.length) {
    console.warn('[crypto_god/broadcaster] Failed to parse response — auto-approving all pending drafts')
    const fallback: BroadcastReview[] = state.drafts_pending.map((p) => ({
      draft_id: p.signal_id,
      decision: 'approved' as const,
      reasoning: 'parse error — auto-approved',
      edits: [],
    }))
    return { broadcaster_reviews: fallback }
  }

  for (const r of parsed.reviews) {
    console.log(`[crypto_god/broadcaster] ${r.draft_id}: ${r.decision} — ${r.reasoning}`)
  }

  return { broadcaster_reviews: parsed.reviews }
}

// --- resolve node ---

const MAX_RETRIES = 2

async function resolveNode(state: typeof CryptoGodState.State): Promise<Partial<typeof CryptoGodState.State>> {
  const reviews = state.broadcaster_reviews ?? []
  const pendingMap = new Map(state.drafts_pending.map((p) => [p.signal_id, p]))

  const newApproved: DraftPost[] = []
  const newPending: PendingDraft[] = []
  const newRejected: PendingDraft[] = []

  for (const review of reviews) {
    const draft = pendingMap.get(review.draft_id)
    if (!draft) {
      console.warn(`[crypto_god/resolve] Review references unknown draft_id: ${review.draft_id}`)
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

  console.log(`[crypto_god/resolve] approved=${newApproved.length}, pending=${newPending.length}, rejected=${newRejected.length}`)

  return { drafts_approved: newApproved, drafts_pending: newPending, drafts_rejected: newRejected }
}

function broadcastRouter(state: typeof CryptoGodState.State): string {
  return state.drafts_pending.length > 0 ? 'write' : 'save'
}

// --- save node ---

async function saveNode(state: typeof CryptoGodState.State): Promise<Partial<typeof CryptoGodState.State>> {
  const now = new Date().toISOString()

  if (!state.drafts_approved.length && !state.drafts_rejected.length) {
    console.log('[crypto_god] No drafts to save')
    return {}
  }

  for (const draft of state.drafts_approved) {
    const draft_text = draft.draft_text.trimEnd() + '\nhttps://pacifica.fi'
    await supabase.from('x_posts').insert({
      draft_text,
      status: 'draft',
      agent_type: 'crypto_god',
      signal_ids: [draft.signal_id],
      fomo_reasoning: draft.reasoning,
      broadcaster_reasoning: draft.broadcaster_reasoning,
      reviewed_at: now,
      reviewed_by: 'chief_broadcaster',
    })
    console.log(`[crypto_god] Saved approved draft: "${draft_text.slice(0, 60)}..."`)
  }

  for (const draft of state.drafts_rejected) {
    const draft_text = draft.draft_text.trimEnd() + '\nhttps://pacifica.fi'
    await supabase.from('x_posts').insert({
      draft_text,
      status: 'rejected',
      agent_type: 'crypto_god',
      signal_ids: [draft.signal_id],
      fomo_reasoning: draft.reasoning,
      broadcaster_reasoning: draft.last_broadcaster_reasoning,
      reviewed_at: now,
      reviewed_by: 'chief_broadcaster',
    })
    console.log(`[crypto_god] Saved rejected draft (attempt ${draft.attempt})`)
  }

  return {}
}

// --- graph ---

export const cryptoGodGraph = new StateGraph(CryptoGodState)
  .addNode('rank', rankNode)
  .addNode('write', writeNode)
  .addNode('broadcast', broadcastNode)
  .addNode('resolve', resolveNode)
  .addNode('save', saveNode)
  .addEdge(START, 'rank')
  .addConditionalEdges('rank', rankRouter, { write: 'write', [END]: END })
  .addEdge('write', 'broadcast')
  .addEdge('broadcast', 'resolve')
  .addConditionalEdges('resolve', broadcastRouter, { write: 'write', save: 'save' })
  .addEdge('save', END)
  .compile()
