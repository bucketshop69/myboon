import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeCandle,
  normalizeFundingPoint,
  normalizeMarketSnapshot,
  normalizeMetaAndAssetContexts,
  selectTopMarketsBy24hNotionalVolume,
} from './normalization'

const observedAt = '2026-06-26T12:00:00.000Z'
const observedMs = Date.parse(observedAt)
const hourMs = 3_600_000
const baseMs = observedMs - 50 * hourMs

function rawCandle(index: number, close: number, volume = 10): Record<string, unknown> {
  const start = baseMs + index * hourMs
  return {
    t: start,
    T: start + hourMs - 1,
    s: 'ETH',
    i: '1h',
    o: String(close - 1),
    c: String(close),
    h: String(close + 1),
    l: String(close - 2),
    v: String(volume),
    n: 100 + index,
  }
}

test('selectTopMarketsBy24hNotionalVolume ranks dynamically from dayNtlVlm', () => {
  const parsed = normalizeMetaAndAssetContexts([
    {
      universe: [
        { name: 'BTC' },
        { name: 'ETH' },
        { name: 'SOL' },
        { name: 'DOGE' },
      ],
    },
    [
      { dayNtlVlm: '10', markPx: '1' },
      { dayNtlVlm: '1000', markPx: '1' },
      { dayNtlVlm: '500', markPx: '1' },
      { dayNtlVlm: '750', markPx: '1' },
    ],
  ])

  const selected = selectTopMarketsBy24hNotionalVolume(parsed, 3)

  assert.deepEqual(selected.map((item) => item.symbol), ['ETH', 'DOGE', 'SOL'])
  assert.deepEqual(selected.map((item) => item.rank), [1, 2, 3])
})

test('normalizeMarketSnapshot computes candle price, clean volume, and funding history metrics', () => {
  const rawCandles = Array.from({ length: 50 }, (_, index) => rawCandle(index, 100, 20))
  rawCandles[48] = rawCandle(48, 100, 50)
  rawCandles[49] = rawCandle(49, 115, 200)
  rawCandles[45] = rawCandle(45, 100, 20)
  rawCandles[25] = rawCandle(25, 105, 20)

  const candles = rawCandles
    .map(normalizeCandle)
    .filter((candle): candle is NonNullable<typeof candle> => candle != null)
  const fundingHistory = [
    { coin: 'ETH', fundingRate: '0.0001', premium: '0.0002', time: observedMs - hourMs },
    { coin: 'ETH', fundingRate: '0.0002', premium: '0.0002', time: observedMs - 4 * hourMs },
    { coin: 'ETH', fundingRate: '0.0003', premium: '0.0002', time: observedMs - 24 * hourMs },
  ].map((point) => normalizeFundingPoint('ETH', point))
    .filter((point): point is NonNullable<typeof point> => point != null)

  const snapshot = normalizeMarketSnapshot({
    symbol: 'ETH',
    asset: { name: 'ETH' },
    context: {
      markPx: '115',
      midPx: '114.9',
      oraclePx: '115.1',
      prevDayPx: '105',
      premium: '-0.0005',
      funding: '-0.0001',
      dayNtlVlm: '1000000',
      dayBaseVlm: '9000',
    },
    rank: 1,
    observedAt,
    candles,
    fundingHistory,
  })

  assert.equal(snapshot.entityHint, 'Ethereum')
  assert.equal(snapshot.rankBy24hNotionalVolume, 1)
  assert.equal(snapshot.priceChange1hPct, 15)
  assert.equal(snapshot.priceChange4hPct, 15)
  assert.equal(snapshot.fundingRate1hAgo, 0.0001)
  assert.equal(snapshot.fundingChange1h, -0.0002)
  assert.equal(snapshot.fundingDirection, 'negative')
  assert.equal(snapshot.fundingFlipped1h, true)
  assert.equal(snapshot.rawPayload.fundingHistoryAvailable, true)
  assert.equal(snapshot.volume1h, 23_000)
  assert.equal(snapshot.volumeChange1hPct, 360)
})

test('normalizeMarketSnapshot ignores stale funding points for window comparisons', () => {
  const candles = Array.from({ length: 50 }, (_, index) => rawCandle(index, 100, 20))
    .map(normalizeCandle)
    .filter((candle): candle is NonNullable<typeof candle> => candle != null)
  const staleFundingHistory = [
    { coin: 'ETH', fundingRate: '-0.0001', premium: '0.0002', time: observedMs - 3 * hourMs },
  ].map((point) => normalizeFundingPoint('ETH', point))
    .filter((point): point is NonNullable<typeof point> => point != null)

  const snapshot = normalizeMarketSnapshot({
    symbol: 'ETH',
    asset: { name: 'ETH' },
    context: {
      markPx: '100',
      funding: '0.0001',
      dayNtlVlm: '1000000',
    },
    rank: 1,
    observedAt,
    candles,
    fundingHistory: staleFundingHistory,
  })

  assert.equal(snapshot.fundingRate1hAgo, null)
  assert.equal(snapshot.fundingChange1h, null)
  assert.equal(snapshot.fundingFlipped1h, false)
})
