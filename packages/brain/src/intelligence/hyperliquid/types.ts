import type { PublishedOutput } from '../../publisher-types.js'

export type HyperliquidPositionSide = 'long' | 'short'
export type HyperliquidFindingType = 'opened' | 'added' | 'reduced' | 'closed' | 'flipped'
export type HyperliquidEditorDecisionKind = 'publish' | 'update' | 'hold' | 'ignore'

export interface HyperliquidWatchlistEntry {
  wallet: string
  label: string
  reason: string
  minPositionUsd?: number | null
  active: boolean
}

export interface HyperliquidPositionSnapshot {
  id?: string
  wallet: string
  asset: string
  side: HyperliquidPositionSide
  size: number
  notionalUsd: number
  entryPrice: number | null
  markPrice: number | null
  leverage: number | null
  unrealizedPnlUsd: number | null
  marginUsedUsd: number | null
  observedAt: string
  raw: unknown
}

export interface HyperliquidMarketSnapshot {
  asset: string
  markPrice: number | null
  midPrice: number | null
  oraclePrice: number | null
  fundingRate: number | null
  openInterestUsd: number | null
  volume24hUsd: number | null
  previousDayPrice: number | null
  observedAt: string
  raw: unknown
}

export interface HyperliquidPositionChangeFinding {
  id: string
  type: HyperliquidFindingType
  wallet: string
  walletLabel: string
  watchReason: string
  asset: string
  before: HyperliquidPositionSnapshot | null
  after: HyperliquidPositionSnapshot | null
  market: HyperliquidMarketSnapshot | null
  notionalDeltaUsd: number
  notionalDeltaPct: number | null
  observedAt: string
  dedupeKey: string
  storyKey: string
  receiptIds: string[]
  reason: string
}

export interface HyperliquidResearchBrief {
  id: string
  type: 'wallet_position_change'
  asset: string
  wallet: string
  walletLabel: string
  finding: HyperliquidFindingType
  before: {
    side: HyperliquidPositionSide | null
    notionalUsd: number
    entryPrice: number | null
    unrealizedPnlUsd: number | null
  }
  after: {
    side: HyperliquidPositionSide | null
    notionalUsd: number
    entryPrice: number | null
    unrealizedPnlUsd: number | null
  }
  marketContext: {
    fundingRate: number | null
    openInterestUsd: number | null
    markPrice: number | null
    volume24hUsd: number | null
  }
  timeWindow: string
  receipts: Array<{
    source: 'hyperliquid'
    sourceId: string
    capturedAt: string
    rawRef: string
  }>
  whyItMayMatter: string
  uncertainty: string[]
  suggestedAngle: string
  dedupeKey: string
  storyKey: string
  priorityHint: number
  createdAt: string
}

export interface HyperliquidMechanicalGateResult {
  passed: boolean
  reasons: string[]
}

export interface HyperliquidEditorDecision {
  decision: HyperliquidEditorDecisionKind
  priority: number
  reason: string
  surface: 'feed_card' | 'thread' | 'none'
}

export interface HyperliquidPublishedRow {
  narrative_id: string
  content_small: string
  content_full: string
  reasoning: string
  tags: string[]
  priority: number
  actions: PublishedOutput['actions']
  content_type: PublishedOutput['content_type']
  thread_id: string | null
  packet_id: string
  story_key: string
  story_candidate_id: string
  evidence_refs: HyperliquidResearchBrief['receipts']
}

export interface HyperliquidPipelineResult {
  watchlistCount: number
  snapshotsSaved: number
  findings: number
  briefs: number
  decisions: Record<HyperliquidEditorDecisionKind, number>
  published: Array<{
    narrativeId: string
    storyKey: string
    contentSmall: string
  }>
  held: Array<{
    briefId: string
    storyKey: string
    decision: HyperliquidEditorDecisionKind
    reason: string
  }>
}
