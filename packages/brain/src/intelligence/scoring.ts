import { INTELLIGENCE_SCORING_VERSION, type ScoreBreakdown } from './contracts.js'

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export interface PolymarketOddsShiftInput {
  oddsDelta: number
  hoursSinceObserved: number
  liquidityUsd?: number
  sourceReliability?: number
}

export function scorePolymarketOddsShift(input: PolymarketOddsShiftInput): ScoreBreakdown {
  const absDelta = Math.abs(input.oddsDelta)
  const liquidityScore = input.liquidityUsd == null ? 0.5 : clamp01(Math.log10(Math.max(input.liquidityUsd, 1)) / 6)
  const freshness = clamp01(1 - input.hoursSinceObserved / 24)
  const sourceReliability = clamp01(input.sourceReliability ?? 0.8)
  const signalWeight = clamp01(absDelta / 0.2)

  return {
    confidence: clamp01(signalWeight * 0.5 + liquidityScore * 0.25 + sourceReliability * 0.25),
    urgency: clamp01(signalWeight * 0.7 + freshness * 0.3),
    freshness,
    sourceReliability,
    signalWeight,
    dedupePriority: clamp01(signalWeight * 0.6 + freshness * 0.4),
  }
}

export function scoringVersion(): typeof INTELLIGENCE_SCORING_VERSION {
  return INTELLIGENCE_SCORING_VERSION
}
