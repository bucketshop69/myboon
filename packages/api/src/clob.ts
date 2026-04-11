/**
 * Server-side CLOB session management and order routing.
 *
 * Flow:
 * 1. Phone derives EVM key from Solana wallet signature (Phantom MWA)
 * 2. Phone sends the raw Solana signature to POST /clob/auth
 * 3. Server derives the same EVM key, calls createOrDeriveApiKey(), stores session
 * 4. Phone places orders via POST /clob/order — server signs & submits with Builder attribution
 */

import { Hono } from 'hono'
import { Wallet, utils } from 'ethers'
import { ClobClient } from '@polymarket/clob-client'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'
import type { ApiKeyCreds } from '@polymarket/clob-client'

const CLOB_HOST = 'https://clob.polymarket.com'
const CHAIN_ID = 137 // Polygon mainnet
const DERIVE_MESSAGE = 'myboon:polymarket:enable'

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

// --- In-memory session store ---
// Key: polygon address (lowercase), Value: { wallet, creds, createdAt }

interface ClobSession {
  wallet: Wallet
  creds: ApiKeyCreds
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
    0, // SignatureType: EOA
    session.wallet.address,
    undefined, // geoBlockToken
    undefined, // useServerTime
    builderConfig,
  )
}

// --- Routes ---

export const clobRoutes = new Hono()

/**
 * POST /clob/auth
 * Body: { signature: string } — hex-encoded 64-byte Solana signature
 *
 * Server derives EVM key from signature, creates CLOB API credentials,
 * returns the polygon address to the phone.
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
    // Decode hex signature to bytes
    const sigBytes = Buffer.from(signature, 'hex')
    if (sigBytes.length !== 64) {
      return c.json({ error: 'Invalid signature length — expected 64 bytes' }, 400)
    }

    // Derive EVM private key: keccak256(signature)
    const evmPrivateKey = utils.keccak256(sigBytes)
    const wallet = new Wallet(evmPrivateKey)
    const polygonAddress = wallet.address.toLowerCase()

    console.log(`[clob] Deriving session for ${polygonAddress}`)

    // Create CLOB API credentials
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet)
    const creds = await tempClient.createOrDeriveApiKey()

    // Store session
    const session: ClobSession = { wallet, creds, createdAt: Date.now() }
    sessions.set(polygonAddress, session)

    console.log(`[clob] Session created for ${polygonAddress}`)

    // Set CLOB spending allowance (required for orders to fill)
    try {
      const client = getClient(session)
      await client.updateBalanceAllowance({ asset_type: 'COLLATERAL' as any })
      console.log(`[clob] Allowance set for ${polygonAddress}`)
    } catch (allowErr: any) {
      console.warn(`[clob] Allowance update failed (non-fatal): ${allowErr.message}`)
    }

    return c.json({
      polygonAddress: wallet.address,
      ok: true,
    })
  } catch (err: any) {
    console.error('[clob] Auth failed:', err.message || err)
    return c.json({ error: 'CLOB auth failed', detail: err.message }, 500)
  }
})

/**
 * POST /clob/order
 * Body: { polygonAddress, tokenID, price, size, side }
 *
 * Server signs the order with the user's derived EVM key and submits
 * with Builder attribution headers.
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

    // Build and sign the order
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
 * Returns open orders and positions for the user.
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
 * Returns { svm, evm, btc, tron, ... } — one address per chain.
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
 * Requires active session.
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
