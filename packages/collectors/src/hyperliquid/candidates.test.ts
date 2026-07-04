import assert from 'node:assert/strict'
import test from 'node:test'
import { detectCandidates, type CandidateDetectionOptions } from './candidates'
import type { HyperliquidMarketSnapshot } from './types'

const options: CandidateDetectionOptions = {
  observedAt: '2026-06-26T12:00:00.000Z',
  priceChange1hThresholdPct: 5,
  priceChange4hThresholdPct: 7,
  extremeFundingRateThreshold: 0.0005,
  fundingMoveThreshold: 0.00005,
  priceFundingMovePriceThresholdPct: 3,
  volumeSpikeThresholdPct: 100,
  weightedCandidateThreshold: 55,
  candidateDedupeHours: 4,
}

function snapshot(overrides: Partial<HyperliquidMarketSnapshot> = {}): HyperliquidMarketSnapshot {
  return {
    venue: 'hyperliquid',
    symbol: 'ETH',
    baseAsset: 'ETH',
    entityHint: 'Ethereum',
    marketType: 'perp',
    observedAt: options.observedAt,
    venueTimestamp: null,
    rankBy24hNotionalVolume: 1,
    markPrice: 100,
    midPrice: 100,
    oraclePrice: 100,
    prevDayPrice: 100,
    premium: 0,
    dayNotionalVolume: 1_000_000,
    dayBaseVolume: 10_000,
    volume1h: 10_000,
    volume4h: 40_000,
    volume24h: 200_000,
    volumeChange1hPct: null,
    volumeChange4hPct: null,
    volumeChange24hPct: null,
    priceChange1hPct: null,
    priceChange4hPct: null,
    priceChange24hPct: null,
    fundingRateCurrent: 0.00001,
    fundingRate1hAgo: 0.00001,
    fundingRate4hAgo: 0.00001,
    fundingRate24hAgo: 0.00001,
    fundingChange1h: 0,
    fundingChange4h: 0,
    fundingChange24h: 0,
    fundingDirection: 'positive',
    fundingFlipped1h: false,
    fundingFlipped4h: false,
    fundingFlipped24h: false,
    rawPayload: {
      metaAsset: {},
      assetContext: {},
      candles: [],
      fundingHistory: [],
      fundingHistoryAvailable: true,
      fundingHistoryLimitation: null,
    },
    ...overrides,
  }
}

test('detectCandidates creates one weighted candidate for a strong 4h price move', () => {
  const candidates = detectCandidates(snapshot({
    priceChange1hPct: -5.5,
    priceChange4hPct: 7.2,
  }), options)

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].triggerType, 'weighted_market_signal')
  assert.ok(candidates[0].score >= 55)
  assert.match(candidates[0].triggerReason, /4h price moved/)
})

test('detectCandidates weights funding flip, extreme funding, and combined move into one candidate', () => {
  const candidates = detectCandidates(snapshot({
    priceChange1hPct: 3.5,
    fundingRateCurrent: -0.0006,
    fundingRate1hAgo: 0.0001,
    fundingChange1h: -0.0007,
    fundingDirection: 'negative',
    fundingFlipped1h: true,
  }), options)

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].triggerType, 'weighted_market_signal')
  assert.match(candidates[0].triggerReason, /funding flipped/)
  assert.match(candidates[0].triggerReason, /price and funding moved together/)
})

test('detectCandidates does not create a candidate from volume alone', () => {
  const candidates = detectCandidates(snapshot({
    volumeChange1hPct: 1_000,
  }), options)

  assert.equal(candidates.length, 0)
})

test('detectCandidates uses volume as confirmation when there is a primary signal', () => {
  const candidates = detectCandidates(snapshot({
    priceChange4hPct: 6,
    fundingChange4h: 0.00005,
    volumeChange4hPct: 300,
  }), options)

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].triggerType, 'weighted_market_signal')
  assert.equal(
    (candidates[0].metricsSnapshot.candidateQuality as { volumeIsConfirmingOnly: boolean }).volumeIsConfirmingOnly,
    true
  )
})
