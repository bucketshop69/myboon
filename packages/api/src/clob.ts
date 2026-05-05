/**
 * Server-side CLOB V2 session management and order routing.
 *
 * Flow (gasless via Builder Relayer + Safe wallet):
 * 1. Phone derives EVM key from Solana wallet signature (Phantom MWA)
 * 2. Phone sends the raw Solana signature to POST /clob/auth
 * 3. Server derives EVM key → deploys Safe (gasless) → runs approvals (gasless)
 *    → creates CLOB API credentials (SignatureTypeV2.POLY_GNOSIS_SAFE)
 * 4. Phone places orders via POST /clob/order — server signs & submits via builder
 *
 * V2 changes (April 2026):
 * - Collateral: pUSD (0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB) replaces USDC.e
 * - Exchange: V2 contracts (CTF Exchange V2, NegRisk CTF Exchange V2)
 * - Builder: public builderCode replaces HMAC auth for orders
 * - Order struct: timestamp, metadata, builder fields; no nonce/feeRateBps/taker
 * - Relayer SDK: unchanged (still V1, still needs builder-signing-sdk for HMAC)
 */

import { Hono } from 'hono'
import { Wallet, utils, providers } from 'ethers'
import { ClobClient, SignatureTypeV2, Chain } from '@polymarket/clob-client-v2'
import type { ApiKeyCreds } from '@polymarket/clob-client-v2'
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client'
import { deriveSafe } from '@polymarket/builder-relayer-client/dist/builder/derive'
import { BuilderConfig as RelayerBuilderConfig } from '@polymarket/builder-signing-sdk'
import { encodeFunctionData, maxUint256 } from 'viem'

// V2 is live on production URL after April 28 cutover
const CLOB_HOST = process.env.CLOB_HOST || 'https://clob.polymarket.com'
const RELAYER_URL = 'https://relayer-v2.polymarket.com'
const CHAIN_ID = 137 // Polygon mainnet
const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const polygonProvider = new providers.JsonRpcProvider(POLYGON_RPC)

// Builder code for V2 orders (public bytes32, no HMAC needed)
const BUILDER_CODE = '0xda0aa9e10ba50d0077e25e94cf9e4d9ef749821528acf6fc758df962d67b63ed'

// Gnosis Safe factory on Polygon (used for deterministic Safe address derivation)
const SAFE_FACTORY = '0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b'

// Polymarket V2 contract addresses (Polygon mainnet)
const CONTRACTS = {
  // Collateral: pUSD replaces USDC.e in V2
  PUSD: '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB',
  // USDC.e (bridged USDC on Polygon) — input for wrapping to pUSD
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  // CollateralOnramp — wraps USDC.e → pUSD
  COLLATERAL_ONRAMP: '0x93070a847efEf7F70739046A929D47a521F5B8ee',
  // CollateralOfframp — unwraps pUSD → USDC.e
  COLLATERAL_OFFRAMP: '0x2957922Eb93258b93368531d39fAcCA3B4dC5854',
  // V2 exchanges
  CTF_EXCHANGE_V2: '0xE111180000d2663C0091e4f400237545B87B996B',
  NEG_RISK_CTF_EXCHANGE_V2: '0xe2222d279d744050d28e00520010520000310F59',
  // Unchanged
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

const ERC1155_BALANCE_OF_ABI = [{
  name: 'balanceOf', type: 'function',
  inputs: [{ name: 'account', type: 'address' }, { name: 'id', type: 'uint256' }],
  outputs: [{ type: 'uint256' }],
}] as const

const CTF_PAYOUT_DENOMINATOR_ABI = [{
  name: 'payoutDenominator', type: 'function',
  inputs: [{ name: 'conditionId', type: 'bytes32' }],
  outputs: [{ type: 'uint256' }],
}] as const

// --- Builder Config ---

// Relayer still uses V1 HMAC auth (for Safe deploy/approve/withdraw)
const builderKey = process.env.POLYMARKET_BUILDER_API_KEY
const builderSecret = process.env.POLYMARKET_BUILDER_SECRET
const builderPassphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE

if (!builderKey || !builderSecret || !builderPassphrase) {
  console.warn('[clob] POLYMARKET_BUILDER_* env vars not set — gasless relay will fail')
}

const relayerBuilderConfig = (builderKey && builderSecret && builderPassphrase)
  ? new RelayerBuilderConfig({
      localBuilderCreds: { key: builderKey, secret: builderSecret, passphrase: builderPassphrase },
    })
  : undefined

// V2 builder config — just a builderCode, no HMAC
const clobBuilderConfig = { builderCode: BUILDER_CODE }

// --- USDC.e balance check + auto-wrap helper ---

async function getUsdceBalance(safeAddress: string): Promise<bigint> {
  const balanceData = encodeFunctionData({
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
    functionName: 'balanceOf',
    args: [safeAddress as `0x${string}`],
  })
  const res = await polygonProvider.call({ to: CONTRACTS.USDC_E, data: balanceData })
  return BigInt(res)
}

async function autoWrapUsdce(session: ClobSession): Promise<{ wrapped: boolean; amount: number; txHash: string | null }> {
  if (!relayerBuilderConfig) return { wrapped: false, amount: 0, txHash: null }

  const usdceBalance = await getUsdceBalance(session.safeAddress)
  if (usdceBalance === 0n) return { wrapped: false, amount: 0, txHash: null }

  const safeAddr = session.safeAddress as `0x${string}`
  const onramp = CONTRACTS.COLLATERAL_ONRAMP as `0x${string}`
  const usdceContract = CONTRACTS.USDC_E as `0x${string}`

  const approveTx = {
    to: usdceContract,
    data: encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [onramp, usdceBalance],
    }),
    value: '0',
  }

  const wrapTx = {
    to: onramp,
    data: encodeFunctionData({
      abi: [{ name: 'wrap', type: 'function', inputs: [{ name: '_asset', type: 'address' }, { name: '_to', type: 'address' }, { name: '_amount', type: 'uint256' }], outputs: [] }] as const,
      functionName: 'wrap',
      args: [usdceContract, safeAddr, usdceBalance],
    }),
    value: '0',
  }

  const relay = new RelayClient(RELAYER_URL, CHAIN_ID, session.wallet, relayerBuilderConfig as any, RelayerTxType.SAFE)
  const execRes = await relay.execute([approveTx, wrapTx], `Auto-wrap ${Number(usdceBalance) / 1e6} USDC.e → pUSD`)
  const execResult = await execRes.wait()

  const amount = Number(usdceBalance) / 1e6
  const txHash = execResult?.transactionHash ?? null
  console.log(`[clob] Auto-wrapped ${amount} USDC.e → pUSD${txHash ? ` tx=${txHash}` : ''}`)
  return { wrapped: true, amount, txHash }
}

// --- Approval helpers ---

function buildApprovalTxs() {
  // Approve V2 exchanges + adapter for pUSD and CTF tokens
  const spenders = [
    CONTRACTS.CTF_EXCHANGE_V2,
    CONTRACTS.NEG_RISK_CTF_EXCHANGE_V2,
    CONTRACTS.NEG_RISK_ADAPTER,
  ]

  // pUSD approvals (replaces USDC.e in V2)
  const pusdApprovals = spenders.map((spender) => ({
    to: CONTRACTS.PUSD,
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

  return [...pusdApprovals, ...ctfApprovals]
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
  return new ClobClient({
    host: CLOB_HOST,
    chain: Chain.POLYGON,
    signer: session.wallet,
    creds: session.creds,
    signatureType: SignatureTypeV2.POLY_GNOSIS_SAFE,
    funderAddress: session.safeAddress,
    builderConfig: clobBuilderConfig,
  })
}

// --- Routes ---

export const clobRoutes = new Hono()

console.log('[clob] Routes loaded: /auth, /order/signed, /positions/:polygonAddress, /balance/:polygonAddress, /redeem')

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

  if (!relayerBuilderConfig) {
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

    // 2. Create RelayClient (SAFE mode — gasless, still uses V1 HMAC auth)
    const relay = new RelayClient(RELAYER_URL, CHAIN_ID, wallet, relayerBuilderConfig as any, RelayerTxType.SAFE)

    // 3. Derive Safe address deterministically (CREATE2 from EOA + factory)
    // NOTE: Do NOT use relay.getRelayPayload() — it returns the relay hub address, not the Safe!
    const safeAddress = deriveSafe(eoaAddress, SAFE_FACTORY) as string
    console.log(`[clob] Safe address (derived): ${safeAddress}`)

    // 4. Deploy Safe if needed
    try {
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
    } catch (deployErr: any) {
      // "safe already deployed!" is fine — just means the check was stale
      if (deployErr.message?.includes('already deployed')) {
        console.log(`[clob] Safe already deployed (caught)`)
      } else {
        throw deployErr
      }
    }

    // 5. Run approvals for V2 contracts (gasless via builder relayer)
    console.log(`[clob] Running V2 approvals...`)
    try {
      const approvalTxs = buildApprovalTxs()
      const approvalRes = await relay.execute(approvalTxs, `Approve pUSD + CTF for V2 exchanges (${eoaAddress})`)
      const approvalResult = await approvalRes.wait()
      if (approvalResult) {
        console.log(`[clob] V2 approvals confirmed: tx=${approvalResult.transactionHash}`)
      } else {
        console.warn(`[clob] V2 approvals may have failed`)
      }
    } catch (err: any) {
      // Approvals may already be set from a previous auth
      console.warn(`[clob] Approval error (may already be approved): ${err.message}`)
    }

    // 6. Create CLOB API credentials (L1 auth — EIP-712 signature from EOA)
    const tempClient = new ClobClient({
      host: CLOB_HOST,
      chain: Chain.POLYGON,
      signer: wallet,
      signatureType: SignatureTypeV2.POLY_GNOSIS_SAFE,
      funderAddress: safeAddress,
    })
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
 * POST /clob/order/signed
 * Body: { polygonAddress, signedOrder }
 *
 * Phase 2: Phone signs order locally, sends pre-signed order here.
 * Server wraps with L2 HMAC headers (API creds) and posts to CLOB.
 * Server does NOT touch the private key for order signing.
 */
clobRoutes.post('/order/signed', async (c) => {
  let body: { polygonAddress?: string; signedOrder?: any; orderType?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  const { polygonAddress, signedOrder, orderType } = body
  if (!polygonAddress || !signedOrder) {
    return c.json({ error: 'Missing polygonAddress or signedOrder' }, 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  try {
    const client = getClient(session)
    const result = await client.postOrder(signedOrder, orderType === 'FOK' ? 'FOK' : 'GTC')

    // SDK may swallow errors and return an error object instead of throwing
    if (result?.error || result?.status === 'error') {
      const detail = result.error || result.message || JSON.stringify(result)
      console.error(`[clob] CLOB rejected order for ${polygonAddress}:`, detail)
      return c.json({ error: 'Order rejected by CLOB', detail }, 400)
    }

    console.log(`[clob] Signed order posted for ${polygonAddress}: ${signedOrder.side} (local signing)`)
    return c.json(result)
  } catch (err: any) {
    console.error('[clob] Signed order failed:', err.message || err)
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
 * DELETE /clob/order/:orderId
 * Cancel a single open order.
 */
clobRoutes.delete('/order/:orderId', async (c) => {
  const orderId = c.req.param('orderId')
  const polygonAddress = c.req.query('address')

  if (!polygonAddress) {
    return c.json({ error: 'Missing address query param' }, 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  try {
    const client = getClient(session)
    const result = await client.cancelOrder({ orderID: orderId })
    console.log(`[clob] Order cancelled: ${orderId} for ${polygonAddress}`)
    return c.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[clob] Cancel failed:', err.message || err)
    return c.json({ error: 'Cancel failed', detail: err.message }, 500)
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
    // Auto-wrap any USDC.e sitting in the Safe (bridge deposits arrive as USDC.e)
    try {
      const wrapResult = await autoWrapUsdce(session)
      if (wrapResult.wrapped) {
        console.log(`[clob] Auto-wrapped ${wrapResult.amount} USDC.e before balance check`)
      }
    } catch (wrapErr: any) {
      console.warn(`[clob] Auto-wrap failed (non-fatal): ${wrapErr.message}`)
    }

    const client = getClient(session)
    const result = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' as any }) // pUSD balance in V2
    const rawBalance = parseFloat(result.balance) || 0
    const rawAllowance = parseFloat(result.allowance) || 0
    // V2 SDK returns raw units (6 decimals) — always divide
    const balance = rawBalance >= 1000 ? rawBalance / 1e6 : rawBalance
    const allowance = rawAllowance >= 1000 ? rawAllowance / 1e6 : rawAllowance

    console.log(`[clob] Balance for ${polygonAddress} (Safe: ${session.safeAddress}): raw=${rawBalance} → ${balance} pUSD`)
    return c.json({ balance, allowance, raw: result })
  } catch (err: any) {
    console.error('[clob] Balance fetch failed:', err.message || err)
    return c.json({ error: 'Failed to fetch balance', detail: err.message }, 500)
  }
})

/**
 * POST /clob/wrap
 * Body: { polygonAddress }
 *
 * Wraps all USDC.e in the Safe into pUSD (V2 collateral) via CollateralOnramp.
 * Gasless — relayer pays gas. Two batched txs: approve + wrap.
 */
clobRoutes.post('/wrap', async (c) => {
  let body: { polygonAddress?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  const { polygonAddress } = body
  if (!polygonAddress) {
    return c.json({ error: 'Missing polygonAddress' }, 400)
  }

  if (!relayerBuilderConfig) {
    return c.json({ error: 'Builder not configured' }, 500)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  try {
    const result = await autoWrapUsdce(session)
    if (!result.wrapped) {
      return c.json({ error: 'No USDC.e to wrap', balance: '0' }, 400)
    }

    return c.json({ ok: true, amountWrapped: result.amount, txHash: result.txHash })
  } catch (err: any) {
    console.error('[clob] Wrap failed:', err.message || err)
    return c.json({ error: 'Wrap failed', detail: err.message }, 500)
  }
})

/**
 * POST /clob/withdraw
 * Body: { polygonAddress, amount, solanaAddress }
 *
 * Withdraws from Polymarket Safe to user's Solana wallet (gasless).
 * 1. Calls Polymarket Bridge API for withdraw deposit address
 * 2. Transfers pUSD to bridge EVM address (gasless via relayer)
 * 3. Bridge auto-unwraps pUSD → USDC and bridges to Solana
 */
clobRoutes.post('/withdraw', async (c) => {
  let body: { polygonAddress?: string; amount?: number; solanaAddress?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  const { polygonAddress, amount, solanaAddress } = body
  if (!polygonAddress || !amount || !solanaAddress) {
    return c.json({ error: 'Missing required fields: polygonAddress, amount, solanaAddress' }, 400)
  }

  if (amount <= 0) {
    return c.json({ error: 'Amount must be positive' }, 400)
  }

  if (!relayerBuilderConfig) {
    return c.json({ error: 'Builder not configured' }, 500)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  try {
    // 1. Get bridge deposit addresses from Polymarket Bridge API
    const SOLANA_CHAIN_ID = '1151111081099710'
    const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

    const bridgeRes = await fetch('https://bridge.polymarket.com/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: session.safeAddress,
        toChainId: SOLANA_CHAIN_ID,
        toTokenAddress: SOLANA_USDC_MINT,
        recipientAddr: solanaAddress,
      }),
    })

    if (!bridgeRes.ok) {
      const text = await bridgeRes.text()
      console.error(`[clob] Bridge withdraw API error ${bridgeRes.status}: ${text}`)
      return c.json({ error: 'Bridge API error', detail: text }, 502)
    }

    const bridgeData = await bridgeRes.json() as Record<string, any>
    console.log(`[clob] Bridge withdraw response:`, JSON.stringify(bridgeData))

    // Bridge returns deposit address(es) — we need the EVM one to send USDC.e to
    const bridgeEvmAddress = bridgeData.address?.evm || bridgeData.depositAddress || bridgeData.address
    if (!bridgeEvmAddress || typeof bridgeEvmAddress !== 'string') {
      console.error('[clob] No EVM bridge address in response:', bridgeData)
      return c.json({ error: 'No bridge deposit address returned' }, 502)
    }

    // 2. Transfer pUSD directly to bridge address
    // Bridge auto-unwraps pUSD → USDC via CollateralOfframp + Uniswap pool
    const amountRaw = BigInt(Math.floor(amount * 1e6))

    const transferTx = {
      to: CONTRACTS.PUSD,
      data: encodeFunctionData({
        abi: [{ name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const,
        functionName: 'transfer',
        args: [bridgeEvmAddress as `0x${string}`, amountRaw],
      }),
      value: '0',
    }

    // 3. Execute via relayer (gasless)
    const relay = new RelayClient(RELAYER_URL, CHAIN_ID, session.wallet, relayerBuilderConfig as any, RelayerTxType.SAFE)
    const execRes = await relay.execute([transferTx], `Withdraw ${amount} pUSD to Solana ${solanaAddress.slice(0, 8)}...`)
    const execResult = await execRes.wait()

    const txHash = execResult?.transactionHash ?? null
    console.log(`[clob] Withdraw ${amount}: pUSD → bridge ${bridgeEvmAddress} → Solana ${solanaAddress}${txHash ? ` tx=${txHash}` : ''}`)

    return c.json({
      ok: true,
      amount,
      safeAddress: session.safeAddress,
      bridgeAddress: bridgeEvmAddress,
      solanaAddress,
      txHash,
    })
  } catch (err: any) {
    console.error('[clob] Withdraw failed:', err.message || err)
    return c.json({ error: 'Withdraw failed', detail: err.message }, 500)
  }
})

/**
 * POST /clob/redeem
 * Body: { polygonAddress, conditionId }
 *
 * Redeems winning tokens for a resolved market via CTF contract.
 * Executes gaslessly through the Builder Relayer (Safe tx).
 * Burns entire token balance — no amount param (CTF spec).
 */
const CTF_REDEEM_ABI = [{
  name: 'redeemPositions', type: 'function',
  inputs: [
    { name: 'collateralToken', type: 'address' },
    { name: 'parentCollectionId', type: 'bytes32' },
    { name: 'conditionId', type: 'bytes32' },
    { name: 'indexSets', type: 'uint256[]' },
  ],
  outputs: [],
}] as const

/**
 * POST /clob/redeem/debug
 * Body: { polygonAddress, conditionId, asset }
 *
 * Read-only/simulation diagnostics for redeem failures.
 */
clobRoutes.post('/redeem/debug', async (c) => {
  let body: { polygonAddress?: string; conditionId?: string; asset?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  const { polygonAddress, conditionId, asset } = body
  if (!polygonAddress || !conditionId || !asset) {
    return c.json({ error: 'Missing polygonAddress, conditionId, or asset' }, 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  const safeAddress = session?.safeAddress ?? deriveSafe(polygonAddress, SAFE_FACTORY).toLowerCase()

  const redeemData = encodeFunctionData({
    abi: CTF_REDEEM_ABI,
    functionName: 'redeemPositions',
    args: [
      CONTRACTS.PUSD as `0x${string}`,
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      conditionId as `0x${string}`,
      [1n, 2n],
    ],
  })

  const result: Record<string, unknown> = {
    polygonAddress,
    safeAddress,
    conditionId,
    asset,
    hasActiveSession: !!session,
    collateralToken: CONTRACTS.PUSD,
    ctf: CONTRACTS.CTF,
  }

  try {
    const balanceData = encodeFunctionData({
      abi: ERC1155_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [safeAddress as `0x${string}`, BigInt(asset)],
    })
    const balanceRaw = await polygonProvider.call({ to: CONTRACTS.CTF, data: balanceData })
    const tokenBalance = BigInt(balanceRaw)
    result.tokenBalanceRaw = tokenBalance.toString()
    result.tokenBalance = Number(tokenBalance) / 1e6
  } catch (err: any) {
    result.tokenBalanceError = err?.message ?? String(err)
  }

  try {
    const denominatorData = encodeFunctionData({
      abi: CTF_PAYOUT_DENOMINATOR_ABI,
      functionName: 'payoutDenominator',
      args: [conditionId as `0x${string}`],
    })
    const denominatorRaw = await polygonProvider.call({ to: CONTRACTS.CTF, data: denominatorData })
    result.payoutDenominator = BigInt(denominatorRaw).toString()
  } catch (err: any) {
    result.payoutDenominatorError = err?.message ?? String(err)
  }

  try {
    await polygonProvider.call({
      from: safeAddress,
      to: CONTRACTS.CTF,
      data: redeemData,
    })
    result.simulationOk = true
  } catch (err: any) {
    result.simulationOk = false
    result.simulationError = err?.reason ?? err?.message ?? String(err)
    result.simulationCode = err?.code ?? null
    result.simulationData = err?.data ?? null
  }

  console.log('[clob] Redeem debug:', result)
  return c.json(result)
})

clobRoutes.post('/redeem', async (c) => {
  console.log('[clob] Redeem route hit')

  let body: { polygonAddress?: string; conditionId?: string }
  try {
    body = await c.req.json()
  } catch {
    console.warn('[clob] Redeem bad request: invalid JSON body')
    return c.json({ error: 'Bad request' }, 400)
  }

  const { polygonAddress, conditionId } = body
  console.log('[clob] Redeem request:', {
    polygonAddress,
    conditionId: conditionId ? `${conditionId.slice(0, 10)}...${conditionId.slice(-6)}` : null,
  })

  if (!polygonAddress || !conditionId) {
    console.warn('[clob] Redeem missing fields:', {
      hasPolygonAddress: !!polygonAddress,
      hasConditionId: !!conditionId,
    })
    return c.json({ error: 'Missing polygonAddress or conditionId' }, 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    console.warn(`[clob] Redeem no active session for ${polygonAddress}. Active sessions=${sessions.size}`)
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  if (!relayerBuilderConfig) {
    console.error('[clob] Redeem relayer not configured: missing POLYMARKET_BUILDER_* env vars')
    return c.json({ error: 'Relayer not configured' }, 500)
  }

  try {
    console.log(`[clob] Redeem building tx: EOA=${session.eoaAddress}, Safe=${session.safeAddress}, condition=${conditionId.slice(0, 10)}...`)

    const redeemTx = {
      to: CONTRACTS.CTF as `0x${string}`,
      data: encodeFunctionData({
        abi: CTF_REDEEM_ABI,
        functionName: 'redeemPositions',
        args: [
          CONTRACTS.PUSD as `0x${string}`,
          '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
          conditionId as `0x${string}`,
          [1n, 2n],
        ],
      }),
      value: '0',
    }

    console.log(`[clob] Redeem relay execute: to=${redeemTx.to}, dataBytes=${redeemTx.data.length}`)
    const relay = new RelayClient(RELAYER_URL, CHAIN_ID, session.wallet, relayerBuilderConfig as any, RelayerTxType.SAFE)
    const execRes = await relay.execute([redeemTx], `Redeem positions for condition ${conditionId.slice(0, 10)}...`)
    console.log('[clob] Redeem relay response:', {
      type: typeof execRes,
      keys: execRes && typeof execRes === 'object' ? Object.keys(execRes as unknown as Record<string, unknown>) : [],
    })
    console.log('[clob] Redeem relay submitted, waiting for receipt...')
    const execResult = await execRes.wait()
    console.log('[clob] Redeem relay wait result:', execResult ?? null)

    const txHash = execResult?.transactionHash ?? null
    if (!txHash) {
      console.warn('[clob] Redeem relay completed without transaction hash; treating as not confirmed')
      return c.json({
        error: 'Redeem not confirmed',
        detail: 'Relayer completed without returning a transaction hash',
      }, 502)
    }

    console.log(`[clob] Redeemed positions for ${polygonAddress} condition=${conditionId.slice(0, 10)}... tx=${txHash}`)

    return c.json({ ok: true, txHash })
  } catch (err: any) {
    console.error('[clob] Redeem failed:', {
      message: err?.message,
      code: err?.code,
      response: err?.response?.data ?? err?.response,
      stack: err?.stack,
    })
    return c.json({ error: 'Redeem failed', detail: err.message }, 500)
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

// Gamma API proxy (also geo-restricted)
clobRoutes.get('/gamma/events/:eventId', async (c) => {
  const eventId = c.req.param('eventId')
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`)
    const data = await res.json()
    return c.json(data, res.ok ? 200 : (res.status as any))
  } catch (err: any) {
    return c.json({ error: 'Gamma proxy failed', detail: err.message }, 502)
  }
})

// V2 health check — verify CLOB host connectivity
clobRoutes.get('/v2/health', async (c) => {
  try {
    const res = await fetch(`${CLOB_HOST}/time`)
    const data = await res.json().catch(() => null)
    return c.json({ ok: res.ok, host: CLOB_HOST, status: res.status, serverTime: data })
  } catch (err: any) {
    return c.json({ ok: false, host: CLOB_HOST, error: err.message }, 502)
  }
})

// ============================================================================

clobRoutes.delete('/session/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  sessions.delete(polygonAddress.toLowerCase())
  return c.json({ ok: true })
})
