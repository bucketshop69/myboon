import type { SupabaseClient } from '@supabase/supabase-js'
import { HyperliquidInfoClient } from './client'
import {
  dedupeCandidates,
  detectCandidates,
  selectedCandidateOptions,
} from './candidates'
import {
  normalizeMarketSnapshot,
  selectTopMarketsBy24hNotionalVolume,
  snapshotMetrics,
} from './normalization'
import type {
  HyperliquidCandidateDraft,
  HyperliquidCollectorOptions,
  HyperliquidCollectorResult,
  HyperliquidMarketSnapshot,
} from './types'

const HOUR_MS = 3_600_000
const LOOKUP_CHUNK_SIZE = 50
const WRITE_CHUNK_SIZE = 50

interface SnapshotInsertResult {
  symbol: string
  id: string
}

export interface HyperliquidCollectionPreview {
  observedAt: string
  fetchedMarkets: number
  snapshots: HyperliquidMarketSnapshot[]
  candidates: HyperliquidCandidateDraft[]
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? parsed : fallback
}

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}

function selectedOptions(partial: HyperliquidCollectorOptions = {}): Required<HyperliquidCollectorOptions> {
  return {
    now: partial.now ?? new Date().toISOString(),
    topMarketCount: partial.topMarketCount ?? envNumber('HYPERLIQUID_TOP_MARKET_COUNT', 20),
    candleLookbackHours: partial.candleLookbackHours ?? envNumber('HYPERLIQUID_CANDLE_LOOKBACK_HOURS', 50),
    fundingLookbackHours: partial.fundingLookbackHours ?? envNumber('HYPERLIQUID_FUNDING_LOOKBACK_HOURS', 25),
    priceChange1hThresholdPct: partial.priceChange1hThresholdPct ?? envNumber('HYPERLIQUID_PRICE_CHANGE_1H_THRESHOLD_PCT', 5),
    priceChange4hThresholdPct: partial.priceChange4hThresholdPct ?? envNumber('HYPERLIQUID_PRICE_CHANGE_4H_THRESHOLD_PCT', 7),
    extremeFundingRateThreshold: partial.extremeFundingRateThreshold ?? envNumber('HYPERLIQUID_EXTREME_FUNDING_RATE_THRESHOLD', 0.0005),
    fundingMoveThreshold: partial.fundingMoveThreshold ?? envNumber('HYPERLIQUID_FUNDING_MOVE_THRESHOLD', 0.00005),
    priceFundingMovePriceThresholdPct: partial.priceFundingMovePriceThresholdPct ?? envNumber('HYPERLIQUID_PRICE_FUNDING_MOVE_PRICE_THRESHOLD_PCT', 3),
    volumeSpikeThresholdPct: partial.volumeSpikeThresholdPct ?? envNumber('HYPERLIQUID_VOLUME_SPIKE_THRESHOLD_PCT', 100),
    weightedCandidateThreshold: partial.weightedCandidateThreshold ?? envNumber('HYPERLIQUID_WEIGHTED_CANDIDATE_THRESHOLD', 55),
    candidateDedupeHours: partial.candidateDedupeHours ?? envNumber('HYPERLIQUID_CANDIDATE_DEDUPE_HOURS', 4),
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (const group of chunks(items, concurrency)) {
    results.push(...await Promise.all(group.map(fn)))
  }
  return results
}

export async function collectHyperliquidMarketSnapshots(
  client = new HyperliquidInfoClient(),
  options: HyperliquidCollectorOptions = {}
): Promise<HyperliquidCollectionPreview> {
  const selected = selectedOptions(options)
  const observedAt = selected.now
  const observedMs = new Date(observedAt).getTime()
  const metaAndContexts = await client.fetchMetaAndAssetContexts()
  const topMarkets = selectTopMarketsBy24hNotionalVolume(metaAndContexts, selected.topMarketCount)

  const snapshots = await mapConcurrent(topMarkets, 5, async (market) => {
    const candleStartTime = observedMs - selected.candleLookbackHours * HOUR_MS
    const fundingStartTime = observedMs - selected.fundingLookbackHours * HOUR_MS
    const [candles, fundingHistory] = await Promise.all([
      client.fetchCandles({
        coin: market.symbol,
        interval: '1h',
        startTime: candleStartTime,
        endTime: observedMs,
      }),
      client.fetchFundingHistory({
        coin: market.symbol,
        startTime: fundingStartTime,
        endTime: observedMs,
      }).catch(() => []),
    ])

    return normalizeMarketSnapshot({
      symbol: market.symbol,
      asset: market.asset,
      context: market.context,
      rank: market.rank,
      observedAt,
      candles,
      fundingHistory,
    })
  })

  const candidateOptions = selectedCandidateOptions(selected, observedAt)
  const candidates = dedupeCandidates(snapshots.flatMap((snapshot) => (
    detectCandidates(snapshot, candidateOptions)
  )))

  return {
    observedAt,
    fetchedMarkets: metaAndContexts.contexts.length,
    snapshots,
    candidates,
  }
}

function snapshotRow(snapshot: HyperliquidMarketSnapshot): Record<string, unknown> {
  return {
    venue: snapshot.venue,
    symbol: snapshot.symbol,
    base_asset: snapshot.baseAsset,
    entity_hint: snapshot.entityHint,
    market_type: snapshot.marketType,
    observed_at: snapshot.observedAt,
    venue_timestamp: snapshot.venueTimestamp,
    rank_by_24h_notional_volume: snapshot.rankBy24hNotionalVolume,
    raw_payload: snapshot.rawPayload,
    mark_price: snapshot.markPrice,
    mid_price: snapshot.midPrice,
    oracle_price: snapshot.oraclePrice,
    prev_day_price: snapshot.prevDayPrice,
    premium: snapshot.premium,
    day_notional_volume: snapshot.dayNotionalVolume,
    day_base_volume: snapshot.dayBaseVolume,
    volume_1h: snapshot.volume1h,
    volume_4h: snapshot.volume4h,
    volume_24h: snapshot.volume24h,
    volume_change_1h_pct: snapshot.volumeChange1hPct,
    volume_change_4h_pct: snapshot.volumeChange4hPct,
    volume_change_24h_pct: snapshot.volumeChange24hPct,
    price_change_1h_pct: snapshot.priceChange1hPct,
    price_change_4h_pct: snapshot.priceChange4hPct,
    price_change_24h_pct: snapshot.priceChange24hPct,
    funding_rate_current: snapshot.fundingRateCurrent,
    funding_rate_1h_ago: snapshot.fundingRate1hAgo,
    funding_rate_4h_ago: snapshot.fundingRate4hAgo,
    funding_rate_24h_ago: snapshot.fundingRate24hAgo,
    funding_change_1h: snapshot.fundingChange1h,
    funding_change_4h: snapshot.fundingChange4h,
    funding_change_24h: snapshot.fundingChange24h,
    funding_direction: snapshot.fundingDirection,
    funding_flipped_1h: snapshot.fundingFlipped1h,
    funding_flipped_4h: snapshot.fundingFlipped4h,
    funding_flipped_24h: snapshot.fundingFlipped24h,
  }
}

function previousSnapshotMetrics(row: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol: row.symbol,
    baseAsset: row.base_asset,
    rankBy24hNotionalVolume: row.rank_by_24h_notional_volume,
    markPrice: row.mark_price,
    dayNotionalVolume: row.day_notional_volume,
    volume1h: row.volume_1h,
    volume4h: row.volume_4h,
    volume24h: row.volume_24h,
    priceChange1hPct: row.price_change_1h_pct,
    priceChange4hPct: row.price_change_4h_pct,
    priceChange24hPct: row.price_change_24h_pct,
    fundingRateCurrent: row.funding_rate_current,
    fundingDirection: row.funding_direction,
    observedAt: row.observed_at,
  }
}

async function fetchPreviousSnapshots(
  db: SupabaseClient,
  symbols: string[],
  observedAt: string
): Promise<Map<string, Record<string, unknown>>> {
  const previousBySymbol = new Map<string, Record<string, unknown>>()
  for (const symbol of symbols) {
    const { data, error } = await db
      .from('hyperliquid_market_snapshots')
      .select([
        'symbol',
        'base_asset',
        'rank_by_24h_notional_volume',
        'mark_price',
        'day_notional_volume',
        'volume_1h',
        'volume_4h',
        'volume_24h',
        'price_change_1h_pct',
        'price_change_4h_pct',
        'price_change_24h_pct',
        'funding_rate_current',
        'funding_direction',
        'observed_at',
      ].join(', '))
      .eq('venue', 'hyperliquid')
      .eq('symbol', symbol)
      .lt('observed_at', observedAt)
      .order('observed_at', { ascending: false })
      .limit(1)

    if (error) throw new Error(`previous Hyperliquid snapshot fetch failed: ${error.message}`)
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    const row = rows[0]
    if (row) previousBySymbol.set(symbol, previousSnapshotMetrics(row))
  }
  return previousBySymbol
}

async function upsertSnapshots(
  db: SupabaseClient,
  snapshots: HyperliquidMarketSnapshot[]
): Promise<Map<string, string>> {
  const idsBySymbol = new Map<string, string>()

  for (const snapshotChunk of chunks(snapshots, WRITE_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('hyperliquid_market_snapshots')
      .upsert(snapshotChunk.map(snapshotRow), { onConflict: 'venue,symbol,observed_at' })
      .select('id, symbol')

    if (error) throw new Error(`Hyperliquid snapshot upsert failed: ${error.message}`)
    for (const row of (data ?? []) as SnapshotInsertResult[]) {
      idsBySymbol.set(row.symbol, row.id)
    }
  }

  return idsBySymbol
}

async function fetchExistingCandidateKeys(
  db: SupabaseClient,
  dedupeKeys: string[]
): Promise<Set<string>> {
  const existing = new Set<string>()
  if (dedupeKeys.length === 0) return existing

  for (const keyChunk of chunks(dedupeKeys, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('hyperliquid_market_candidates')
      .select('dedupe_key')
      .in('dedupe_key', keyChunk)

    if (error) throw new Error(`Hyperliquid candidate dedupe fetch failed: ${error.message}`)
    for (const row of data ?? []) {
      existing.add((row as { dedupe_key: string }).dedupe_key)
    }
  }

  return existing
}

function candidateRow(
  candidate: HyperliquidCandidateDraft,
  snapshot: HyperliquidMarketSnapshot,
  snapshotId: string | null
): Record<string, unknown> {
  return {
    venue: snapshot.venue,
    symbol: snapshot.symbol,
    base_asset: snapshot.baseAsset,
    entity_hint: candidate.entityHint,
    market_type: snapshot.marketType,
    snapshot_id: snapshotId,
    trigger_type: candidate.triggerType,
    trigger_reason: candidate.triggerReason,
    score: candidate.score,
    metrics_snapshot: candidate.metricsSnapshot,
    prior_metrics_snapshot: candidate.priorMetricsSnapshot,
    status: candidate.status,
    observed_at: candidate.observedAt,
    dedupe_key: candidate.dedupeKey,
  }
}

async function insertCandidates(
  db: SupabaseClient,
  candidates: HyperliquidCandidateDraft[],
  snapshotsBySymbol: Map<string, HyperliquidMarketSnapshot>,
  snapshotIdsBySymbol: Map<string, string>
): Promise<number> {
  const existingKeys = await fetchExistingCandidateKeys(db, candidates.map((candidate) => candidate.dedupeKey))
  const newCandidates = candidates.filter((candidate) => !existingKeys.has(candidate.dedupeKey))
  if (newCandidates.length === 0) return 0

  for (const candidateChunk of chunks(newCandidates, WRITE_CHUNK_SIZE)) {
    const rows = candidateChunk.map((candidate) => {
      const symbol = String(candidate.metricsSnapshot.symbol)
      const snapshot = snapshotsBySymbol.get(symbol)
      if (!snapshot) throw new Error(`Missing Hyperliquid snapshot for candidate symbol ${symbol}`)
      return candidateRow(candidate, snapshot, snapshotIdsBySymbol.get(symbol) ?? null)
    })

    const { error } = await db
      .from('hyperliquid_market_candidates')
      .insert(rows)

    if (error) throw new Error(`Hyperliquid candidate insert failed: ${error.message}`)
  }

  return newCandidates.length
}

export async function runHyperliquidCollector(
  db: SupabaseClient,
  client = new HyperliquidInfoClient(),
  options: HyperliquidCollectorOptions = {}
): Promise<HyperliquidCollectorResult> {
  const selected = selectedOptions(options)
  const collection = await collectHyperliquidMarketSnapshots(client, selected)
  const snapshotsBySymbol = new Map(collection.snapshots.map((snapshot) => [snapshot.symbol, snapshot]))
  const previousBySymbol = await fetchPreviousSnapshots(
    db,
    collection.snapshots.map((snapshot) => snapshot.symbol),
    collection.observedAt
  )

  const candidateOptions = selectedCandidateOptions(selected, collection.observedAt)
  const candidates = dedupeCandidates(collection.snapshots.flatMap((snapshot) => (
    detectCandidates(snapshot, candidateOptions, previousBySymbol.get(snapshot.symbol) ?? null)
  )))

  const snapshotIdsBySymbol = await upsertSnapshots(db, collection.snapshots)
  const candidatesWritten = await insertCandidates(db, candidates, snapshotsBySymbol, snapshotIdsBySymbol)

  return {
    observedAt: collection.observedAt,
    fetchedMarkets: collection.fetchedMarkets,
    selectedMarkets: collection.snapshots.length,
    snapshotsWritten: collection.snapshots.length,
    candidatesWritten,
    topMarkets: collection.snapshots.slice(0, 20).map((snapshot) => ({
      symbol: snapshot.symbol,
      entityHint: snapshot.entityHint,
      rankBy24hNotionalVolume: snapshot.rankBy24hNotionalVolume,
      dayNotionalVolume: snapshot.dayNotionalVolume,
      priceChange1hPct: snapshot.priceChange1hPct,
      priceChange4hPct: snapshot.priceChange4hPct,
      fundingRateCurrent: snapshot.fundingRateCurrent,
    })),
    candidates: candidates.map((candidate) => ({
      symbol: String(candidate.metricsSnapshot.symbol),
      triggerType: candidate.triggerType,
      score: candidate.score,
      triggerReason: candidate.triggerReason,
    })),
  }
}

export async function previewHyperliquidCollector(
  client = new HyperliquidInfoClient(),
  options: HyperliquidCollectorOptions = {}
): Promise<HyperliquidCollectorResult> {
  const collection = await collectHyperliquidMarketSnapshots(client, options)
  return {
    observedAt: collection.observedAt,
    fetchedMarkets: collection.fetchedMarkets,
    selectedMarkets: collection.snapshots.length,
    snapshotsWritten: 0,
    candidatesWritten: 0,
    topMarkets: collection.snapshots.slice(0, 20).map((snapshot) => ({
      symbol: snapshot.symbol,
      entityHint: snapshot.entityHint,
      rankBy24hNotionalVolume: snapshot.rankBy24hNotionalVolume,
      dayNotionalVolume: snapshot.dayNotionalVolume,
      priceChange1hPct: snapshot.priceChange1hPct,
      priceChange4hPct: snapshot.priceChange4hPct,
      fundingRateCurrent: snapshot.fundingRateCurrent,
    })),
    candidates: collection.candidates.map((candidate) => ({
      symbol: String(candidate.metricsSnapshot.symbol),
      triggerType: candidate.triggerType,
      score: candidate.score,
      triggerReason: candidate.triggerReason,
    })),
  }
}

export const __testing = {
  candidateRow,
  detectCandidates,
  normalizeMarketSnapshot,
  selectTopMarketsBy24hNotionalVolume,
  selectedOptions,
  snapshotMetrics,
  snapshotRow,
}
