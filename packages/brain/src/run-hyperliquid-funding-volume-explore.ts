import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { HyperliquidInfoClient, type HyperliquidCandle, type HyperliquidFundingPoint as ClientFundingPoint } from './intelligence/hyperliquid/client.js'
import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from './intelligence/hyperliquid/research-lead-thresholds.js'

const DAY_MS = 24 * 3_600_000
const HOUR_MS = 3_600_000

type CandidateStatus = 'pass' | 'hold'

interface Check {
  name: string
  passed: boolean
  value: string
  threshold: string
}

interface FundingCandidate {
  lane: 'funding'
  asset: string
  status: CandidateStatus
  score: number
  headline: string
  whyItMatters: string
  observedWindow: {
    start: string
    end: string
    days: number
  }
  metrics: {
    samples: number
    latestFundingBps: number
    averageFundingBps: number
    maxFundingBps: number
    minFundingBps: number
    positiveSampleSharePct: number
    negativeSampleSharePct: number
    firstHalfAverageBps: number
    secondHalfAverageBps: number
  }
  checks: Check[]
}

interface VolumeCandidate {
  lane: 'volume'
  asset: string
  status: CandidateStatus
  score: number
  headline: string
  whyItMatters: string
  observedWindow: {
    baselineStart: string
    baselineEnd: string
    recentStart: string
    recentEnd: string
    days: number
  }
  metrics: {
    recentVolumeUsd: number
    baselineAverageVolumeUsd: number
    spikeMultiple: number
    baselineDays: number
    recentClose: number
    recentPriceChangePct: number
  }
  checks: Check[]
}

interface ExplorationWindow {
  days: number
  funding: FundingCandidate[]
  volume: VolumeCandidate[]
}

interface ExplorationArtifact {
  kind: 'hyperliquid.funding-volume.exploration'
  generatedAt: string
  assets: string[]
  thresholds: {
    funding: {
      minSamples: number
      averageFundingBps: number
      tailFundingBps: number
      sustainedSharePct: number
      flipDeltaBps: number
    }
    volume: {
      minBaselineDays: number
      minRecentVolumeUsd: number
      researchSpikeMultiple7d: number
      researchSpikeMultiple30d: number
    }
  }
  windows: ExplorationWindow[]
}

const maxAssets = Number(process.env.HYPERLIQUID_EXPLORE_MAX_ASSETS ?? 20)
const topN = Number(process.env.HYPERLIQUID_EXPLORE_TOP_N ?? 20)
const outputPath = process.env.HYPERLIQUID_EXPLORE_OUTPUT

const fundingThresholds = {
  minSamples: Number(process.env.HYPERLIQUID_EXPLORE_MIN_FUNDING_SAMPLES ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.funding.minSamples),
  averageFunding: Number(process.env.HYPERLIQUID_EXPLORE_AVG_FUNDING_THRESHOLD ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.funding.researchAverageFundingBps / 10_000),
  tailFunding: Number(process.env.HYPERLIQUID_EXPLORE_TAIL_FUNDING_THRESHOLD ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.funding.researchTailFundingBps / 10_000),
  sustainedShare: Number(process.env.HYPERLIQUID_EXPLORE_SUSTAINED_SHARE ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.funding.researchSustainedSharePct / 100),
  flipDelta: Number(process.env.HYPERLIQUID_EXPLORE_FLIP_DELTA ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.funding.researchFlipDeltaBps / 10_000),
}

const volumeThresholds = {
  minBaselineDays: Number(process.env.HYPERLIQUID_EXPLORE_MIN_BASELINE_DAYS ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.volume.minBaselineDays),
  minRecentVolumeUsd: Number(process.env.HYPERLIQUID_EXPLORE_MIN_RECENT_VOLUME_USD ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.volume.minRecentVolumeUsd),
  researchSpikeMultiple7d: Number(process.env.HYPERLIQUID_EXPLORE_MIN_VOLUME_MULTIPLE_7D ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.volume.researchSpikeMultiple7d),
  researchSpikeMultiple30d: Number(process.env.HYPERLIQUID_EXPLORE_MIN_VOLUME_MULTIPLE_30D ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.volume.researchSpikeMultiple30d),
}

function parseWindows(): number[] {
  const raw = process.env.HYPERLIQUID_EXPLORE_WINDOWS ?? '7,30'
  const windows = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
  return [...new Set(windows.length > 0 ? windows : [7, 30])]
}

function parseAssetList(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean)
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function bps(value: number): number {
  return round(value * 10_000, 3)
}

function pct(value: number): number {
  return round(value * 100, 1)
}

function money(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${round(value / 1_000_000_000, 1)}B`
  if (abs >= 1_000_000) return `$${round(value / 1_000_000, 1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function selectAssets(marketSnapshots: Awaited<ReturnType<HyperliquidInfoClient['fetchMarketSnapshots']>>): string[] {
  const explicit = parseAssetList(process.env.HYPERLIQUID_EXPLORE_ASSETS ?? process.env.HYPERLIQUID_SIGNAL_ASSETS)
  if (explicit.length > 0) return explicit

  const focus = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE']
  const top = [...marketSnapshots]
    .filter((snapshot) => snapshot.asset && snapshot.volume24hUsd != null)
    .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
    .map((snapshot) => snapshot.asset.toUpperCase())

  return [...new Set([...focus, ...top])].slice(0, maxAssets)
}

function fundingCandidate(asset: string, rawPoints: ClientFundingPoint[], now: Date, days: number): FundingCandidate {
  const endTime = now.getTime()
  const startTime = endTime - days * DAY_MS
  const points = rawPoints
    .filter((point) => point.time >= startTime && point.time <= endTime)
    .sort((a, b) => a.time - b.time)
  const values = points.map((point) => point.fundingRate)
  const splitAt = Math.max(1, Math.floor(values.length / 2))
  const firstHalfAverage = average(values.slice(0, splitAt))
  const secondHalfAverage = average(values.slice(splitAt).length > 0 ? values.slice(splitAt) : values.slice(0, splitAt))
  const avgFunding = average(values)
  const maxFunding = values.length > 0 ? Math.max(...values) : 0
  const minFunding = values.length > 0 ? Math.min(...values) : 0
  const latestFunding = values.at(-1) ?? 0
  const positiveShare = values.length > 0 ? values.filter((value) => value > 0).length / values.length : 0
  const negativeShare = values.length > 0 ? values.filter((value) => value < 0).length / values.length : 0
  const dominantShare = Math.max(positiveShare, negativeShare)
  const absoluteAverage = Math.abs(avgFunding)
  const absoluteTail = Math.max(Math.abs(maxFunding), Math.abs(minFunding))
  const flipDelta = Math.abs(secondHalfAverage - firstHalfAverage)
  const flipped = Math.sign(firstHalfAverage) !== Math.sign(secondHalfAverage) && Math.sign(firstHalfAverage) !== 0 && Math.sign(secondHalfAverage) !== 0
  const sampleCheck = values.length >= fundingThresholds.minSamples
  const averageCheck = absoluteAverage >= fundingThresholds.averageFunding
  const tailCheck = absoluteTail >= fundingThresholds.tailFunding
  const sustainedCheck = dominantShare >= fundingThresholds.sustainedShare
  const flipCheck = flipped && flipDelta >= fundingThresholds.flipDelta
  const status: CandidateStatus = sampleCheck && ((averageCheck && tailCheck) || (sustainedCheck && averageCheck) || flipCheck) ? 'pass' : 'hold'
  const score = round(
    Math.min(4, absoluteAverage / fundingThresholds.averageFunding) * 2
      + Math.min(3, absoluteTail / fundingThresholds.tailFunding) * 1.5
      + Math.min(1, dominantShare / fundingThresholds.sustainedShare) * 1.5
      + (flipCheck ? 1.5 : 0),
    2
  )
  const direction = avgFunding > 0 ? 'longs paying shorts' : avgFunding < 0 ? 'shorts paying longs' : 'funding near flat'
  const headline = status === 'pass'
    ? `${asset} funding pressure: ${direction}, avg ${bps(avgFunding)} bps`
    : `${asset} funding watch: ${direction}, avg ${bps(avgFunding)} bps`
  const whyItMatters = status === 'pass'
    ? 'Funding is a crowding signal: when one side keeps paying, the trade may be consensus and vulnerable to reversal or squeeze.'
    : 'This is useful context but not a feed item yet because the pressure is too small, too inconsistent, or undersampled.'

  return {
    lane: 'funding',
    asset,
    status,
    score,
    headline,
    whyItMatters,
    observedWindow: {
      start: new Date(startTime).toISOString(),
      end: now.toISOString(),
      days,
    },
    metrics: {
      samples: values.length,
      latestFundingBps: bps(latestFunding),
      averageFundingBps: bps(avgFunding),
      maxFundingBps: bps(maxFunding),
      minFundingBps: bps(minFunding),
      positiveSampleSharePct: pct(positiveShare),
      negativeSampleSharePct: pct(negativeShare),
      firstHalfAverageBps: bps(firstHalfAverage),
      secondHalfAverageBps: bps(secondHalfAverage),
    },
    checks: [
      { name: 'enough hourly samples', passed: sampleCheck, value: String(values.length), threshold: `>= ${fundingThresholds.minSamples}` },
      { name: 'average pressure', passed: averageCheck, value: `${bps(absoluteAverage)} bps`, threshold: `>= ${bps(fundingThresholds.averageFunding)} bps` },
      { name: 'tail pressure', passed: tailCheck, value: `${bps(absoluteTail)} bps`, threshold: `>= ${bps(fundingThresholds.tailFunding)} bps` },
      { name: 'sustained one-sided samples', passed: sustainedCheck, value: `${pct(dominantShare)}%`, threshold: `>= ${pct(fundingThresholds.sustainedShare)}%` },
      { name: 'meaningful flip', passed: flipCheck, value: `${bps(flipDelta)} bps`, threshold: `>= ${bps(fundingThresholds.flipDelta)} bps and sign changed` },
    ],
  }
}

function dailyVolumeUsd(candle: HyperliquidCandle): number {
  return candle.volume * candle.close
}

function volumeCandidate(asset: string, candles: HyperliquidCandle[], now: Date, days: number): VolumeCandidate {
  const endTime = now.getTime()
  const baselineStartTime = endTime - days * DAY_MS
  const closedCandles = candles
    .filter((candle) => candle.endTime <= endTime - HOUR_MS)
    .sort((a, b) => a.endTime - b.endTime)
  const recent = closedCandles.at(-1)
  const baseline = recent
    ? closedCandles.filter((candle) => candle.endTime >= baselineStartTime && candle.endTime < recent.endTime)
    : []
  const recentVolumeUsd = recent ? dailyVolumeUsd(recent) : 0
  const baselineAverageVolumeUsd = average(baseline.map(dailyVolumeUsd))
  const spikeMultiple = baselineAverageVolumeUsd > 0 ? recentVolumeUsd / baselineAverageVolumeUsd : 0
  const previousClose = baseline.at(-1)?.close ?? recent?.open ?? 0
  const recentClose = recent?.close ?? 0
  const recentPriceChangePct = previousClose > 0 ? ((recentClose - previousClose) / previousClose) * 100 : 0
  const baselineCheck = baseline.length >= volumeThresholds.minBaselineDays
  const volumeCheck = recentVolumeUsd >= volumeThresholds.minRecentVolumeUsd
  const minSpikeMultiple = days >= 30 ? volumeThresholds.researchSpikeMultiple30d : volumeThresholds.researchSpikeMultiple7d
  const spikeCheck = spikeMultiple >= minSpikeMultiple
  const status: CandidateStatus = baselineCheck && volumeCheck && spikeCheck ? 'pass' : 'hold'
  const score = round(
    Math.min(4, spikeMultiple / minSpikeMultiple) * 2
      + Math.min(3, recentVolumeUsd / volumeThresholds.minRecentVolumeUsd) * 1.5
      + Math.min(1, baseline.length / volumeThresholds.minBaselineDays),
    2
  )
  const move = recentPriceChangePct >= 0 ? `up ${round(recentPriceChangePct, 2)}%` : `down ${Math.abs(round(recentPriceChangePct, 2))}%`
  const headline = status === 'pass'
    ? `${asset} volume spike: ${round(spikeMultiple, 2)}x baseline, price ${move}`
    : `${asset} volume watch: ${round(spikeMultiple, 2)}x baseline, price ${move}`
  const whyItMatters = status === 'pass'
    ? 'Volume is attention. A clean volume expansion says the asset deserves a closer read even before wallet or OI context is added.'
    : 'This is visible market activity, but the latest day is not far enough above baseline to become a standalone feed item.'

  return {
    lane: 'volume',
    asset,
    status,
    score,
    headline,
    whyItMatters,
    observedWindow: {
      baselineStart: new Date(baselineStartTime).toISOString(),
      baselineEnd: baseline.at(-1) ? new Date(baseline.at(-1)!.endTime).toISOString() : new Date(baselineStartTime).toISOString(),
      recentStart: recent ? new Date(recent.startTime).toISOString() : now.toISOString(),
      recentEnd: recent ? new Date(recent.endTime).toISOString() : now.toISOString(),
      days,
    },
    metrics: {
      recentVolumeUsd: round(recentVolumeUsd),
      baselineAverageVolumeUsd: round(baselineAverageVolumeUsd),
      spikeMultiple: round(spikeMultiple, 2),
      baselineDays: baseline.length,
      recentClose: round(recentClose, 6),
      recentPriceChangePct: round(recentPriceChangePct, 2),
    },
    checks: [
      { name: 'enough baseline days', passed: baselineCheck, value: String(baseline.length), threshold: `>= ${volumeThresholds.minBaselineDays}` },
      { name: 'large enough recent volume', passed: volumeCheck, value: money(recentVolumeUsd), threshold: `>= ${money(volumeThresholds.minRecentVolumeUsd)}` },
      { name: 'above baseline', passed: spikeCheck, value: `${round(spikeMultiple, 2)}x`, threshold: `>= ${minSpikeMultiple}x` },
    ],
  }
}

function sortCandidates<T extends { status: CandidateStatus, score: number, asset: string }>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pass' ? -1 : 1
    return b.score - a.score || a.asset.localeCompare(b.asset)
  })
}

async function safeFetchFunding(client: HyperliquidInfoClient, asset: string, startTime: number, endTime: number): Promise<ClientFundingPoint[]> {
  try {
    return await client.fetchFundingHistory(asset, startTime, endTime)
  } catch (err) {
    console.warn(`[hyperliquid-funding-volume] ${asset} funding fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function safeFetchCandles(client: HyperliquidInfoClient, asset: string, startTime: number, endTime: number): Promise<HyperliquidCandle[]> {
  try {
    return await client.fetchCandleSnapshot(asset, '1d', startTime, endTime)
  } catch (err) {
    console.warn(`[hyperliquid-funding-volume] ${asset} candle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function writeArtifact(artifact: ExplorationArtifact): Promise<string> {
  const path = outputPath
    ? resolve(outputPath)
    : resolve(process.cwd(), 'artifacts', 'hyperliquid-signals', `hyperliquid-funding-volume-explore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(artifact, null, 2))
  return path
}

async function main(): Promise<void> {
  const now = new Date()
  const client = new HyperliquidInfoClient()
  const windows = parseWindows()
  const maxWindowDays = Math.max(...windows)
  const marketSnapshots = await client.fetchMarketSnapshots(now.toISOString())
  const assets = selectAssets(marketSnapshots)
  const fetchStart = now.getTime() - (maxWindowDays + 2) * DAY_MS

  console.log(`[hyperliquid-funding-volume] Assets: ${assets.join(', ')}`)
  console.log(`[hyperliquid-funding-volume] Windows: ${windows.join('d, ')}d`)

  const fundingEntries = await Promise.all(assets.map(async (asset) => {
    const points = await safeFetchFunding(client, asset, fetchStart, now.getTime())
    console.log(`[hyperliquid-funding-volume] ${asset} funding points: ${points.length}`)
    return [asset, points] as const
  }))
  const candleEntries = await Promise.all(assets.map(async (asset) => {
    const candles = await safeFetchCandles(client, asset, fetchStart, now.getTime())
    console.log(`[hyperliquid-funding-volume] ${asset} daily candles: ${candles.length}`)
    return [asset, candles] as const
  }))
  const fundingByAsset = Object.fromEntries(fundingEntries)
  const candlesByAsset = Object.fromEntries(candleEntries)

  const artifact: ExplorationArtifact = {
    kind: 'hyperliquid.funding-volume.exploration',
    generatedAt: now.toISOString(),
    assets,
    thresholds: {
      funding: {
        minSamples: fundingThresholds.minSamples,
        averageFundingBps: bps(fundingThresholds.averageFunding),
        tailFundingBps: bps(fundingThresholds.tailFunding),
        sustainedSharePct: pct(fundingThresholds.sustainedShare),
        flipDeltaBps: bps(fundingThresholds.flipDelta),
      },
      volume: {
        minBaselineDays: volumeThresholds.minBaselineDays,
        minRecentVolumeUsd: volumeThresholds.minRecentVolumeUsd,
        researchSpikeMultiple7d: volumeThresholds.researchSpikeMultiple7d,
        researchSpikeMultiple30d: volumeThresholds.researchSpikeMultiple30d,
      },
    },
    windows: windows.map((days) => ({
      days,
      funding: sortCandidates(assets.map((asset) => fundingCandidate(asset, fundingByAsset[asset] ?? [], now, days))).slice(0, topN),
      volume: sortCandidates(assets.map((asset) => volumeCandidate(asset, candlesByAsset[asset] ?? [], now, days))).slice(0, topN),
    })),
  }

  const artifactPath = await writeArtifact(artifact)
  console.log(JSON.stringify({
    artifactPath,
    thresholds: artifact.thresholds,
    windows: artifact.windows.map((window) => ({
      days: window.days,
      counts: {
        fundingPass: window.funding.filter((candidate) => candidate.status === 'pass').length,
        volumePass: window.volume.filter((candidate) => candidate.status === 'pass').length,
      },
      topFunding: window.funding.slice(0, 5).map((candidate) => ({
        asset: candidate.asset,
        status: candidate.status,
        score: candidate.score,
        headline: candidate.headline,
        metrics: candidate.metrics,
        failedChecks: candidate.checks.filter((check) => !check.passed).map((check) => `${check.name}: ${check.value} vs ${check.threshold}`),
      })),
      topVolume: window.volume.slice(0, 5).map((candidate) => ({
        asset: candidate.asset,
        status: candidate.status,
        score: candidate.score,
        headline: candidate.headline,
        metrics: {
          recentVolume: money(candidate.metrics.recentVolumeUsd),
          baselineAverageVolume: money(candidate.metrics.baselineAverageVolumeUsd),
          spikeMultiple: candidate.metrics.spikeMultiple,
          recentPriceChangePct: candidate.metrics.recentPriceChangePct,
        },
        failedChecks: candidate.checks.filter((check) => !check.passed).map((check) => `${check.name}: ${check.value} vs ${check.threshold}`),
      })),
    })),
    note: 'This exploration does not write to Supabase. It ranks pass and hold candidates so the examples can be judged before tuning publish thresholds.',
  }, null, 2))
}

main().catch((err) => {
  console.error('[hyperliquid-funding-volume] Fatal error:', err)
  process.exit(1)
})
