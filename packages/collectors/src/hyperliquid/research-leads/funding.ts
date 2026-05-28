import { HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS } from '../research-lead-thresholds.js'
import {
  average,
  bps,
  DAY_MS,
  normalizePart,
  round,
} from './shared.js'
import type {
  BuildHyperliquidFundingResearchLeadsInput,
  FundingLeadThresholds,
  HyperliquidResearchLead,
  HyperliquidResearchLeadStatus,
} from './types.js'

function defaultFundingThresholds(): FundingLeadThresholds {
  const thresholds = HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.funding
  return {
    minSamples: thresholds.minSamples,
    researchAverageFundingBps: thresholds.researchAverageFundingBps,
    watchAverageFundingBps: thresholds.watchAverageFundingBps,
    researchTailFundingBps: thresholds.researchTailFundingBps,
    watchTailFundingBps: thresholds.watchTailFundingBps,
    researchSustainedSharePct: thresholds.researchSustainedSharePct,
    watchSustainedSharePct: thresholds.watchSustainedSharePct,
    researchFlipDeltaBps: thresholds.researchFlipDeltaBps,
    watchFlipDeltaBps: thresholds.watchFlipDeltaBps,
  }
}

function fundingQuestions(asset: string, avgFunding: number, firstHalfAvg: number, secondHalfAvg: number): string[] {
  const directionQuestion = avgFunding > 0
    ? `Are ${asset} longs crowded, and did price fail to reward that long positioning?`
    : avgFunding < 0
      ? `Are ${asset} shorts crowded, and is there squeeze risk if price stabilizes?`
      : `Is ${asset} funding changing from neutral into a directional crowding regime?`
  const flipQuestion = Math.sign(firstHalfAvg) !== Math.sign(secondHalfAvg)
    ? `Did ${asset} funding flip because positioning changed, or because price moved faster than perp demand?`
    : `Is ${asset} funding persistent enough to matter, or just normal perps noise?`

  return [
    directionQuestion,
    flipQuestion,
    'Did volume expand during the same window?',
    'Did open interest rise or fall while funding pressure built?',
    'Are watched wallets positioned with or against the crowded side?',
  ]
}

function fundingPriority(status: HyperliquidResearchLeadStatus, avgFundingBps: number, tailFundingBps: number, dominantSharePct: number, flipDeltaBps: number): number {
  if (status === 'ignore') return 1
  const statusBase = status === 'research' ? 5 : 3
  const avgBoost = Math.min(2, Math.abs(avgFundingBps))
  const tailBoost = Math.min(2, Math.abs(tailFundingBps) / 2)
  const shareBoost = dominantSharePct >= 85 ? 1.5 : dominantSharePct >= 65 ? 1 : dominantSharePct >= 50 ? 0.5 : 0
  const flipBoost = flipDeltaBps >= 0.75 ? 1.5 : flipDeltaBps >= 0.3 ? 1 : 0
  return round(Math.min(10, statusBase + avgBoost + tailBoost + shareBoost + flipBoost), 2)
}

function buildFundingLeadForWindow(
  input: BuildHyperliquidFundingResearchLeadsInput,
  nowMs: number,
  days: number,
  thresholds: FundingLeadThresholds
): HyperliquidResearchLead {
  const normalizedAsset = input.asset.trim().toUpperCase()
  const startMs = nowMs - days * DAY_MS
  const points = input.funding
    .filter((point) => point.time >= startMs && point.time <= nowMs && Number.isFinite(point.fundingRate))
    .sort((a, b) => a.time - b.time)
  const values = points.map((point) => point.fundingRate)
  const splitAt = Math.max(1, Math.floor(values.length / 2))
  const firstHalfAvg = average(values.slice(0, splitAt))
  const secondHalfValues = values.slice(splitAt)
  const secondHalfAvg = average(secondHalfValues.length > 0 ? secondHalfValues : values.slice(0, splitAt))
  const avgFunding = average(values)
  const maxFunding = values.length > 0 ? Math.max(...values) : 0
  const minFunding = values.length > 0 ? Math.min(...values) : 0
  const latestFunding = values.at(-1) ?? 0
  const positiveShare = values.length > 0 ? values.filter((value) => value > 0).length / values.length : 0
  const negativeShare = values.length > 0 ? values.filter((value) => value < 0).length / values.length : 0
  const dominantSharePct = round(Math.max(positiveShare, negativeShare) * 100, 1)
  const avgFundingBps = bps(avgFunding)
  const tailFundingBps = Math.max(Math.abs(bps(maxFunding)), Math.abs(bps(minFunding)))
  const flipDeltaBps = Math.abs(bps(secondHalfAvg - firstHalfAvg))
  const signChanged = Math.sign(firstHalfAvg) !== Math.sign(secondHalfAvg) && Math.sign(firstHalfAvg) !== 0 && Math.sign(secondHalfAvg) !== 0
  const enoughSamplesCheck = values.length >= thresholds.minSamples
  const researchAverageCheck = Math.abs(avgFundingBps) >= thresholds.researchAverageFundingBps
  const watchAverageCheck = Math.abs(avgFundingBps) >= thresholds.watchAverageFundingBps
  const researchTailCheck = tailFundingBps >= thresholds.researchTailFundingBps
  const watchTailCheck = tailFundingBps >= thresholds.watchTailFundingBps
  const researchSustainedCheck = dominantSharePct >= thresholds.researchSustainedSharePct
  const watchSustainedCheck = dominantSharePct >= thresholds.watchSustainedSharePct
  const researchFlipCheck = signChanged && flipDeltaBps >= thresholds.researchFlipDeltaBps
  const watchFlipCheck = signChanged && flipDeltaBps >= thresholds.watchFlipDeltaBps
  const researchPattern = (researchAverageCheck && researchTailCheck) || (researchSustainedCheck && researchTailCheck) || (researchFlipCheck && researchTailCheck)
  const watchPattern = watchAverageCheck || watchTailCheck || watchSustainedCheck || watchFlipCheck
  const status: HyperliquidResearchLeadStatus = enoughSamplesCheck && researchPattern
    ? 'research'
    : enoughSamplesCheck && watchPattern
      ? 'watch'
      : 'ignore'
  const direction = avgFunding > 0
    ? 'longs paying shorts'
    : avgFunding < 0
      ? 'shorts paying longs'
      : 'funding near flat'
  const headlinePrefix = status === 'research'
    ? `${normalizedAsset} funding pressure`
    : status === 'watch'
      ? `${normalizedAsset} funding watch`
      : `${normalizedAsset} funding quiet`
  const observedAt = points.at(-1) ? new Date(points.at(-1)!.time).toISOString() : input.now
  const storyKey = `hyperliquid:research-lead:funding-pressure:${normalizePart(normalizedAsset)}:${days}d`

  return {
    id: `${storyKey}:${observedAt}`,
    asset: normalizedAsset,
    lane: 'funding_pressure',
    status,
    priority: fundingPriority(status, avgFundingBps, tailFundingBps, dominantSharePct, flipDeltaBps),
    observedAt,
    storyKey,
    headline: `${headlinePrefix}: ${direction}, avg ${round(avgFundingBps, 3)} bps over ${days}d`,
    whatChanged: values.length > 0
      ? `${normalizedAsset} funding averaged ${round(avgFundingBps, 3)} bps over ${values.length} hourly samples. Latest funding was ${bps(latestFunding)} bps; the strongest tail was ${round(tailFundingBps, 3)} bps.`
      : `No usable funding samples were available for ${normalizedAsset} in the ${days}d window.`,
    whyInteresting: status === 'research'
      ? 'Funding pressure is a crowding signal. It can show when one side keeps paying to hold exposure, which may create reversal, squeeze, or unwind risk.'
      : status === 'watch'
        ? 'Funding is visible but not decisive yet. It can become useful if volume, OI, or wallet behavior confirms the same asset.'
        : 'This lane ran, but funding did not clear the minimum research or watch filters.',
    suggestedResearchQuestions: status === 'ignore' ? [] : fundingQuestions(normalizedAsset, avgFunding, firstHalfAvg, secondHalfAvg),
    metrics: {
      windowDays: days,
      samples: values.length,
      latestFundingBps: bps(latestFunding),
      averageFundingBps: round(avgFundingBps, 3),
      maxFundingBps: bps(maxFunding),
      minFundingBps: bps(minFunding),
      tailFundingBps: round(tailFundingBps, 3),
      positiveSampleSharePct: round(positiveShare * 100, 1),
      negativeSampleSharePct: round(negativeShare * 100, 1),
      firstHalfAverageBps: bps(firstHalfAvg),
      secondHalfAverageBps: bps(secondHalfAvg),
      flipDeltaBps: round(flipDeltaBps, 3),
      signChanged,
    },
    checks: [
      { name: 'enough hourly samples', passed: enoughSamplesCheck, value: String(values.length), threshold: `>= ${thresholds.minSamples}` },
      { name: 'research average funding', passed: researchAverageCheck, value: `${round(Math.abs(avgFundingBps), 3)} bps`, threshold: `>= ${thresholds.researchAverageFundingBps} bps` },
      { name: 'watch average funding', passed: watchAverageCheck, value: `${round(Math.abs(avgFundingBps), 3)} bps`, threshold: `>= ${thresholds.watchAverageFundingBps} bps` },
      { name: 'research tail funding', passed: researchTailCheck, value: `${round(tailFundingBps, 3)} bps`, threshold: `>= ${thresholds.researchTailFundingBps} bps` },
      { name: 'watch tail funding', passed: watchTailCheck, value: `${round(tailFundingBps, 3)} bps`, threshold: `>= ${thresholds.watchTailFundingBps} bps` },
      { name: 'research sustained side', passed: researchSustainedCheck, value: `${dominantSharePct}%`, threshold: `>= ${thresholds.researchSustainedSharePct}%` },
      { name: 'watch sustained side', passed: watchSustainedCheck, value: `${dominantSharePct}%`, threshold: `>= ${thresholds.watchSustainedSharePct}%` },
      { name: 'research funding flip', passed: researchFlipCheck, value: `${round(flipDeltaBps, 3)} bps`, threshold: `>= ${thresholds.researchFlipDeltaBps} bps and sign changed` },
      { name: 'watch funding flip', passed: watchFlipCheck, value: `${round(flipDeltaBps, 3)} bps`, threshold: `>= ${thresholds.watchFlipDeltaBps} bps and sign changed` },
    ],
    receipts: points.length > 0
      ? [{
        source: 'hyperliquid',
        sourceId: `${normalizedAsset}:fundingHistory:${points[0].time}-${points.at(-1)!.time}`,
        capturedAt: input.now,
        rawRef: 'fundingHistory',
      }]
      : [],
    uncertainty: [
      'Funding alone does not show whether positioning is opening or closing.',
      'A funding tail can be brief; OI and volume are needed to separate crowding from noise.',
      'Positive funding is not automatically bullish, and negative funding is not automatically bearish.',
    ],
    supportingLeadIds: [],
  }
}

export function buildHyperliquidFundingResearchLeads(input: BuildHyperliquidFundingResearchLeadsInput): HyperliquidResearchLead[] {
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs)) return []
  const windowsDays = input.windowsDays ?? [HYPERLIQUID_RESEARCH_LEAD_THRESHOLDS.funding.windowDays]
  const thresholds = input.thresholds ?? defaultFundingThresholds()

  return windowsDays
    .filter((days) => Number.isFinite(days) && days > 0)
    .map((days) => buildFundingLeadForWindow(input, nowMs, days, thresholds))
}
