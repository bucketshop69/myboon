import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { dedupeCandidates, detectCandidates, selectedCandidateOptions } from './candidates'
import { collectHyperliquidMarketSnapshots } from './collector'
import { HyperliquidInfoClient } from './client'
import { snapshotMetrics } from './normalization'
import type {
  HyperliquidCandidateDraft,
  HyperliquidCollectorOptions,
  HyperliquidCollectorResult,
  HyperliquidMarketSnapshot,
} from './types'

const nodeRequire = createRequire(__filename)
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (path: string) => SqliteDatabase
}

const DEFAULT_SQLITE_PATH = '.data/hyperliquid.sqlite'

interface SqliteStatement {
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
  run(...params: unknown[]): unknown
}

interface SqliteDatabase {
  close(): void
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
}

export interface HyperliquidSqliteSummary {
  snapshots: number
  candidates: number
  recentCandidates: Array<{
    observedAt: string
    symbol: string
    triggerType: string
    score: number
    triggerReason: string
  }>
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function sqlitePath(path = process.env.HYPERLIQUID_SQLITE_PATH ?? DEFAULT_SQLITE_PATH): string {
  return resolve(process.cwd(), path)
}

function openHyperliquidSqlite(path?: string): SqliteDatabase {
  const dbPath = sqlitePath(path)
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA busy_timeout = 5000;')
  return db
}

function ensureHyperliquidSqliteSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hyperliquid_market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue TEXT NOT NULL DEFAULT 'hyperliquid',
      symbol TEXT NOT NULL,
      base_asset TEXT NOT NULL,
      entity_hint TEXT NOT NULL,
      market_type TEXT NOT NULL DEFAULT 'perp',
      observed_at TEXT NOT NULL,
      venue_timestamp TEXT,
      rank_by_24h_notional_volume INTEGER NOT NULL,
      raw_payload TEXT NOT NULL,
      mark_price REAL,
      mid_price REAL,
      oracle_price REAL,
      prev_day_price REAL,
      premium REAL,
      day_notional_volume REAL,
      day_base_volume REAL,
      volume_1h REAL,
      volume_4h REAL,
      volume_24h REAL,
      volume_change_1h_pct REAL,
      volume_change_4h_pct REAL,
      volume_change_24h_pct REAL,
      price_change_1h_pct REAL,
      price_change_4h_pct REAL,
      price_change_24h_pct REAL,
      funding_rate_current REAL,
      funding_rate_1h_ago REAL,
      funding_rate_4h_ago REAL,
      funding_rate_24h_ago REAL,
      funding_change_1h REAL,
      funding_change_4h REAL,
      funding_change_24h REAL,
      funding_direction TEXT NOT NULL DEFAULT 'neutral',
      funding_flipped_1h INTEGER NOT NULL DEFAULT 0,
      funding_flipped_4h INTEGER NOT NULL DEFAULT 0,
      funding_flipped_24h INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (venue, symbol, observed_at)
    );

    CREATE INDEX IF NOT EXISTS hyperliquid_sqlite_snapshots_symbol_time_idx
      ON hyperliquid_market_snapshots (symbol, observed_at DESC);

    CREATE INDEX IF NOT EXISTS hyperliquid_sqlite_snapshots_rank_time_idx
      ON hyperliquid_market_snapshots (observed_at DESC, rank_by_24h_notional_volume);

    CREATE TABLE IF NOT EXISTS hyperliquid_market_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue TEXT NOT NULL DEFAULT 'hyperliquid',
      symbol TEXT NOT NULL,
      base_asset TEXT NOT NULL,
      entity_hint TEXT NOT NULL,
      market_type TEXT NOT NULL DEFAULT 'perp',
      snapshot_id INTEGER REFERENCES hyperliquid_market_snapshots(id) ON DELETE SET NULL,
      trigger_type TEXT NOT NULL,
      trigger_reason TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      metrics_snapshot TEXT NOT NULL,
      prior_metrics_snapshot TEXT,
      status TEXT NOT NULL DEFAULT 'pending_research',
      observed_at TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS hyperliquid_sqlite_candidates_status_idx
      ON hyperliquid_market_candidates (status, observed_at DESC);

    CREATE INDEX IF NOT EXISTS hyperliquid_sqlite_candidates_symbol_time_idx
      ON hyperliquid_market_candidates (symbol, observed_at DESC);

    CREATE INDEX IF NOT EXISTS hyperliquid_sqlite_candidates_trigger_idx
      ON hyperliquid_market_candidates (trigger_type, observed_at DESC);
  `)
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

function fetchPreviousSnapshotMetrics(
  db: SqliteDatabase,
  symbol: string,
  observedAt: string
): Record<string, unknown> | null {
  const row = db.prepare(`
    SELECT
      symbol,
      base_asset,
      rank_by_24h_notional_volume,
      mark_price,
      day_notional_volume,
      volume_1h,
      volume_4h,
      volume_24h,
      price_change_1h_pct,
      price_change_4h_pct,
      price_change_24h_pct,
      funding_rate_current,
      funding_direction,
      observed_at
    FROM hyperliquid_market_snapshots
    WHERE venue = 'hyperliquid'
      AND symbol = ?
      AND observed_at < ?
    ORDER BY observed_at DESC
    LIMIT 1
  `).get(symbol, observedAt) as Record<string, unknown> | undefined

  return row ? previousSnapshotMetrics(row) : null
}

function insertSnapshot(db: SqliteDatabase, snapshot: HyperliquidMarketSnapshot): number {
  db.prepare(`
    INSERT INTO hyperliquid_market_snapshots (
      venue,
      symbol,
      base_asset,
      entity_hint,
      market_type,
      observed_at,
      venue_timestamp,
      rank_by_24h_notional_volume,
      raw_payload,
      mark_price,
      mid_price,
      oracle_price,
      prev_day_price,
      premium,
      day_notional_volume,
      day_base_volume,
      volume_1h,
      volume_4h,
      volume_24h,
      volume_change_1h_pct,
      volume_change_4h_pct,
      volume_change_24h_pct,
      price_change_1h_pct,
      price_change_4h_pct,
      price_change_24h_pct,
      funding_rate_current,
      funding_rate_1h_ago,
      funding_rate_4h_ago,
      funding_rate_24h_ago,
      funding_change_1h,
      funding_change_4h,
      funding_change_24h,
      funding_direction,
      funding_flipped_1h,
      funding_flipped_4h,
      funding_flipped_24h,
      updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    )
    ON CONFLICT(venue, symbol, observed_at) DO UPDATE SET
      entity_hint = excluded.entity_hint,
      rank_by_24h_notional_volume = excluded.rank_by_24h_notional_volume,
      raw_payload = excluded.raw_payload,
      mark_price = excluded.mark_price,
      mid_price = excluded.mid_price,
      oracle_price = excluded.oracle_price,
      prev_day_price = excluded.prev_day_price,
      premium = excluded.premium,
      day_notional_volume = excluded.day_notional_volume,
      day_base_volume = excluded.day_base_volume,
      volume_1h = excluded.volume_1h,
      volume_4h = excluded.volume_4h,
      volume_24h = excluded.volume_24h,
      volume_change_1h_pct = excluded.volume_change_1h_pct,
      volume_change_4h_pct = excluded.volume_change_4h_pct,
      volume_change_24h_pct = excluded.volume_change_24h_pct,
      price_change_1h_pct = excluded.price_change_1h_pct,
      price_change_4h_pct = excluded.price_change_4h_pct,
      price_change_24h_pct = excluded.price_change_24h_pct,
      funding_rate_current = excluded.funding_rate_current,
      funding_rate_1h_ago = excluded.funding_rate_1h_ago,
      funding_rate_4h_ago = excluded.funding_rate_4h_ago,
      funding_rate_24h_ago = excluded.funding_rate_24h_ago,
      funding_change_1h = excluded.funding_change_1h,
      funding_change_4h = excluded.funding_change_4h,
      funding_change_24h = excluded.funding_change_24h,
      funding_direction = excluded.funding_direction,
      funding_flipped_1h = excluded.funding_flipped_1h,
      funding_flipped_4h = excluded.funding_flipped_4h,
      funding_flipped_24h = excluded.funding_flipped_24h,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    snapshot.venue,
    snapshot.symbol,
    snapshot.baseAsset,
    snapshot.entityHint,
    snapshot.marketType,
    snapshot.observedAt,
    snapshot.venueTimestamp,
    snapshot.rankBy24hNotionalVolume,
    json(snapshot.rawPayload),
    snapshot.markPrice,
    snapshot.midPrice,
    snapshot.oraclePrice,
    snapshot.prevDayPrice,
    snapshot.premium,
    snapshot.dayNotionalVolume,
    snapshot.dayBaseVolume,
    snapshot.volume1h,
    snapshot.volume4h,
    snapshot.volume24h,
    snapshot.volumeChange1hPct,
    snapshot.volumeChange4hPct,
    snapshot.volumeChange24hPct,
    snapshot.priceChange1hPct,
    snapshot.priceChange4hPct,
    snapshot.priceChange24hPct,
    snapshot.fundingRateCurrent,
    snapshot.fundingRate1hAgo,
    snapshot.fundingRate4hAgo,
    snapshot.fundingRate24hAgo,
    snapshot.fundingChange1h,
    snapshot.fundingChange4h,
    snapshot.fundingChange24h,
    snapshot.fundingDirection,
    snapshot.fundingFlipped1h ? 1 : 0,
    snapshot.fundingFlipped4h ? 1 : 0,
    snapshot.fundingFlipped24h ? 1 : 0
  )

  const row = db.prepare(`
    SELECT id
    FROM hyperliquid_market_snapshots
    WHERE venue = ?
      AND symbol = ?
      AND observed_at = ?
  `).get(snapshot.venue, snapshot.symbol, snapshot.observedAt) as { id: number } | undefined

  if (!row) throw new Error(`SQLite snapshot id lookup failed for ${snapshot.symbol}`)
  return row.id
}

function insertCandidate(
  db: SqliteDatabase,
  candidate: HyperliquidCandidateDraft,
  snapshot: HyperliquidMarketSnapshot,
  snapshotId: number
): boolean {
  const existing = db.prepare(`
    SELECT dedupe_key
    FROM hyperliquid_market_candidates
    WHERE dedupe_key = ?
  `).get(candidate.dedupeKey)

  if (existing) return false

  db.prepare(`
    INSERT INTO hyperliquid_market_candidates (
      venue,
      symbol,
      base_asset,
      entity_hint,
      market_type,
      snapshot_id,
      trigger_type,
      trigger_reason,
      score,
      metrics_snapshot,
      prior_metrics_snapshot,
      status,
      observed_at,
      dedupe_key
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.venue,
    snapshot.symbol,
    snapshot.baseAsset,
    candidate.entityHint,
    snapshot.marketType,
    snapshotId,
    candidate.triggerType,
    candidate.triggerReason,
    candidate.score,
    json(candidate.metricsSnapshot),
    candidate.priorMetricsSnapshot ? json(candidate.priorMetricsSnapshot) : null,
    candidate.status,
    candidate.observedAt,
    candidate.dedupeKey
  )

  return true
}

export async function runHyperliquidCollectorToSqlite(input: {
  path?: string
  client?: HyperliquidInfoClient
  options?: HyperliquidCollectorOptions
} = {}): Promise<HyperliquidCollectorResult & { sqlitePath: string }> {
  const dbPath = sqlitePath(input.path)
  const db = openHyperliquidSqlite(dbPath)
  try {
    ensureHyperliquidSqliteSchema(db)
    const collection = await collectHyperliquidMarketSnapshots(
      input.client ?? new HyperliquidInfoClient(),
      input.options ?? {}
    )
    const candidateOptions = selectedCandidateOptions(input.options ?? {}, collection.observedAt)
    const candidates = dedupeCandidates(collection.snapshots.flatMap((snapshot) => (
      detectCandidates(
        snapshot,
        candidateOptions,
        fetchPreviousSnapshotMetrics(db, snapshot.symbol, collection.observedAt)
      )
    )))
    const snapshotsBySymbol = new Map(collection.snapshots.map((snapshot) => [snapshot.symbol, snapshot]))
    const snapshotIdsBySymbol = new Map<string, number>()

    db.exec('BEGIN')
    try {
      for (const snapshot of collection.snapshots) {
        snapshotIdsBySymbol.set(snapshot.symbol, insertSnapshot(db, snapshot))
      }

      let candidatesWritten = 0
      for (const candidate of candidates) {
        const symbol = String(candidate.metricsSnapshot.symbol)
        const snapshot = snapshotsBySymbol.get(symbol)
        const snapshotId = snapshotIdsBySymbol.get(symbol)
        if (!snapshot || !snapshotId) continue
        if (insertCandidate(db, candidate, snapshot, snapshotId)) candidatesWritten += 1
      }

      db.exec('COMMIT')

      return {
        sqlitePath: dbPath,
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
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } finally {
    db.close()
  }
}

export function summarizeHyperliquidSqlite(path?: string): HyperliquidSqliteSummary {
  const db = openHyperliquidSqlite(path)
  try {
    ensureHyperliquidSqliteSchema(db)
    const snapshotCount = db.prepare('SELECT COUNT(*) AS count FROM hyperliquid_market_snapshots')
      .get() as { count: number }
    const candidateCount = db.prepare('SELECT COUNT(*) AS count FROM hyperliquid_market_candidates')
      .get() as { count: number }
    const recent = db.prepare(`
      SELECT observed_at, symbol, trigger_type, score, trigger_reason
      FROM hyperliquid_market_candidates
      ORDER BY observed_at DESC, score DESC
      LIMIT 20
    `).all() as Array<Record<string, unknown>>

    return {
      snapshots: numberOrNull(snapshotCount.count) ?? 0,
      candidates: numberOrNull(candidateCount.count) ?? 0,
      recentCandidates: recent.map((row) => ({
        observedAt: String(row.observed_at),
        symbol: String(row.symbol),
        triggerType: String(row.trigger_type),
        score: numberOrNull(row.score) ?? 0,
        triggerReason: String(row.trigger_reason),
      })),
    }
  } finally {
    db.close()
  }
}

export const __testing = {
  ensureHyperliquidSqliteSchema,
  openHyperliquidSqlite,
  sqlitePath,
  snapshotMetrics,
}
