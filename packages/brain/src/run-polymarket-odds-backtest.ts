import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()
import { createClient } from '@supabase/supabase-js'
import { writeBacktestArtifact } from './intelligence/backtest-artifacts.js'
import { runPolymarketOddsShiftBacktest, type LegacyOddsShiftSignal } from './intelligence/polymarket-backtest.js'

const days = Number(process.env.POLYMARKET_BACKTEST_DAYS ?? 30)
const continuationDelta = Number(process.env.POLYMARKET_BACKTEST_CONTINUATION_DELTA ?? 0.03)
const windowHours = Number(process.env.POLYMARKET_BACKTEST_WINDOW_HOURS ?? 24)
const topFraction = Number(process.env.POLYMARKET_BACKTEST_TOP_FRACTION ?? 0.3)
const maxRows = Number(process.env.POLYMARKET_BACKTEST_MAX_ROWS ?? 5000)
const outputPath = process.env.POLYMARKET_BACKTEST_OUTPUT

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const supabase = createClient(supabaseUrl, supabaseKey)
const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString()

const rows: LegacyOddsShiftSignal[] = []
const pageSize = 1000

for (let from = 0; from < maxRows; from += pageSize) {
  const to = Math.min(from + pageSize - 1, maxRows - 1)
  const { data, error } = await supabase
    .from('signals')
    .select('id, topic, slug, created_at, metadata')
    .eq('source', 'POLYMARKET')
    .eq('type', 'ODDS_SHIFT')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .range(from, to)

  if (error) throw error
  rows.push(...((data ?? []) as LegacyOddsShiftSignal[]))
  if (!data || data.length < pageSize) break
}

const params = {
  days,
  continuationDelta,
  windowHours,
  topFraction,
  rawSignals: rows.length,
  maxRows,
}

const result = runPolymarketOddsShiftBacktest(rows, {
  continuationDelta,
  windowHours,
  topFraction,
  requestedWindowDays: days,
})

const artifact = {
  params,
  summary: result.summary,
  selected: result.selected,
  baseline: result.baseline,
  examples: result.examples,
}

const artifactPath = await writeBacktestArtifact(artifact, outputPath)

if (result.summary.actualWindowDays < Math.min(days, 30)) {
  console.warn(`[polymarket-backtest] Requested ${days}d but conclusive candidate window is ${result.summary.actualWindowDays.toFixed(2)}d. Increase POLYMARKET_BACKTEST_DAYS/MAX_ROWS for >=30d acceptance evidence.`)
}

console.log(JSON.stringify({
  params,
  summary: result.summary,
  examples: result.examples,
  artifactPath,
}, null, 2))
