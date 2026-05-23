import { oddsMoveCriterion } from '../contracts.js'
import type { LegacyWhaleBetSignal } from '../polymarket-whale-backtest.js'
import {
  FEED_V3_SCHEMA_VERSION,
  type EditorialDecision,
  type FactTrace,
  type PacketFact,
  type ResearchPacket,
} from './contracts.js'
import { buildWalletRepeatStoryKey, decideWalletRepeatPacket } from './editorial-decision.js'

export interface PolymarketWalletTradeSeed {
  id: string
  wallet: string
  slug?: string | null
  marketId?: string | null
  marketTitle?: string | null
  outcome: string
  side: string
  amountUsd: number
  price?: number | null
  marketOddsAtTrade?: number | null
  observedAt: string
  capturedAt: string
  rawRef?: string
}

export interface PolymarketOddsSnapshotSeed {
  id: string
  slug: string
  price: number
  observedAt: string
  capturedAt: string
  rawRef?: string
  volumeUsd?: number | null
  liquidityUsd?: number | null
}

export interface WalletRepeatResearchOptions {
  now: string
  asOfMode?: 'now' | 'latest_trade'
  existingThreadByStoryKey?: Record<string, string>
  coveredThroughByStoryKey?: Record<string, string>
  noisyMarketSlugs?: string[]
  staleAfterHours?: number
  materialityThresholds?: {
    minNewTradeAmountUsd?: number
    minOddsDelta?: number
  }
}

export interface WalletRepeatResearchResult {
  packet: ResearchPacket
  decision: EditorialDecision
}

interface TradeGroup {
  storyKey: string
  wallet: string
  market: string
  marketTitle: string
  slug: string
  hasResolvedSlug: boolean
  outcome: string
  direction: 'up' | 'down'
  trades: PolymarketWalletTradeSeed[]
}

const DEFAULT_STALE_AFTER_HOURS = 24

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePrice(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 && parsed <= 1 ? parsed : null
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function inferDirection(sideRaw: string, outcomeRaw: string): 'up' | 'down' | null {
  const side = sideRaw.toUpperCase()
  const outcome = outcomeRaw.toUpperCase()
  if (side !== 'BUY' && side !== 'SELL') return null

  const isNo = outcome === 'NO'
  const isSell = side === 'SELL'
  if (isNo) return isSell ? 'up' : 'down'
  return isSell ? 'down' : 'up'
}

function hoursBetween(fromIso: string, toIso: string): number {
  return Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3_600_000)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function receipt(sourceId: string, capturedAt: string, rawRef?: string): FactTrace {
  return {
    source: 'polymarket',
    sourceId,
    capturedAt,
    ...(rawRef ? { rawRef } : {}),
  }
}

function tradePrice(trade: PolymarketWalletTradeSeed): number | null {
  return normalizePrice(trade.price ?? trade.marketOddsAtTrade)
}

function formatCents(price: number): string {
  return `${Math.round(price * 100)}c`
}

function averageEntry(trades: PolymarketWalletTradeSeed[]): number | null {
  let totalAmount = 0
  let weightedPrice = 0
  for (const trade of trades) {
    const price = tradePrice(trade)
    if (price == null) continue
    totalAmount += trade.amountUsd
    weightedPrice += trade.amountUsd * price
  }
  return totalAmount === 0 ? null : weightedPrice / totalAmount
}

function buildTradeFact(trade: PolymarketWalletTradeSeed, index: number, slug: string): PacketFact {
  const price = tradePrice(trade)
  const priceText = price == null ? 'unknown odds' : formatCents(price)
  return {
    id: `fact:polymarket:wallet-trade:${trade.id}`,
    normalizedFactIds: [`normalized:polymarket:wallet-trade:${trade.id}`],
    claim: `${trade.wallet} ${trade.side.toLowerCase()} ${round(trade.amountUsd, 2)} USDC of ${trade.outcome} at ${priceText}`,
    factType: 'wallet.trade',
    observedAt: trade.observedAt,
    values: {
      wallet: trade.wallet,
      marketSlug: slug,
      outcome: trade.outcome,
      side: trade.side,
      amountUsd: trade.amountUsd,
      tradeIndex: index + 1,
      price,
    },
    receipt: receipt(trade.id, trade.capturedAt, trade.rawRef ?? `legacy-signal:${trade.id}`),
    confidence: 0.95,
  }
}

function oddsFact(
  slug: string,
  first: PolymarketOddsSnapshotSeed,
  latest: PolymarketOddsSnapshotSeed
): PacketFact {
  const oddsDelta = latest.price - first.price
  return {
    id: `fact:polymarket:odds:${first.id}:${latest.id}`,
    normalizedFactIds: [
      `normalized:polymarket:odds:${first.id}`,
      `normalized:polymarket:odds:${latest.id}`,
    ],
    claim: `${slug} moved from ${formatCents(first.price)} to ${formatCents(latest.price)}`,
    factType: 'odds.snapshot',
    observedAt: latest.observedAt,
    values: {
      marketSlug: slug,
      fromPrice: first.price,
      toPrice: latest.price,
      oddsDelta: round(oddsDelta),
    },
    receipt: receipt(latest.id, latest.capturedAt, latest.rawRef ?? `odds:${latest.id}`),
    confidence: 0.9,
  }
}

function currentMarketFact(slug: string, latest: PolymarketOddsSnapshotSeed): PacketFact {
  return {
    id: `fact:polymarket:market-current:${latest.id}`,
    normalizedFactIds: [`normalized:polymarket:market-current:${latest.id}`],
    claim: `${slug} current YES price is ${formatCents(latest.price)}`,
    factType: 'market.snapshot',
    observedAt: latest.observedAt,
    values: {
      marketSlug: slug,
      yesPrice: latest.price,
      volumeUsd: latest.volumeUsd ?? null,
      liquidityUsd: latest.liquidityUsd ?? null,
    },
    receipt: receipt(latest.id, latest.capturedAt, latest.rawRef ?? `odds:${latest.id}`),
    confidence: 0.9,
  }
}

function oddsForSlug(
  oddsSnapshots: PolymarketOddsSnapshotSeed[],
  slug: string,
  asOf?: string
): PolymarketOddsSnapshotSeed[] {
  return oddsSnapshots
    .filter((snapshot) => snapshot.slug === slug)
    .filter((snapshot) => !asOf || snapshot.observedAt <= asOf)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))
}

function groupTrades(trades: PolymarketWalletTradeSeed[]): TradeGroup[] {
  const groups = new Map<string, TradeGroup>()
  for (const trade of trades) {
    const wallet = trade.wallet.trim()
    const storyMarket = (trade.marketId ?? trade.slug)?.trim()
    const resolvedSlug = trade.slug?.trim() ?? null
    const slug = resolvedSlug ?? storyMarket
    const outcome = trade.outcome.trim()
    const direction = inferDirection(trade.side, outcome)
    if (!wallet || !storyMarket || !slug || !outcome || !direction) continue

    const storyKey = buildWalletRepeatStoryKey({
      wallet,
      marketId: storyMarket,
      slug,
      outcome,
      direction,
    })
    const existing = groups.get(storyKey)
    if (existing) {
      existing.trades.push(trade)
      continue
    }
    groups.set(storyKey, {
      storyKey,
      wallet,
      market: slug,
      marketTitle: trade.marketTitle ?? slug,
      slug,
      hasResolvedSlug: resolvedSlug != null,
      outcome,
      direction,
      trades: [trade],
    })
  }
  return [...groups.values()]
    .map((group) => ({ ...group, trades: group.trades.sort((a, b) => a.observedAt.localeCompare(b.observedAt)) }))
    .filter((group) => group.trades.length >= 2)
}

function buildPacket(
  group: TradeGroup,
  oddsSnapshots: PolymarketOddsSnapshotSeed[],
  options: WalletRepeatResearchOptions
): ResearchPacket {
  const now = options.now
  const trades = group.trades
  const firstTrade = trades[0]
  const latestTrade = trades[trades.length - 1]
  const totalExposure = trades.reduce((sum, trade) => sum + trade.amountUsd, 0)
  const avgEntry = averageEntry(trades)
  const odds = oddsForSlug(oddsSnapshots, group.slug, now)
  const firstOdds = odds[0]
  const latestOdds = odds[odds.length - 1]
  const oddsDelta = firstOdds && latestOdds ? latestOdds.price - firstOdds.price : null
  const timeGapHours = hoursBetween(firstTrade.observedAt, latestTrade.observedAt)
  const freshness = clamp01(1 - hoursBetween(latestTrade.observedAt, now) / 24)
  const materialityScore = clamp01(
    Math.log10(Math.max(totalExposure, 1)) / 5 * 0.45 +
    (oddsDelta == null ? 0 : Math.min(Math.abs(oddsDelta), 0.25) / 0.25) * 0.35 +
    Math.min(trades.length / 4, 1) * 0.2
  )
  const facts = trades.map((trade, index) => buildTradeFact(trade, index, group.slug))
  if (firstOdds && latestOdds) {
    facts.push(oddsFact(group.slug, firstOdds, latestOdds))
    facts.push(currentMarketFact(group.slug, latestOdds))
  }

  const avgEntryText = avgEntry == null ? 'unknown average entry' : `${formatCents(avgEntry)} average entry`
  const oddsMoveText = oddsDelta == null
    ? 'without confirmed odds context yet'
    : `while YES moved ${round(oddsDelta * 100, 1)} points`
  const threadId = options.existingThreadByStoryKey?.[group.storyKey]

  return {
    schemaVersion: FEED_V3_SCHEMA_VERSION,
    id: `packet:${group.storyKey}`,
    storyCandidateId: `candidate:${group.storyKey}`,
    storyKey: group.storyKey,
    ...(threadId ? { threadId } : {}),
    segment: 'Smart Money',
    archetype: 'wallet_repeat_action',
    status: threadId ? 'update' : 'new',
    headlineClaim: `${group.wallet} doubled down on ${group.outcome}`,
    thesis: `The same wallet made ${trades.length} same-side trades on ${group.outcome}, building ${round(totalExposure, 2)} USDC exposure at ${avgEntryText}.`,
    whyNow: `The latest trade arrived ${round(hoursBetween(latestTrade.observedAt, now), 2)} hours ago ${oddsMoveText}.`,
    whatChanged: `Exposure increased from ${round(firstTrade.amountUsd, 2)} USDC to ${round(totalExposure, 2)} USDC over ${round(timeGapHours, 2)} hours.`,
    entities: [
      { type: 'wallet', id: group.wallet, canonicalName: group.wallet },
      { type: 'market', id: group.market, canonicalName: group.marketTitle },
      { type: 'outcome', id: group.outcome, canonicalName: group.outcome },
      { type: 'source', id: 'polymarket', canonicalName: 'Polymarket' },
    ],
    facts,
    counterEvidence: [],
    materiality: {
      score: round(materialityScore, 2),
      reasons: [
        'repeat wallet action',
        `${round(totalExposure, 2)} USDC total exposure`,
        ...(oddsDelta == null ? [] : [`${round(oddsDelta * 100, 1)} point odds move during sequence`]),
      ],
    },
    freshness: round(freshness, 2),
    confidence: round(clamp01(0.45 + facts.length * 0.08 + (oddsDelta == null ? 0 : 0.15)), 2),
    uncertainty: [
      'Polymarket activity API may not represent the wallet full position inventory.',
      ...(!group.hasResolvedSlug ? ['Resolved Polymarket slug is missing.'] : []),
      ...(oddsDelta == null ? ['Current market or odds context is missing.'] : []),
    ],
    recommendedActions: group.hasResolvedSlug ? [{ type: 'predict', slug: group.slug }] : [],
    successCriteria: [oddsMoveCriterion(group.direction, 0.03, 24)],
    editorialConstraints: ['Do not imply motive, coordination, or insider knowledge.'],
    createdAt: now,
  }
}

export function legacyWhaleBetToWalletTradeSeed(raw: LegacyWhaleBetSignal): PolymarketWalletTradeSeed | null {
  const wallet = normalizeText(raw.metadata?.user)
  const slug = normalizeText(raw.slug) ?? normalizeText(raw.metadata?.slug)
  const marketId = normalizeText(raw.metadata?.marketId)
  const outcome = normalizeText(raw.metadata?.outcome)
  const side = normalizeText(raw.metadata?.side)
  const amountUsd = numberOrNull(raw.metadata?.amount)
  const observedAt = normalizeText(raw.metadata?.activityTimestamp) ?? raw.created_at
  if (!wallet || !outcome || !side || amountUsd == null || amountUsd <= 0) return null

  return {
    id: raw.id,
    wallet,
    slug,
    marketId,
    marketTitle: normalizeText(raw.topic),
    outcome,
    side,
    amountUsd,
    price: normalizePrice(raw.metadata?.tradePrice),
    marketOddsAtTrade: normalizePrice(raw.metadata?.marketOddsAtBet),
    observedAt,
    capturedAt: raw.created_at,
    rawRef: `legacy-signal:${raw.id}`,
  }
}

export function buildWalletRepeatResearchPackets(
  trades: PolymarketWalletTradeSeed[],
  oddsSnapshots: PolymarketOddsSnapshotSeed[],
  options: WalletRepeatResearchOptions
): WalletRepeatResearchResult[] {
  const noisyMarketSlugs = new Set(options.noisyMarketSlugs ?? [])
  const staleAfterHours = options.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS
  return groupTrades(trades).map((group) => {
    const latestTrade = group.trades[group.trades.length - 1]
    const packetNow = options.asOfMode === 'latest_trade' ? latestTrade.observedAt : options.now
    const packetOptions = { ...options, now: packetNow }
    const packet = buildPacket(group, oddsSnapshots, packetOptions)
    const decision = decideWalletRepeatPacket(packet, {
      now: packetNow,
      existingThreadId: options.existingThreadByStoryKey?.[group.storyKey],
      materialChangeAfter: options.coveredThroughByStoryKey?.[group.storyKey],
      unresolvedMarket: !group.hasResolvedSlug,
      noisy: noisyMarketSlugs.has(group.slug),
      stale: hoursBetween(latestTrade.observedAt, packetNow) > staleAfterHours,
      materialityThresholds: options.materialityThresholds,
    })
    return { packet, decision }
  })
}

export function buildWalletRepeatResearchPacketsFromLegacy(
  rawSignals: LegacyWhaleBetSignal[],
  oddsSnapshots: PolymarketOddsSnapshotSeed[],
  options: WalletRepeatResearchOptions
): WalletRepeatResearchResult[] {
  return buildWalletRepeatResearchPackets(
    rawSignals.map(legacyWhaleBetToWalletTradeSeed).filter((trade): trade is PolymarketWalletTradeSeed => trade != null),
    oddsSnapshots,
    options
  )
}
