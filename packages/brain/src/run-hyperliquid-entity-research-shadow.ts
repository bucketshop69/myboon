import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { HyperliquidInfoClient, type HyperliquidCandle, type HyperliquidFundingPoint } from './intelligence/hyperliquid/client.js'
import {
  buildHyperliquidFundingResearchLeads,
  buildHyperliquidPriceMomentumResearchLeads,
  buildHyperliquidVolumeResearchLeads,
  rankHyperliquidResearchLeads,
  summarizeHyperliquidResearchLeads,
  type HyperliquidResearchLead,
} from './intelligence/hyperliquid/research-leads.js'
import {
  buildHyperliquidEntityResearch,
  summarizeEntityResearch,
  type HyperliquidEntityResearchResult,
} from './intelligence/v3/hyperliquid-entity-research.js'

const DAY_MS = 24 * 3_600_000

const lookbackDays = Number(process.env.HYPERLIQUID_ENTITY_RESEARCH_DAYS ?? 7)
const maxAssets = Number(process.env.HYPERLIQUID_ENTITY_RESEARCH_MAX_ASSETS ?? 12)
const maxPackets = Number(process.env.HYPERLIQUID_ENTITY_RESEARCH_MAX_PACKETS ?? 20)
const includeWatch = process.env.HYPERLIQUID_ENTITY_RESEARCH_INCLUDE_WATCH !== '0'
const outputPath = process.env.HYPERLIQUID_ENTITY_RESEARCH_OUTPUT

interface HyperliquidEntityResearchShadowArtifact {
  kind: 'hyperliquid.entity-research-shadow'
  generatedAt: string
  params: {
    lookbackDays: number
    maxAssets: number
    maxPackets: number
    includeWatch: boolean
    assets: string[]
  }
  collectionLeadSummary: ReturnType<typeof summarizeHyperliquidResearchLeads>
  researchPacketSummary: ReturnType<typeof summarizeEntityResearch>
  collectionLeads: HyperliquidResearchLead[]
  entityResearch: HyperliquidEntityResearchResult
  notes: string[]
}

function parseAssetList(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean)
}

function selectAssets(marketSnapshots: Awaited<ReturnType<HyperliquidInfoClient['fetchMarketSnapshots']>>): string[] {
  const explicit = parseAssetList(
    process.env.HYPERLIQUID_ENTITY_RESEARCH_ASSETS
      ?? process.env.HYPERLIQUID_RESEARCH_LEAD_ASSETS
      ?? process.env.HYPERLIQUID_EXPLORE_ASSETS
  )
  if (explicit.length > 0) return explicit

  const focus = ['BTC', 'ETH', 'SOL', 'HYPE', 'NEAR', 'XRP', 'DOGE']
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
    console.warn(`[hyperliquid-entity-research-shadow] ${asset} candle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function safeFetchFunding(client: HyperliquidInfoClient, asset: string, startTime: number, endTime: number): Promise<HyperliquidFundingPoint[]> {
  try {
    return await client.fetchFundingHistory(asset, startTime, endTime)
  } catch (err) {
    console.warn(`[hyperliquid-entity-research-shadow] ${asset} funding fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function writeArtifact(artifact: HyperliquidEntityResearchShadowArtifact): Promise<string> {
  const path = outputPath
    ? resolve(outputPath)
    : resolve(process.cwd(), 'artifacts', 'hyperliquid-research', `hyperliquid-entity-research-shadow-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(artifact, null, 2))
  return path
}

async function main(): Promise<void> {
  const now = new Date()
  const nowIso = now.toISOString()
  const client = new HyperliquidInfoClient()
  const marketSnapshots = await client.fetchMarketSnapshots(nowIso)
  const assets = selectAssets(marketSnapshots)
  const fetchStart = now.getTime() - (lookbackDays + 2) * DAY_MS

  console.log(`[hyperliquid-entity-research-shadow] Assets: ${assets.join(', ')}`)
  console.log(`[hyperliquid-entity-research-shadow] Lookback: ${lookbackDays}d`)

  const candleEntries = await Promise.all(assets.map(async (asset) => {
    const candles = await safeFetchCandles(client, asset, fetchStart, now.getTime())
    console.log(`[hyperliquid-entity-research-shadow] ${asset} daily candles: ${candles.length}`)
    return [asset, candles] as const
  }))
  const fundingEntries = await Promise.all(assets.map(async (asset) => {
    const funding = await safeFetchFunding(client, asset, fetchStart, now.getTime())
    console.log(`[hyperliquid-entity-research-shadow] ${asset} funding points: ${funding.length}`)
    return [asset, funding] as const
  }))

  const candlesByAsset = Object.fromEntries(candleEntries)
  const fundingByAsset = Object.fromEntries(fundingEntries)
  const volumeLeads = assets.flatMap((asset) => buildHyperliquidVolumeResearchLeads({
    asset,
    candles: candlesByAsset[asset] ?? [],
    now: nowIso,
    windowsDays: [lookbackDays],
  }))
  const priceMomentumLeads = assets.flatMap((asset) => buildHyperliquidPriceMomentumResearchLeads({
    asset,
    candles: candlesByAsset[asset] ?? [],
    now: nowIso,
    windowsDays: [1, lookbackDays],
  }))
  const fundingLeads = assets.flatMap((asset) => buildHyperliquidFundingResearchLeads({
    asset,
    funding: fundingByAsset[asset] ?? [],
    now: nowIso,
    windowsDays: [lookbackDays],
  }))
  const leads = rankHyperliquidResearchLeads([...volumeLeads, ...priceMomentumLeads, ...fundingLeads])
  const entityResearch = buildHyperliquidEntityResearch(leads, {
    now: nowIso,
    includeWatch,
    maxPackets,
  })

  const artifact: HyperliquidEntityResearchShadowArtifact = {
    kind: 'hyperliquid.entity-research-shadow',
    generatedAt: nowIso,
    params: {
      lookbackDays,
      maxAssets,
      maxPackets,
      includeWatch,
      assets,
    },
    collectionLeadSummary: summarizeHyperliquidResearchLeads(leads),
    researchPacketSummary: summarizeEntityResearch(entityResearch),
    collectionLeads: leads,
    entityResearch,
    notes: [
      'This is a shadow run. It does not write research_packets or published_narratives.',
      'Entity books are in-memory for this artifact so we can inspect whether the researcher memory loop feels useful.',
      'Web/external research is intentionally not used in this first pass.',
    ],
  }

  const artifactPath = await writeArtifact(artifact)
  console.log(JSON.stringify({
    artifactPath,
    collectionLeadSummary: artifact.collectionLeadSummary,
    researchPacketSummary: artifact.researchPacketSummary,
    topPackets: entityResearch.packets.slice(0, 8).map((item) => ({
      entity: item.packet.entities[0]?.canonicalName,
      archetype: item.packet.archetype,
      decision: item.decision.decision,
      priority: item.decision.priority,
      headlineClaim: item.packet.headlineClaim,
      thesis: item.packet.thesis,
      memoryUpdate: item.entityBookNote.memoryUpdate,
      nextQuestions: item.entityBookNote.nextQuestions.slice(0, 3),
    })),
    entityBooks: entityResearch.entityBooks.map((book) => ({
      entity: book.entity.canonicalName,
      notes: book.notes.length,
      latestNote: book.notes.at(-1)?.memoryUpdate ?? null,
      openQuestions: book.openQuestions.slice(0, 3),
    })),
    note: 'Research packets and entity books were created in an artifact only; no feed publication happened.',
  }, null, 2))
}

main().catch((err) => {
  console.error('[hyperliquid-entity-research-shadow] Fatal error:', err)
  process.exit(1)
})
