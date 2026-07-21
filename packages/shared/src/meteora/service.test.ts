import assert from 'node:assert/strict'
import { MeteoraDataApiClient } from './data-api.js'
import { MeteoraClientError } from './errors.js'
import { assertAtomicAmount, rangeForBinCount, strategyToSdkValue } from './validation.js'

const pool = {
  address: '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6',
  name: 'SOL-USDC',
  token_x: {
    address: 'So11111111111111111111111111111111111111112',
    name: 'Wrapped SOL',
    symbol: 'SOL',
    decimals: 9,
    is_verified: true,
  },
  token_y: {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    is_verified: true,
  },
  reserve_x: 'EYj9xKw6ZszwpyNibHY7JD5o3QgTVrSdcBp1fMJhrR9o',
  reserve_y: 'CoaxzEh8p5YyGLcj36Eo3cUThVJxeKCs7qvLAGDYwBcz',
  token_x_amount: 10.5,
  token_y_amount: 1000,
  created_at: 1711766862000,
  reward_mint_x: '11111111111111111111111111111111',
  reward_mint_y: '11111111111111111111111111111111',
  pool_config: {
    bin_step: 4,
    base_fee_pct: 0.04,
    max_fee_pct: 0,
    protocol_fee_pct: 5,
    collect_fee_mode: 0,
  },
  dynamic_fee_pct: 0.000012,
  tvl: 4481128.92894453,
  current_price: 76.33028516759326,
  apr: 0.29552987949358933,
  apy: 193.613261018708,
  has_farm: false,
  volume: { '24h': 35103340.46032323 },
  fees: { '24h': 13243.07492366214 },
  fee_tvl_ratio: { '24h': 0.29552987949358933 },
  is_blacklisted: false,
  tags: [],
}

async function testPoolNormalizationAndCache(): Promise<void> {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls += 1
    return new Response(
      JSON.stringify({
        total: 1,
        pages: 1,
        current_page: 1,
        page_size: 20,
        data: [pool],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const client = new MeteoraDataApiClient({ fetch: fetcher })
  const first = await client.listPools()
  const second = await client.listPools()

  assert.equal(calls, 1)
  assert.equal(first.data.items.length, 1)
  assert.equal(first.data.items[0]?.pair, 'SOL / USDC')
  assert.equal(first.data.items[0]?.tokenX.symbol, 'SOL')
  assert.equal(first.data.items[0]?.approvedByMeteora, true)
  assert.equal(first.data.items[0]?.volume24hUsd, '35103340.46032323')
  assert.equal(first.freshness.state, 'live')
  assert.equal(second.freshness.state, 'fresh')
}

async function testUnverifiedPoolsAreHidden(): Promise<void> {
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        total: 1,
        pages: 1,
        current_page: 1,
        page_size: 20,
        data: [{ ...pool, token_x: { ...pool.token_x, is_verified: false } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

  const client = new MeteoraDataApiClient({ fetch: fetcher })
  const result = await client.listPools()
  assert.equal(result.data.items.length, 0)
}

function testValidation(): void {
  assert.equal(assertAtomicAmount('0', 'amount'), '0')
  assert.equal(assertAtomicAmount('1000000', 'amount'), '1000000')
  assert.deepEqual(rangeForBinCount(100, 69), { minBinId: 66, maxBinId: 134 })
  assert.equal(strategyToSdkValue('spot'), 0)
  assert.equal(strategyToSdkValue('curve'), 1)
  assert.equal(strategyToSdkValue('bid_ask'), 2)

  assert.throws(
    () => assertAtomicAmount('1.2', 'amount'),
    (error) => error instanceof MeteoraClientError && error.code === 'AMOUNT_FORMAT_INVALID',
  )
}

await testPoolNormalizationAndCache()
await testUnverifiedPoolsAreHidden()
testValidation()

console.log('Meteora service tests passed')
