import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { HyperliquidInfoClient, type HyperliquidCandle, type HyperliquidFill } from './intelligence/hyperliquid/client.js'
import { runHyperliquidMonthlyShadowReplay } from './intelligence/hyperliquid/shadow-replay.js'
import type { HyperliquidWatchlistEntry } from './intelligence/hyperliquid/types.js'
import {
  combineHyperliquidCrossSignalStories,
  type HyperliquidCrossSignalStoryCandidate,
  type HyperliquidNormalizedSignalFinding,
  type HyperliquidSignalBias,
} from './intelligence/hyperliquid/signals/cross-signal-story.js'
import {
  detectHyperliquidFundingPressureFindings,
  type HyperliquidFundingPressureFinding,
} from './intelligence/hyperliquid/signals/funding-pressure.js'
import {
  detectHyperliquidOiExpansionFindings,
  type HyperliquidOiExpansionFinding,
  type HyperliquidOiExpansionPoint,
} from './intelligence/hyperliquid/signals/oi-expansion.js'
import {
  detectHyperliquidPriceOiDivergences,
  type HyperliquidPriceOiDivergenceFinding,
  type HyperliquidPriceOiPoint,
} from './intelligence/hyperliquid/signals/price-oi-divergence.js'
import {
  detectHyperliquidVolumeSpikes,
  type HyperliquidVolumeSpikeFinding,
  type HyperliquidVolumePoint,
} from './intelligence/hyperliquid/signals/volume-spike.js'

interface GraphOiPoint {
  timestamp: string
  coin: string
  open_interest: number
  funding_rate: number | null
}

interface BacktestArtifact {
  kind: 'hyperliquid.signal-lanes.7d-backtest'
  generatedAt: string
  window: {
    start: string
    end: string
    days: number
  }
  agentRound: Array<{
    lane: string
    nickname: string
    confidence: number
    status: 'completed'
  }>
  dataSources: {
    assets: string[]
    watchlistSource: string
    watchlistWallets: string[]
    oiProvider: 'the_graph_token_api' | 'not_configured'
  }
  caveats: string[]
  laneSummaries: Record<string, number>
  laneFindings: {
    oiExpansion: HyperliquidOiExpansionFinding[]
    priceOiDivergence: HyperliquidPriceOiDivergenceFinding[]
    fundingPressure: HyperliquidFundingPressureFinding[]
    volumeSpike: HyperliquidVolumeSpikeFinding[]
    watchlistWallet: HyperliquidNormalizedSignalFinding[]
  }
  crossSignalStories: HyperliquidCrossSignalStoryCandidate[]
}

const DAY_MS = 24 * 3_600_000
const days = Number(process.env.HYPERLIQUID_SIGNAL_BACKTEST_DAYS ?? 7)
const maxAssets = Number(process.env.HYPERLIQUID_SIGNAL_MAX_ASSETS ?? 12)
const maxWatchlist = Number(process.env.HYPERLIQUID_SIGNAL_MAX_WALLETS ?? 5)
const maxStories = Number(process.env.HYPERLIQUID_SIGNAL_MAX_STORIES ?? 20)
const outputPath = process.env.HYPERLIQUID_SIGNAL_BACKTEST_OUTPUT

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function money(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function parseAssetList(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean)
}

function parseWalletList(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((wallet) => wallet.trim())
    .filter(Boolean)
}

function selectAssetsFromMarket(marketSnapshots: Awaited<ReturnType<HyperliquidInfoClient['fetchMarketSnapshots']>>): string[] {
  const explicit = parseAssetList(process.env.HYPERLIQUID_SIGNAL_ASSETS)
  if (explicit.length > 0) return explicit

  const focus = ['BTC', 'ETH', 'SOL', 'HYPE', 'NEAR']
  const top = [...marketSnapshots]
    .filter((snapshot) => snapshot.asset && snapshot.volume24hUsd != null)
    .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
    .map((snapshot) => snapshot.asset.toUpperCase())
  return [...new Set([...focus, ...top])].slice(0, maxAssets)
}

async function loadLeaderboardWatchlist(limit: number): Promise<HyperliquidWatchlistEntry[]> {
  const explicit = parseWalletList(process.env.HYPERLIQUID_WATCHLIST)
  if (explicit.length > 0) {
    return explicit.slice(0, limit).map((wallet) => ({
      wallet,
      label: wallet.slice(0, 10),
      reason: 'env watchlist',
      minPositionUsd: Number(process.env.HYPERLIQUID_MIN_POSITION_USD ?? 100_000),
      active: true,
    }))
  }

  const res = await fetch('https://stats-data.hyperliquid.xyz/Mainnet/leaderboard')
  if (!res.ok) return []
  const data = await res.json() as { leaderboardRows?: Array<{ ethAddress?: unknown, displayName?: unknown }> }
  return (data.leaderboardRows ?? [])
    .map((row) => ({
      wallet: typeof row.ethAddress === 'string' ? row.ethAddress : '',
      label: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : '',
      reason: 'temporary public leaderboard watchlist',
      minPositionUsd: Number(process.env.HYPERLIQUID_MIN_POSITION_USD ?? 100_000),
      active: true,
    }))
    .filter((row) => row.wallet)
    .slice(0, limit)
    .map((row) => ({ ...row, label: row.label || row.wallet.slice(0, 10) }))
}

function candleVolumePoints(candlesByAsset: Record<string, HyperliquidCandle[]>): HyperliquidVolumePoint[] {
  return Object.entries(candlesByAsset).flatMap(([asset, candles]) => candles.map((candle) => ({
    asset,
    volumeUsd: candle.volume * candle.close,
    observedAt: new Date(candle.endTime).toISOString(),
    windowStart: new Date(candle.startTime).toISOString(),
    windowEnd: new Date(candle.endTime).toISOString(),
  })))
}

function nearestCandlePrice(candles: HyperliquidCandle[], time: string): number | null {
  const target = Date.parse(time)
  if (!Number.isFinite(target) || candles.length === 0) return null
  let nearest = candles[0]
  let nearestDistance = Math.abs(nearest.endTime - target)
  for (const candle of candles.slice(1)) {
    const distance = Math.abs(candle.endTime - target)
    if (distance < nearestDistance) {
      nearest = candle
      nearestDistance = distance
    }
  }
  return nearest.close
}

function oiPointsFromGraph(
  graphOiByAsset: Record<string, GraphOiPoint[]>,
  candlesByAsset: Record<string, HyperliquidCandle[]>
): { oiExpansion: HyperliquidOiExpansionPoint[], priceOi: HyperliquidPriceOiPoint[] } {
  const oiExpansion: HyperliquidOiExpansionPoint[] = []
  const priceOi: HyperliquidPriceOiPoint[] = []
  for (const [asset, points] of Object.entries(graphOiByAsset)) {
    const candles = candlesByAsset[asset] ?? []
    for (const point of points) {
      const price = nearestCandlePrice(candles, point.timestamp)
      if (price == null) continue
      const openInterestUsd = point.open_interest * price
      oiExpansion.push({
        asset,
        observedAt: point.timestamp,
        openInterestUsd,
        markPrice: price,
      })
      priceOi.push({
        asset,
        timestamp: point.timestamp,
        price,
        openInterestUsd,
      })
    }
  }
  return { oiExpansion, priceOi }
}

async function fetchGraphOi(asset: string, start: string, end: string): Promise<GraphOiPoint[]> {
  const token = process.env.THE_GRAPH_TOKEN_API_KEY ?? process.env.GRAPH_TOKEN_API_KEY ?? process.env.TOKEN_API_KEY
  if (!token) return []

  const url = new URL('https://token-api.thegraph.com/v1/hyperliquid/markets/oi')
  url.searchParams.set('coin', asset)
  url.searchParams.set('dex', 'perps')
  url.searchParams.set('interval', '1h')
  url.searchParams.set('start_time', start)
  url.searchParams.set('end_time', end)
  url.searchParams.set('limit', '1000')
  url.searchParams.set('page', '1')

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    console.warn(`[hyperliquid-signals] OI provider failed for ${asset}: ${res.status} ${await res.text()}`)
    return []
  }

  const body = await res.json() as { data?: unknown[] }
  return (body.data ?? []).flatMap((row): GraphOiPoint[] => {
    if (!row || typeof row !== 'object') return []
    const raw = row as Record<string, unknown>
    const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : null
    const coin = typeof raw.coin === 'string' ? raw.coin : asset
    const openInterest = numberOrNull(raw.open_interest)
    if (!timestamp || openInterest == null) return []
    return [{
      timestamp: new Date(timestamp.replace(' ', 'T')).toISOString(),
      coin,
      open_interest: openInterest,
      funding_rate: numberOrNull(raw.funding_rate),
    }]
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

function fundingSignals(findings: HyperliquidFundingPressureFinding[]): HyperliquidNormalizedSignalFinding[] {
  return findings.map((finding) => ({
    id: finding.id,
    signalType: 'funding',
    asset: finding.asset,
    observedAt: finding.endTime,
    strength: finding.priorityHint,
    bias: fundingBias(finding),
    summary: finding.reason,
    tags: ['funding'],
    priorityHint: finding.priorityHint,
    metrics: {
      avgFunding: finding.avgFunding,
      maxFunding: finding.maxFunding,
      minFunding: finding.minFunding,
      sampleCount: finding.sampleCount,
    },
  }))
}

function fundingBias(finding: HyperliquidFundingPressureFinding): HyperliquidSignalBias {
  if (finding.direction === 'negative_to_positive') return 'bullish'
  if (finding.direction === 'positive_to_negative') return 'bearish'
  if (finding.direction === 'short_crowded') return 'bullish'
  if (finding.direction === 'long_crowded') return 'bearish'
  return 'mixed'
}

function volumeSignals(findings: HyperliquidVolumeSpikeFinding[]): HyperliquidNormalizedSignalFinding[] {
  return findings.map((finding) => ({
    id: finding.storyKey,
    signalType: 'volume',
    asset: finding.asset,
    observedAt: finding.timeRange.recentEnd,
    strength: finding.priorityHint,
    bias: 'neutral',
    summary: finding.reason,
    tags: ['volume'],
    priorityHint: finding.priorityHint,
    metrics: {
      recentVolumeUsd: finding.recentVolumeUsd,
      baselineVolumeUsd: finding.baselineVolumeUsd,
      spikeMultiple: finding.spikeMultiple,
    },
  }))
}

function oiSignals(findings: HyperliquidOiExpansionFinding[]): HyperliquidNormalizedSignalFinding[] {
  return findings.map((finding) => ({
    id: finding.id,
    signalType: 'open_interest',
    asset: finding.asset,
    observedAt: finding.timeRange.end,
    strength: finding.priorityHint,
    bias: finding.priceDeltaPct == null ? 'neutral' : finding.priceDeltaPct >= 0 ? 'bullish' : 'mixed',
    summary: finding.reason,
    tags: ['open-interest'],
    priorityHint: finding.priorityHint,
    metrics: {
      startOpenInterestUsd: finding.startOpenInterestUsd,
      endOpenInterestUsd: finding.endOpenInterestUsd,
      oiDeltaUsd: finding.oiDeltaUsd,
      oiDeltaPct: finding.oiDeltaPct,
    },
  }))
}

function priceOiSignals(findings: HyperliquidPriceOiDivergenceFinding[]): HyperliquidNormalizedSignalFinding[] {
  return findings.map((finding) => ({
    id: finding.storyKey,
    signalType: 'price_open_interest',
    asset: finding.asset,
    observedAt: finding.timeRange.end,
    strength: finding.priorityHint,
    bias: priceOiBias(finding),
    summary: finding.reason,
    tags: ['price-oi'],
    priorityHint: finding.priorityHint,
    metrics: {
      classification: finding.classification,
      priceDeltaPct: finding.deltas.priceDeltaPct,
      openInterestDeltaUsd: finding.deltas.openInterestDeltaUsd,
      openInterestDeltaPct: finding.deltas.openInterestDeltaPct,
    },
  }))
}

function priceOiBias(finding: HyperliquidPriceOiDivergenceFinding): HyperliquidSignalBias {
  if (finding.classification === 'leverage_momentum' || finding.classification === 'short_covering') return 'bullish'
  if (finding.classification === 'pressure_building' || finding.classification === 'unwind') return 'bearish'
  return 'mixed'
}

function walletSignals(stories: ReturnType<typeof runHyperliquidMonthlyShadowReplay>['wouldPublish']): HyperliquidNormalizedSignalFinding[] {
  return stories.map((story) => ({
    id: story.storyKey,
    signalType: 'wallet',
    asset: story.brief.asset,
    observedAt: story.brief.createdAt,
    strength: story.brief.priorityHint,
    bias: story.brief.after.side === 'long' ? 'bullish' : story.brief.after.side === 'short' ? 'bearish' : 'mixed',
    summary: story.output.content_small.replace(/\n/g, ' '),
    detail: story.output.content_full,
    tags: ['wallet'],
    priorityHint: story.brief.priorityHint,
    evidenceRefs: story.brief.receipts,
    metrics: {
      beforeNotionalUsd: story.brief.before.notionalUsd,
      afterNotionalUsd: story.brief.after.notionalUsd,
      finding: story.brief.finding,
    },
  }))
}

async function writeArtifact(artifact: BacktestArtifact): Promise<string> {
  const path = outputPath
    ? resolve(outputPath)
    : resolve(process.cwd(), 'artifacts', 'hyperliquid-signals', `hyperliquid-7d-signal-backtest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(artifact, null, 2))
  return path
}

async function main(): Promise<void> {
  const now = new Date()
  const endTime = now.getTime()
  const startTime = endTime - days * DAY_MS
  const warmupStartTime = startTime - 7 * DAY_MS
  const client = new HyperliquidInfoClient()
  const marketSnapshots = await client.fetchMarketSnapshots(now.toISOString())
  const assets = selectAssetsFromMarket(marketSnapshots)
  const watchlist = await loadLeaderboardWatchlist(maxWatchlist)
  const startIso = new Date(startTime).toISOString()
  const endIso = new Date(endTime).toISOString()

  console.log(`[hyperliquid-signals] Assets: ${assets.join(', ')}`)
  console.log(`[hyperliquid-signals] Watchlist wallets: ${watchlist.length}`)

  const candleEntries = await Promise.all(assets.map(async (asset) => {
    const candles = await client.fetchCandleSnapshot(asset, '1d', startTime - 3 * DAY_MS, endTime)
    console.log(`[hyperliquid-signals] ${asset} candles: ${candles.length}`)
    return [asset, candles] as const
  }))
  const candlesByAsset = Object.fromEntries(candleEntries)

  const fundingEntries = await Promise.all(assets.map(async (asset) => {
    const funding = await client.fetchFundingHistory(asset, startTime, endTime)
    console.log(`[hyperliquid-signals] ${asset} funding points: ${funding.length}`)
    return [asset, funding.map((point) => ({
      asset,
      fundingRate: point.fundingRate,
      observedAt: new Date(point.time).toISOString(),
    }))] as const
  }))

  const graphToken = process.env.THE_GRAPH_TOKEN_API_KEY ?? process.env.GRAPH_TOKEN_API_KEY ?? process.env.TOKEN_API_KEY
  const graphOiEntries = graphToken
    ? await Promise.all(assets.map(async (asset) => [asset, await fetchGraphOi(asset, startIso, endIso)] as const))
    : assets.map((asset) => [asset, []] as const)
  const graphOiByAsset = Object.fromEntries(graphOiEntries)
  const { oiExpansion: oiInput, priceOi: priceOiInput } = oiPointsFromGraph(graphOiByAsset, candlesByAsset)

  const fillsEntries = await Promise.all(watchlist.map(async (watch) => {
    const fills = await client.fetchUserFillsByTime(watch.wallet, warmupStartTime, endTime)
    console.log(`[hyperliquid-signals] ${watch.wallet.slice(0, 10)}... fills: ${fills.length}`)
    return [watch.wallet, fills] as const
  }))
  const fillsByWallet = Object.fromEntries(fillsEntries) as Record<string, HyperliquidFill[]>

  const oiFindings = detectHyperliquidOiExpansionFindings(oiInput)
  const priceOiFindings = detectHyperliquidPriceOiDivergences(priceOiInput, { now: endIso, windowDays: days })
  const fundingFindings = detectHyperliquidFundingPressureFindings(Object.fromEntries(fundingEntries), { now: endIso, windowDays: days })
  const volumeFindings = detectHyperliquidVolumeSpikes(candleVolumePoints(candlesByAsset), {
    baselineWindowMs: days * DAY_MS,
    minRecentVolumeUsd: Number(process.env.HYPERLIQUID_MIN_VOLUME_USD ?? 5_000_000),
    minSpikeMultiple: Number(process.env.HYPERLIQUID_MIN_VOLUME_SPIKE_MULTIPLE ?? 1.75),
  })
  const walletReplay = runHyperliquidMonthlyShadowReplay({
    watchlist,
    fillsByWallet,
    marketSnapshots,
    options: {
      now: endIso,
      startTime,
      endTime,
      warmupStartTime,
      minPositionUsd: Number(process.env.HYPERLIQUID_MIN_POSITION_USD ?? 100_000),
      minChangeUsd: Number(process.env.HYPERLIQUID_MIN_CHANGE_USD ?? 50_000),
      minChangePct: Number(process.env.HYPERLIQUID_MIN_CHANGE_PCT ?? 0.3),
      maxPublications: Number(process.env.HYPERLIQUID_SIGNAL_MAX_WALLET_PUBLICATIONS ?? 50),
    },
  })

  const normalizedSignals = [
    ...oiSignals(oiFindings),
    ...priceOiSignals(priceOiFindings),
    ...fundingSignals(fundingFindings),
    ...volumeSignals(volumeFindings),
    ...walletSignals(walletReplay.wouldPublish),
  ]
  const stories = combineHyperliquidCrossSignalStories(normalizedSignals, {
    now: endIso,
    windowStart: startIso,
    windowEnd: endIso,
    maxStories,
  })

  const artifact: BacktestArtifact = {
    kind: 'hyperliquid.signal-lanes.7d-backtest',
    generatedAt: endIso,
    window: { start: startIso, end: endIso, days },
    agentRound: [
      { lane: 'oi_expansion', nickname: 'Newton', confidence: 9, status: 'completed' },
      { lane: 'price_oi_divergence', nickname: 'Meitner', confidence: 8, status: 'completed' },
      { lane: 'funding_pressure', nickname: 'Ptolemy', confidence: 9, status: 'completed' },
      { lane: 'volume_spike', nickname: 'Goodall', confidence: 8, status: 'completed' },
      { lane: 'watchlist_wallet', nickname: 'Ampere', confidence: 8, status: 'completed' },
      { lane: 'cross_signal_story', nickname: 'Kierkegaard', confidence: 9, status: 'completed' },
    ],
    dataSources: {
      assets,
      watchlistSource: process.env.HYPERLIQUID_WATCHLIST ? 'env:HYPERLIQUID_WATCHLIST' : 'temporary public leaderboard',
      watchlistWallets: watchlist.map((watch) => watch.wallet),
      oiProvider: graphToken ? 'the_graph_token_api' : 'not_configured',
    },
    caveats: [
      'This is a seven-day shadow/backtest report. It does not insert into Supabase or published_narratives.',
      'Official Hyperliquid endpoints provide historical candles, funding, and user fills; historical OI requires a separate configured OI provider or our own stored OI snapshots.',
      'Watchlist wallets fall back to the public leaderboard when HYPERLIQUID_WATCHLIST is not configured; leaderboard wallets can include market makers or hedged accounts.',
      'Wallet position history is reconstructed from fills with a warm-up window, not from official point-in-time historical position snapshots.',
      'Rows under crossSignalStories are would-be published_narratives rows for review only.',
    ],
    laneSummaries: {
      oiExpansion: oiFindings.length,
      priceOiDivergence: priceOiFindings.length,
      fundingPressure: fundingFindings.length,
      volumeSpike: volumeFindings.length,
      watchlistWallet: walletReplay.wouldPublish.length,
      crossSignalStories: stories.length,
    },
    laneFindings: {
      oiExpansion: oiFindings,
      priceOiDivergence: priceOiFindings,
      fundingPressure: fundingFindings,
      volumeSpike: volumeFindings,
      watchlistWallet: walletSignals(walletReplay.wouldPublish),
    },
    crossSignalStories: stories,
  }

  const artifactPath = await writeArtifact(artifact)
  console.log(JSON.stringify({
    artifactPath,
    laneSummaries: artifact.laneSummaries,
    oiProvider: artifact.dataSources.oiProvider,
    examples: stories.slice(0, 8).map((story) => ({
      asset: story.asset,
      score: story.score,
      signals: story.signalTypes,
      contentSmall: story.publishedNarrativeRow.content_small,
    })),
    topLaneExamples: {
      funding: fundingFindings.slice(0, 3).map((finding) => finding.reason),
      volume: volumeFindings.slice(0, 3).map((finding) => finding.reason),
      wallet: walletReplay.wouldPublish.slice(0, 3).map((story) => story.output.content_small),
      oi: oiFindings.slice(0, 3).map((finding) => finding.reason),
    },
    note: graphToken
      ? 'Historical OI provider was configured, so OI lanes ran with provider data.'
      : 'Historical OI provider was not configured, so OI expansion and price/OI divergence produced no real-data findings.',
  }, null, 2))
}

main().catch((err) => {
  console.error('[hyperliquid-signals] Fatal error:', err)
  process.exit(1)
})
