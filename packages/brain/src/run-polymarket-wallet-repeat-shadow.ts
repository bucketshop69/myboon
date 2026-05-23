import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { createClient } from '@supabase/supabase-js'
import type { LegacyOddsShiftSignal } from './intelligence/polymarket-backtest.js'
import type { LegacyWhaleBetSignal } from './intelligence/polymarket-whale-backtest.js'
import {
  runPolymarketWalletRepeatReplay,
  writeWalletRepeatReplayArtifact,
} from './intelligence/v3/wallet-repeat-replay.js'

const days = Number(process.env.POLYMARKET_BACKTEST_DAYS ?? 30)
const continuationDelta = Number(process.env.POLYMARKET_BACKTEST_CONTINUATION_DELTA ?? 0.03)
const windowHours = Number(process.env.POLYMARKET_BACKTEST_WINDOW_HOURS ?? 24)
const topFraction = Number(process.env.POLYMARKET_BACKTEST_TOP_FRACTION ?? 0.3)
const maxWhaleRows = Number(process.env.POLYMARKET_WHALE_BACKTEST_MAX_ROWS ?? 50000)
const maxOddsRows = Number(process.env.POLYMARKET_BACKTEST_MAX_ODDS_ROWS ?? 50000)
const outputPath = process.env.POLYMARKET_WALLET_REPEAT_SHADOW_OUTPUT
const replayNowOverride = process.env.POLYMARKET_WALLET_REPEAT_REPLAY_NOW

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const supabase = createClient(supabaseUrl, supabaseKey)
const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString()
const evaluationCutoff = new Date(Date.now() - windowHours * 3_600_000).toISOString()
const pageSize = 1000

async function fetchSignals<T>(type: string, maxRows: number): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1)
    let query = supabase
      .from('signals')
      .select('id, topic, slug, created_at, weight, metadata')
      .eq('source', 'POLYMARKET')
      .eq('type', type)
      .gte('created_at', since)

    if (type === 'WHALE_BET') {
      query = query.lte('created_at', evaluationCutoff)
    }

    const { data, error } = await query
      .order('created_at', { ascending: true })
      .range(from, to)

    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < pageSize) break
  }
  return rows
}

const [whaleRows, oddsRows] = await Promise.all([
  fetchSignals<LegacyWhaleBetSignal>('WHALE_BET', maxWhaleRows),
  fetchSignals<LegacyOddsShiftSignal>('ODDS_SHIFT', maxOddsRows),
])

const replayNow = replayNowOverride
  ?? [...whaleRows, ...oddsRows]
    .map((row) => row.created_at)
    .sort()
    .at(-1)
  ?? new Date(0).toISOString()

const params = {
  days,
  continuationDelta,
  windowHours,
  topFraction,
  evaluationCutoff,
  replayNow,
  rawWhaleSignals: whaleRows.length,
  rawOddsSignals: oddsRows.length,
  maxWhaleRows,
  maxOddsRows,
  shadowMode: true,
}

const result = runPolymarketWalletRepeatReplay(whaleRows, oddsRows, {
  now: replayNow,
  requestedWindowDays: days,
  continuationDelta,
  windowHours,
  topFraction,
})

const artifactPath = await writeWalletRepeatReplayArtifact({
  params,
  ...result,
}, outputPath)

if (result.summary.actualWindowDays < Math.min(days, 30)) {
  console.warn(`[polymarket-wallet-repeat-shadow] Requested ${days}d but conclusive packet window is ${result.summary.actualWindowDays.toFixed(2)}d. Increase POLYMARKET_BACKTEST_DAYS/MAX_ROWS for >=30d acceptance evidence.`)
}

console.log(JSON.stringify({
  params,
  summary: result.summary,
  shadowMode: result.shadowMode,
  deterministicReplayKey: result.deterministicReplayKey,
  decisionCounts: result.decisionCounts,
  examples: result.examples,
  artifactPath,
}, null, 2))
