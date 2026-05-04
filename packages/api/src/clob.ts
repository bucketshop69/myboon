/**
 * Server-side CLOB V2 session management and order routing.
 *
 * Flow (gasless via Builder Relayer + trading wallet):
 * 1. Phone derives EVM key from Solana wallet signature (Phantom MWA)
 * 2. Phone sends the raw Solana signature to POST /clob/auth
 * 3. Server derives EVM key, then uses Safe for existing users or deposit wallet
 *    for new API users
 * 4. Safe users sign orders locally; deposit-wallet users are signed server-side
 *    by the CLOB SDK with POLY_1271
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
import { AssetType, ClobClient, OrderType, Side, SignatureTypeV2, Chain } from '@polymarket/clob-client-v2'
import type { ApiKeyCreds } from '@polymarket/clob-client-v2'
import { deriveSafe, RelayClient, RelayerTxType, TransactionType } from '@polymarket/builder-relayer-client'
import type { DepositWalletCall, Transaction } from '@polymarket/builder-relayer-client'
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

// --- Builder Config ---

// Relayer uses builder HMAC auth for Safe and deposit-wallet gasless calls.
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

type WalletMode = 'safe' | 'deposit_wallet'

async function getUsdceBalance(walletAddress: string): Promise<bigint> {
  const balanceData = encodeFunctionData({
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
    functionName: 'balanceOf',
    args: [walletAddress as `0x${string}`],
  })
  const res = await polygonProvider.call({ to: CONTRACTS.USDC_E, data: balanceData })
  return BigInt(res)
}

async function autoWrapUsdce(session: ClobSession): Promise<{ wrapped: boolean; amount: number; txHash: string | null }> {
  if (!relayerBuilderConfig) return { wrapped: false, amount: 0, txHash: null }

  const usdceBalance = await getUsdceBalance(session.tradingAddress)
  if (usdceBalance === 0n) return { wrapped: false, amount: 0, txHash: null }

  const tradingAddr = session.tradingAddress as `0x${string}`
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
      args: [usdceContract, tradingAddr, usdceBalance],
    }),
    value: '0',
  }

  const execResult = await executeTradingWalletCalls(session, [approveTx, wrapTx], `Auto-wrap ${Number(usdceBalance) / 1e6} USDC.e to pUSD`)

  const amount = Number(usdceBalance) / 1e6
  const txHash = execResult?.transactionHash ?? null
  console.log(`[clob] Auto-wrapped ${amount} USDC.e to pUSD for ${session.walletMode}${txHash ? ` tx=${txHash}` : ''}`)
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
  walletMode: WalletMode
  tradingAddress: string
  safeAddress?: string
  depositWalletAddress?: string
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
    signatureType: session.walletMode === 'deposit_wallet'
      ? SignatureTypeV2.POLY_1271
      : SignatureTypeV2.POLY_GNOSIS_SAFE,
    funderAddress: session.tradingAddress,
    builderConfig: clobBuilderConfig,
  })
}

function getRelay(session: ClobSession, relayTxType = RelayerTxType.SAFE): RelayClient {
  return new RelayClient(RELAYER_URL, CHAIN_ID, session.wallet, relayerBuilderConfig as any, relayTxType)
}

function toDepositWalletCall(tx: Transaction): DepositWalletCall {
  return {
    target: tx.to,
    value: tx.value,
    data: tx.data,
  }
}

async function executeTradingWalletCalls(session: ClobSession, txs: Transaction[], metadata: string) {
  if (!relayerBuilderConfig) {
    throw new Error('Builder not configured')
  }

  if (session.walletMode === 'deposit_wallet') {
    if (!session.depositWalletAddress) throw new Error('Missing deposit wallet address')
    const deadline = Math.floor(Date.now() / 1000 + 240).toString()
    const res = await getRelay(session).executeDepositWalletBatch(
      txs.map(toDepositWalletCall),
      session.depositWalletAddress,
      deadline,
    )
    return res.wait()
  }

  const res = await getRelay(session, RelayerTxType.SAFE).execute(txs, metadata)
  return res.wait()
}

// --- Routes ---

export const clobRoutes = new Hono()

/**
 * POST /clob/auth
 * Body: { signature: string } — hex-encoded 64-byte Solana signature
 *
 * Server derives EVM key, prepares the selected trading wallet, creates CLOB API
 * credentials, and returns the EOA plus Safe/deposit wallet addresses.
 */
clobRoutes.post('/auth', async (c) => {
  let body: { signature?: string; preferredWalletMode?: WalletMode }
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

    const requestedWalletMode: WalletMode = body.preferredWalletMode === 'safe' ? 'safe' : 'deposit_wallet'
    const relay = new RelayClient(RELAYER_URL, CHAIN_ID, wallet, relayerBuilderConfig as any, RelayerTxType.SAFE)

    let sessionDraft: Omit<ClobSession, 'creds' | 'createdAt'>

    if (requestedWalletMode === 'safe') {
      // Existing users keep the Safe path in this phase.
      const safeAddress = deriveSafe(eoaAddress, SAFE_FACTORY) as string
      console.log(`[clob] Safe address (derived): ${safeAddress}`)

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
        if (deployErr.message?.includes('already deployed')) {
          console.log(`[clob] Safe already deployed (caught)`)
        } else {
          throw deployErr
        }
      }

      sessionDraft = {
        wallet,
        eoaAddress: eoaAddress.toLowerCase(),
        walletMode: 'safe',
        tradingAddress: safeAddress.toLowerCase(),
        safeAddress: safeAddress.toLowerCase(),
      }
    } else {
      const depositWalletAddress = await relay.deriveDepositWalletAddress()
      console.log(`[clob] Deposit wallet address (derived): ${depositWalletAddress}`)

      try {
        const deployed = await relay.getDeployed(depositWalletAddress, TransactionType.WALLET)
        if (!deployed) {
          console.log(`[clob] Deploying deposit wallet for ${eoaAddress}...`)
          const deployRes = await relay.deployDepositWallet()
          const deployResult = await deployRes.wait()
          if (deployResult) {
            console.log(`[clob] Deposit wallet deployed: tx=${deployResult.transactionHash}`)
          } else {
            console.warn(`[clob] Deposit wallet deploy may have failed — continuing anyway`)
          }
        } else {
          console.log(`[clob] Deposit wallet already deployed`)
        }
      } catch (deployErr: any) {
        if (deployErr.message?.includes('already deployed')) {
          console.log(`[clob] Deposit wallet already deployed (caught)`)
        } else {
          throw deployErr
        }
      }

      sessionDraft = {
        wallet,
        eoaAddress: eoaAddress.toLowerCase(),
        walletMode: 'deposit_wallet',
        tradingAddress: depositWalletAddress.toLowerCase(),
        depositWalletAddress: depositWalletAddress.toLowerCase(),
      }
    }

    // 5. Run approvals for V2 contracts from the active trading wallet.
    console.log(`[clob] Running V2 approvals for ${sessionDraft.walletMode}...`)
    try {
      const approvalTxs = buildApprovalTxs()
      const approvalResult = await executeTradingWalletCalls(
        { ...sessionDraft, creds: {} as ApiKeyCreds, createdAt: Date.now() },
        approvalTxs,
        `Approve pUSD + CTF for V2 exchanges (${eoaAddress})`,
      )
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
      signatureType: sessionDraft.walletMode === 'deposit_wallet'
        ? SignatureTypeV2.POLY_1271
        : SignatureTypeV2.POLY_GNOSIS_SAFE,
      funderAddress: sessionDraft.tradingAddress,
    })
    const creds = await tempClient.createOrDeriveApiKey()

    // 7. Store session
    const session: ClobSession = {
      ...sessionDraft,
      creds,
      createdAt: Date.now(),
    }
    sessions.set(eoaAddress.toLowerCase(), session)

    try {
      const client = getClient(session)
      await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL })
    } catch (balanceErr: any) {
      console.warn(`[clob] Balance allowance sync failed (non-fatal): ${balanceErr.message}`)
    }

    console.log(`[clob] Session created — EOA: ${eoaAddress}, ${session.walletMode}: ${session.tradingAddress}`)

    return c.json({
      polygonAddress: eoaAddress,
      walletMode: session.walletMode,
      tradingAddress: session.tradingAddress,
      safeAddress: session.safeAddress ?? null,
      depositWalletAddress: session.depositWalletAddress ?? null,
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
    const result = await client.postOrder(signedOrder, orderType === 'FOK' ? OrderType.FOK : OrderType.GTC)

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
 * POST /clob/order
 * Body: { polygonAddress, tokenID, price, size, side, negRisk?, orderType? }
 *
 * Server-side order creation for deposit-wallet users. The updated CLOB SDK
 * builds the ERC-7739-wrapped POLY_1271 signature when the session is configured
 * with `signatureType = POLY_1271` and `funderAddress = depositWalletAddress`.
 */
clobRoutes.post('/order', async (c) => {
  let body: {
    polygonAddress?: string
    tokenID?: string
    price?: number
    size?: number
    side?: 'BUY' | 'SELL'
    negRisk?: boolean
    orderType?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  const { polygonAddress, tokenID, price, size, side, negRisk, orderType } = body
  if (!polygonAddress || !tokenID || typeof price !== 'number' || typeof size !== 'number' || !side) {
    return c.json({ error: 'Missing required fields: polygonAddress, tokenID, price, size, side' }, 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  if (session.walletMode !== 'deposit_wallet') {
    return c.json({ error: 'Use /clob/order/signed for Safe wallet orders' }, 400)
  }

  try {
    const client = getClient(session)
    const order = await client.createOrder(
      {
        tokenID,
        price,
        size,
        side: side === 'BUY' ? Side.BUY : Side.SELL,
        builderCode: BUILDER_CODE,
      },
      { tickSize: '0.01', negRisk: !!negRisk },
    )
    const result = await client.postOrder(order, orderType === 'FOK' ? OrderType.FOK : OrderType.GTC)

    if (result?.error || result?.status === 'error') {
      const detail = result.error || result.message || JSON.stringify(result)
      console.error(`[clob] CLOB rejected deposit-wallet order for ${polygonAddress}:`, detail)
      return c.json({ error: 'Order rejected by CLOB', detail }, 400)
    }

    console.log(`[clob] Deposit-wallet order posted for ${polygonAddress}: ${side}`)
    return c.json(result)
  } catch (err: any) {
    console.error('[clob] Deposit-wallet order failed:', err.message || err)
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
 * Uses the active trading wallet address — Safe for existing users, deposit
 * wallet for new API users.
 */
clobRoutes.get('/deposit/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  const session = sessions.get(polygonAddress.toLowerCase())

  const depositAddress = session ? session.tradingAddress : polygonAddress

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
    console.log(`[clob] Deposit addresses fetched for trading wallet ${depositAddress}`)
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
    // Auto-wrap any USDC.e sitting in the trading wallet (bridge deposits arrive as USDC.e)
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

    console.log(`[clob] Balance for ${polygonAddress} (${session.walletMode}: ${session.tradingAddress}): raw=${rawBalance} -> ${balance} pUSD`)
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
 * Wraps all USDC.e in the trading wallet into pUSD (V2 collateral) via CollateralOnramp.
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
 * Withdraws from the Polymarket trading wallet to user's Solana wallet (gasless).
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
        address: session.tradingAddress,
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
    const execResult = await executeTradingWalletCalls(
      session,
      [transferTx],
      `Withdraw ${amount} pUSD to Solana ${solanaAddress.slice(0, 8)}...`,
    )

    const txHash = execResult?.transactionHash ?? null
    console.log(`[clob] Withdraw ${amount}: pUSD -> bridge ${bridgeEvmAddress} -> Solana ${solanaAddress}${txHash ? ` tx=${txHash}` : ''}`)

    return c.json({
      ok: true,
      amount,
      tradingAddress: session.tradingAddress,
      safeAddress: session.safeAddress ?? null,
      depositWalletAddress: session.depositWalletAddress ?? null,
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
 * Executes gaslessly through the Builder Relayer.
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

clobRoutes.post('/redeem', async (c) => {
  let body: { polygonAddress?: string; conditionId?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad request' }, 400)
  }

  const { polygonAddress, conditionId } = body
  if (!polygonAddress || !conditionId) {
    return c.json({ error: 'Missing polygonAddress or conditionId' }, 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json({ error: 'No active session — call POST /clob/auth first' }, 401)
  }

  if (!relayerBuilderConfig) {
    return c.json({ error: 'Relayer not configured' }, 500)
  }

  try {
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

    const execResult = await executeTradingWalletCalls(
      session,
      [redeemTx],
      `Redeem positions for condition ${conditionId.slice(0, 10)}...`,
    )

    const txHash = execResult?.transactionHash ?? null
    console.log(`[clob] Redeemed positions for ${polygonAddress} condition=${conditionId.slice(0, 10)}... tx=${txHash}`)

    return c.json({ ok: true, txHash })
  } catch (err: any) {
    console.error('[clob] Redeem failed:', err.message || err)
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
    return c.json(data, (res.ok ? 200 : res.status) as any)
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
    return c.json(data, (res.ok ? 200 : res.status) as any)
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
    return c.json(data, (res.ok ? 200 : res.status) as any)
  } catch (err: any) {
    return c.json({ error: 'CLOB last-trade-price proxy failed', detail: err.message }, 502)
  }
})

clobRoutes.get('/markets/:conditionId', async (c) => {
  const conditionId = c.req.param('conditionId')
  try {
    const res = await fetch(`${CLOB_HOST}/markets/${encodeURIComponent(conditionId)}`)
    const data = await res.json()
    return c.json(data, (res.ok ? 200 : res.status) as any)
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
