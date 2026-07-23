import assert from 'node:assert/strict'
import { SpotDataApiClient } from './data-api.js'
import { SpotClientError } from './errors.js'

const WALLET = '7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C'
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const rawBalances = {
  wallet: WALLET,
  totalValueUsd: 150.5,
  tokens: [
    {
      mint: MINT,
      symbol: 'USDC',
      name: 'USD Coin',
      icon: 'https://example.com/usdc.png',
      decimals: 6,
      amount: '100500000',
      uiAmount: 100.5,
      priceUsd: 1,
      valueUsd: 100.5,
    },
    {
      mint: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      name: 'Wrapped SOL',
      icon: null,
      decimals: 9,
      amount: '500000000',
      uiAmount: 0.5,
      priceUsd: 100,
      valueUsd: 50,
    },
  ],
}

async function testGetWalletBalancesNormalizesAndCaches(): Promise<void> {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls += 1
    return new Response(JSON.stringify(rawBalances), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = new SpotDataApiClient({ fetch: fetcher })
  const first = await client.getWalletBalances(WALLET)
  assert.equal(first.data.wallet, WALLET)
  assert.equal(first.data.totalValueUsd, 150.5)
  assert.equal(first.data.tokens.length, 2)
  assert.equal(first.data.tokens[0].symbol, 'USDC')
  assert.equal(first.data.tokens[0].valueUsd, 100.5)
  assert.equal(first.freshness.state, 'live')

  const second = await client.getWalletBalances(WALLET)
  assert.equal(second.freshness.state, 'fresh')
  assert.equal(calls, 1, 'second call should be served from cache, not refetched')
}

async function testGetMintBalanceReturnsSingleToken(): Promise<void> {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    assert.ok(url.includes(`/balances/${MINT}`))
    return new Response(JSON.stringify(rawBalances.tokens[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = new SpotDataApiClient({ fetch: fetcher })
  const result = await client.getMintBalance(WALLET, MINT)
  assert.ok(result.data)
  assert.equal(result.data?.mint, MINT)
  assert.equal(result.data?.valueUsd, 100.5)
}

async function testGetMintBalanceReturnsNullWhenNotHeld(): Promise<void> {
  const fetcher: typeof fetch = async () =>
    new Response(null, { status: 404 })

  const client = new SpotDataApiClient({ fetch: fetcher })
  const result = await client.getMintBalance(WALLET, MINT)
  assert.equal(result.data, null)
}

async function testInvalidWalletAddressRejected(): Promise<void> {
  const client = new SpotDataApiClient({ fetch: async () => new Response('{}') })
  await assert.rejects(
    () => client.getWalletBalances('not-a-wallet'),
    (error) => error instanceof SpotClientError && error.code === 'INVALID_ADDRESS',
  )
}

async function testRetriesOnRateLimitThenSucceeds(): Promise<void> {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls += 1
    if (calls === 1) return new Response('rate limited', { status: 429 })
    return new Response(JSON.stringify(rawBalances), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = new SpotDataApiClient({ fetch: fetcher })
  const result = await client.getWalletBalances(WALLET)
  assert.equal(calls, 2, 'client should retry once after a 429 before succeeding')
  assert.equal(result.data.wallet, WALLET)
  assert.equal(result.freshness.state, 'live')
}

async function testThrowsTypedErrorWithNoCacheToFallBackOn(): Promise<void> {
  const fetcher: typeof fetch = async () => new Response('boom', { status: 500 })
  const client = new SpotDataApiClient({ fetch: fetcher, maxRetries: 0 })

  await assert.rejects(
    () => client.getWalletBalances(WALLET),
    (error) => error instanceof SpotClientError && error.code === 'UPSTREAM_UNAVAILABLE',
  )
}

await testGetWalletBalancesNormalizesAndCaches()
await testGetMintBalanceReturnsSingleToken()
await testGetMintBalanceReturnsNullWhenNotHeld()
await testInvalidWalletAddressRejected()
await testRetriesOnRateLimitThenSucceeds()
await testThrowsTypedErrorWithNoCacheToFallBackOn()

console.log('Spot data client tests passed')
