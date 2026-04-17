/**
 * Server-side CLOB session management and order routing.
 *
 * Flow (gasless via Builder Relayer + Safe wallet):
 * 1. Phone derives EVM key from Solana wallet signature (Phantom MWA)
 * 2. Phone sends the raw Solana signature to POST /clob/auth
 * 3. Server derives EVM key → deploys Safe (gasless) → runs approvals (gasless)
 *    → creates CLOB API credentials (SignatureType 2 / GNOSIS_SAFE)
 * 4. Phone places orders via POST /clob/order — server signs & submits via builder
 *
 * All on-chain operations are gasless — the Builder Relayer pays gas.
 * User funds live in the Safe wallet. EOA is the signer only.
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

const ERC20_APPROVE_ABI = [{
  name: 'approve', type: 'function',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}] as const

const ERC1155_SET_APPROVAL_ABI = [{
  name: 'setApprovalForAll', type: 'function',
  inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
  outputs: [],
}] as const

// --- Builder Config (from env) ---

const builderKey = process.env.POLYMARKET_BUILDER_API_KEY
const builderSecret = process.env.POLYMARKET_BUILDER_SECRET
const builderPassphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE

if (!builderKey || !builderSecret || !builderPassphrase) {
  console.warn('[clob] POLYMARKET_BUILDER_* env vars not set — gasless auth will fail')
}

const builderConfig = (builderKey && builderSecret && builderPassphrase)
  ? new BuilderConfig({
      localBuilderCreds: { key: builderKey, secret: builderSecret, passphrase: builderPassphrase },
    })
  : undefined

// --- Approval helpers ---

function buildApprovalTxs() {
  const spenders = [CONTRACTS.CTF_EXCHANGE, CONTRACTS.NEG_RISK_CTF_EXCHANGE, CONTRACTS.NEG_RISK_ADAPTER]

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

// --- In-memory session store ---

interface ClobSession {
  wallet: Wallet
  creds: ApiKeyCreds
  eoaAddress: string
  safeAddress: string
  createdAt: number
}

const sessions = new Map<string, ClobSession>()

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

function cleanSessions() {
  const now = Date.now()
  for (const [addr, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(addr)
    }
  }
}

setInterval(cleanSessions, 60 * 60 * 1000)

function getClient(session: ClobSession): ClobClient {
  return new ClobClient(
    CLOB_HOST,
    CHAIN_ID,
    session.wallet,
    session.creds,
    2, // GNOSIS_SAFE — gasless via builder relayer
    session.safeAddress, // funder — where USDC lives
    undefined,
    undefined,
    builderConfig,
  )
}

// --- Routes ---

export const clobRoutes = new Hono()

/**
 * POST /clob/auth
 * Body: { signature: string } — hex-encoded 64-byte Solana signature
 *
 * Server derives EVM key → deploys Safe (gasless) → runs approvals (gasless)
 * → creates CLOB API credentials → returns EOA + Safe addresses.
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

  if (!builderConfig) {
    return c.json({ error: 'Builder not configured — set POLYMARKET_BUILDER_* env vars' }, 500)
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

    // 2. Create RelayClient (SAFE mode — gasless)
    const relay = new RelayClient(RELAYER_URL, CHAIN_ID, wallet, builderConfig, RelayerTxType.SAFE)

    // 3. Get expected Safe address
    const relayPayload = await relay.getRelayPayload(eoaAddress, 'SAFE')
    const safeAddress = relayPayload.address
    console.log(`[clob] Safe address: ${safeAddress}`)

    // 4. Deploy Safe if needed
    const deployed = await relay.getDeployed(safeAddress)
    if (!deployed) {
      console.log(`[clob] Deploying Safe for ${eoaAddress}...`)
      const deployRes = await relay.deploy()
      const deployResult = await deployRes.wait()
      if (deployResult) {
        console.log(`[clob] Safe deployed: tx=${deployResult.transactionHash}`)
      } else {
        console.warn(`[clob] Safe deploy may have failed — continuing anyway`)
      }
    } else {
      console.log(`[clob] Safe already deployed`)
    }

    // 5. Run approvals (gasless via builder relayer)
    console.log(`[clob] Running approvals...`)
    try {
      const approvalTxs = buildApprovalTxs()
      const approvalRes = await relay.execute(approvalTxs, `Approve USDC.e + CTF for ${eoaAddress}`)
      const approvalResult = await approvalRes.wait()
      if (approvalResult) {
        console.log(`[clob] Approvals confirmed: tx=${approvalResult.transactionHash}`)
      } else {
        console.warn(`[clob] Approvals may have failed`)
      }
    } catch (err: any) {
      // Approvals may already be set from a previous auth
      console.warn(`[clob] Approval error (may already be approved): ${err.message}`)
    }

    // 6. Create CLOB API credentials (L1 auth — EIP-712 signature from EOA)
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet)
    const creds = await tempClient.createOrDeriveApiKey()

    // 7. Store session
    const session: ClobSession = {
      wallet,
      creds,
      eoaAddress: eoaAddress.toLowerCase(),
      safeAddress: safeAddress.toLowerCase(),
      createdAt: Date.now(),
    }
    sessions.set(eoaAddress.toLowerCase(), session)

    console.log(`[clob] Session created — EOA: ${eoaAddress}, Safe: ${safeAddress}`)

    return c.json({
      polygonAddress: eoaAddress,
      safeAddress,
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
 * polygonAddress is the EOA address (returned from /clob/auth).
 * Server signs the order with the EOA key and submits via builder CLOB client.
 */
clobRoutes.post('/order', async (c) => {
  let body: {
    polygonAddress?: string
    tokenID?: string
    price?: number
    amount?: number
    size?: number
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

    const signedOrder = await client.createOrder({
      tokenID,
      price,
      size,
      side: side === 'BUY' ? 0 : 1,
    })

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
 * Uses the Safe address — that's where funds need to land.
 */
clobRoutes.get('/deposit/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  const session = sessions.get(polygonAddress.toLowerCase())

  // Use Safe address if session exists, otherwise fall back to provided address
  const depositAddress = session ? session.safeAddress : polygonAddress

  try {
    const res = await fetch('https://bridge.polymarket.com/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: depositAddress }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[clob] Bridge API error ${res.status}: ${text}`)
      return c.json({ error: 'Bridge API error', detail: text }, 502)
    }

    const addresses = await res.json()
    console.log(`[clob] Deposit addresses fetched for Safe ${depositAddress}`)
    return c.json(addresses)
  } catch (err: any) {
    console.error('[clob] Deposit fetch failed:', err.message || err)
    return c.json({ error: 'Failed to fetch deposit addresses', detail: err.message }, 500)
  }
})

/**
 * GET /clob/balance/:polygonAddress
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
    const balance = rawBalance > 1_000_000 ? rawBalance / 1e6 : rawBalance
    const allowance = rawAllowance > 1_000_000 ? rawAllowance / 1e6 : rawAllowance

    console.log(`[clob] Balance for ${polygonAddress} (Safe: ${session.safeAddress}): ${balance} USDC`)
    return c.json({ balance, allowance, raw: result })
  } catch (err: any) {
    console.error('[clob] Balance fetch failed:', err.message || err)
    return c.json({ error: 'Failed to fetch balance', detail: err.message }, 500)
  }
})

// ============================================================================
// Read-only CLOB proxy — no auth needed, bypasses geo-restriction
// ============================================================================

clobRoutes.get('/book', async (c) => {
  const tokenId = c.req.query('token_id')
  if (!tokenId) return c.json({ error: 'Missing token_id query param' }, 400)
  try {
    const res = await fetch(`${CLOB_HOST}/book?token_id=${encodeURIComponent(tokenId)}`)
    const data = await res.json()
    return c.json(data, res.ok ? 200 : res.status)
  } catch (err: any) {
    return c.json({ error: 'CLOB book proxy failed', detail: err.message }, 502)
  }
})

clobRoutes.get('/midpoint', async (c) => {
  const tokenId = c.req.query('token_id')
  if (!tokenId) return c.json({ error: 'Missing token_id query param' }, 400)
  try {
    const res = await fetch(`${CLOB_HOST}/midpoint?token_id=${encodeURIComponent(tokenId)}`)
    const data = await res.json()
    return c.json(data, res.ok ? 200 : res.status)
  } catch (err: any) {
    return c.json({ error: 'CLOB midpoint proxy failed', detail: err.message }, 502)
  }
})

clobRoutes.get('/last-trade-price', async (c) => {
  const tokenId = c.req.query('token_id')
  if (!tokenId) return c.json({ error: 'Missing token_id query param' }, 400)
  try {
    const res = await fetch(`${CLOB_HOST}/last-trade-price?token_id=${encodeURIComponent(tokenId)}`)
    const data = await res.json()
    return c.json(data, res.ok ? 200 : res.status)
  } catch (err: any) {
    return c.json({ error: 'CLOB last-trade-price proxy failed', detail: err.message }, 502)
  }
})

clobRoutes.get('/markets/:conditionId', async (c) => {
  const conditionId = c.req.param('conditionId')
  try {
    const res = await fetch(`${CLOB_HOST}/markets/${encodeURIComponent(conditionId)}`)
    const data = await res.json()
    return c.json(data, res.ok ? 200 : res.status)
  } catch (err: any) {
    return c.json({ error: 'CLOB market info proxy failed', detail: err.message }, 502)
  }
})

// ============================================================================

clobRoutes.delete('/session/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  sessions.delete(polygonAddress.toLowerCase())
  return c.json({ ok: true })
})
