/**
 * Server-side CLOB session management and order routing.
 *
 * Flow (Safe wallet — gasless via Builder Relayer):
 * 1. Phone derives EVM key from Solana wallet signature (Phantom MWA)
 * 2. Phone sends the raw Solana signature to POST /clob/auth
 * 3. Server derives EVM key → deploys Safe wallet (gasless) → runs approvals (gasless)
 *    → creates CLOB API credentials → stores session
 * 4. Phone places orders via POST /clob/order — server signs & submits with Builder attribution
 *
 * User funds live in the Safe wallet. The Builder Relayer pays all gas.
 * The EOA key is only used for signing — it never holds funds.
 */

import { Hono } from 'hono'
import { Wallet, utils, providers } from 'ethers'
import { ClobClient } from '@polymarket/clob-client'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client'
import { encodeFunctionData, maxUint256 } from 'viem'
import type { ApiKeyCreds } from '@polymarket/clob-client'

const CLOB_HOST = 'https://clob.polymarket.com'
const RELAYER_URL = 'https://relayer-v2.polymarket.com'
const CHAIN_ID = 137 // Polygon mainnet
const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const polygonProvider = new providers.JsonRpcProvider(POLYGON_RPC)

// Polymarket contract addresses (Polygon mainnet)
const CONTRACTS = {
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  CTF: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
} as const

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

const ERC1155_SET_APPROVAL_ABI = [
  {
    name: 'setApprovalForAll',
    type: 'function',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
] as const

// --- Builder config (from env) ---

function getBuilderConfig(): BuilderConfig | undefined {
  const key = process.env.POLYMARKET_BUILDER_API_KEY
  const secret = process.env.POLYMARKET_BUILDER_SECRET
  const passphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE

  if (!key || !secret || !passphrase) {
    console.warn('[clob] Builder keys not configured — orders will not have attribution')
    return undefined
  }

  return new BuilderConfig({
    localBuilderCreds: { key, secret, passphrase },
  })
}

const builderConfig = getBuilderConfig()

// --- Relayer API key auth (from env) ---

const RELAYER_API_KEY = process.env.RELAYER_API_KEY
const RELAYER_API_KEY_ADDRESS = process.env.RELAYER_API_KEY_ADDRESS

if (!RELAYER_API_KEY || !RELAYER_API_KEY_ADDRESS) {
  console.warn('[clob] RELAYER_API_KEY / RELAYER_API_KEY_ADDRESS not set — Safe deploy & approvals will fail')
}

// --- In-memory session store ---
// Key: safe address (lowercase), Value: { wallet, creds, safeAddress, createdAt }

interface ClobSession {
  wallet: Wallet
  creds: ApiKeyCreds
  safeAddress: string
  createdAt: number
}

const sessions = new Map<string, ClobSession>()

// Clean up sessions older than 24h
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

function cleanSessions() {
  const now = Date.now()
  for (const [addr, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(addr)
    }
  }
}

// Run cleanup every hour
setInterval(cleanSessions, 60 * 60 * 1000)

function getClient(session: ClobSession): ClobClient {
  return new ClobClient(
    CLOB_HOST,
    CHAIN_ID,
    session.wallet,
    session.creds,
    2, // SignatureType: GNOSIS_SAFE — funds are in the Safe, EOA just signs
    session.safeAddress,
    undefined, // geoBlockToken
    undefined, // useServerTime
    builderConfig,
  )
}

function getRelayClient(wallet: Wallet): RelayClient {
  // Create without BuilderConfig — we use RELAYER_API_KEY auth instead of Builder HMAC
  const relay = new RelayClient(
    RELAYER_URL,
    CHAIN_ID,
    wallet,
    undefined,
    RelayerTxType.SAFE,
  )

  // Monkey-patch httpClient to inject RELAYER_API_KEY headers on every request.
  // The SDK's sendAuthedRequest normally uses Builder HMAC headers (which return 401 from VPS).
  // The relayer also accepts RELAYER_API_KEY / RELAYER_API_KEY_ADDRESS headers as auth.
  if (RELAYER_API_KEY && RELAYER_API_KEY_ADDRESS) {
    const originalSend = relay.httpClient.send.bind(relay.httpClient)
    relay.httpClient.send = async (endpoint: string, method: string, options?: any) => {
      return originalSend(endpoint, method, {
        ...options,
        headers: {
          ...options?.headers,
          'RELAYER_API_KEY': RELAYER_API_KEY,
          'RELAYER_API_KEY_ADDRESS': RELAYER_API_KEY_ADDRESS,
        },
      })
    }
  }

  return relay
}

/**
 * Build the approval transactions needed for trading.
 * USDC.e approve for 3 exchange contracts +
 * CTF (ERC1155) setApprovalForAll for 3 exchange contracts.
 * All sent through the relayer in one batch — gasless.
 */
function buildApprovalTxs(): { to: string; data: string; value: string }[] {
  const spenders = [
    CONTRACTS.CTF_EXCHANGE,
    CONTRACTS.NEG_RISK_CTF_EXCHANGE,
    CONTRACTS.NEG_RISK_ADAPTER,
  ]

  const usdcApprovals = spenders.map((spender) => ({
    to: CONTRACTS.USDC_E,
    data: encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [spender as `0x${string}`, maxUint256],
    }),
    value: '0',
  }))

  const ctfApprovals = spenders.map((spender) => ({
    to: CONTRACTS.CTF,
    data: encodeFunctionData({
      abi: ERC1155_SET_APPROVAL_ABI,
      functionName: 'setApprovalForAll',
      args: [spender as `0x${string}`, true],
    }),
    value: '0',
  }))

  return [...usdcApprovals, ...ctfApprovals]
}

// --- Routes ---

export const clobRoutes = new Hono()

/**
 * POST /clob/auth
 * Body: { signature: string } — hex-encoded 64-byte Solana signature
 *
 * Server derives EVM key from signature, deploys a Safe wallet (gasless),
 * runs approvals (gasless), creates CLOB API credentials, returns the Safe address.
 */
clobRoutes.post('/auth', async (c) => {
  let body: { signature?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  const { signature } = body
  if (!signature || typeof signature !== 'string') {
    return c.json({ error: 'Missing signature' }, 400)
  }

  try {
    // 1. Derive EVM private key: keccak256(solana_signature)
    const sigBytes = Buffer.from(signature, 'hex')
    if (sigBytes.length !== 64) {
      return c.json({ error: 'Invalid signature length — expected 64 bytes' }, 400)
    }

    const evmPrivateKey = utils.keccak256(sigBytes)
    const wallet = new Wallet(evmPrivateKey, polygonProvider)
    const eoaAddress = wallet.address

    console.log(`[clob] EOA derived: ${eoaAddress}`)

    // 2. Deploy Safe wallet via Builder Relayer (gasless)
    const relay = getRelayClient(wallet)
    let safeAddress: string

    // Check if Safe is already deployed for this EOA (returning user)
    const relayPayload = await relay.getRelayPayload(eoaAddress, 'SAFE')
    const expectedSafe = relayPayload.address
    const alreadyDeployed = await relay.getDeployed(expectedSafe)

    if (alreadyDeployed) {
      safeAddress = expectedSafe
      console.log(`[clob] Safe already deployed: ${safeAddress}`)
    } else {
      console.log(`[clob] Deploying Safe for ${eoaAddress}...`)
      const deployResponse = await relay.deploy()
      const deployResult = await deployResponse.wait()
      if (!deployResult) {
        return c.json({ error: 'Safe deployment failed' }, 500)
      }
      safeAddress = deployResult.proxyAddress || expectedSafe
      console.log(`[clob] Safe deployed: ${safeAddress}`)

      // 3. Run all approvals in one batch (gasless)
      console.log(`[clob] Running approvals for ${safeAddress}...`)
      const approvalTxs = buildApprovalTxs()
      const approvalResponse = await relay.execute(approvalTxs, 'Approve USDC.e + CTF for trading')
      const approvalResult = await approvalResponse.wait()
      if (!approvalResult) {
        console.warn(`[clob] Approvals may have failed — trading might not work`)
      } else {
        console.log(`[clob] Approvals confirmed: ${approvalResult.transactionHash}`)
      }
    }

    // 4. Create CLOB API credentials (L1 auth — EIP-712 signature from EOA)
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet)
    const creds = await tempClient.createOrDeriveApiKey()

    // 5. Store session keyed by Safe address
    const session: ClobSession = {
      wallet,
      creds,
      safeAddress: safeAddress.toLowerCase(),
      createdAt: Date.now(),
    }
    sessions.set(safeAddress.toLowerCase(), session)

    console.log(`[clob] Session created — EOA: ${eoaAddress}, Safe: ${safeAddress}`)

    // Refresh CLOB allowance cache
    try {
      const client = getClient(session)
      await client.updateBalanceAllowance({ asset_type: 'COLLATERAL' as any })
    } catch (err: any) {
      console.warn(`[clob] Allowance refresh failed (non-fatal): ${err.message}`)
    }

    return c.json({
      polygonAddress: safeAddress, // The Safe address — this is where funds live
      eoaAddress: eoaAddress,      // The signing key address — for debugging only
      ok: true,
    })
  } catch (err: any) {
    console.error('[clob] Auth failed:', err.message || err)
    return c.json({ error: 'CLOB auth failed', detail: err.message }, 500)
  }
})

/**
 * POST /clob/order
 * Body: { polygonAddress, tokenID, price, amount, side }
 *
 * polygonAddress is the Safe address (returned from /clob/auth).
 * Server signs the order with the user's EOA key and submits with Builder attribution.
 */
clobRoutes.post('/order', async (c) => {
  let body: {
    polygonAddress?: string
    tokenID?: string
    price?: number
    amount?: number  // Dollar amount — server converts to share size
    size?: number    // Legacy: share count (used if amount not provided)
    side?: 'BUY' | 'SELL'
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  const { polygonAddress, tokenID, price, amount, side } = body

  if (!polygonAddress || !tokenID || price == null || !side) {
    return c.json({ error: 'Missing required fields: polygonAddress, tokenID, price, side' }, 400)
  }

  if (price <= 0 || price >= 1) {
    return c.json({ error: 'Price must be between 0 and 1 (exclusive)' }, 400)
  }

  // Convert dollar amount to share size: shares = dollars / price
  const size = amount != null ? Math.floor((amount / price) * 100) / 100 : body.size
  if (!size || size <= 0) {
    return c.json({ error: 'Missing or invalid amount/size' }, 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  try {
    const client = getClient(session)

    // Build and sign the order (EOA signs, but funder=Safe)
    const signedOrder = await client.createOrder({
      tokenID,
      price,
      size,
      side: side === 'BUY' ? 0 : 1,
    })

    // Submit with Builder attribution
    const result = await client.postOrder(signedOrder)

    console.log(`[clob] Order placed for ${polygonAddress}: ${side} $${amount ?? size} @ ${price} (${size} shares)`)
    return c.json(result)
  } catch (err: any) {
    console.error('[clob] Order failed:', err.message || err)
    return c.json({ error: 'Order failed', detail: err.message }, 500)
  }
})

/**
 * GET /clob/positions/:polygonAddress
 * Returns open orders for the user. polygonAddress = Safe address.
 */
clobRoutes.get('/positions/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  const session = sessions.get(polygonAddress.toLowerCase())

  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  try {
    const client = getClient(session)
    const orders = await client.getOpenOrders()
    return c.json({ orders: orders ?? [] })
  } catch (err: any) {
    console.error('[clob] Positions fetch failed:', err.message || err)
    return c.json({ error: 'Failed to fetch positions', detail: err.message }, 500)
  }
})

/**
 * GET /clob/deposit/:polygonAddress
 * Fetches deposit addresses from Polymarket Bridge API.
 * polygonAddress should be the Safe address — that's where funds need to land.
 */
clobRoutes.get('/deposit/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')

  try {
    const res = await fetch('https://bridge.polymarket.com/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: polygonAddress }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[clob] Bridge API error ${res.status}: ${text}`)
      return c.json({ error: 'Bridge API error', detail: text }, 502)
    }

    const addresses = await res.json()
    console.log(`[clob] Deposit addresses fetched for ${polygonAddress}`)
    return c.json(addresses)
  } catch (err: any) {
    console.error('[clob] Deposit fetch failed:', err.message || err)
    return c.json({ error: 'Failed to fetch deposit addresses', detail: err.message }, 500)
  }
})

/**
 * GET /clob/balance/:polygonAddress
 * Returns USDC balance + allowance from the CLOB.
 * polygonAddress = Safe address.
 */
clobRoutes.get('/balance/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  const session = sessions.get(polygonAddress.toLowerCase())

  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  try {
    const client = getClient(session)
    const result = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' as any })
    const rawBalance = parseFloat(result.balance) || 0
    const rawAllowance = parseFloat(result.allowance) || 0
    // CLOB may return micro-units (6 decimals) or human-readable — normalize
    const balance = rawBalance > 1_000_000 ? rawBalance / 1e6 : rawBalance
    const allowance = rawAllowance > 1_000_000 ? rawAllowance / 1e6 : rawAllowance

    console.log(`[clob] Balance for ${polygonAddress}: raw=${result.balance} → ${balance} USDC`)
    return c.json({
      balance,
      allowance,
      raw: result,
    })
  } catch (err: any) {
    console.error('[clob] Balance fetch failed:', err.message || err)
    return c.json({ error: 'Failed to fetch balance', detail: err.message }, 500)
  }
})

/**
 * DELETE /clob/session/:polygonAddress
 * Clears the in-memory session.
 */
clobRoutes.delete('/session/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  sessions.delete(polygonAddress.toLowerCase())
  return c.json({ ok: true })
})
