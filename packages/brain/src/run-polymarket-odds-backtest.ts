import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()
import { createClient } from '@supabase/supabase-js'
import { runPolymarketOddsShiftBacktest, type LegacyOddsShiftSignal } from './intelligence/polymarket-backtest.js'

const days = Number(process.env.POLYMARKET_BACKTEST_DAYS ?? 30)
const continuationDelta = Number(process.env.POLYMARKET_BACKTEST_CONTINUATION_DELTA ?? 0.03)
const windowHours = Number(process.env.POLYMARKET_BACKTEST_WINDOW_HOURS ?? 24)
const topFraction = Number(process.env.POLYMARKET_BACKTEST_TOP_FRACTION ?? 0.3)
const maxRows = Number(process.env.POLYMARKET_BACKTEST_MAX_ROWS ?? 5000)

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

const result = runPolymarketOddsShiftBacktest(rows, {
  continuationDelta,
  windowHours,
  topFraction,
})

console.log(JSON.stringify({
  params: {
    days,
    continuationDelta,
    windowHours,
    topFraction,
    rawSignals: rows.length,
    maxRows,
  },
  summary: result.summary,
  examples: result.examples,
}, null, 2))
