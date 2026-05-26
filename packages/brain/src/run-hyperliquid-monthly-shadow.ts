import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { HyperliquidInfoClient } from './intelligence/hyperliquid/client.js'
import {
  runHyperliquidMonthlyShadowReplay,
  writeHyperliquidShadowReplayArtifact,
} from './intelligence/hyperliquid/shadow-replay.js'
import type { HyperliquidWatchlistEntry } from './intelligence/hyperliquid/types.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const days = Number(process.env.HYPERLIQUID_SHADOW_DAYS ?? 30)
const warmupDays = Number(process.env.HYPERLIQUID_SHADOW_WARMUP_DAYS ?? 7)
const minPositionUsd = Number(process.env.HYPERLIQUID_MIN_POSITION_USD ?? 100_000)
const minChangeUsd = Number(process.env.HYPERLIQUID_MIN_CHANGE_USD ?? 50_000)
const minChangePct = Number(process.env.HYPERLIQUID_MIN_CHANGE_PCT ?? 0.3)
const maxPublications = Number(process.env.HYPERLIQUID_SHADOW_MAX_PUBLICATIONS ?? 50)
const outputPath = process.env.HYPERLIQUID_SHADOW_OUTPUT

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function envWatchlist(): HyperliquidWatchlistEntry[] {
  return (process.env.HYPERLIQUID_WATCHLIST ?? '')
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

async function loadWatchlist(): Promise<HyperliquidWatchlistEntry[]> {
  const fallback = envWatchlist()
  if (!supabaseUrl || !supabaseKey) return fallback

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('hyperliquid_watchlist')
    .select('wallet,label,reason,min_position_usd,active')
    .eq('active', true)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn(`[hyperliquid-monthly-shadow] Could not load hyperliquid_watchlist; using env watchlist: ${error.message}`)
    return fallback
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
  return rows.length > 0 ? rows : fallback
}

async function main(): Promise<void> {
  const now = new Date()
  const endTime = now.getTime()
  const startTime = endTime - days * 24 * 3_600_000
  const warmupStartTime = startTime - warmupDays * 24 * 3_600_000
  const client = new HyperliquidInfoClient()
  const watchlist = await loadWatchlist()

  console.log(`[hyperliquid-monthly-shadow] Watchlist wallets: ${watchlist.length}`)
  const [marketSnapshots, fillsByWalletEntries] = await Promise.all([
    client.fetchMarketSnapshots(now.toISOString()),
    Promise.all(watchlist.map(async (watch) => {
      const fills = await client.fetchUserFillsByTime(watch.wallet, warmupStartTime, endTime)
      console.log(`[hyperliquid-monthly-shadow] ${watch.wallet.slice(0, 10)}... fills: ${fills.length}`)
      return [watch.wallet, fills] as const
    })),
  ])

  const artifact = runHyperliquidMonthlyShadowReplay({
    watchlist,
    fillsByWallet: Object.fromEntries(fillsByWalletEntries),
    marketSnapshots,
    options: {
      now: now.toISOString(),
      startTime,
      endTime,
      warmupStartTime,
      minPositionUsd,
      minChangeUsd,
      minChangePct,
      maxPublications,
    },
  })
  const path = await writeHyperliquidShadowReplayArtifact(artifact, outputPath)

  console.log(JSON.stringify({
    artifactPath: path,
    summary: artifact.summary,
    caveats: artifact.caveats,
    examples: artifact.wouldPublish.slice(0, 5).map((item) => ({
      storyKey: item.storyKey,
      contentSmall: item.output.content_small,
      reason: item.decision.reason,
    })),
  }, null, 2))
}

main().catch((err) => {
  console.error('[hyperliquid-monthly-shadow] Fatal error:', err)
  process.exit(1)
})
