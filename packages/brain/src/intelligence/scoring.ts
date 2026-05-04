import { INTELLIGENCE_SCORING_VERSION, type ScoreBreakdown } from './contracts.js'

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export interface PolymarketOddsShiftInput {
  oddsDelta: number
  hoursSinceObserved: number
  liquidityUsd?: number
  sourceReliability?: number
  currentPrice?: number
}

export function scorePolymarketOddsShift(input: PolymarketOddsShiftInput): ScoreBreakdown {
  const absDelta = Math.abs(input.oddsDelta)
  const liquidityScore = input.liquidityUsd == null ? 0.5 : clamp01(Math.log10(Math.max(input.liquidityUsd, 1)) / 6)
  const freshness = clamp01(1 - input.hoursSinceObserved / 24)
  const sourceReliability = clamp01(input.sourceReliability ?? 0.8)
  const signalWeight = clamp01(absDelta / 0.2)
  const directionRoom = input.currentPrice == null
    ? 1
    : input.oddsDelta >= 0
      ? clamp01((1 - input.currentPrice) / 0.5)
      : clamp01(input.currentPrice / 0.5)

  return {
    confidence: clamp01((signalWeight * 0.5 + liquidityScore * 0.25 + sourceReliability * 0.25) * directionRoom),
    urgency: clamp01(signalWeight * 0.7 + freshness * 0.3),
    freshness,
    sourceReliability,
    signalWeight,
    dedupePriority: clamp01(signalWeight * 0.6 + freshness * 0.4),
  }
}

export interface PolymarketWhaleBetInput {
  amountUsd: number
  hoursSinceObserved: number
  tradePrice?: number | null
  marketOddsAtBet?: number | null
  outcome?: string | null
  walletTotalBets?: number | null
  walletWinRate?: number | null
  sourceReliability?: number
}

export type PolymarketWhaleBetArchetype = 'penny_pickup' | 'lottery' | 'contrarian' | 'conviction' | 'noise'

export interface PolymarketWhaleBetClassification {
  archetype: PolymarketWhaleBetArchetype
  betProbability: number | null
  riskUsd: number | null
  reason: string
  publishableAsConviction: boolean
}

function normalizeProbability(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

function probabilityForOutcome(input: Pick<PolymarketWhaleBetInput, 'tradePrice' | 'marketOddsAtBet' | 'outcome'>): number | null {
  const tradePrice = normalizeProbability(input.tradePrice)
  if (tradePrice != null) return tradePrice

  const yesOdds = normalizeProbability(input.marketOddsAtBet)
  if (yesOdds == null) return null
  return input.outcome?.toUpperCase() === 'NO' ? 1 - yesOdds : yesOdds
}

export function classifyPolymarketWhaleBet(input: PolymarketWhaleBetInput): PolymarketWhaleBetClassification {
  const betProbability = probabilityForOutcome(input)
  const riskUsd = betProbability == null ? null : input.amountUsd * Math.min(betProbability, 1 - betProbability)

  if (input.amountUsd < 500) {
    return { archetype: 'noise', betProbability, riskUsd, reason: 'below whale-tracking amount threshold', publishableAsConviction: false }
  }
  if (betProbability == null) {
    return { archetype: 'noise', betProbability, riskUsd, reason: 'missing odds at bet time; cannot risk-adjust', publishableAsConviction: false }
  }
  if (betProbability >= 0.95) {
    return { archetype: 'penny_pickup', betProbability, riskUsd, reason: 'bet is with 95%+ consensus; not directional whale alpha', publishableAsConviction: false }
  }
  if (betProbability <= 0.05) {
    return { archetype: 'lottery', betProbability, riskUsd, reason: 'tiny-probability longshot; classify separately from normal conviction', publishableAsConviction: true }
  }
  if (betProbability < 0.30) {
    return { archetype: 'contrarian', betProbability, riskUsd, reason: 'bet is against broad market consensus', publishableAsConviction: true }
  }
  if (riskUsd != null && riskUsd >= 1_000) {
    return { archetype: 'conviction', betProbability, riskUsd, reason: 'meaningful risk at non-consensus odds', publishableAsConviction: true }
  }
  return { archetype: 'noise', betProbability, riskUsd, reason: 'risk-adjusted exposure too small', publishableAsConviction: false }
}

export function scorePolymarketWhaleBet(input: PolymarketWhaleBetInput): ScoreBreakdown {
  const classification = classifyPolymarketWhaleBet(input)
  const amountScore = clamp01(Math.log10(Math.max(input.amountUsd, 1)) / 5) // $100k ~= 1.0
  const riskAdjustedScore = classification.riskUsd == null
    ? amountScore * 0.5
    : clamp01(Math.log10(Math.max(classification.riskUsd, 1)) / 5)
  const oddsQuality = classification.archetype === 'penny_pickup'
    ? 0.1
    : classification.archetype === 'lottery'
      ? 0.65
      : classification.archetype === 'contrarian'
        ? 0.55
        : classification.archetype === 'conviction'
          ? 1
          : 0.25
  const probabilityQuality = classification.betProbability == null
    ? 0.25
    : classification.betProbability >= 0.2 && classification.betProbability <= 0.8
      ? 1
      : classification.betProbability >= 0.1 && classification.betProbability <= 0.9
        ? 0.55
        : 0.15
  const experienceScore = input.walletTotalBets == null ? 0.4 : clamp01(Math.log10(Math.max(input.walletTotalBets, 1)) / 4)
  const winRateScore = input.walletWinRate == null ? 0.5 : clamp01(input.walletWinRate)
  const freshness = clamp01(1 - input.hoursSinceObserved / 24)
  const sourceReliability = clamp01(input.sourceReliability ?? 0.75)
  const signalWeight = clamp01(riskAdjustedScore * 0.45 + oddsQuality * 0.25 + probabilityQuality * 0.3)

  return {
    confidence: clamp01(signalWeight * 0.55 + experienceScore * 0.15 + winRateScore * 0.1 + sourceReliability * 0.2),
    urgency: clamp01(signalWeight * 0.65 + freshness * 0.35),
    freshness,
    sourceReliability,
    signalWeight,
    dedupePriority: clamp01(signalWeight * 0.7 + freshness * 0.3),
  }
}

export function scoringVersion(): typeof INTELLIGENCE_SCORING_VERSION {
  return INTELLIGENCE_SCORING_VERSION
}
