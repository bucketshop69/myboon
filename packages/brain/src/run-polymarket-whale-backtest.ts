import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()
import { createClient } from '@supabase/supabase-js'
import { writeBacktestArtifact } from './intelligence/backtest-artifacts.js'
import { type LegacyOddsShiftSignal } from './intelligence/polymarket-backtest.js'
import { runPolymarketWhaleBetBacktest, type LegacyWhaleBetSignal } from './intelligence/polymarket-whale-backtest.js'

const days = Number(process.env.POLYMARKET_BACKTEST_DAYS ?? 30)
const continuationDelta = Number(process.env.POLYMARKET_BACKTEST_CONTINUATION_DELTA ?? 0.03)
const windowHours = Number(process.env.POLYMARKET_BACKTEST_WINDOW_HOURS ?? 24)
const topFraction = Number(process.env.POLYMARKET_BACKTEST_TOP_FRACTION ?? 0.3)
const minAmountUsd = Number(process.env.POLYMARKET_WHALE_BACKTEST_MIN_AMOUNT ?? 500)
const maxWhaleRows = Number(process.env.POLYMARKET_WHALE_BACKTEST_MAX_ROWS ?? 50000)
const maxOddsRows = Number(process.env.POLYMARKET_BACKTEST_MAX_ODDS_ROWS ?? 50000)
const outputPath = process.env.POLYMARKET_BACKTEST_OUTPUT

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const supabase = createClient(supabaseUrl, supabaseKey)
const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString()
// Do not backtest whale bets whose full evaluation window has not elapsed yet.
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

const params = {
  days,
  continuationDelta,
  windowHours,
  topFraction,
  minAmountUsd,
  evaluationCutoff,
  rawWhaleSignals: whaleRows.length,
  rawOddsSignals: oddsRows.length,
  maxWhaleRows,
  maxOddsRows,
}

const result = runPolymarketWhaleBetBacktest(whaleRows, oddsRows, {
  continuationDelta,
  windowHours,
  topFraction,
  minAmountUsd,
  requestedWindowDays: days,
})

const artifact = {
  params,
  summary: result.summary,
  selectedSignals: result.selectedSignals,
  selected: result.selected,
  baselineSignals: result.baselineSignals,
  baseline: result.baseline,
  byArchetype: result.byArchetype,
  examples: result.examples,
}

const artifactPath = await writeBacktestArtifact(artifact, outputPath)

if (result.summary.actualWindowDays < Math.min(days, 30)) {
  console.warn(`[polymarket-whale-backtest] Requested ${days}d but conclusive candidate window is ${result.summary.actualWindowDays.toFixed(2)}d. Increase POLYMARKET_BACKTEST_DAYS/MAX_ROWS for >=30d acceptance evidence.`)
}

console.log(JSON.stringify({
  params,
  summary: result.summary,
  byArchetype: result.byArchetype,
  examples: result.examples,
  artifactPath,
}, null, 2))
