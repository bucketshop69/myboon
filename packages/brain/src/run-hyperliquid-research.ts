import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { callMinimax, extractText } from './minimax.js'
import { extractJson } from './json-utils.js'
import type { PublishedOutput } from './publisher-types.js'
import { HyperliquidInfoClient } from './intelligence/hyperliquid/client.js'
import { runHyperliquidResearchPipeline, type HyperliquidEditor, type HyperliquidResearchStore, type HyperliquidWriter } from './intelligence/hyperliquid/pipeline.js'
import type {
  HyperliquidEditorDecision,
  HyperliquidMarketSnapshot,
  HyperliquidPositionSnapshot,
  HyperliquidResearchBrief,
  HyperliquidWatchlistEntry,
} from './intelligence/hyperliquid/types.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')
if (missing.length > 0) throw new Error(`Missing required env vars: ${missing.join(', ')}`)

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
const runOnce = process.env.HYPERLIQUID_RESEARCH_RUN_ONCE === '1'
const intervalMs = Number(process.env.HYPERLIQUID_RESEARCH_INTERVAL_MS ?? 5 * 60 * 1000)
const minPositionUsd = Number(process.env.HYPERLIQUID_MIN_POSITION_USD ?? 100_000)
const minChangeUsd = Number(process.env.HYPERLIQUID_MIN_CHANGE_USD ?? 50_000)
const minChangePct = Number(process.env.HYPERLIQUID_MIN_CHANGE_PCT ?? 0.3)
const maxPublications = Number(process.env.HYPERLIQUID_MAX_PUBLICATIONS ?? 3)

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function envWatchlist(): HyperliquidWatchlistEntry[] {
  const raw = process.env.HYPERLIQUID_WATCHLIST ?? ''
  return raw
    .split(',')
    .map((wallet) => wallet.trim())
    .filter(Boolean)
    .map((wallet) => ({
      wallet,
      label: wallet.slice(0, 10),
      reason: 'env watchlist',
      minPositionUsd,
      active: true,
    }))
}

class SupabaseHyperliquidResearchStore implements HyperliquidResearchStore {
  constructor(private readonly db: SupabaseClient) {}

  async loadWatchlist(): Promise<HyperliquidWatchlistEntry[]> {
    const { data, error } = await this.db
      .from('hyperliquid_watchlist')
      .select('wallet,label,reason,min_position_usd,active')
      .eq('active', true)
      .order('created_at', { ascending: true })

    if (error) {
      if (/hyperliquid_watchlist|relation|does not exist/i.test(error.message)) {
        console.warn(`[hyperliquid-research] hyperliquid_watchlist unavailable; using HYPERLIQUID_WATCHLIST env: ${error.message}`)
        return envWatchlist()
      }
      throw error
    }

    const rows = (data ?? []).map((row: {
      wallet: string
      label: string | null
      reason: string | null
      min_position_usd: number | string | null
      active: boolean | null
    }) => ({
      wallet: row.wallet,
      label: row.label ?? row.wallet.slice(0, 10),
      reason: row.reason ?? 'watchlist',
      minPositionUsd: numberOrNull(row.min_position_usd),
      active: row.active ?? true,
    }))

    return rows.length > 0 ? rows : envWatchlist()
  }

  async loadLatestPositionSnapshots(wallet: string): Promise<HyperliquidPositionSnapshot[]> {
    const { data, error } = await this.db
      .from('hyperliquid_position_snapshots')
      .select('*')
      .eq('wallet', wallet.toLowerCase())
      .order('observed_at', { ascending: false })
      .limit(100)

    if (error) {
      if (/hyperliquid_position_snapshots|relation|does not exist/i.test(error.message)) return []
      throw error
    }

    const latestByAsset = new Map<string, HyperliquidPositionSnapshot>()
    for (const row of (data ?? []) as any[]) {
      if (latestByAsset.has(row.asset)) continue
      latestByAsset.set(row.asset, dbPositionToSnapshot(row))
    }
    return [...latestByAsset.values()]
  }

  async savePositionSnapshots(snapshots: HyperliquidPositionSnapshot[]): Promise<HyperliquidPositionSnapshot[]> {
    if (snapshots.length === 0) return []
    const rows = snapshots.map((snapshot) => ({
      wallet: snapshot.wallet.toLowerCase(),
      asset: snapshot.asset,
      side: snapshot.side,
      size: snapshot.size,
      notional_usd: snapshot.notionalUsd,
      entry_price: snapshot.entryPrice,
      mark_price: snapshot.markPrice,
      leverage: snapshot.leverage,
      unrealized_pnl_usd: snapshot.unrealizedPnlUsd,
      margin_used_usd: snapshot.marginUsedUsd,
      observed_at: snapshot.observedAt,
      raw: snapshot.raw,
    }))
    const { data, error } = await this.db
      .from('hyperliquid_position_snapshots')
      .insert(rows)
      .select('*')
    if (error) throw error
    return ((data ?? []) as any[]).map(dbPositionToSnapshot)
  }

  async saveMarketSnapshots(snapshots: HyperliquidMarketSnapshot[]): Promise<HyperliquidMarketSnapshot[]> {
    if (snapshots.length === 0) return []
    const rows = snapshots.map((snapshot) => ({
      asset: snapshot.asset,
      mark_price: snapshot.markPrice,
      mid_price: snapshot.midPrice,
      oracle_price: snapshot.oraclePrice,
      funding_rate: snapshot.fundingRate,
      open_interest_usd: snapshot.openInterestUsd,
      volume_24h_usd: snapshot.volume24hUsd,
      previous_day_price: snapshot.previousDayPrice,
      observed_at: snapshot.observedAt,
      raw: snapshot.raw,
    }))
    const { data, error } = await this.db
      .from('hyperliquid_market_snapshots')
      .insert(rows)
      .select('*')
    if (error) {
      if (/hyperliquid_market_snapshots|relation|does not exist/i.test(error.message)) {
        console.warn(`[hyperliquid-research] market snapshot table unavailable; continuing without persistence: ${error.message}`)
        return snapshots
      }
      throw error
    }
    return ((data ?? []) as any[]).map(dbMarketToSnapshot)
  }

  async fetchRecentStoryKeys(since: string): Promise<Set<string>> {
    const { data, error } = await this.db
      .from('published_narratives')
      .select('story_key')
      .gte('created_at', since)
      .like('story_key', 'hyperliquid:%')
    if (error) return new Set()
    return new Set((data ?? []).map((row: { story_key?: string | null }) => row.story_key).filter((key): key is string => Boolean(key)))
  }

  async insertResearchFinding(input: {
    finding: unknown
    brief: HyperliquidResearchBrief
    decision: HyperliquidEditorDecision
  }): Promise<{ id: string }> {
    const { data, error } = await this.db
      .from('research_findings')
      .insert({
        source: 'hyperliquid',
        finding_type: input.brief.finding,
        story_key: input.brief.storyKey,
        dedupe_key: input.brief.dedupeKey,
        asset: input.brief.asset,
        wallet: input.brief.wallet.toLowerCase(),
        finding: input.finding,
        brief: input.brief,
        editor_decision: input.decision,
        status: input.decision.decision,
      })
      .select('id')
      .single()
    if (error) {
      if (/research_findings|relation|does not exist/i.test(error.message)) {
        console.warn(`[hyperliquid-research] research_findings unavailable; using synthetic id: ${error.message}`)
        return { id: input.brief.id }
      }
      throw error
    }
    return { id: String(data.id) }
  }

  async insertNarrative(input: {
    brief: HyperliquidResearchBrief
    decision: HyperliquidEditorDecision
    output: PublishedOutput
    findingId: string
  }): Promise<{ id: string }> {
    const { data, error } = await this.db
      .from('narratives')
      .insert({
        cluster: input.brief.suggestedAngle,
        observation: input.brief.whyItMayMatter,
        score: input.decision.priority,
        signal_count: input.brief.receipts.length,
        signals_snapshot: {
          research_finding_id: input.findingId,
          brief: input.brief,
          decision: input.decision,
        },
        slugs: [],
        content_type: input.output.content_type,
        status: 'published',
      })
      .select('id')
      .single()
    if (error) throw error
    return { id: String(data.id) }
  }

  async insertPublishedNarrative(input: {
    narrativeId: string
    brief: HyperliquidResearchBrief
    decision: HyperliquidEditorDecision
    output: PublishedOutput
    findingId: string
    threadId: string | null
  }): Promise<void> {
    const row = {
      narrative_id: input.narrativeId,
      content_small: input.output.content_small,
      content_full: input.output.content_full,
      reasoning: input.output.reasoning,
      tags: input.output.tags,
      priority: input.output.priority,
      actions: input.output.actions,
      content_type: input.output.content_type,
      thread_id: input.threadId,
      schema_version: 1,
      editor_version: 1,
      packet_id: input.brief.id,
      story_key: input.brief.storyKey,
      story_candidate_id: input.findingId,
      evidence_refs: input.brief.receipts,
    }
    const { error } = await this.db.from('published_narratives').insert(row)
    if (!error) return
    if (/packet_id|story_key|story_candidate_id|evidence_refs|schema_version|editor_version|column/i.test(error.message)) {
      const fallback = await this.db.from('published_narratives').insert({
        narrative_id: input.narrativeId,
        content_small: input.output.content_small,
        content_full: input.output.content_full,
        reasoning: `${input.output.reasoning}\nHyperliquid brief: ${input.brief.id}\nStory key: ${input.brief.storyKey}`,
        tags: input.output.tags,
        priority: input.output.priority,
        actions: input.output.actions,
        content_type: input.output.content_type,
        thread_id: input.threadId,
      })
      if (fallback.error) throw fallback.error
      return
    }
    throw error
  }

  async findExistingThread(storyKey: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('published_narratives')
      .select('id,thread_id')
      .eq('story_key', storyKey)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return null
    const row = data?.[0] as { id?: string; thread_id?: string | null } | undefined
    return row?.thread_id ?? row?.id ?? null
  }
}

function dbPositionToSnapshot(row: any): HyperliquidPositionSnapshot {
  return {
    id: String(row.id),
    wallet: String(row.wallet),
    asset: String(row.asset),
    side: row.side,
    size: Number(row.size),
    notionalUsd: Number(row.notional_usd),
    entryPrice: numberOrNull(row.entry_price),
    markPrice: numberOrNull(row.mark_price),
    leverage: numberOrNull(row.leverage),
    unrealizedPnlUsd: numberOrNull(row.unrealized_pnl_usd),
    marginUsedUsd: numberOrNull(row.margin_used_usd),
    observedAt: String(row.observed_at),
    raw: row.raw,
  }
}

function dbMarketToSnapshot(row: any): HyperliquidMarketSnapshot {
  return {
    asset: String(row.asset),
    markPrice: numberOrNull(row.mark_price),
    midPrice: numberOrNull(row.mid_price),
    oraclePrice: numberOrNull(row.oracle_price),
    fundingRate: numberOrNull(row.funding_rate),
    openInterestUsd: numberOrNull(row.open_interest_usd),
    volume24hUsd: numberOrNull(row.volume_24h_usd),
    previousDayPrice: numberOrNull(row.previous_day_price),
    observedAt: String(row.observed_at),
    raw: row.raw,
  }
}

class MinimaxHyperliquidEditor implements HyperliquidEditor {
  async review(brief: HyperliquidResearchBrief): Promise<HyperliquidEditorDecision> {
    const response = await callMinimax(
      [{ role: 'user', content: JSON.stringify({ brief }, null, 2) }],
      [],
      [
        'You are the editor for a Hyperliquid research feed.',
        'The research brief already passed mechanical gates.',
        'Decide whether this deserves publish, update, hold, or ignore.',
        'Do not invent facts or motive. Return JSON only:',
        '{ "decision": "publish|update|hold|ignore", "priority": 1-10, "reason": "...", "surface": "feed_card|thread|none" }',
      ].join(' '),
      { max_tokens: 512, temperature: 0.1 }
    )
    const parsed = extractJson<HyperliquidEditorDecision>(extractText(response), 'hyperliquid-editor')
    if (!parsed?.decision) {
      return { decision: 'hold', priority: 3, reason: 'Editor response could not be parsed.', surface: 'none' }
    }
    return parsed
  }
}

class MinimaxHyperliquidWriter implements HyperliquidWriter {
  async write(brief: HyperliquidResearchBrief, decision: HyperliquidEditorDecision): Promise<PublishedOutput> {
    const response = await callMinimax(
      [{ role: 'user', content: JSON.stringify({ brief, decision }, null, 2) }],
      [],
      [
        'You write short feed posts from approved Hyperliquid research briefs.',
        'Use only facts in the brief. Mention uncertainty when relevant.',
        'No unsupported motive, no certainty claims, no insider language.',
        'Return JSON matching PublishedOutput: content_small, content_full, reasoning, tags, priority, publisher_score, actions, content_type.',
        'Use content_type crypto. Include a perps action for the asset.',
      ].join(' '),
      { max_tokens: 1024, temperature: 0.25 }
    )
    const output = extractJson<PublishedOutput>(extractText(response), 'hyperliquid-writer')
    if (!output) throw new Error('Hyperliquid writer returned no parseable PublishedOutput JSON')
    output.tags = output.tags ?? ['hyperliquid', brief.asset.toLowerCase()]
    output.actions = [{ type: 'perps', asset: brief.asset }]
    output.content_type = 'crypto'
    output.priority = output.priority ?? decision.priority
    output.publisher_score = output.publisher_score ?? decision.priority
    return output
  }
}

async function runOnceAt(now: string): Promise<void> {
  console.log(`[hyperliquid-research] Running at ${now}`)
  const result = await runHyperliquidResearchPipeline(
    new SupabaseHyperliquidResearchStore(supabase),
    new HyperliquidInfoClient(),
    new MinimaxHyperliquidEditor(),
    new MinimaxHyperliquidWriter(),
    {
      now,
      minPositionUsd,
      minChangeUsd,
      minChangePct,
      maxPublications,
    }
  )
  console.log(JSON.stringify(result, null, 2))
}

async function main(): Promise<void> {
  await runOnceAt(new Date().toISOString())
  if (runOnce) return
  setInterval(() => {
    runOnceAt(new Date().toISOString()).catch((err) => {
      console.error('[hyperliquid-research] Run failed:', err)
    })
  }, intervalMs)
}

main().catch((err) => {
  console.error('[hyperliquid-research] Fatal error:', err)
  process.exit(1)
})
