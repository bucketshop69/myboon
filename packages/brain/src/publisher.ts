import 'dotenv/config'
import { publisherGraph } from './graphs/publisher-graph.js'
import { callMinimax, extractText } from './minimax.js'
import type { Narrative, PublishedOutput } from './publisher-types.js'

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')

if (missing.length > 0) {
  console.error(`[publisher] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

// --- supabase helpers ---

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function fetchDraftNarratives(): Promise<Narrative[]> {
  const url = `${SUPABASE_URL}/rest/v1/narratives?status=eq.draft&score=gte.7&order=score.desc&limit=20`
  const res = await fetch(url, { headers: supabaseHeaders() })
  if (!res.ok) {
    throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<Narrative[]>
}

async function isTopicCapped(clusterTitle: string): Promise<boolean> {
  // Cap: same cluster title already published in the last 24h → skip.
  // Queries the narratives table directly on cluster + status to avoid
  // the old first-word keyword approach which was blocking unrelated topics.
  const since = new Date(Date.now() - 86400000).toISOString()
  const url = `${SUPABASE_URL}/rest/v1/narratives?cluster=eq.${encodeURIComponent(clusterTitle)}&status=eq.published&updated_at=gte.${encodeURIComponent(since)}&select=id&limit=1`
  const res = await fetch(url, { headers: supabaseHeaders() })
  if (!res.ok) return false
  const rows = await res.json() as unknown[]
  return Array.isArray(rows) && rows.length >= 1
}

async function findExistingThread(slugs: string[]): Promise<string | null> {
  if (!slugs.length) return null
  const since = new Date(Date.now() - 86400000).toISOString()
  const url = `${SUPABASE_URL}/rest/v1/published_narratives?created_at=gte.${encodeURIComponent(since)}&select=id,thread_id,actions&limit=20`
  const res = await fetch(url, { headers: supabaseHeaders() })
  if (!res.ok) return null
  const rows = await res.json() as Array<{ id: string; thread_id: string | null; actions: Array<{ type: string; slug?: string }> }>
  if (!Array.isArray(rows)) return null

  for (const row of rows) {
    const rowSlugs = (row.actions ?? [])
      .filter((a) => a.type === 'predict')
      .map((a) => a.slug)
    const overlap = slugs.some((s) => rowSlugs.includes(s))
    if (overlap) {
      return row.thread_id ?? row.id
    }
  }
  return null
}

async function insertPublishedNarrative(
  narrativeId: string,
  output: PublishedOutput,
  threadId: string | null
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/published_narratives`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      narrative_id: narrativeId,
      content_small: output.content_small,
      content_full: output.content_full,
      reasoning: output.reasoning,
      tags: output.tags,
      priority: output.priority,
      actions: output.actions ?? [],
      content_type: output.content_type,
      thread_id: threadId,
    }),
  })

  if (!res.ok) {
    throw new Error(`Supabase published_narratives insert failed: ${res.status} ${await res.text()}`)
  }
}

async function markNarrativeStatus(narrativeId: string, status: 'published' | 'rejected'): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/narratives?id=eq.${narrativeId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify({ status }),
  })

  if (!res.ok) {
    throw new Error(`Supabase narratives PATCH failed: ${res.status} ${await res.text()}`)
  }
}

// --- chief editor (agentic throttle) ---

interface RecentPublication {
  id: string
  content_small: string
  tags: string[]
  content_type: string
  created_at: string
}

async function fetchRecentPublications(): Promise<RecentPublication[]> {
  const since = new Date(Date.now() - 86400000).toISOString()
  const url = `${SUPABASE_URL}/rest/v1/published_narratives?created_at=gte.${encodeURIComponent(since)}&select=id,content_small,tags,content_type,created_at&order=created_at.desc&limit=30`
  const res = await fetch(url, { headers: supabaseHeaders() })
  if (!res.ok) return []
  return res.json() as Promise<RecentPublication[]>
}

function buildEditorialBrief(recent: RecentPublication[]): string {
  if (recent.length === 0) return 'No publications in the last 24h. All topics are fresh.'

  // Tag frequency
  const tagCounts = new Map<string, number>()
  for (const pub of recent) {
    for (const tag of pub.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => `${tag} (${count}x)`)

  // Content type distribution
  const typeCounts = new Map<string, number>()
  for (const pub of recent) {
    typeCounts.set(pub.content_type, (typeCounts.get(pub.content_type) ?? 0) + 1)
  }
  const typeBreakdown = [...typeCounts.entries()]
    .map(([type, count]) => `${type}: ${count}`)

  // Wallet mentions (extract from content_small)
  const walletMentions = new Map<string, number>()
  for (const pub of recent) {
    const matches = pub.content_small.match(/0x[a-f0-9]{6,10}/gi) ?? []
    for (const addr of matches) {
      const key = addr.toLowerCase().slice(0, 10)
      walletMentions.set(key, (walletMentions.get(key) ?? 0) + 1)
    }
  }
  const repeatWallets = [...walletMentions.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([addr, count]) => `${addr} (${count}x)`)

  return [
    `Published in last 24h: ${recent.length} narratives.`,
    `Content types: ${typeBreakdown.join(', ')}`,
    `Top tags: ${topTags.join(', ')}`,
    repeatWallets.length > 0
      ? `Repeat wallets: ${repeatWallets.join(', ')} — deprioritize unless genuinely new angle`
      : 'No repeat wallets.',
    '',
    'Recent cards (newest first):',
    ...recent.slice(0, 8).map((p, i) =>
      `  ${i + 1}. [${p.content_type}] ${p.content_small.slice(0, 100)}...`
    ),
  ].join('\n')
}

const CHIEF_EDITOR_PROMPT = `You are the Chief Editor of a prediction market intelligence feed.

You receive a list of draft narratives and a brief of what was published in the last 24 hours.
Your job: pick which drafts deserve publication. You are the GATEKEEPER for feed quality.

RULES:
1. MAX 3 narratives per run. Quality over quantity.
2. TOPIC DIVERSITY: If 70%+ of recent publications share a tag (e.g. "iran"), REJECT new drafts with that tag unless they introduce a genuinely new actor, market, or thesis. "Same wallet, slightly different angle" is NOT enough.
3. WALLET FREQUENCY: If a wallet has been featured 3+ times in 24h, REJECT unless it's a massive position change (>$50K swing).
4. CONTENT TYPE BALANCE: If recent publications are 80%+ one type (e.g. "signal"), prioritize drafts that could be "macro", "fomo", "crypto", or "news".
5. FRESHNESS: Newer, time-sensitive narratives beat stale rehashes.
6. If a wallet keeps appearing, consider flagging it as a "wallet_spotlight" — a dedicated profile piece rather than another signal card.

For each draft, return:
- "publish": send to publisher LLM
- "skip": not worth publishing right now
- "wallet_spotlight": this wallet deserves a dedicated profile piece (future feature — skip for now but flag it)

Return JSON array:
[
  { "narrative_id": "...", "decision": "publish" | "skip" | "wallet_spotlight", "reason": "..." },
  ...
]

Only return the JSON array. No other text.`

interface ChiefEditorDecision {
  narrative_id: string
  decision: 'publish' | 'skip' | 'wallet_spotlight'
  reason: string
}

async function runChiefEditor(
  drafts: Narrative[],
  recent: RecentPublication[]
): Promise<ChiefEditorDecision[]> {
  const brief = buildEditorialBrief(recent)

  const draftSummaries = drafts.map((d) => ({
    id: d.id,
    cluster: d.cluster,
    score: d.score,
    signal_count: d.signal_count,
    observation: d.observation.slice(0, 300),
    key_signals: d.key_signals.slice(0, 5).map((s) => s.slice(0, 150)),
  }))

  const userPrompt = [
    'EDITORIAL BRIEF (last 24h):',
    brief,
    '',
    `DRAFT NARRATIVES (${drafts.length} candidates):`,
    JSON.stringify(draftSummaries, null, 2),
    '',
    'Pick which drafts to publish. Max 3.',
  ].join('\n')

  try {
    const response = await callMinimax(
      [{ role: 'user', content: userPrompt }],
      [],
      CHIEF_EDITOR_PROMPT,
      { max_tokens: 2048, temperature: 0.2 }
    )

    const text = extractText(response)

    // Try to parse the JSON array
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    let decisions: ChiefEditorDecision[]

    try {
      decisions = JSON.parse(cleaned) as ChiefEditorDecision[]
    } catch {
      // Try to extract array from text
      const arrStart = cleaned.indexOf('[')
      const arrEnd = cleaned.lastIndexOf(']')
      if (arrStart === -1 || arrEnd === -1) {
        console.warn('[chief-editor] Could not parse response — allowing all drafts')
        return drafts.map((d) => ({ narrative_id: d.id, decision: 'publish' as const, reason: 'fallback — editor parse failed' }))
      }
      decisions = JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) as ChiefEditorDecision[]
    }

    return decisions
  } catch (err) {
    console.error('[chief-editor] LLM call failed — allowing all drafts:', err instanceof Error ? err.message : err)
    return drafts.map((d) => ({ narrative_id: d.id, decision: 'publish' as const, reason: 'fallback — editor error' }))
  }
}

// --- terminal report ---

function printReport(published: Array<{ narrative: Narrative; output: PublishedOutput }>, timestamp: string): void {
  console.log('\n' + '='.repeat(60))
  console.log(`[publisher] Report — ${timestamp}`)
  console.log('='.repeat(60))

  if (published.length === 0) {
    console.log('No narratives published this run.')
  }

  for (const { narrative, output } of published) {
    console.log(`\nCluster  : ${narrative.cluster}`)
    console.log(`Priority : ${output.priority}/10`)
    console.log(`Tags     : ${output.tags.join(', ')}`)
    console.log(`Type     : ${output.content_type}`)
    console.log(`Card     : ${output.content_small}`)
  }

  console.log('\n' + '='.repeat(60) + '\n')
}

// --- main run ---

async function run(): Promise<void> {
  const timestamp = new Date().toISOString()
  console.log(`[publisher] Running at ${timestamp}`)

  const narratives = await fetchDraftNarratives()

  if (narratives.length === 0) {
    console.log('[publisher] No draft narratives. Skipping LLM call.')
    return
  }

  console.log(`[publisher] Found ${narratives.length} draft narrative(s).`)

  // Chief Editor — agentic throttle before processing
  const recentPubs = await fetchRecentPublications()
  console.log(`[publisher] Chief Editor reviewing ${narratives.length} draft(s) against ${recentPubs.length} recent publication(s)...`)

  const editorDecisions = await runChiefEditor(narratives, recentPubs)
  const approvedIds = new Set(
    editorDecisions
      .filter((d) => d.decision === 'publish')
      .map((d) => d.narrative_id)
  )

  // Log editorial decisions
  for (const d of editorDecisions) {
    const symbol = d.decision === 'publish' ? '✓' : d.decision === 'wallet_spotlight' ? '★' : '✗'
    const cluster = narratives.find((n) => n.id === d.narrative_id)?.cluster ?? d.narrative_id
    console.log(`[chief-editor] ${symbol} ${d.decision}: "${cluster}" — ${d.reason}`)
  }

  // Mark skipped narratives as rejected so they don't come back
  for (const d of editorDecisions) {
    if (d.decision === 'skip' || d.decision === 'wallet_spotlight') {
      await markNarrativeStatus(d.narrative_id, 'rejected').catch(() => {})
    }
  }

  const approvedNarratives = narratives.filter((n) => approvedIds.has(n.id))
  console.log(`[publisher] Chief Editor approved ${approvedNarratives.length}/${narratives.length} narrative(s).`)

  if (approvedNarratives.length === 0) {
    console.log('[publisher] No narratives approved by Chief Editor. Skipping LLM calls.')
    return
  }

  const published: Array<{ narrative: Narrative; output: PublishedOutput }> = []

  for (const narrative of approvedNarratives) {
    console.log(`[publisher] Processing: "${narrative.cluster}"`)
    try {
      if (await isTopicCapped(narrative.cluster)) {
        console.log(`[publisher] Topic capped for "${narrative.cluster}" — skipping`)
        continue
      }

      // Run publisher + critic graph
      const finalState = await publisherGraph.invoke({ narrative })

      const draft = finalState.draft as PublishedOutput | null
      const critic = finalState.critic

      if (!draft) {
        console.log(`[publisher] No draft produced for "${narrative.cluster}" — skipping`)
        continue
      }

      // Catch empty content before wasting a critic LLM call
      if (!draft.content_small?.trim() && !draft.content_full?.trim()) {
        console.log(`[publisher] Empty content for "${narrative.cluster}" — MiniMax returned no content. Rejecting.`)
        await markNarrativeStatus(narrative.id, 'rejected')
        continue
      }

      // Critic rejected — skip insert
      if (critic?.verdict === 'reject') {
        console.log(`[publisher] Critic rejected narrative ${narrative.id}: ${critic.issues.join(', ')}`)
        await markNarrativeStatus(narrative.id, 'rejected')
        continue
      }

      // Enforce slug cap at code level (max 3 predict actions)
      const cappedActions = [
        ...draft.actions.filter((a) => a.type === 'predict').slice(0, 3),
        ...draft.actions.filter((a) => a.type === 'perps'),
      ]
      draft.actions = cappedActions

      if (draft.publisher_score >= 8) {
        const threadId = await findExistingThread(narrative.slugs ?? [])
        await insertPublishedNarrative(narrative.id, draft, threadId)
        await markNarrativeStatus(narrative.id, 'published')
        published.push({ narrative, output: draft })
        console.log(`[publisher] Published: "${narrative.cluster}" (publisher_score ${draft.publisher_score}, priority ${draft.priority}, content_type ${draft.content_type})`)
      } else {
        await markNarrativeStatus(narrative.id, 'rejected')
        console.log(`[publisher] Rejected: "${narrative.cluster}" (publisher_score ${draft.publisher_score} < 8)`)
      }
    } catch (err) {
      console.error(`[publisher] Failed to process narrative "${narrative.cluster}":`, err)
    }
  }

  printReport(published, timestamp)
  console.log(`[publisher] Done — ${published.length}/${approvedNarratives.length} approved narrative(s) published (${narratives.length} total drafts).`)
}

// --- entry point ---

async function main(): Promise<void> {
  await run().catch((err: unknown) => {
    console.error('[publisher] Error during run:', err)
  })

  setInterval(() => {
    run().catch((err: unknown) => {
      console.error('[publisher] Error during run:', err)
    })
  }, 30 * 60 * 1000)
}

main()
