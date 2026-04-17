/**
 * Test: Gasless Builder flow end-to-end
 *
 * 1. Deploy Safe wallet (if needed)
 * 2. Run approvals via Builder RelayClient (gasless)
 * 3. Derive CLOB API creds (L1 auth)
 * 4. Check balance via CLOB (SignatureType 2 = GNOSIS_SAFE)
 * 5. (Optional) Place a tiny test order
 *
 * Usage:
 *   cd packages/api
 *   npx tsx src/test-builder-gasless.ts
 *
 * Required env (in .env):
 *   POLYMARKET_BUILDER_API_KEY
 *   POLYMARKET_BUILDER_SECRET
 *   POLYMARKET_BUILDER_PASSPHRASE
 *
 * Optional:
 *   TEST_EVM_PRIVATE_KEY — reuse a specific wallet (otherwise random)
 *   POLYGON_RPC_URL — default: https://polygon-rpc.com
 *   PLACE_TEST_ORDER=1 — actually place a tiny GTC order (will likely not fill)
 */

import 'dotenv/config'
import { Wallet, providers } from 'ethers'
import { ClobClient, Side, OrderType } from '@polymarket/clob-client'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client'
import { encodeFunctionData, maxUint256 } from 'viem'

// --- Config ---

const RELAYER_URL = 'https://relayer-v2.polymarket.com'
const CLOB_HOST = 'https://clob.polymarket.com'
const CHAIN_ID = 137
const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'

const CONTRACTS = {
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  CTF: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
} as const

const ERC20_APPROVE_ABI = [{
  name: 'approve', type: 'function',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}] as const

const ERC1155_APPROVE_ABI = [{
  name: 'setApprovalForAll', type: 'function',
  inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
  outputs: [],
}] as const

// --- Helpers ---

function buildApprovalTxs() {
  const spenders = [CONTRACTS.CTF_EXCHANGE, CONTRACTS.NEG_RISK_CTF_EXCHANGE, CONTRACTS.NEG_RISK_ADAPTER]

  const usdc = spenders.map(s => ({
    to: CONTRACTS.USDC_E,
    data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [s as `0x${string}`, maxUint256] }),
    value: '0',
  }))

  const ctf = spenders.map(s => ({
    to: CONTRACTS.CTF,
    data: encodeFunctionData({ abi: ERC1155_APPROVE_ABI, functionName: 'setApprovalForAll', args: [s as `0x${string}`, true] }),
    value: '0',
  }))

  return [...usdc, ...ctf]
}

function log(step: string, msg: string) {
  console.log(`\n[${step}] ${msg}`)
}

// --- Main ---

async function main() {
  // 0. Validate env
  const builderKey = process.env.POLYMARKET_BUILDER_API_KEY
  const builderSecret = process.env.POLYMARKET_BUILDER_SECRET
  const builderPassphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE

  if (!builderKey || !builderSecret || !builderPassphrase) {
    console.error('Missing POLYMARKET_BUILDER_* env vars — check .env')
    process.exit(1)
  }

  const builderConfig = new BuilderConfig({
    localBuilderCreds: { key: builderKey, secret: builderSecret, passphrase: builderPassphrase },
  })

  // 1. Setup wallet
  const provider = new providers.JsonRpcProvider(POLYGON_RPC)
  const pk = process.env.TEST_EVM_PRIVATE_KEY
  const wallet = pk ? new Wallet(pk, provider) : Wallet.createRandom().connect(provider)

  log('SETUP', `EOA: ${wallet.address}`)
  if (!pk) log('SETUP', `Random wallet — set TEST_EVM_PRIVATE_KEY=${wallet.privateKey} to reuse`)

  // 2. Create RelayClient (SAFE mode = gasless)
  const relay = new RelayClient(RELAYER_URL, CHAIN_ID, wallet, builderConfig, RelayerTxType.SAFE)

  // 3. Get expected Safe address
  log('SAFE', 'Getting relay payload...')
  const payload = await relay.getRelayPayload(wallet.address, 'SAFE')
  const safeAddress = payload.address
  log('SAFE', `Expected Safe: ${safeAddress}`)

  // 4. Deploy Safe if needed
  const deployed = await relay.getDeployed(safeAddress)
  if (deployed) {
    log('SAFE', 'Already deployed ✓')
  } else {
    log('SAFE', 'Deploying...')
    const deployRes = await relay.deploy()
    log('SAFE', `Deploy txID: ${deployRes.transactionID}`)
    const result = await deployRes.wait()
    if (result) {
      log('SAFE', `Deployed! tx=${result.transactionHash}, safe=${result.proxyAddress}`)
    } else {
      console.error('Safe deploy failed')
      process.exit(1)
    }
  }

  // 5. Approvals (gasless via relayer)
  log('APPROVALS', `Submitting ${buildApprovalTxs().length} approval txs...`)
  try {
    const approvalRes = await relay.execute(buildApprovalTxs(), 'USDC.e + CTF approvals for trading')
    log('APPROVALS', `txID: ${approvalRes.transactionID}`)
    const approvalResult = await approvalRes.wait()
    if (approvalResult) {
      log('APPROVALS', `Confirmed! tx=${approvalResult.transactionHash}`)
    } else {
      log('APPROVALS', 'May have failed — check on-chain')
    }
  } catch (err: any) {
    log('APPROVALS', `Error: ${err.message} (may already be approved)`)
  }

  // 6. CLOB auth (L1 → derive API creds)
  log('CLOB', 'Deriving API credentials...')
  const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet)
  const creds = await tempClient.createOrDeriveApiKey()
  log('CLOB', `API key: ${creds.key?.slice(0, 12)}...`)

  // 7. Create trading client (SignatureType 2 = GNOSIS_SAFE, funder = Safe address)
  const client = new ClobClient(
    CLOB_HOST,
    CHAIN_ID,
    wallet,
    creds,
    2, // GNOSIS_SAFE
    safeAddress, // funder — where funds live
    undefined,
    undefined,
    builderConfig,
  )

  // 8. Check balance
  log('BALANCE', 'Fetching...')
  try {
    const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' as any })
    log('BALANCE', `Balance: ${bal.balance} | Allowance: ${bal.allowance}`)
  } catch (err: any) {
    log('BALANCE', `Error: ${err.message}`)
  }

  // 9. Optional: place test order
  if (process.env.PLACE_TEST_ORDER === '1') {
    log('ORDER', 'Placing test order...')
    try {
      // Fetch a real market to get tokenID + tick_size
      const markets = await fetch(`${CLOB_HOST}/markets?next_cursor=MA==`).then(r => r.json())
      const market = markets.data?.[0]
      if (!market) throw new Error('No markets found')

      const tokenId = market.tokens?.[0]?.token_id
      const tickSize = String(market.minimum_tick_size || '0.01')
      const negRisk = market.neg_risk ?? false

      log('ORDER', `Market: ${market.question?.slice(0, 60)}...`)
      log('ORDER', `Token: ${tokenId?.slice(0, 20)}... | tick=${tickSize} | negRisk=${negRisk}`)

      const order = await client.createAndPostOrder(
        { tokenID: tokenId, price: 0.01, size: 1, side: Side.BUY },
        { tickSize, negRisk },
        OrderType.GTC,
      )
      log('ORDER', `Result: orderID=${order.orderID} status=${order.status}`)
    } catch (err: any) {
      log('ORDER', `Error: ${err.message}`)
    }
  }

  // Summary
  console.log('\n========== SUMMARY ==========')
  console.log(`EOA (signer):    ${wallet.address}`)
  console.log(`Safe (funder):   ${safeAddress}`)
  console.log(`Sig type:        2 (GNOSIS_SAFE)`)
  console.log(`Builder key:     ${builderKey.slice(0, 12)}...`)
  console.log(`CLOB API key:    ${creds.key?.slice(0, 12)}...`)
  console.log('=============================')
  console.log('\nTo deposit: bridge USDC to Safe address via bridge.polymarket.com')
}

main().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
