# #047 — Specialized Broadcast Floor: Multi-Agent X Strategy

## Problem

The current "influencer" is a single generic agent that posts narratives to X. This is too narrow:

1. **No specialization** — Lookonchain-style whale alerts require a different voice than match previews or geopolitical analysis
2. **No editorial judgment** — Every published narrative becomes an X post, even if it's not X-worthy
3. **No proactive content** — Can't react to high-conviction signals before they become narratives
4. **No format variety** — Only produces single posts, no cross-agent coordination

The result: X account is a narrative RSS feed, not a growth channel.

## Goal

Replace the single "influencer" with a **specialized broadcast floor**:

| Agent | Scope | Voice | Writes to |
|-------|-------|-------|-----------|
| `fomo_master` | Whale alerts, high-conviction Polymarket bets | Punchy, urgent, Lookonchain-style | `x_posts` |
| `sports_analyst` | UCL/EPL match previews + bet stories | Informed, stats-aware | `x_posts` (Phase 3) |
| `macro_analyst` | Geopolitics, elections, macro | Measured, authoritative | `x_posts` (Phase 3) |
| `chief_broadcaster` | Inline reflection node — critiques every draft before saving | Senior editor, brand guardian | Updates `x_posts.status` |

**Backlog:**

- `crypto_analyst` — SPL token pumps, DEX flow, perp positioning (needs on-chain data sources)

## Dependencies

- Blocks: none
- Related: #043 (content pipeline)
- Related: #042 (Nansen layer — `nansen_bettor_profile` tool used by fomo_master)

---

## Scope

### Phase 1 (This Issue)

- `packages/brain/src/graphs/fomo-master-graph.ts` — rank + write + broadcaster graph
- `packages/brain/src/fomo-master.ts` — runner with deterministic pre-enrichment
- `packages/brain/src/run-fomo-master.ts` — PM2 entry point
- `packages/brain/package.json` — add `fomo-master:start` script
- `ecosystem.config.cjs` — add `myboon-fomo-master` process
- DB migrations — see below

### Phase 2 (Backlog — crypto_analyst)

- Needs: Jupiter flow, perp OI, DEX volume data sources
- Build after on-chain Nansen collector is stable

### Phase 3 (Future)

- `sports_analyst` — needs match schedule strategy (Polymarket market data sufficient, no calendar table needed)
- `macro_analyst` — needs publisher critic loop stable first
- `chief_broadcaster` as standalone process — after all agents are stable

---

## DB Migrations

Run manually via Supabase SQL editor:

```sql
-- Add agent attribution and signal tracking to x_posts (run first if not already done)
ALTER TABLE x_posts
  ADD COLUMN IF NOT EXISTS agent_type       TEXT NOT NULL DEFAULT 'influencer',
  ADD COLUMN IF NOT EXISTS signal_ids       UUID[],
  ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by      TEXT;

-- Add reasoning columns to x_posts
ALTER TABLE x_posts
  ADD COLUMN IF NOT EXISTS fomo_reasoning         TEXT,
  ADD COLUMN IF NOT EXISTS broadcaster_reasoning  TEXT;

-- Add skip reasoning to signals (why ranker didn't pick a signal)
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS skip_reasoning  TEXT;
```

**Notes:**

- `agent_type` is plain TEXT — no CHECK constraint. New agents just write their name.
- `signal_ids` — array of signal UUIDs this post consumed. Used by fomo_master to prevent reprocessing the same signals on the next run.
- `fomo_reasoning` — ranker + writer reasoning for why this post was written.
- `broadcaster_reasoning` — broadcaster reasoning for approve/reject decision.
- `skip_reasoning` — written back to `signals` after graph run for signals the ranker passed over.

---

## Architecture

### System Flow

```
Runner (deterministic, no LLM)
  1. Fetch WHALE_BET signals (4h window, weight ≥ 8)
  2. Dedup against recent x_posts.signal_ids (two-step PostgREST pattern)
  3. Cluster by market slug → pick representative (highest weight; tiebreaker: most recent)
  4. Attach cluster_context to representative
  5. Enrich each representative: Nansen profile (cached 24h) + Polymarket live odds + market_history
  6. Format into clean plaintext signal blocks
  7. Fetch timelines: full 7d (broadcaster) + posted-only subset (writer)
  8. Invoke graph
  9. After graph: write why_skipped back to signals.skip_reasoning
```

```
Graph
  rank → write → broadcast → conditional routing
```

---

## Graph Design

### Node: rank

**Purpose:** Editorial judgment — pick 1-3 signals worth writing about.

**Input:** `formatted_signals[]` — all pre-enriched, formatted signal blocks.

**Output:** `ranked_signals[]` (frozen for rest of graph run) + `why_skipped` map (signal_id → reason).

**Early exit:** If ranker picks zero signals (all noise), the graph routes rank → END immediately. The runner still writes `why_skipped` back to `signals.skip_reasoning` for all signals. No write or broadcast call is made.

**Ranking framework (priority order):**
1. Contrarian conviction — large bet on low-probability outcome (e.g. $20K at 12%)
2. Wallet credibility — Nansen win rate, PnL, trade history distinguish smart money from noise
3. Pattern — cluster_context shows this market is accumulating (multiple wallets, growing volume)
4. Size — raw USD amount (baseline, everyone can read this)
5. Timing — fresh bet vs position from hours ago

**LLM receives:** Formatted signal blocks (plaintext). Outputs JSON with `picks[]` (signal_ids) + `why_skipped` map.

---

### Node: write

**Purpose:** Produce punchy Lookonchain-style X posts for each ranked signal.

**Input:** `ranked_signals[]` + `posted_timeline[]` (posted-only, for taste) + (on retry) `previous_draft` + `broadcaster_edits[]`.

**Output:** `drafts_pending[]` — one draft per ranked signal.

**On first attempt:** Write from scratch using ranked signal data.

**On retry:** Receive previous draft + structured edits `[{ issue: string, fix: string }]` from broadcaster. The fix field is directional ("lead with the wallet win rate, not the dollar amount"), not prescriptive ("rewrite as: ..."). Writer owns voice.

**Writer sees:**
- The signal block (Nansen profile, cluster_context, live odds, market_history)
- posted-only timeline (last 7d posts that were actually published — no rejected drafts)
- On retry: previous_draft + edits

**Style rules in prompt:**
- Lead with the number or the story: "$26K fresh wallet", "71% win rate bettor", "3rd bet this week"
- No hashtags, no threads (single post only)
- Max 1 emoji per post, only if it adds urgency: 🚨 ⚡ 💰
- Sound informed, not hype-y
- NEVER write "Full context in the feed." or any app CTA
- NEVER be vague about wallet history — use the actual Nansen data (win_rate, trade_count, total_pnl)
- Do NOT include the Polymarket URL (appended automatically in code after broadcast)

**Negative examples in prompt:**
- ❌ "A notable wallet made a significant bet on a political market." (vague)
- ❌ "🚀🔥💯 HUGE bet on Iran!" (hype)
- ❌ "Full context in the feed." (CTA)
- ✅ "⚡ A wallet with a 71% win rate just put $14K on Trump tariff escalation. Third bet on this market this week — $38K total now riding on it."

---

### Node: broadcast

**Purpose:** Batch editorial review — review all pending drafts in one LLM call.

**Input:** `drafts_pending[]` + `full_timeline[]` (all 7d posts including rejected, for duplicate/frequency detection).

**Output:** `reviews[]` — one review per draft with 3-way decision.

**Decision types:**

| Decision | Meaning | What happens |
|----------|---------|--------------|
| `approved` | Post is ready | Accumulate in `drafts_approved` |
| `soft_reject` | Fixable issues — rewrite | Back to write node (max 2 retries per draft) |
| `hard_reject` | Unfixable — structural problem | Save immediately as `status='rejected'` |

**Hard reject triggers:**
- Duplicate topic well-covered in last 24h
- Same market posted 3+ times this week
- No specific dollar amounts
- Contains "Full context in the feed." or any CTA

**Soft reject triggers:**
- Vague wallet description ("active in political markets") — must name specific context
- Wrong lead — buried the most interesting number
- Hype-y or unprofessional tone (fixable with direction)

**Broadcaster output format:**
```json
{
  "reviews": [
    {
      "draft_id": "signal_id",
      "decision": "approved" | "soft_reject" | "hard_reject",
      "reasoning": "string — why",
      "edits": [{ "issue": "string", "fix": "string" }]
    }
  ]
}
```

`edits` only populated on soft_reject. Each edit is directional: issue identifies the problem, fix gives direction (not a rewrite).

---

### Conditional Routing (after broadcast)

```
for each review:
  approved      → accumulate in drafts_approved
  hard_reject   → save_rejected immediately
  soft_reject:
    if draft.attempt < 2 → back to write node (write retries this draft only)
    if draft.attempt >= 2 → save_rejected
```

After all drafts are resolved (no more pending): save all `drafts_approved` → END.

---

### Graph Edges

```
START → rank → (no picks) ─────────────────────────────────────→ END
             → (has picks) → write → broadcast → router
                                ↑           |
                                └── (soft_reject, attempt < 2)
                                            |
                          (approved / hard_reject / soft_reject attempt >= 2)
                                            ↓
                                          save → END
                                     save_rejected → END
```

---

## State Annotation

```ts
interface FormattedSignal {
  id: string
  type: string
  weight: number
  metadata: Record<string, unknown>
  created_at: string
  nansen_profile: unknown | null
  live_odds: number | null       // current probability from Polymarket
  market_history: {              // signals for this market slug, last 7d
    bet_count: number
    distinct_wallets: number
    total_volume: number
  }
  cluster_context: {             // from slug clustering in runner
    signal_count: number
    distinct_wallets: number
    total_volume: number
    latest_at: string
  } | null
  formatted_text: string         // clean plaintext block, ready for LLM
}

interface RankedSignal extends FormattedSignal {
  rank: number
}

interface PendingDraft {
  signal_id: string
  draft_text: string
  reasoning: string
  attempt: number
  edits: Array<{ issue: string; fix: string }>  // from last broadcaster review
}

interface DraftPost {
  draft_text: string
  reasoning: string
  signal_id: string   // singular — one draft per ranked signal
}

interface BroadcastReview {
  draft_id: string
  decision: 'approved' | 'soft_reject' | 'hard_reject'
  reasoning: string
  edits: Array<{ issue: string; fix: string }>
}

const FomoState = Annotation.Root({
  formatted_signals: Annotation<FormattedSignal[]>,
  posted_timeline: Annotation<XPostRow[]>,    // posted-only, for writer taste
  full_timeline: Annotation<XPostRow[]>,      // all 7d statuses, for broadcaster
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
  previous_drafts: Annotation<Record<string, string>>({
    reducer: (_, b) => b,
    default: () => ({}),
  }),
  broadcaster_reviews: Annotation<BroadcastReview[] | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
})
```

---

## Runner Design (`packages/brain/src/fomo-master.ts`)

```ts
export async function runFomoMaster(): Promise<void> {
  // Step 1: fetch consumed signal_ids from recent x_posts (two-step dedup)
  const { data: recentPosts } = await supabase
    .from('x_posts').select('signal_ids')
    .eq('agent_type', 'fomo_master')
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
  const consumedIds = new Set<string>(
    (recentPosts ?? []).flatMap((p) => p.signal_ids ?? [])
  )

  // Step 2: fetch high-weight WHALE_BET signals from last 4h
  const { data: signals } = await supabase
    .from('signals').select('*')
    .eq('type', 'WHALE_BET').gte('weight', 8)
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
  const unprocessed = (signals ?? []).filter((s) => !consumedIds.has(s.id))
  if (!unprocessed.length) return

  // Step 3: cluster by slug → pick representative (highest weight; tiebreaker: most recent)
  const clusterMap = new Map<string, typeof unprocessed>()
  for (const signal of unprocessed) {
    const slug = (signal.metadata?.slug as string) ?? signal.id
    if (!clusterMap.has(slug)) clusterMap.set(slug, [])
    clusterMap.get(slug)!.push(signal)
  }
  const representatives = [...clusterMap.values()].map((cluster) => {
    const rep = cluster.sort((a, b) =>
      b.weight !== a.weight ? b.weight - a.weight
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    const cluster_context = cluster.length > 1 ? {
      signal_count: cluster.length,
      distinct_wallets: new Set(cluster.map((s) => s.metadata?.user).filter(Boolean)).size,
      total_volume: cluster.reduce((sum, s) => sum + ((s.metadata?.amount as number) ?? 0), 0),
      latest_at: cluster[0].created_at,
    } : null
    return { ...rep, cluster_context }
  })

  // Step 4: enrich — Nansen profile (cached) + live odds + market_history
  const enriched = await Promise.all(representatives.map(async (signal) => {
    const address = signal.metadata?.user as string | undefined
    const slug = signal.metadata?.slug as string | undefined

    const [nansen_profile, live_odds, market_history] = await Promise.allSettled([
      address ? nansenClient.bettorProfile(address) : Promise.resolve(null),
      slug ? fetchPolymarketOdds(slug) : Promise.resolve(null),
      slug ? fetchMarketHistory(supabase, slug) : Promise.resolve({ bet_count: 0, distinct_wallets: 0, total_volume: 0 }),
    ])

    return {
      ...signal,
      nansen_profile: nansen_profile.status === 'fulfilled' ? nansen_profile.value : null,
      live_odds: live_odds.status === 'fulfilled' ? live_odds.value : null,
      market_history: market_history.status === 'fulfilled' ? market_history.value : { bet_count: 0, distinct_wallets: 0, total_volume: 0 },
    }
  }))

  // Step 5: format into plaintext signal blocks
  const formatted_signals = enriched.map(formatSignalBlock)

  // Step 6: fetch timelines
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: fullTimeline } = await supabase
    .from('x_posts').select('draft_text, agent_type, status, created_at')
    .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false })
  const full_timeline = fullTimeline ?? []
  const posted_timeline = full_timeline.filter((p) => p.status === 'posted')

  // Step 7: invoke graph
  const finalState = await fomoMasterGraph.invoke({ formatted_signals, posted_timeline, full_timeline })

  // Step 8: write why_skipped back to signals table
  const why_skipped = finalState.why_skipped ?? {}
  await Promise.all(
    Object.entries(why_skipped).map(([signal_id, reason]) =>
      supabase.from('signals').update({ skip_reasoning: reason }).eq('id', signal_id)
    )
  )
}
```

**Helper: `fetchMarketHistory`** — queries `signals` table for a given slug over 7 days, returns `{ bet_count, distinct_wallets, total_volume }`.

**Helper: `fetchPolymarketOdds`** — calls Polymarket REST API (no cache — odds move fast). Returns current probability as a number (0–1) or null on failure.

**Helper: `formatSignalBlock`** — converts enriched signal to clean plaintext block.

Field rules:
- `direction` (YES/NO) and `live_odds` always appear on the same line — this is the contrarian signal the ranker scores. If `live_odds` is null, write `Current odds: unknown`.
- `nansen_profile` null → write `Bettor: {address} | No wallet history on record`.
- `cluster_context` null (single signal, no cluster) → omit the Cluster line entirely.
- `market_history.bet_count === 0` → write `Market activity (7d): no prior bets on record`.

Example output (all fields present):

```text
SIGNAL: $14,000 YES bet on "Trump imposes 25% tariffs on EU by June"
Market: trump-eu-tariffs-june | Current odds: 34% YES
Bettor: 0xabc... | Win rate: 71% | PnL: +$142K | Trades: 89
Market activity (7d): 12 bets, 7 wallets, $94K total volume
Cluster: 3 bets in last 4h, 2 wallets, $41K total
```

Example output (no Nansen profile, no cluster):

```text
SIGNAL: $8,500 NO bet on "Fed cuts rates before July"
Market: fed-rate-cut-july | Current odds: 61% YES
Bettor: 0xdef... | No wallet history on record
Market activity (7d): 4 bets, 3 wallets, $22K total volume
```

---

## Save Nodes

### save (approved drafts)

For each draft in `drafts_approved`:
1. Resolve `signal.metadata.user` address from `draft.signal_id` (look up signal in `formatted_signals`)
2. Append Polymarket profile URL: `\nhttps://polymarket.com/{address}` (no `/profile/` prefix)
3. Insert into `x_posts` with: `status='draft'`, `agent_type='fomo_master'`, `signal_ids: [draft.signal_id]`, `fomo_reasoning`, `broadcaster_reasoning`, `reviewed_at`, `reviewed_by='chief_broadcaster'`

### save_rejected (hard-rejected or max-retry exhausted)

Same insert but `status='rejected'`. Log attempt count.

---

## Acceptance Criteria

### Phase 1 (fomo_master + broadcaster)

- [ ] DB migrations run — all 6 columns exist on `x_posts` and `signals`
- [ ] Runner clusters signals by slug — only one representative per market per run
- [ ] cluster_context attached to representative before format step
- [ ] Nansen enrichment runs in runner (pre-graph), not inside graph nodes
- [ ] Live Polymarket odds fetched per market in runner (no cache)
- [ ] market_history (7d signals by slug) fetched in runner and attached
- [ ] Signal formatted into clean plaintext block before graph invocation
- [ ] `rank` node picks 1-3 signals with explicit ranking framework, outputs `ranked_signals` + `why_skipped` map
- [ ] If ranker picks zero signals, graph exits rank → END immediately (no write, no broadcast call)
- [ ] `write` node produces one draft per ranked signal; on retry receives `previous_draft` + `edits[]`
- [ ] `broadcast` node reviews all drafts in a single LLM call, returns `reviews[]`
- [ ] hard_reject → save_rejected immediately
- [ ] soft_reject → write retry (max 2 per draft), then save_rejected if still failing
- [ ] approved → save as `status='draft'`
- [ ] Broadcaster edits are directional `[{ issue, fix }]` — not rewrites
- [ ] `posted_timeline` contains only `status='posted'` records — no drafts or rejected
- [ ] Writer uses posted-only timeline; broadcaster uses full 7d timeline
- [ ] `DraftPost.signal_id` is a single string (not array) — save node wraps it as `signal_ids: [signal_id]`
- [ ] `why_skipped` written back to `signals.skip_reasoning` after graph run
- [ ] Polymarket URL appended in saveNode (not in LLM prompt, not in broadcaster)
- [ ] No "Full context in the feed." or similar CTA ever in output
- [ ] PM2 process `myboon-fomo-master` starts cleanly, runs hourly
- [ ] `pnpm --filter @myboon/brain fomo-master:start` runs without error

### Phase 2 (crypto_analyst — backlog)

- [ ] Data sources identified (Nansen on-chain collector stable)
- [ ] `crypto_analyst` graph created
- [ ] Integration tested

---

## Backlog Agents (Not Scoped Yet)

### crypto_analyst

Needs Nansen on-chain collector (Jupiter DEX trades, perp OI, token netflow) before building.

### sports_analyst

Needs: UCL/EPL market data from Polymarket (no separate calendar table — query Polymarket event screener directly for upcoming matches + odds).

### macro_analyst

Needs publisher critic loop stable. Reads `published_narratives`, decides what deserves X amplification beyond the feed.

### chief_broadcaster (standalone)

After all agents stable — becomes a separate scheduled process that reviews cross-agent draft queues in bulk. For now, broadcaster logic lives inline in each agent's graph.
