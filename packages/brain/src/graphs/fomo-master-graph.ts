import { Annotation, StateGraph, END, START } from '@langchain/langgraph'
import { createClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from '../minimax.js'
import { extractJson } from '../json-utils.js'

// --- local types ---

export interface FormattedSignal {
  id: string
  type: string
  weight: number
  metadata: Record<string, unknown>
  created_at: string
  bettor_profile: {
    portfolio_value: number
    markets_traded: number
    trade_count: number
    win_rate: number | null
    total_pnl: number
  } | null
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
  slug: string       // from signal.metadata.slug — attached by writeNode, not LLM
  archetype: string  // from LLM writer output
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

// --- persuasion playbook ---

const PERSUASION_PLAYBOOK = `
ARCHETYPE EXAMPLES — 4-5 lines. Observational voice. Build tension, end with implication.
Study the structure, not just the words.

--- CONTRARIAN (live_odds < 0.30 — betting heavily against consensus) ---
Lead: establish what the crowd believes. Then land the bet against it. End with the tension.

GOOD:
The market has Iran ceasefire at 88% YES.
One wallet just put $38K on NO.
No history on record. This is their first move.
Either they know something the market doesn't — or they're about to lose $38K.

GOOD:
$14K against an 88% consensus.
Fresh wallet, zero prior trades.
At 12:1 odds, this isn't a hedge. It's a conviction bet.
That's either very dumb or very informed.

BAD:
"A wallet bet $14K NO on Iran ceasefire by March 31. Odds currently sit at 88% YES."
[Two lines of data. No tension. No implication.]

--- CLUSTER (3+ wallets, same market, last 4h) ---
Lead: the convergence fact. Then build why that's unusual. End with what it signals.

GOOD:
Three wallets. Four hours. $628K. All YES on Iran ceasefire.
No on-chain connection between them.
This isn't one whale splitting positions — these are independent actors reaching the same thesis.
When that happens on a political market, retail is usually last to find out.

GOOD:
Two wallets with zero history opened on the same Backpack FDV market today.
$9.5K and $2.4K — unconnected addresses, same direction.
Neither has traded before. Both entered within the same hour.
Unrelated fresh accounts converging on an obscure market is not random.

BAD:
"Multiple wallets have placed bets on the Iran ceasefire market today totaling $628K."
[States the pattern without making you feel anything about it.]

--- AUTHORITY (win_rate >= 60% AND trade_count >= 10) ---
Lead: the track record. Then the bet. Then the implication of that combination.

GOOD:
A wallet with a 71% win rate just put $14K on Trump tariff escalation.
23 bets on record. This is their third position on this market this week — $38K total.
71% win rate across political markets isn't luck. That's a sample size.
They're building a position, not taking a flier.

GOOD:
68% win rate. 23 bets. $22K on Bitcoin direction.
This is the same wallet that called the Fed pause two weeks before it happened.
They don't usually repeat markets. This one they're back in.

BAD:
"An experienced wallet with a good track record has placed a bet."
[Vague. No numbers. No credibility.]

--- FRESH_WALLET (no bettor_profile OR trade_count < 3) ---
Lead: the absence of history. Then the size of the bet. End with the open question.

GOOD:
Zero history on this wallet. No bets on record.
First move: $67K on a ground offensive in Lebanon by March 31.
Not $1K to test the platform. $67K opening position.
The question isn't whether they're right — it's why someone makes THIS their first bet.

GOOD:
Brand new wallet. No prior trades.
First four moves: $51K into a single NHL market across four bets in under 4 hours.
That's not a tourist learning the platform.
Someone opened a fresh account specifically to make this bet.

BAD:
"A brand-new wallet with no history placed a $67K bet on an Israeli ground offensive."
[States facts. Doesn't create any pull to keep reading.]

--- TIME_SENSITIVE modifier (any archetype + resolution within 48h) ---
If the market question mentions a date within 48 hours, add one line about timing.
Place it as the final line — it's the punctuation, not the lead.

GOOD (FRESH_WALLET + TIME_SENSITIVE):
Zero history on this wallet. First bet: $22K on US-Iran ceasefire.
Fresh account, no prior moves on record.
Someone chose this as their opening position — 38 hours before it resolves.
That's when we find out if they knew something.

GOOD (CLUSTER + TIME_SENSITIVE):
Three wallets. Four hours. $628K. All YES on Iran ceasefire.
No connection between them on-chain. Independent actors, same direction.
Resolves tonight.
Smart money doesn't wait until morning.
`

// --- system prompts ---

const RANKER_SYSTEM_PROMPT = `You are the editorial director for a financial intelligence X account.
Your job: from a batch of whale bet signals, pick the 1-3 most compelling stories to post about.

Ranking criteria (in order):
1. Contrarian conviction — large bet on a low-probability outcome is the strongest signal
2. Wallet credibility — a high win-rate wallet with proven PnL matters more than an unknown wallet
3. Pattern — multiple wallets betting the same market is a story on its own
4. Size — raw dollar amount (everyone can read this, so it's the weakest differentiator alone)
5. Timing — a fresh bet is more relevant than a stale one

You will receive formatted signal blocks with short IDs (S1, S2, ...). Each block includes: bet direction+odds (for contrarian scoring), bettor profile (win rate, PnL, trade count from Polymarket data), market_history (for pattern), and cluster_context (if multiple wallets hit this market).

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

const WRITER_SYSTEM_PROMPT = `You are the writer for a financial intelligence X account covering prediction markets.
Your audience: Polymarket traders, on-chain degens, people looking for market intelligence — not entertainment.

[Voice]
Observational. Not hype. You notice things and point at them — you don't shout about them.
4-5 lines per post. Each line earns its place. No filler, no throat-clearing.
Build tension through facts. Let the implication land in the final line.
The reader should finish and think "huh" — not "so what."

[Classification]
Before writing, classify the signal. First match wins:
1. CONTRARIAN: live_odds < 0.30 — wallet betting heavily against consensus
2. CLUSTER: 3+ wallets, same market, last 4h (cluster_context.signal_count)
3. AUTHORITY: bettor_profile.win_rate >= 0.60 AND bettor_profile.trade_count >= 10
4. FRESH_WALLET: no bettor_profile OR bettor_profile.trade_count < 3
5. GENERAL: fallback — lead with the most specific number in the signal

[TIME_SENSITIVE modifier]
If the market resolves within 48h (detectable from question text: "by March 31", "tonight", etc.),
add a timing line as the final line of any archetype post. Timing is punctuation, not the lead.

[Examples per archetype]
${PERSUASION_PLAYBOOK}

[Hard rules]
- 4-5 lines. No more.
- No hashtags
- No emojis unless it genuinely adds something (max 1: ⚡ 🚨 — never 🚀🔥)
- NEVER write "Full context in the feed." or any CTA
- NEVER be vague — use actual bettor_profile numbers (win_rate, trade_count, total_pnl, portfolio_value)
- Do NOT include the Polymarket URL — appended automatically

You will receive ranked signal blocks. Write one post per signal.
On retry: previous draft and broadcaster edits will be included. Apply the direction given.

Return JSON:
{
  "drafts": [
    {
      "signal_id": "uuid",
      "archetype": "CONTRARIAN | CLUSTER | AUTHORITY | FRESH_WALLET | GENERAL",
      "draft_text": "...",
      "reasoning": "why this archetype, what you led with"
    }
  ]
}`

const BROADCASTER_SYSTEM_PROMPT = `You are the chief broadcaster for a financial intelligence X account.
You review draft posts as a batch before any are saved.

[You will receive]
Each draft includes: signal_id, draft_text, slug (Polymarket market slug), archetype (persuasion frame used).
You also receive the last 7 days of x_posts history for duplicate and frequency detection.

[CRITICAL: count only POSTED content toward frequency limits]
The timeline includes posts with status: posted, draft, rejected.
ONLY count status='posted' posts toward frequency limits.
Rejected drafts were NEVER published — do not treat them as coverage.
A slug that has only rejected drafts in history is a fresh topic.

[Duplicate detection — angle fingerprint]
An angle is: {slug}:{archetype}. Same market, different archetype = DIFFERENT story.

Hard reject if:
- The same {slug}:{archetype} combination has status='posted' in the last 24h
- OR the same slug has been posted 3+ times this week with the SAME archetype

Approve if:
- Same slug, different archetype = fresh angle, approve
- Same slug, same archetype, but >24h since last status='posted' occurrence = approve
- No prior status='posted' content on this slug = always approve

[Hard reject triggers]
- Same {slug}:{archetype} posted (status='posted') in last 24h
- Contains "Full context in the feed." or any CTA
- No specific dollar amounts in the post

[Soft reject triggers]
- Wallet description is vague — must name win rate, PnL, or trade count
- Most compelling number is buried — it should be in the first line
- Wrong archetype for the signal data (e.g. CLUSTER framing for a single wallet)
- Tone is hype-y or unprofessional

[Soft reject edits]
Provide as [{ issue, fix }] pairs. The fix is directional — tell the writer what to change, not how to write it.
Example: { "issue": "buried the win rate", "fix": "lead with 71% win rate before the dollar amount" }

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
  drafts: Array<{ signal_id: string; archetype: string; draft_text: string; reasoning: string }>
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
  const signalMap = new Map(state.ranked_signals!.map((s) => [s.id, s]))
  const pendingMap = new Map(state.drafts_pending.map((p) => [p.signal_id, p]))
  const newPending: PendingDraft[] = parsed.drafts.map((d) => {
    const signal = signalMap.get(d.signal_id)
    const slug = (signal?.metadata?.slug as string | undefined) ?? ''
    const prev = pendingMap.get(d.signal_id)
    return {
      signal_id: d.signal_id,
      draft_text: d.draft_text,
      reasoning: d.reasoning,
      archetype: d.archetype ?? 'GENERAL',
      slug,
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
            slug: p.slug,
            archetype: p.archetype,
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
