import type { HyperliquidCandle, HyperliquidFill, HyperliquidFundingPoint } from '../client.js'
import type { HyperliquidPositionSnapshot } from '../types.js'
import type { HyperliquidWalletQualityProfile } from '../wallet-profile.js'

export type HyperliquidResearchLeadLane =
  | 'volume_spike'
  | 'funding_pressure'
  | 'price_momentum'
  | 'oi_expansion'
  | 'price_oi_divergence'
  | 'watchlist_wallet'
  | 'cross_signal'

export type HyperliquidResearchLeadStatus = 'research' | 'watch' | 'ignore'

export interface HyperliquidResearchLeadCheck {
  name: string
  passed: boolean
  value: string
  threshold: string
}

export interface HyperliquidResearchLeadReceipt {
  source: 'hyperliquid' | 'the_graph_token_api' | 'internal'
  sourceId: string
  capturedAt: string
  rawRef?: string
}

export interface HyperliquidResearchLead {
  id: string
  asset: string
  lane: HyperliquidResearchLeadLane
  status: HyperliquidResearchLeadStatus
  priority: number
  observedAt: string
  storyKey: string
  headline: string
  whatChanged: string
  whyInteresting: string
  suggestedResearchQuestions: string[]
  metrics: Record<string, number | string | boolean | null>
  checks: HyperliquidResearchLeadCheck[]
  receipts: HyperliquidResearchLeadReceipt[]
  uncertainty: string[]
  supportingLeadIds: string[]
}

export interface HyperliquidResearchLeadArtifact {
  kind: 'hyperliquid.research-leads'
  generatedAt: string
  assets: string[]
  windows: number[]
  leads: HyperliquidResearchLead[]
  laneSummaries: Record<HyperliquidResearchLeadLane, {
    research: number
    watch: number
    ignore: number
  }>
}

export interface VolumeLeadThresholds {
  minBaselineDays: number
  minRecentVolumeUsd: number
  researchSpikeMultiple7d: number
  researchSpikeMultiple30d: number
  watchSpikeMultiple7d: number
  watchSpikeMultiple30d: number
  minAbsPriceMovePct: number
}

export interface BuildHyperliquidVolumeResearchLeadsInput {
  asset: string
  candles: HyperliquidCandle[]
  now: string
  windowsDays?: number[]
  thresholds?: VolumeLeadThresholds
}

export interface FundingLeadThresholds {
  minSamples: number
  researchAverageFundingBps: number
  watchAverageFundingBps: number
  researchTailFundingBps: number
  watchTailFundingBps: number
  researchSustainedSharePct: number
  watchSustainedSharePct: number
  researchFlipDeltaBps: number
  watchFlipDeltaBps: number
}

export interface BuildHyperliquidFundingResearchLeadsInput {
  asset: string
  funding: HyperliquidFundingPoint[]
  now: string
  windowsDays?: number[]
  thresholds?: FundingLeadThresholds
}

export interface PriceMomentumLeadThresholds {
  minBaselineCandles: number
  minRecentVolumeUsd: number
  researchMovePct1d: number
  watchMovePct1d: number
  researchMovePct7d: number
  watchMovePct7d: number
  researchMovePct30d: number
  watchMovePct30d: number
}

export interface BuildHyperliquidPriceMomentumResearchLeadsInput {
  asset: string
  candles: HyperliquidCandle[]
  now: string
  windowsDays?: number[]
  thresholds?: PriceMomentumLeadThresholds
}

export interface WalletBehaviorLeadThresholds {
  minWalletConfidence: number
  researchNotionalChangeUsd: number
  watchNotionalChangeUsd: number
  researchPositionNotionalUsd: number
  watchPositionNotionalUsd: number
  researchChangePct: number
  watchChangePct: number
}

export interface BuildHyperliquidWalletBehaviorResearchLeadsInput {
  wallet: string
  profile: HyperliquidWalletQualityProfile
  fills: HyperliquidFill[]
  currentPositions: HyperliquidPositionSnapshot[]
  now: string
  lookbackDays: number
  maxLeads?: number
  thresholds?: WalletBehaviorLeadThresholds
}
