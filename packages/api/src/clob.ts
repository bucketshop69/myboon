/**
 * Server-side CLOB session management and order routing.
 *
 * Flow (raw EOA — gasless approvals via Relayer API key):
 * 1. Phone derives EVM key from Solana wallet signature (Phantom MWA)
 * 2. Phone sends the raw Solana signature to POST /clob/auth
 * 3. Server derives EVM key → runs approvals via raw Relayer API (gasless)
 *    → creates CLOB API credentials → stores session
 * 4. Phone places orders via POST /clob/order — server signs & submits
 *
 * Approvals are gasless — the Relayer API pays gas via RELAYER_API_KEY auth.
 * No Safe wallet needed. The EOA holds funds and signs orders directly.
 */

import { Hono } from 'hono'
import { Wallet, utils, providers } from 'ethers'
import { ClobClient } from '@polymarket/clob-client'
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

// --- Relayer API key auth (from env) ---

const RELAYER_API_KEY = process.env.RELAYER_API_KEY
const RELAYER_API_KEY_ADDRESS = process.env.RELAYER_API_KEY_ADDRESS

if (!RELAYER_API_KEY || !RELAYER_API_KEY_ADDRESS) {
  console.warn('[clob] RELAYER_API_KEY / RELAYER_API_KEY_ADDRESS not set — gasless approvals will fail')
}

const relayerHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(RELAYER_API_KEY && { 'RELAYER_API_KEY': RELAYER_API_KEY }),
  ...(RELAYER_API_KEY_ADDRESS && { 'RELAYER_API_KEY_ADDRESS': RELAYER_API_KEY_ADDRESS }),
}

/**
 * Submit a single transaction to the Polymarket Relayer (gasless).
 * Uses RELAYER_API_KEY auth — relayer handles signing and pays gas.
 */
async function submitToRelayer(
  tx: { to: string; data: string; value: string },
  from: string,
  description: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(`${RELAYER_URL}/submit`, {
    method: 'POST',
    headers: relayerHeaders,
    body: JSON.stringify({ from, to: tx.to, data: tx.data, value: tx.value, description }),
  })
  const body = await res.text()
  console.log(`[clob] Relayer /submit ${res.status}: ${body.slice(0, 300)}`)
  return { ok: res.ok, status: res.status, body }
}

/**
 * Submit multiple transactions to the Relayer sequentially.
 */
async function executeViaRelayer(
  txns: { to: string; data: string; value: string }[],
  from: string,
  description: string,
): Promise<{ ok: boolean; failed: number }> {
  let failed = 0
  for (const tx of txns) {
    const result = await submitToRelayer(tx, from, description)
    if (!result.ok) failed++
  }
  return { ok: failed === 0, failed }
}

// --- In-memory session store ---
// Key: EOA address (lowercase), Value: { wallet, creds, createdAt }

interface ClobSession {
  wallet: Wallet
  creds: ApiKeyCreds
  eoaAddress: string
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
    0, // SignatureType: EOA — wallet signs directly, no Safe
  )
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
 * Server derives EVM key from signature, runs approvals via raw Relayer API (gasless),
 * creates CLOB API credentials, returns the EOA address.
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

    // 2. Run approvals via raw Relayer API (gasless)
    console.log(`[clob] Running approvals for ${eoaAddress}...`)
    const approvalTxs = buildApprovalTxs()
    const relayResult = await executeViaRelayer(approvalTxs, eoaAddress, `Approve USDC.e + CTF for ${eoaAddress}`)

    if (!relayResult.ok) {
      console.warn(`[clob] ${relayResult.failed}/${approvalTxs.length} approvals failed — trading might not work`)
    } else {
      console.log(`[clob] All ${approvalTxs.length} approvals submitted for ${eoaAddress}`)
    }

    // 3. Create CLOB API credentials (L1 auth — EIP-712 signature from EOA)
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet)
    const creds = await tempClient.createOrDeriveApiKey()

    // 4. Store session keyed by EOA address
    const session: ClobSession = {
      wallet,
      creds,
      eoaAddress: eoaAddress.toLowerCase(),
      createdAt: Date.now(),
    }
    sessions.set(eoaAddress.toLowerCase(), session)

    console.log(`[clob] Session created — EOA: ${eoaAddress}`)

    return c.json({
      polygonAddress: eoaAddress, // The EOA address — this is where funds live
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
 * Server signs the order with the EOA key and submits to the CLOB.
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

    // Build and sign the order (EOA signs directly)
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
 * Returns open orders for the user. polygonAddress = EOA address.
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
 * polygonAddress should be the EOA address — that's where funds need to land.
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
 * polygonAddress = EOA address.
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

// ============================================================================
// Read-only CLOB proxy — no auth needed, bypasses geo-restriction
// ============================================================================

/**
 * GET /clob/book?token_id=<id>
 * Proxy to CLOB order book endpoint.
 */
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

/**
 * GET /clob/midpoint?token_id=<id>
 * Proxy to CLOB midpoint endpoint.
 */
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

/**
 * GET /clob/last-trade-price?token_id=<id>
 * Proxy to CLOB last trade price endpoint.
 */
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

/**
 * GET /clob/markets/:conditionId
 * Proxy to CLOB market info endpoint.
 */
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

/**
 * DELETE /clob/session/:polygonAddress
 * Clears the in-memory session.
 */
clobRoutes.delete('/session/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  sessions.delete(polygonAddress.toLowerCase())
  return c.json({ ok: true })
})
