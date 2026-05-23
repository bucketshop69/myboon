import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from './minimax.js'
import { extractJson } from './json-utils.js'
import type { PublishedOutput } from './publisher-types.js'
import {
  buildPacketWriterPrompt,
  assertPacketBackedOutput,
  type PacketWriterInput,
} from './intelligence/v3/packet-writer.js'
import {
  runFreshPolymarketV3Pipeline,
  type ExistingStoryState,
  type NarrativeInsertRow,
  type PolymarketV3LiveStore,
  type PolymarketV3Signal,
  type PolymarketV3Writer,
  type PublishedInsertRow,
} from './intelligence/v3/polymarket-live-pipeline.js'
import type { PolymarketOddsSnapshotSeed } from './intelligence/v3/wallet-repeat-research.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')

if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`)
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

const lookbackHours = Number(process.env.POLYMARKET_V3_LIVE_LOOKBACK_HOURS ?? 24)
const limit = Number(process.env.POLYMARKET_V3_LIVE_LIMIT ?? 500)
const maxPublications = Number(process.env.POLYMARKET_V3_LIVE_MAX_PUBLICATIONS ?? 3)
const intervalMs = Number(process.env.POLYMARKET_V3_LIVE_INTERVAL_MS ?? 5 * 60 * 1000)
const runOnce = process.env.POLYMARKET_V3_LIVE_RUN_ONCE === '1'
const includeProcessed = process.env.POLYMARKET_V3_LIVE_INCLUDE_PROCESSED !== '0'
const markProcessed = process.env.POLYMARKET_V3_LIVE_MARK_PROCESSED !== '0'

interface PolymarketTrackedRow {
  slug: string | null
  yes_price: number | string | null
  volume: number | string | null
  updated_at: string | null
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePrice(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 && parsed <= 1 ? parsed : null
}

function latestEvidenceTime(row: { evidence_refs?: unknown; created_at?: string | null }): string | null {
  const evidence = Array.isArray(row.evidence_refs) ? row.evidence_refs : []
  const captured = evidence
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const value = (item as { capturedAt?: unknown }).capturedAt
      return typeof value === 'string' ? value : null
    })
    .filter((value): value is string => value != null)
    .sort()
    .at(-1)
  return captured ?? row.created_at ?? null
}

class SupabasePolymarketV3LiveStore implements PolymarketV3LiveStore {
  constructor(private readonly db: SupabaseClient) {}

  async fetchFreshSignals(params: {
    since: string
    limit: number
    includeProcessed: boolean
  }): Promise<PolymarketV3Signal[]> {
    let query = this.db
      .from('signals')
      .select('id, source, type, topic, slug, weight, metadata, created_at, processed')
      .eq('source', 'POLYMARKET')
      .in('type', ['WHALE_BET', 'ODDS_SHIFT'])
      .gte('created_at', params.since)
      .order('created_at', { ascending: true })
      .limit(params.limit)

    if (!params.includeProcessed) {
      query = query.eq('processed', false)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as PolymarketV3Signal[]
  }

  async fetchCurrentMarketSnapshots(slugs: string[], now: string): Promise<PolymarketOddsSnapshotSeed[]> {
    if (slugs.length === 0) return []

    const { data, error } = await this.db
      .from('polymarket_tracked')
      .select('slug, yes_price, volume, updated_at')
      .in('slug', slugs)

    if (error) {
      console.warn(`[polymarket-v3-live] Could not fetch polymarket_tracked snapshots: ${error.message}`)
      return []
    }

    return ((data ?? []) as PolymarketTrackedRow[])
      .map((row): PolymarketOddsSnapshotSeed | null => {
        const slug = typeof row.slug === 'string' ? row.slug : null
        const price = normalizePrice(row.yes_price)
        if (!slug || price == null) return null
        return {
          id: `tracked:${slug}:${row.updated_at ?? now}`,
          slug,
          price,
          observedAt: row.updated_at ?? now,
          capturedAt: now,
          rawRef: `polymarket_tracked:${slug}`,
          volumeUsd: numberOrNull(row.volume),
        }
      })
      .filter((snapshot): snapshot is PolymarketOddsSnapshotSeed => snapshot != null)
  }

  async fetchExistingStories(storyKeys: string[]): Promise<Record<string, ExistingStoryState>> {
    if (storyKeys.length === 0) return {}

    const { data, error } = await this.db
      .from('published_narratives')
      .select('id, thread_id, story_key, evidence_refs, created_at')
      .in('story_key', storyKeys)
      .order('created_at', { ascending: false })

    if (error) {
      if (/story_key|evidence_refs|column/i.test(error.message)) {
        console.warn(`[polymarket-v3-live] V3 published_narratives columns unavailable; duplicate detection is limited: ${error.message}`)
        return {}
      }
      throw error
    }

    const states: Record<string, ExistingStoryState> = {}
    for (const row of (data ?? []) as Array<{
      id: string
      thread_id: string | null
      story_key: string | null
      evidence_refs?: unknown
      created_at?: string | null
    }>) {
      if (!row.story_key || states[row.story_key]) continue
      states[row.story_key] = {
        storyKey: row.story_key,
        threadId: row.thread_id ?? row.id,
        coveredThrough: latestEvidenceTime(row),
      }
    }
    return states
  }

  async insertNarrative(row: NarrativeInsertRow): Promise<{ id: string }> {
    const { data, error } = await this.db
      .from('narratives')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      if (/schema_version|success_criteria|column/i.test(error.message)) {
        const { schema_version: _schemaVersion, success_criteria: _successCriteria, ...legacyRow } = row
        const fallback = await this.db
          .from('narratives')
          .insert(legacyRow)
          .select('id')
          .single()
        if (fallback.error) throw fallback.error
        return { id: String(fallback.data.id) }
      }
      throw error
    }

    return { id: String(data.id) }
  }

  async insertPublishedNarrative(row: PublishedInsertRow): Promise<void> {
    const fullRow = {
      narrative_id: row.narrative_id,
      content_small: row.content_small,
      content_full: row.content_full,
      reasoning: row.reasoning,
      tags: row.tags,
      priority: row.priority,
      actions: row.actions,
      content_type: row.content_type,
      thread_id: row.thread_id,
      schema_version: row.schema_version,
      editor_version: row.editor_version,
      success_criteria: row.success_criteria,
      packet_id: row.packet_id,
      story_key: row.story_key,
      story_candidate_id: row.story_candidate_id,
      evidence_refs: row.evidence_refs,
    }

    const { error } = await this.db
      .from('published_narratives')
      .insert(fullRow)

    if (!error) return

    if (/packet_id|story_key|story_candidate_id|evidence_refs|schema_version|editor_version|success_criteria|column/i.test(error.message)) {
      console.warn(`[polymarket-v3-live] V3 published_narratives columns unavailable; retrying legacy insert: ${error.message}`)
      const { error: fallbackError } = await this.db
        .from('published_narratives')
        .insert({
          narrative_id: row.narrative_id,
          content_small: row.content_small,
          content_full: row.content_full,
          reasoning: [
            row.reasoning,
            `V3 packet: ${row.packet_id}`,
            `Story key: ${row.story_key}`,
          ].join('\n'),
          tags: row.tags,
          priority: row.priority,
          actions: row.actions,
          content_type: row.content_type,
          thread_id: row.thread_id,
        })
      if (fallbackError) throw fallbackError
      return
    }

    throw error
  }

  async markSignalsProcessed(signalIds: string[]): Promise<void> {
    if (signalIds.length === 0) return
    const { error } = await this.db
      .from('signals')
      .update({ processed: true })
      .in('id', signalIds)
    if (error) throw error
  }
}

class MinimaxPacketWriter implements PolymarketV3Writer {
  async write(input: PacketWriterInput): Promise<PublishedOutput> {
    const response = await callMinimax(
      [{ role: 'user', content: buildPacketWriterPrompt(input) }],
      [],
      [
        'You are the final writer for a market intelligence feed.',
        'Use only the approved ResearchPacket. Return one JSON object only.',
        'No markdown, no extra commentary, no unsupported motive or causal claims.',
      ].join(' '),
      { max_tokens: 2048, temperature: 0.2 }
    )
    const output = extractJson<PublishedOutput>(extractText(response), 'polymarket-v3-packet-writer')
    if (!output) {
      throw new Error('Packet writer returned no parseable PublishedOutput JSON')
    }
    return assertPacketBackedOutput(input, output)
  }
}

async function runOnceAt(timestamp: string): Promise<void> {
  console.log(`[polymarket-v3-live] Running at ${timestamp}`)
  const result = await runFreshPolymarketV3Pipeline(
    new SupabasePolymarketV3LiveStore(supabase),
    new MinimaxPacketWriter(),
    {
      now: timestamp,
      lookbackHours,
      limit,
      maxPublications,
      includeProcessed,
      markProcessed,
    }
  )
  console.log(JSON.stringify(result, null, 2))
}

async function main(): Promise<void> {
  await runOnceAt(new Date().toISOString())

  if (runOnce) return

  setInterval(() => {
    runOnceAt(new Date().toISOString()).catch((err) => {
      console.error('[polymarket-v3-live] Run failed:', err)
    })
  }, intervalMs)
}

main().catch((err) => {
  console.error('[polymarket-v3-live] Fatal error:', err)
  process.exit(1)
})
