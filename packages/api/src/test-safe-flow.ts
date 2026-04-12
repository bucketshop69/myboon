/**
 * Test script: Safe wallet deployment + approvals via Builder Relayer
 *
 * This tests the new gasless flow end-to-end without needing the phone.
 * It uses a test private key (the same one derived from the Solana sig in the POC).
 *
 * Usage:
 *   cd packages/api
 *   npx tsx src/test-safe-flow.ts
 *
 * Required env vars (in .env):
 *   POLYMARKET_BUILDER_API_KEY
 *   POLYMARKET_BUILDER_SECRET
 *   POLYMARKET_BUILDER_PASSPHRASE
 *
 * Optional: TEST_EVM_PRIVATE_KEY — if not set, generates a random wallet
 */

import 'dotenv/config'
import { Wallet, providers } from 'ethers'
import { ClobClient } from '@polymarket/clob-client'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client'
import { encodeFunctionData, maxUint256 } from 'viem'

const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'

const CLOB_HOST = 'https://clob.polymarket.com'
const RELAYER_URL = 'https://relayer-v2.polymarket.com'
const CHAIN_ID = 137

const CONTRACTS = {
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  CTF: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
} as const

async function main() {
  // --- 1. Setup ---
  const builderKey = process.env.POLYMARKET_BUILDER_API_KEY
  const builderSecret = process.env.POLYMARKET_BUILDER_SECRET
  const builderPassphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE

  if (!builderKey || !builderSecret || !builderPassphrase) {
    console.error('Missing POLYMARKET_BUILDER_* env vars')
    process.exit(1)
  }

  const builderConfig = new BuilderConfig({
    localBuilderCreds: { key: builderKey, secret: builderSecret, passphrase: builderPassphrase },
  })

  // Use test key or generate random wallet — must connect to provider for RelayClient
  const provider = new providers.JsonRpcProvider(POLYGON_RPC)
  const privateKey = process.env.TEST_EVM_PRIVATE_KEY
  const wallet = privateKey
    ? new Wallet(privateKey, provider)
    : Wallet.createRandom().connect(provider)
  const eoaAddress = wallet.address

  console.log(`\n=== Safe Flow Test ===`)
  console.log(`EOA address: ${eoaAddress}`)
  if (!privateKey) {
    console.log(`(random wallet — set TEST_EVM_PRIVATE_KEY in .env to reuse)`)
    console.log(`Private key: ${wallet.privateKey}`)
  }

  // --- 2. Create RelayClient ---
  const relay = new RelayClient(
    RELAYER_URL,
    CHAIN_ID,
    wallet,
    builderConfig,
    RelayerTxType.SAFE,
  )

  // --- 3. Check / Deploy Safe ---
  console.log(`\n--- Step 1: Safe Wallet ---`)

  // getRelayPayload returns the expected Safe address + nonce
  const relayPayload = await relay.getRelayPayload(eoaAddress, 'SAFE')
  const expectedSafe = relayPayload.address
  console.log(`Expected Safe address: ${expectedSafe}`)

  const deployed = await relay.getDeployed(expectedSafe)
  console.log(`Already deployed: ${deployed}`)

  if (!deployed) {
    console.log(`Deploying Safe...`)
    const deployResponse = await relay.deploy()
    console.log(`Deploy submitted: txID=${deployResponse.transactionID}`)

    const deployResult = await deployResponse.wait()
    if (deployResult) {
      console.log(`Safe deployed! tx=${deployResult.transactionHash}`)
      console.log(`Safe address: ${deployResult.proxyAddress}`)
    } else {
      console.error(`Deploy failed or timed out`)
      process.exit(1)
    }
  }

  // --- 4. Run Approvals (gasless) ---
  console.log(`\n--- Step 2: Approvals (gasless via relayer) ---`)

  const spenders = [CONTRACTS.CTF_EXCHANGE, CONTRACTS.NEG_RISK_CTF_EXCHANGE, CONTRACTS.NEG_RISK_ADAPTER]

  const approvalTxs = [
    // USDC.e approvals
    ...spenders.map((spender) => ({
      to: CONTRACTS.USDC_E,
      data: encodeFunctionData({
        abi: [{
          name: 'approve',
          type: 'function',
          inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
          outputs: [{ type: 'bool' }],
        }] as const,
        functionName: 'approve',
        args: [spender as `0x${string}`, maxUint256],
      }),
      value: '0',
    })),
    // CTF (ERC1155) approvals
    ...spenders.map((spender) => ({
      to: CONTRACTS.CTF,
      data: encodeFunctionData({
        abi: [{
          name: 'setApprovalForAll',
          type: 'function',
          inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
          outputs: [],
        }] as const,
        functionName: 'setApprovalForAll',
        args: [spender as `0x${string}`, true],
      }),
      value: '0',
    })),
  ]

  console.log(`Submitting ${approvalTxs.length} approval transactions in one batch...`)

  try {
    const approvalResponse = await relay.execute(approvalTxs, 'Approve USDC.e + CTF for trading')
    console.log(`Approvals submitted: txID=${approvalResponse.transactionID}`)

    const approvalResult = await approvalResponse.wait()
    if (approvalResult) {
      console.log(`Approvals confirmed! tx=${approvalResult.transactionHash}`)
    } else {
      console.warn(`Approvals may have failed — check on-chain`)
    }
  } catch (err: any) {
    console.error(`Approval error: ${err.message}`)
    // If Safe was just deployed, approvals might already be fine from a previous run
  }

  // --- 5. Derive CLOB API credentials ---
  console.log(`\n--- Step 3: CLOB Auth ---`)

  const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet)
  const creds = await tempClient.createOrDeriveApiKey()
  console.log(`CLOB creds derived: apiKey=${creds.key?.slice(0, 8)}...`)

  // --- 6. Check balance with Safe as funder ---
  console.log(`\n--- Step 4: Balance Check (Safe as funder) ---`)

  const client = new ClobClient(
    CLOB_HOST,
    CHAIN_ID,
    wallet,
    creds,
    2, // GNOSIS_SAFE
    expectedSafe,
    undefined,
    undefined,
    builderConfig,
  )

  try {
    const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' as any })
    console.log(`Balance: ${bal.balance}`)
    console.log(`Allowance: ${bal.allowance}`)
  } catch (err: any) {
    console.error(`Balance check failed: ${err.message}`)
  }

  // --- Summary ---
  console.log(`\n=== Summary ===`)
  console.log(`EOA (signer):   ${eoaAddress}`)
  console.log(`Safe (funds):   ${expectedSafe}`)
  console.log(`Signature type: 2 (GNOSIS_SAFE)`)
  console.log(`\nTo deposit: call POST bridge.polymarket.com/deposit with address=${expectedSafe}`)
  console.log(`Then send USDC from Solana to the svm deposit address.`)
  console.log(`\nDone!`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
