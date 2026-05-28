import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { HyperliquidInfoClient, type HyperliquidCandle, type HyperliquidFundingPoint } from './client.js'
import {
  collectionLeadPersistenceStatus,
  finishCollectionRun,
  persistCollectionLeads,
  startCollectionRun,
} from './collection-lead-store.js'
import {
  buildHyperliquidFundingResearchLeads,
  buildHyperliquidPriceMomentumResearchLeads,
  buildHyperliquidVolumeResearchLeads,
  rankHyperliquidResearchLeads,
  summarizeHyperliquidResearchLeads,
  type HyperliquidResearchLead,
  type HyperliquidResearchLeadArtifact,
} from './research-leads.js'
import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from './research-lead-thresholds.js'

const DAY_MS = 24 * 3_600_000
const SOURCE = 'hyperliquid'
const COLLECTOR = 'hyperliquid.research-leads'

const maxAssets = Number(process.env.HYPERLIQUID_RESEARCH_LEAD_MAX_ASSETS ?? 20)
const outputPath = process.env.HYPERLIQUID_RESEARCH_LEAD_OUTPUT

function parseWindows(): number[] {
  const raw = process.env.HYPERLIQUID_RESEARCH_LEAD_WINDOWS
    ?? HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.volume.windowsDays.join(',')
  const windows = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
  return [...new Set(windows.length > 0 ? windows : [...HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.volume.windowsDays])]
}

function parseAssetList(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean)
}

function money(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function selectAssets(marketSnapshots: Awaited<ReturnType<HyperliquidInfoClient['fetchMarketSnapshots']>>): string[] {
  const explicit = parseAssetList(process.env.HYPERLIQUID_RESEARCH_LEAD_ASSETS ?? process.env.HYPERLIQUID_EXPLORE_ASSETS)
  if (explicit.length > 0) return explicit

  const focus = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE']
  const top = [...marketSnapshots]
    .filter((snapshot) => snapshot.asset && snapshot.volume24hUsd != null)
    .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
    .map((snapshot) => snapshot.asset.toUpperCase())

  return [...new Set([...focus, ...top])].slice(0, maxAssets)
}

async function safeFetchCandles(client: HyperliquidInfoClient, asset: string, startTime: number, endTime: number): Promise<HyperliquidCandle[]> {
  try {
    return await client.fetchCandleSnapshot(asset, '1d', startTime, endTime)
  } catch (err) {
    console.warn(`[hyperliquid-research-leads] ${asset} candle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function safeFetchFunding(client: HyperliquidInfoClient, asset: string, startTime: number, endTime: number): Promise<HyperliquidFundingPoint[]> {
  try {
    return await client.fetchFundingHistory(asset, startTime, endTime)
  } catch (err) {
    console.warn(`[hyperliquid-research-leads] ${asset} funding fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function writeArtifact(artifact: HyperliquidResearchLeadArtifact): Promise<string> {
  const path = outputPath
    ? resolve(outputPath)
    : resolve(process.cwd(), 'artifacts', 'hyperliquid-signals', `hyperliquid-research-leads-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(artifact, null, 2))
  return path
}

function metricsForConsole(lead: HyperliquidResearchLead): Record<string, number | string | boolean | null> {
  if (lead.lane === 'funding_pressure') {
    return {
      windowDays: lead.metrics.windowDays,
      samples: lead.metrics.samples,
      averageFundingBps: lead.metrics.averageFundingBps,
      latestFundingBps: lead.metrics.latestFundingBps,
      tailFundingBps: lead.metrics.tailFundingBps,
      positiveSampleSharePct: lead.metrics.positiveSampleSharePct,
      negativeSampleSharePct: lead.metrics.negativeSampleSharePct,
      flipDeltaBps: lead.metrics.flipDeltaBps,
    }
  }

  if (lead.lane === 'price_momentum') {
    return {
      windowDays: lead.metrics.windowDays,
      startClose: lead.metrics.startClose,
      recentClose: lead.metrics.recentClose,
      priceMovePct: lead.metrics.priceMovePct,
      recentVolume: typeof lead.metrics.recentVolumeUsd === 'number' ? money(lead.metrics.recentVolumeUsd) : lead.metrics.recentVolumeUsd,
      baselineCandles: lead.metrics.baselineCandles,
    }
  }

  return {
    windowDays: lead.metrics.windowDays,
    recentVolume: typeof lead.metrics.recentVolumeUsd === 'number' ? money(lead.metrics.recentVolumeUsd) : lead.metrics.recentVolumeUsd,
    baselineAverageVolume: typeof lead.metrics.baselineAverageVolumeUsd === 'number' ? money(lead.metrics.baselineAverageVolumeUsd) : lead.metrics.baselineAverageVolumeUsd,
    spikeMultiple: lead.metrics.spikeMultiple,
    priceMovePct: lead.metrics.priceMovePct,
  }
}

async function main(): Promise<void> {
  let runId: string | null = null

  try {
    const now = new Date()
    const nowIso = now.toISOString()
    const windows = parseWindows()
    const maxWindowDays = Math.max(...windows)
    const client = new HyperliquidInfoClient()
    const marketSnapshots = await client.fetchMarketSnapshots(nowIso)
    const assets = selectAssets(marketSnapshots)
    const fetchStart = now.getTime() - (maxWindowDays + 2) * DAY_MS

    console.log(`[hyperliquid-research-leads] Assets: ${assets.join(', ')}`)
    console.log(`[hyperliquid-research-leads] Windows: ${windows.join('d, ')}d`)
    console.log(`[hyperliquid-research-leads] Collection lead persistence: ${collectionLeadPersistenceStatus()}`)

    const run = await startCollectionRun({
      source: SOURCE,
      collector: COLLECTOR,
      params: {
        assets,
        windows,
        maxAssets,
        fetchStart: new Date(fetchStart).toISOString(),
        fetchEnd: nowIso,
      },
    })
    runId = run?.id ?? null

    const candleEntries = await Promise.all(assets.map(async (asset) => {
      const candles = await safeFetchCandles(client, asset, fetchStart, now.getTime())
      console.log(`[hyperliquid-research-leads] ${asset} daily candles: ${candles.length}`)
      return [asset, candles] as const
    }))
    const fundingEntries = await Promise.all(assets.map(async (asset) => {
      const funding = await safeFetchFunding(client, asset, fetchStart, now.getTime())
      console.log(`[hyperliquid-research-leads] ${asset} funding points: ${funding.length}`)
      return [asset, funding] as const
    }))
    const candlesByAsset = Object.fromEntries(candleEntries)
    const fundingByAsset = Object.fromEntries(fundingEntries)
    const volumeLeads = assets.flatMap((asset) => buildHyperliquidVolumeResearchLeads({
      asset,
      candles: candlesByAsset[asset] ?? [],
      now: nowIso,
      windowsDays: windows,
    }))
    const priceMomentumLeads = assets.flatMap((asset) => buildHyperliquidPriceMomentumResearchLeads({
      asset,
      candles: candlesByAsset[asset] ?? [],
      now: nowIso,
    }))
    const fundingLeads = assets.flatMap((asset) => buildHyperliquidFundingResearchLeads({
      asset,
      funding: fundingByAsset[asset] ?? [],
      now: nowIso,
      windowsDays: windows,
    }))
    const leads = rankHyperliquidResearchLeads([...volumeLeads, ...fundingLeads, ...priceMomentumLeads])

    const artifact: HyperliquidResearchLeadArtifact = {
      kind: 'hyperliquid.research-leads',
      generatedAt: nowIso,
      assets,
      windows,
      leads,
      laneSummaries: summarizeHyperliquidResearchLeads(leads),
    }

    const artifactPath = await writeArtifact(artifact)
    const persistedLeads = runId
      ? await persistCollectionLeads({ source: SOURCE, collector: COLLECTOR, runId, leads })
      : 0
    await finishCollectionRun(runId, {
      status: 'completed',
      summary: artifact.laneSummaries,
      artifactPath,
    })

    const researchLeads = leads.filter((lead) => lead.status === 'research')
    const watchLeads = leads.filter((lead) => lead.status === 'watch')
    console.log(JSON.stringify({
      artifactPath,
      persistedLeads,
      laneSummaries: artifact.laneSummaries,
      topResearchLeads: researchLeads.slice(0, 10).map((lead) => ({
        asset: lead.asset,
        lane: lead.lane,
        priority: lead.priority,
        headline: lead.headline,
        whatChanged: lead.whatChanged,
        metrics: metricsForConsole(lead),
      })),
      topFundingResearchLeads: researchLeads.filter((lead) => lead.lane === 'funding_pressure').slice(0, 8).map((lead) => ({
        asset: lead.asset,
        priority: lead.priority,
        headline: lead.headline,
        whatChanged: lead.whatChanged,
        metrics: metricsForConsole(lead),
      })),
      topVolumeResearchLeads: researchLeads.filter((lead) => lead.lane === 'volume_spike').slice(0, 8).map((lead) => ({
        asset: lead.asset,
        priority: lead.priority,
        headline: lead.headline,
        whatChanged: lead.whatChanged,
        metrics: metricsForConsole(lead),
      })),
      topPriceMomentumResearchLeads: researchLeads.filter((lead) => lead.lane === 'price_momentum').slice(0, 8).map((lead) => ({
        asset: lead.asset,
        priority: lead.priority,
        headline: lead.headline,
        whatChanged: lead.whatChanged,
        metrics: metricsForConsole(lead),
      })),
      topWatchLeads: watchLeads.slice(0, 5).map((lead) => ({
        asset: lead.asset,
        lane: lead.lane,
        priority: lead.priority,
        headline: lead.headline,
        failedChecks: lead.checks.filter((check) => !check.passed).map((check) => `${check.name}: ${check.value} vs ${check.threshold}`),
      })),
      note: 'Research leads are assignments, not feed publications. Published narratives were not created.',
    }, null, 2))
  } catch (err) {
    await finishCollectionRun(runId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }).catch((finishErr) => {
      console.warn(`[hyperliquid-research-leads] Could not mark collection run failed: ${finishErr instanceof Error ? finishErr.message : String(finishErr)}`)
    })
    throw err
  }
}

main().catch((err) => {
  console.error('[hyperliquid-research-leads] Fatal error:', err)
  process.exit(1)
})
