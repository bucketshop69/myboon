export const HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS = {
  volume: {
    windowsDays: [7, 30],
    minBaselineDays: 4,
    minRecentVolumeUsd: 100_000,
    researchSpikeMultiple7d: 1.5,
    researchSpikeMultiple30d: 2,
    watchSpikeMultiple7d: 1,
    watchSpikeMultiple30d: 1.125,
    minAbsPriceMovePct: 2.25,
    staleAfterHours: 27,
  },

  funding: {
    windowDays: 7,
    minSamples: 18,
    researchAverageFundingBps: 0.1875,
    watchAverageFundingBps: 0.14,
    researchTailFundingBps: 0.45,
    watchTailFundingBps: 0.3375,
    researchSustainedSharePct: 48.75,
    watchSustainedSharePct: 36.5,
    researchFlipDeltaBps: 0.3,
    watchFlipDeltaBps: 0.225,
    staleAfterHours: 4.5,
  },

  priceMomentum: {
    windowsDays: [1, 7, 30],
    minBaselineCandles: 4,
    minRecentVolumeUsd: 100_000,
    researchMovePct1d: 7,
    watchMovePct1d: 3,
    researchMovePct7d: 15,
    watchMovePct7d: 8,
    researchMovePct30d: 25,
    watchMovePct30d: 12,
    staleAfterHours: 27,
  },

  openInterest: {
    windowHours: 24,
    minSamples: 9,
    minOpenInterestUsd: 7_500_000,
    researchOiDeltaPct: 11.25,
    watchOiDeltaPct: 6,
    researchOiDeltaUsd: 3_750_000,
    watchOiDeltaUsd: 1_500_000,
    staleAfterHours: 4.5,
  },

  priceOiDivergence: {
    windowHours: 24,
    minSamples: 9,
    minOpenInterestUsd: 7_500_000,
    researchPriceMovePct: 3.75,
    watchPriceMovePct: 2.25,
    researchOiMovePct: 9,
    watchOiMovePct: 5.25,
    staleAfterHours: 4.5,
  },

  wallet: {
    minWalletConfidence: 0.45,
    researchNotionalChangeUsd: 375_000,
    watchNotionalChangeUsd: 75_000,
    researchPositionNotionalUsd: 750_000,
    watchPositionNotionalUsd: 187_500,
    researchChangePct: 37.5,
    watchChangePct: 18.75,
    repeatActionWindowHours: 54,
    staleAfterHours: 9,
  },

  walletProfile: {
    lookbackDays: 14,
    minFillsForProfile: 8,
    minCurrentExposureUsd: 100_000,
    largeDepositUsd: 500_000,
    smallFillUsd: 10_000,
    maxAssetsTradedForDirectional: 8,
    maxFillsPerDayForDirectional: 200,
    maxVolumeToEquityRatioForDirectional: 25,
    minDirectionalConcentrationPct: 50,
    maxRoundTripSharePct: 70,
    maxSmallFillSharePct: 80,
    maxMakerFillSharePct: 70,
    hedgedNetExposureMaxPct: 35,
  },

  crossSignal: {
    researchMinLanes: 2,
    watchMinLanes: 1,
    researchMinCombinedPriority: 10.5,
    watchMinCombinedPriority: 5.25,
    sameAssetWindowHours: 18,
    requireDirectionAgreementForResearch: false,
  },

  global: {
    maxResearchLeadsPerRun: 20,
    maxWatchLeadsPerRun: 30,
    suppressDuplicateWithinHours: 9,
    minExplainabilityChecksPassed: 2,
  },
} as const

export type HyperliquidResearchLeadThresholds = typeof HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS
