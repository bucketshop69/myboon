/**
 * Replay real narratives through the publisher LLM and save results as JSON.
 *
 * Usage:
 *   node_modules/.pnpm/node_modules/.bin/tsx packages/brain/src/replay-publisher.ts
 *
 * Output: docs/scripts/replay-results.json
 */

import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { runPublisherLLM } from './publisher-llm.js'
import type { Narrative } from './publisher-types.js'

interface RawNarrative {
  id: string
  cluster: string
  observation: string
  score: number
  signal_count: number
  signals_snapshot: Array<{
    type: string
    topic: string
    slug: string
    metadata: Record<string, unknown>
  }>
  slugs: string[]
  status: string
  created_at: string
  content_type: string
}

function toNarrative(raw: RawNarrative): Narrative {
  const key_signals = (raw.signals_snapshot ?? []).map((s) => {
    const m = s.metadata ?? {}
    const parts = [`[${s.type}]`, s.topic]
    if (m.slug) parts.push(`[slug: ${m.slug}]`)
    if (m.amount) parts.push(`$${m.amount}`)
    if (m.side) parts.push(`${m.side}`)
    if (m.outcome) parts.push(`${m.outcome}`)
    if (m.user) parts.push(`wallet: ${(m.user as string).slice(0, 10)}...`)
    return parts.join(' — ')
  })

  return {
    id: raw.id,
    cluster: raw.cluster,
    observation: raw.observation,
    score: raw.score,
    signal_count: raw.signal_count,
    key_signals,
    slugs: raw.slugs ?? [],
    status: 'draft',
    created_at: raw.created_at,
  }
}

async function main() {
  // Fetch fresh narratives from Supabase
  const SUPABASE_URL = process.env.SUPABASE_URL!
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const url = `${SUPABASE_URL}/rest/v1/narratives?status=eq.published&order=created_at.desc&limit=5`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  const rawData = await res.json() as RawNarrative[]

  console.log(`Replaying ${rawData.length} narratives...\n`)

  const results: Array<{
    cluster: string
    original_id: string
    content_type: string | undefined
    publisher_score: number
    priority: number
    tags: string[]
    content_small: string
    content_small_length: number
    content_full: string
    content_full_length: number
    error?: string
  }> = []

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i]
    const narrative = toNarrative(raw)
    console.log(`[${i + 1}/${rawData.length}] ${narrative.cluster}`)

    try {
      const draft = await runPublisherLLM(narrative, [], null)
      results.push({
        cluster: narrative.cluster,
        original_id: narrative.id,
        content_type: draft.content_type,
        publisher_score: draft.publisher_score,
        priority: draft.priority,
        tags: draft.tags,
        content_small: draft.content_small,
        content_small_length: draft.content_small.length,
        content_full: draft.content_full,
        content_full_length: draft.content_full.length,
      })
      console.log(`  ✓ score=${draft.publisher_score} | content_small=${draft.content_small.length} chars\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({
        cluster: narrative.cluster,
        original_id: narrative.id,
        content_type: undefined,
        publisher_score: 0,
        priority: 0,
        tags: [],
        content_small: '',
        content_small_length: 0,
        content_full: '',
        content_full_length: 0,
        error: msg,
      })
      console.log(`  ✗ ${msg.slice(0, 100)}\n`)
    }
  }

  const outPath = new URL('../../../docs/scripts/replay-results.json', import.meta.url).pathname
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nSaved ${results.length} results to docs/scripts/replay-results.json`)
}

main().catch(console.error)
