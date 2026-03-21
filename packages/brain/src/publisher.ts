import 'dotenv/config'
import { publisherGraph } from './graphs/publisher-graph.js'
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
  const keyword = clusterTitle.split(/\s+/)[0].toLowerCase()
  const encoded = encodeURIComponent(`%${keyword}%`)
  const since = new Date(Date.now() - 86400000).toISOString()
  const url = `${SUPABASE_URL}/rest/v1/published_narratives?content_small=ilike.${encoded}&created_at=gte.${encodeURIComponent(since)}&select=id`
  const res = await fetch(url, { headers: supabaseHeaders() })
  if (!res.ok) return false
  const rows = await res.json() as unknown[]
  return Array.isArray(rows) && rows.length >= 7
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

  const published: Array<{ narrative: Narrative; output: PublishedOutput }> = []

  for (const narrative of narratives) {
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
  console.log(`[publisher] Done — ${published.length}/${narratives.length} narrative(s) published.`)
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
