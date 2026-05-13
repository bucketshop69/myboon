/**
 * Server-side CLOB V2 session management and order routing.
 *
 * Flow (gasless via Builder Relayer + trading wallet):
 * 1. Phone derives EVM key from Solana wallet signature (Phantom MWA)
 * 2. Phone sends the raw Solana signature to POST /clob/auth
 * 3. Server derives EVM key, deploys/uses the user's deposit wallet
 * 4. Orders are signed server-side by the CLOB SDK with POLY_1271
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
import { RelayClient, TransactionType } from '@polymarket/builder-relayer-client'
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
  // Collateral adapters — redeem legacy USDC.e-backed outcome tokens and wrap payout to pUSD
  CTF_COLLATERAL_ADAPTER: '0xAdA100Db00Ca00073811820692005400218FcE1f',
  NEG_RISK_CTF_COLLATERAL_ADAPTER: '0xadA2005600Dec949baf300f4C6120000bDB6eAab',
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

function roundDown(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.floor((value + Number.EPSILON) * factor) / factor
}

const CTF_PAYOUT_DENOMINATOR_ABI = [{
  name: 'payoutDenominator', type: 'function',
  inputs: [{ name: 'conditionId', type: 'bytes32' }],
  outputs: [{ type: 'uint256' }],
}] as const

const CTF_GET_COLLECTION_ID_ABI = [{
  name: 'getCollectionId', type: 'function',
  inputs: [
    { name: 'parentCollectionId', type: 'bytes32' },
    { name: 'conditionId', type: 'bytes32' },
    { name: 'indexSet', type: 'uint256' },
  ],
  outputs: [{ type: 'bytes32' }],
}] as const

const CTF_GET_POSITION_ID_ABI = [{
  name: 'getPositionId', type: 'function',
  inputs: [
    { name: 'collateralToken', type: 'address' },
    { name: 'collectionId', type: 'bytes32' },
  ],
  outputs: [{ type: 'uint256' }],
}] as const

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

// --- Builder Config ---

// Relayer uses builder HMAC auth for deposit-wallet gasless calls.
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

type WalletMode = 'deposit_wallet'

async function getUsdceBalance(walletAddress: string): Promise<bigint> {
  const balanceData = encodeFunctionData({
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
    functionName: 'balanceOf',
    args: [walletAddress as `0x${string}`],
  })
  const res = await polygonProvider.call({ to: CONTRACTS.USDC_E, data: balanceData })
  return BigInt(res)
}

type AutoWrapResult = { wrapped: boolean; amount: number; txHash: string | null }

async function autoWrapUsdce(session: ClobSession): Promise<AutoWrapResult> {
  if (session.wrapInFlight) return session.wrapInFlight

  session.wrapInFlight = doAutoWrapUsdce(session).finally(() => {
    session.wrapInFlight = undefined
  })

  return session.wrapInFlight
}

async function doAutoWrapUsdce(session: ClobSession): Promise<AutoWrapResult> {
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
    CONTRACTS.CTF_COLLATERAL_ADAPTER,
    CONTRACTS.NEG_RISK_CTF_COLLATERAL_ADAPTER,
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
  depositWalletAddress?: string
  wrapInFlight?: Promise<AutoWrapResult>
  createdAt: number
}

const sessions = new Map<string, ClobSession>()

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

type PredictOperation =
  | 'predict_setup'
  | 'buy'
  | 'sell'
  | 'cancel'
  | 'redeem'
  | 'withdraw'
  | 'deposit'
  | 'wrap'
  | 'predict_session'

type PredictOperationStatus =
  | 'submitted'
  | 'waiting_to_match'
  | 'filled'
  | 'not_filled'
  | 'cancel_requested'
  | 'cancelled'
  | 'collecting'
  | 'bridging'
  | 'completed'
  | 'failed'
  | 'session_expired'

type PredictOperationIdentifiers = {
  orderId?: string
  tokenId?: string
  conditionId?: string
  txHash?: string
  bridgeAddress?: string
  relayerTransactionId?: string
  tradingAddress?: string
  depositWalletAddress?: string
}

type PredictOperationEnvelope = {
  ok: boolean
  operationId: string
  operation: PredictOperation
  status: PredictOperationStatus
  userMessage: string
  identifiers?: PredictOperationIdentifiers
  retry?: { canRetry: boolean; retryAfterMs?: number; pollAfterMs?: number }
  lifecycleError?: { code: string; detailsId?: string }
}

function createOperationId(operation: PredictOperation) {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `op_${operation}_${Date.now()}_${suffix}`
}

function withOperation<T extends Record<string, unknown>>(
  payload: T,
  args: Omit<PredictOperationEnvelope, 'operationId'> & { operationId?: string },
): T & PredictOperationEnvelope {
  const operationId = args.operationId ?? createOperationId(args.operation)
  return {
    ...payload,
    ok: args.ok,
    operationId,
    operation: args.operation,
    status: args.status,
    userMessage: args.userMessage,
    ...(args.identifiers ? { identifiers: args.identifiers } : {}),
    ...(args.retry ? { retry: args.retry } : {}),
    ...(args.lifecycleError ? { lifecycleError: { ...args.lifecycleError, detailsId: args.lifecycleError.detailsId ?? operationId } } : {}),
  }
}

function sessionExpired(operation: PredictOperation = 'predict_session') {
  return withOperation(
    { error: 'No active session — call POST /clob/auth first' },
    {
      ok: false,
      operation,
      status: 'session_expired',
      userMessage: 'Predict session expired. Reconnect your Predict wallet to continue.',
      retry: { canRetry: true },
      lifecycleError: { code: 'PREDICT_SESSION_EXPIRED' },
    },
  )
}

function orderIdFromResult(result: any): string | undefined {
  const id = result?.orderID ?? result?.orderId ?? result?.id
  return typeof id === 'string' ? id : undefined
}

function stableErrorCode(operation: PredictOperation, detail: string) {
  if (/FOK_ORDER_NOT_FILLED|not filled|fill[- ]?or[- ]?kill|liquidity/iu.test(detail)) {
    return operation === 'buy' ? 'PREDICT_BUY_NOT_FILLED' : 'PREDICT_ORDER_NOT_FILLED'
  }
  if (/balance|allowance|insufficient funds/iu.test(detail)) return 'PREDICT_INSUFFICIENT_FUNDS'
  if (/builder|relayer/iu.test(detail)) return 'PREDICT_RELAYER_UNAVAILABLE'
  return `PREDICT_${operation.toUpperCase()}_FAILED`
}

function failedOperation(
  operation: PredictOperation,
  error: string,
  detail: string | null,
  status: PredictOperationStatus = 'failed',
) {
  const code = stableErrorCode(operation, detail ?? error)
  return withOperation(
    { error, ...(detail ? { detail } : {}) },
    {
      ok: false,
      operation,
      status,
      userMessage: status === 'not_filled'
        ? 'Not filled. Price or liquidity changed before the order could execute.'
        : 'Something went wrong. Try again in a moment.',
      retry: { canRetry: true },
      lifecycleError: { code },
    },
  )
}

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
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: session.tradingAddress,
    builderConfig: clobBuilderConfig,
  })
}

function getRelay(session: ClobSession): RelayClient {
  return new RelayClient(RELAYER_URL, CHAIN_ID, session.wallet, relayerBuilderConfig as any)
}

function toDepositWalletCall(tx: Transaction): DepositWalletCall {
  return {
    target: tx.to,
    value: tx.value,
    data: tx.data,
  }
}

async function executeTradingWalletCalls(session: ClobSession, txs: Transaction[], metadata: string) {
  const { execResult } = await submitTradingWalletCalls(session, txs, metadata)
  return execResult
}

async function submitTradingWalletCalls(session: ClobSession, txs: Transaction[], metadata: string) {
  if (!relayerBuilderConfig) {
    throw new Error('Builder not configured')
  }

  let relay: RelayClient
  let res: any

  if (!session.depositWalletAddress) throw new Error('Missing deposit wallet address')
  const deadline = Math.floor(Date.now() / 1000 + 240).toString()
  relay = getRelay(session)
  res = await relay.executeDepositWalletBatch(
    txs.map(toDepositWalletCall),
    session.depositWalletAddress,
    deadline,
  )

  const relayInfo = {
    transactionID: res?.transactionID ?? null,
    transactionHash: res?.transactionHash ?? null,
    hash: res?.hash ?? null,
    state: res?.state ?? null,
  }
  const execResult = await res.wait()
  return { relay, relayInfo, execResult, response: res }
}

// --- Routes ---

export const clobRoutes = new Hono()

console.log('[clob] Routes loaded: /auth, /order, /positions/:polygonAddress, /balance/:polygonAddress, /redeem')

/**
 * POST /clob/auth
 * Body: { signature: string } — hex-encoded 64-byte Solana signature
 *
 * Server derives EVM key, prepares the deposit wallet, creates CLOB API
 * credentials, and returns the EOA plus deposit wallet address.
 */
clobRoutes.post('/auth', async (c) => {
  let body: { signature?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json(failedOperation('predict_setup', 'Bad request', null), 400)
  }

  const { signature } = body
  if (!signature || typeof signature !== 'string') {
    return c.json(failedOperation('predict_setup', 'Missing signature', null), 400)
  }

  if (!relayerBuilderConfig) {
    return c.json(failedOperation('predict_setup', 'Builder not configured — set POLYMARKET_BUILDER_* env vars', null), 500)
  }

  try {
    // 1. Derive EVM private key: keccak256(solana_signature)
    const sigBytes = Buffer.from(signature, 'hex')
    if (sigBytes.length !== 64) {
      return c.json(failedOperation('predict_setup', 'Invalid signature length — expected 64 bytes', null), 400)
    }

    const evmPrivateKey = utils.keccak256(sigBytes)
    const wallet = new Wallet(evmPrivateKey, polygonProvider)
    const eoaAddress = wallet.address

    console.log(`[clob] EOA derived: ${eoaAddress}`)

    const relay = new RelayClient(RELAYER_URL, CHAIN_ID, wallet, relayerBuilderConfig as any)
    console.log(`[clob] Using deposit wallet signatureType=3`)
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

    const sessionDraft: Omit<ClobSession, 'creds' | 'createdAt'> = {
      wallet,
      eoaAddress: eoaAddress.toLowerCase(),
      walletMode: 'deposit_wallet',
      tradingAddress: depositWalletAddress.toLowerCase(),
      depositWalletAddress: depositWalletAddress.toLowerCase(),
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
      signatureType: SignatureTypeV2.POLY_1271,
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

    return c.json(withOperation({
      polygonAddress: eoaAddress,
      walletMode: session.walletMode,
      tradingAddress: session.tradingAddress,
      safeAddress: null,
      depositWalletAddress: session.depositWalletAddress ?? null,
    }, {
      ok: true,
      operation: 'predict_setup',
      status: 'completed',
      userMessage: 'Predict wallet is ready.',
      identifiers: {
        tradingAddress: session.tradingAddress,
        depositWalletAddress: session.depositWalletAddress ?? undefined,
      },
    }))
  } catch (err: any) {
    console.error('[clob] Auth failed:', err.message || err)
    return c.json(failedOperation('predict_setup', 'CLOB auth failed', err.message), 500)
  }
})

/**
 * POST /clob/order
 * Body: { polygonAddress, tokenID, price, size?, amount?, side, negRisk?, orderType? }
 *
 * Server-side order creation for deposit-wallet users. The updated CLOB SDK
 * builds the ERC-7739-wrapped POLY_1271 signature when the session is configured
 * with `signatureType = POLY_1271` and `funderAddress = depositWalletAddress`.
 *
 * GTC/GTD orders use size in shares. FOK/FAK market orders use amount:
 * BUY amount is dollars to spend, SELL amount is shares to sell.
 */
clobRoutes.post('/order', async (c) => {
  let body: {
    polygonAddress?: string
    tokenID?: string
    price?: number
    size?: number
    amount?: number
    side?: 'BUY' | 'SELL'
    negRisk?: boolean
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'FAK'
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json(failedOperation('buy', 'Bad request', null), 400)
  }

  const { polygonAddress, tokenID, price, size, amount, side, negRisk, orderType } = body
  const operation: PredictOperation = side === 'SELL' ? 'sell' : 'buy'
  const resolvedOrderType = orderType === 'FAK'
    ? OrderType.FAK
    : orderType === 'FOK'
      ? OrderType.FOK
      : orderType === 'GTD'
        ? OrderType.GTD
        : OrderType.GTC
  const isMarketOrder = resolvedOrderType === OrderType.FOK || resolvedOrderType === OrderType.FAK

  if (!polygonAddress || !tokenID || typeof price !== 'number' || !side) {
    return c.json(failedOperation(operation, 'Missing required fields: polygonAddress, tokenID, price, side', null), 400)
  }

  if (!isMarketOrder && typeof size !== 'number') {
    return c.json(failedOperation(operation, 'Missing required field: size', null), 400)
  }

  const marketAmount = isMarketOrder
    ? typeof amount === 'number'
      ? amount
      : side === 'BUY' && typeof size === 'number'
        ? size * price
        : size
    : null

  if (isMarketOrder && (typeof marketAmount !== 'number' || !Number.isFinite(marketAmount) || marketAmount <= 0)) {
    return c.json(failedOperation(operation, 'Missing required field: amount', null), 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json(sessionExpired(operation), 401)
  }

  try {
    const client = getClient(session)
    const clobSide = side === 'BUY' ? Side.BUY : Side.SELL
    let result: any
    if (isMarketOrder) {
      const marketOrderType = resolvedOrderType === OrderType.FAK ? OrderType.FAK : OrderType.FOK
      // Polymarket FOK/FAK BUY orders are market orders: amount is dollars to
      // spend and price is the worst acceptable fill price. Do not convert BUY
      // FOK into a limit order here; price * size can produce maker amounts such
      // as 4.998, which CLOB rejects for market buys.
      const normalizedMarketAmount = roundDown(marketAmount as number, 2)
      if (normalizedMarketAmount <= 0) {
        return c.json(failedOperation(operation, 'Amount is too small after precision rounding', null), 400)
      }

      result = await client.createAndPostMarketOrder(
        {
          tokenID,
          price,
          amount: normalizedMarketAmount,
          side: clobSide,
          orderType: marketOrderType,
          builderCode: BUILDER_CODE,
        },
        { tickSize: '0.01', negRisk: !!negRisk },
        marketOrderType,
      )
    } else {
      const limitOrderType = resolvedOrderType === OrderType.GTD ? OrderType.GTD : OrderType.GTC
      result = await client.createAndPostOrder(
        {
          tokenID,
          price,
          size: size as number,
          side: clobSide,
          builderCode: BUILDER_CODE,
        },
        { tickSize: '0.01', negRisk: !!negRisk },
        limitOrderType,
      )
    }

    if (result?.error || result?.errorMsg || result?.status === 'error' || result?.success === false) {
      const detail = result.error || result.errorMsg || result.message || JSON.stringify(result)
      console.error(`[clob] CLOB rejected deposit-wallet order for ${polygonAddress}:`, detail)
      const status = isMarketOrder && /FOK_ORDER_NOT_FILLED|not filled|liquidity/iu.test(detail)
        ? 'not_filled'
        : 'failed'
      return c.json(failedOperation(operation, 'Order rejected by CLOB', detail, status), 400)
    }

    console.log(`[clob] Deposit-wallet order posted for ${polygonAddress}: ${side}`)
    const orderId = orderIdFromResult(result)
    const payload = result && typeof result === 'object' ? result : { raw: result }
    return c.json(withOperation(payload, {
      ok: true,
      operation,
      status: isMarketOrder ? 'filled' : 'waiting_to_match',
      userMessage: isMarketOrder
        ? 'Pick filled at the best available market price.'
        : 'Pick submitted and waiting to match.',
      identifiers: {
        orderId,
        tokenId: tokenID,
      },
      retry: isMarketOrder ? undefined : { canRetry: false, pollAfterMs: 5_000 },
    }))
  } catch (err: any) {
    console.error('[clob] Deposit-wallet order failed:', err.message || err)
    return c.json(failedOperation(operation, 'Order failed', err.message), 500)
  }
})

/**
 * GET /clob/positions/:polygonAddress
 */
clobRoutes.get('/positions/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  const session = sessions.get(polygonAddress.toLowerCase())

  if (!session) {
    return c.json(sessionExpired('predict_session'), 401)
  }

  try {
    const client = getClient(session)
    const orders = await client.getOpenOrders()
    return c.json({ orders: orders ?? [] })
  } catch (err: any) {
    console.error('[clob] Positions fetch failed:', err.message || err)
    return c.json(failedOperation('predict_session', 'Failed to fetch positions', err.message), 500)
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
    return c.json(failedOperation('cancel', 'Missing address query param', null), 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json(sessionExpired('cancel'), 401)
  }

  try {
    const client = getClient(session)
    const result = await client.cancelOrder({ orderID: orderId })
    console.log(`[clob] Order cancelled: ${orderId} for ${polygonAddress}`)
    return c.json(withOperation({ ...result }, {
      ok: true,
      operation: 'cancel',
      status: 'cancel_requested',
      userMessage: 'Cancel requested. We will keep this pick visible until Polymarket confirms it.',
      identifiers: { orderId },
      retry: { canRetry: false, pollAfterMs: 5_000 },
    }))
  } catch (err: any) {
    console.error('[clob] Cancel failed:', err.message || err)
    return c.json(failedOperation('cancel', 'Cancel failed', err.message), 500)
  }
})

/**
 * GET /clob/deposit/:polygonAddress
 * Fetches deposit addresses from Polymarket Bridge API.
 * Uses the active deposit wallet address.
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
 * GET /clob/deposit-status/:depositAddress
 * Proxies Polymarket Bridge status for a copied deposit address.
 */
clobRoutes.get('/deposit-status/:depositAddress', async (c) => {
  const depositAddress = c.req.param('depositAddress')
  if (!depositAddress) {
    return c.json({ error: 'Missing deposit address' }, 400)
  }

  try {
    const res = await fetch(`https://bridge.polymarket.com/status/${encodeURIComponent(depositAddress)}`)

    if (!res.ok) {
      const text = await res.text()
      console.error(`[clob] Bridge status API error ${res.status}: ${text}`)
      return c.json({ error: 'Bridge status API error', detail: text }, 502)
    }

    return c.json(await res.json())
  } catch (err: any) {
    console.error('[clob] Deposit status fetch failed:', err.message || err)
    return c.json({ error: 'Failed to fetch deposit status', detail: err.message }, 500)
  }
})

/**
 * GET /clob/balance/:polygonAddress
 */
clobRoutes.get('/balance/:polygonAddress', async (c) => {
  const polygonAddress = c.req.param('polygonAddress')
  const session = sessions.get(polygonAddress.toLowerCase())

  if (!session) {
    return c.json(sessionExpired('predict_session'), 401)
  }

  try {
    let wrapMeta: {
      attempted: boolean
      wrapped: boolean
      amount: number
      txHash: string | null
      error: string | null
    } = { attempted: false, wrapped: false, amount: 0, txHash: null, error: null }

    // Auto-wrap any USDC.e sitting in the trading wallet (bridge deposits arrive as USDC.e)
    try {
      const wrapResult = await autoWrapUsdce(session)
      wrapMeta = { attempted: wrapResult.amount > 0, wrapped: wrapResult.wrapped, amount: wrapResult.amount, txHash: wrapResult.txHash, error: null }
      if (wrapResult.wrapped) {
        console.log(`[clob] Auto-wrapped ${wrapResult.amount} USDC.e before balance check`)
      }
    } catch (wrapErr: any) {
      wrapMeta = { attempted: true, wrapped: false, amount: 0, txHash: null, error: wrapErr.message ?? 'Auto-wrap failed' }
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
    return c.json({ balance, allowance, wrap: wrapMeta, raw: result })
  } catch (err: any) {
    console.error('[clob] Balance fetch failed:', err.message || err)
    return c.json(failedOperation('predict_session', 'Failed to fetch balance', err.message), 500)
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
    return c.json(failedOperation('wrap', 'Bad request', null), 400)
  }

  const { polygonAddress } = body
  if (!polygonAddress) {
    return c.json(failedOperation('wrap', 'Missing polygonAddress', null), 400)
  }

  if (!relayerBuilderConfig) {
    return c.json(failedOperation('wrap', 'Builder not configured', null), 500)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json(sessionExpired('wrap'), 401)
  }

  try {
    const result = await autoWrapUsdce(session)
    if (!result.wrapped) {
      return c.json(failedOperation('wrap', 'No USDC.e to wrap', null, 'failed'), 400)
    }

    return c.json(withOperation({ amountWrapped: result.amount, txHash: result.txHash }, {
      ok: true,
      operation: 'wrap',
      status: 'completed',
      userMessage: 'Cash is ready for Predict.',
      identifiers: {
        txHash: result.txHash ?? undefined,
        tradingAddress: session.tradingAddress,
        depositWalletAddress: session.depositWalletAddress ?? undefined,
      },
    }))
  } catch (err: any) {
    console.error('[clob] Wrap failed:', err.message || err)
    return c.json(failedOperation('wrap', 'Wrap failed', err.message), 500)
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
    return c.json(failedOperation('withdraw', 'Bad request', null), 400)
  }

  const { polygonAddress, amount, solanaAddress } = body
  if (!polygonAddress || !amount || !solanaAddress) {
    return c.json(failedOperation('withdraw', 'Missing required fields: polygonAddress, amount, solanaAddress', null), 400)
  }

  if (amount <= 0) {
    return c.json(failedOperation('withdraw', 'Amount must be positive', null), 400)
  }

  if (!relayerBuilderConfig) {
    return c.json(failedOperation('withdraw', 'Builder not configured', null), 500)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    return c.json(sessionExpired('withdraw'), 401)
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
      return c.json(failedOperation('withdraw', 'Bridge API error', text), 502)
    }

    const bridgeData = await bridgeRes.json() as Record<string, any>
    console.log(`[clob] Bridge withdraw response:`, JSON.stringify(bridgeData))

    // Bridge returns deposit address(es) — we need the EVM one to send USDC.e to
    const bridgeEvmAddress = bridgeData.address?.evm || bridgeData.depositAddress || bridgeData.address
    if (!bridgeEvmAddress || typeof bridgeEvmAddress !== 'string') {
      console.error('[clob] No EVM bridge address in response:', bridgeData)
      return c.json(failedOperation('withdraw', 'No bridge deposit address returned', null), 502)
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

    return c.json(withOperation({
      ok: true,
      amount,
      tradingAddress: session.tradingAddress,
      safeAddress: null,
      depositWalletAddress: session.depositWalletAddress ?? null,
      bridgeAddress: bridgeEvmAddress,
      solanaAddress,
      txHash,
    }, {
      ok: true,
      operation: 'withdraw',
      status: 'bridging',
      userMessage: 'Withdraw submitted. Bridge confirmation can take a few minutes.',
      identifiers: {
        txHash: txHash ?? undefined,
        bridgeAddress: bridgeEvmAddress,
        tradingAddress: session.tradingAddress,
        depositWalletAddress: session.depositWalletAddress ?? undefined,
      },
      retry: { canRetry: false, pollAfterMs: 15_000 },
    }))
  } catch (err: any) {
    console.error('[clob] Withdraw failed:', err.message || err)
    return c.json(failedOperation('withdraw', 'Withdraw failed', err.message), 500)
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

const REDEEM_INDEX_SETS = [1n, 2n] as const
const REDEEM_COLLATERALS = [
  { label: 'pUSD', address: CONTRACTS.PUSD },
  { label: 'USDC.e', address: CONTRACTS.USDC_E },
] as const

type RedeemCollateralBalance = {
  label: string
  collateralToken: string
  positions: {
    indexSet: string
    positionId: string
    balanceRaw: string
    balance: number
  }[]
  totalBalanceRaw: string
  totalBalance: number
}

function buildCtfRedeemData(collateralToken: string, conditionId: string) {
  return encodeFunctionData({
    abi: CTF_REDEEM_ABI,
    functionName: 'redeemPositions',
    args: [
      collateralToken as `0x${string}`,
      ZERO_BYTES32,
      conditionId as `0x${string}`,
      REDEEM_INDEX_SETS,
    ],
  })
}

async function getCtfPositionBalance(account: string, positionId: bigint): Promise<bigint> {
  const balanceData = encodeFunctionData({
    abi: ERC1155_BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [account as `0x${string}`, positionId],
  })
  const balanceRaw = await polygonProvider.call({ to: CONTRACTS.CTF, data: balanceData })
  return BigInt(balanceRaw)
}

async function getRedeemCollateralBalances(
  tradingAddress: string,
  conditionId: string,
): Promise<RedeemCollateralBalance[]> {
  const balances: RedeemCollateralBalance[] = []

  for (const collateral of REDEEM_COLLATERALS) {
    const positions: RedeemCollateralBalance['positions'] = []
    let totalBalanceRaw = 0n

    for (const indexSet of REDEEM_INDEX_SETS) {
      const collectionData = encodeFunctionData({
        abi: CTF_GET_COLLECTION_ID_ABI,
        functionName: 'getCollectionId',
        args: [ZERO_BYTES32, conditionId as `0x${string}`, indexSet],
      })
      const collectionId = await polygonProvider.call({ to: CONTRACTS.CTF, data: collectionData }) as `0x${string}`

      const positionData = encodeFunctionData({
        abi: CTF_GET_POSITION_ID_ABI,
        functionName: 'getPositionId',
        args: [collateral.address as `0x${string}`, collectionId],
      })
      const positionIdRaw = await polygonProvider.call({ to: CONTRACTS.CTF, data: positionData })
      const positionId = BigInt(positionIdRaw)
      const balanceRaw = await getCtfPositionBalance(tradingAddress, positionId)
      totalBalanceRaw += balanceRaw

      positions.push({
        indexSet: indexSet.toString(),
        positionId: positionId.toString(),
        balanceRaw: balanceRaw.toString(),
        balance: Number(balanceRaw) / 1e6,
      })
    }

    balances.push({
      label: collateral.label,
      collateralToken: collateral.address,
      positions,
      totalBalanceRaw: totalBalanceRaw.toString(),
      totalBalance: Number(totalBalanceRaw) / 1e6,
    })
  }

  return balances
}

function buildSetApprovalForAllTx(operator: string): Transaction {
  return {
    to: CONTRACTS.CTF,
    data: encodeFunctionData({
      abi: ERC1155_SET_APPROVAL_ABI,
      functionName: 'setApprovalForAll',
      args: [operator as `0x${string}`, true],
    }),
    value: '0',
  }
}

function isPusdCollateral(collateral: RedeemCollateralBalance) {
  return collateral.collateralToken.toLowerCase() === CONTRACTS.PUSD.toLowerCase()
}

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
  if (!session) {
    return c.json(sessionExpired('redeem'), 401)
  }
  const tradingAddress = session.tradingAddress

  const result: Record<string, unknown> = {
    polygonAddress,
    safeAddress: null,
    tradingAddress,
    walletMode: session.walletMode,
    conditionId,
    asset,
    hasActiveSession: !!session,
    ctf: CONTRACTS.CTF,
  }

  try {
    const balanceData = encodeFunctionData({
      abi: ERC1155_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [tradingAddress as `0x${string}`, BigInt(asset)],
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
    const collateralBalances = await getRedeemCollateralBalances(tradingAddress, conditionId)
    result.collateralBalances = collateralBalances
    result.selectedCollateral = collateralBalances.find((collateral) => BigInt(collateral.totalBalanceRaw) > 0n) ?? null
  } catch (err: any) {
    result.collateralBalancesError = err?.message ?? String(err)
  }

  try {
    const selectedCollateral = result.selectedCollateral as RedeemCollateralBalance | null | undefined
    const collateralToken = selectedCollateral?.collateralToken ?? CONTRACTS.PUSD
    await polygonProvider.call({
      from: tradingAddress,
      to: CONTRACTS.CTF,
      data: buildCtfRedeemData(collateralToken, conditionId),
    })
    result.simulationOk = true
    result.simulationCollateralToken = collateralToken
  } catch (err: any) {
    result.simulationOk = false
    result.simulationError = err?.reason ?? err?.message ?? String(err)
    result.simulationCode = err?.code ?? null
    result.simulationData = err?.data ?? null
  }

  console.log('[clob] Redeem debug:', result)
  return c.json(result)
})

clobRoutes.get('/relayer/transaction/:transactionId', async (c) => {
  const transactionId = c.req.param('transactionId')
  if (!transactionId?.trim()) return c.json({ error: 'Missing transactionId' }, 400)

  try {
    const relay = new RelayClient(RELAYER_URL, CHAIN_ID)
    const transaction = await relay.getTransaction(transactionId)
    console.log('[clob] Relayer transaction lookup:', { transactionId, transaction })
    return c.json({ transactionId, transaction })
  } catch (err: any) {
    console.error('[clob] Relayer transaction lookup failed:', {
      transactionId,
      message: err?.message,
      response: err?.response?.data ?? err?.response,
    })
    return c.json({
      error: 'Relayer transaction lookup failed',
      detail: err?.message,
      response: err?.response?.data ?? null,
    }, 502)
  }
})

clobRoutes.post('/redeem', async (c) => {
  console.log('[clob] Redeem route hit')

  let body: {
    polygonAddress?: string
    conditionId?: string
    asset?: string
    outcomeIndex?: number
    negativeRisk?: boolean
  }
  try {
    body = await c.req.json()
  } catch {
    console.warn('[clob] Redeem bad request: invalid JSON body')
    return c.json(failedOperation('redeem', 'Bad request', null), 400)
  }

  const { polygonAddress, conditionId, asset, outcomeIndex, negativeRisk } = body
  console.log('[clob] Redeem request:', {
    polygonAddress,
    conditionId: conditionId ? `${conditionId.slice(0, 10)}...${conditionId.slice(-6)}` : null,
    asset,
    outcomeIndex,
    negativeRisk,
  })

  if (!polygonAddress || !conditionId) {
    console.warn('[clob] Redeem missing fields:', {
      hasPolygonAddress: !!polygonAddress,
      hasConditionId: !!conditionId,
    })
    return c.json(failedOperation('redeem', 'Missing polygonAddress or conditionId', null), 400)
  }

  const session = sessions.get(polygonAddress.toLowerCase())
  if (!session) {
    console.warn(`[clob] Redeem no active session for ${polygonAddress}. Active sessions=${sessions.size}`)
    return c.json(sessionExpired('redeem'), 401)
  }

  if (!relayerBuilderConfig) {
    console.error('[clob] Redeem relayer not configured: missing POLYMARKET_BUILDER_* env vars')
    return c.json(failedOperation('redeem', 'Relayer not configured', null), 500)
  }

  try {
    console.log(`[clob] Redeem building tx: EOA=${session.eoaAddress}, ${session.walletMode}=${session.tradingAddress}, condition=${conditionId.slice(0, 10)}...`)

    let redeemMode: 'ctf' | 'neg-risk' = 'ctf'
    let collateralBalances: RedeemCollateralBalance[] = []
    let redeemableCollaterals: RedeemCollateralBalance[] = []
    let redeemContext: Record<string, unknown> = {}
    let redeemTxs: Transaction[] = []

    if (negativeRisk) {
      redeemMode = 'neg-risk'
      if (!asset) {
        return c.json(withOperation({
          error: 'Missing neg-risk redeem fields',
          detail: 'negativeRisk redeem requires asset',
        }, {
          ok: false,
          operation: 'redeem',
          status: 'failed',
          userMessage: 'This market needs one more position detail before it can be collected.',
          retry: { canRetry: true },
          lifecycleError: { code: 'PREDICT_REDEEM_FAILED' },
        }), 400)
      }

      let assetId: bigint
      try {
        assetId = BigInt(asset)
      } catch {
        return c.json(failedOperation('redeem', 'Invalid asset', 'asset must be a uint256 token ID string'), 400)
      }

      const assetBalanceRaw = await getCtfPositionBalance(session.tradingAddress, assetId)
      if (assetBalanceRaw === 0n) {
        return c.json(withOperation({
          error: 'No redeemable position balance',
          detail: 'No balance found for supplied neg-risk asset',
          asset,
          outcomeIndex,
          assetBalanceRaw: assetBalanceRaw.toString(),
        }, {
          ok: false,
          operation: 'redeem',
          status: 'failed',
          userMessage: 'No collectable balance was found for this pick.',
          retry: { canRetry: true },
          lifecycleError: { code: 'PREDICT_REDEEM_FAILED' },
        }), 400)
      }

      redeemContext = {
        mode: redeemMode,
        adapter: CONTRACTS.NEG_RISK_CTF_COLLATERAL_ADAPTER,
        asset,
        outcomeIndex,
        amountRaw: assetBalanceRaw.toString(),
      }
      redeemTxs = [
        buildSetApprovalForAllTx(CONTRACTS.NEG_RISK_CTF_COLLATERAL_ADAPTER),
        {
          to: CONTRACTS.NEG_RISK_CTF_COLLATERAL_ADAPTER,
          data: buildCtfRedeemData(CONTRACTS.USDC_E, conditionId),
          value: '0',
        },
      ]
    } else {
      collateralBalances = await getRedeemCollateralBalances(session.tradingAddress, conditionId)
      const positiveCollaterals = collateralBalances.filter((collateral) => BigInt(collateral.totalBalanceRaw) > 0n)
      const assetMatchedCollaterals = asset
        ? positiveCollaterals.filter((collateral) => collateral.positions.some((position) => position.positionId === asset))
        : []
      redeemableCollaterals = assetMatchedCollaterals.length > 0 ? assetMatchedCollaterals : positiveCollaterals

      console.log('[clob] Redeem collateral precheck:', {
        conditionId,
        tradingAddress: session.tradingAddress,
        asset,
        collateralBalances,
        selectedCollaterals: redeemableCollaterals,
      })

      if (redeemableCollaterals.length === 0) {
        console.warn('[clob] Redeem no position balance for supported collateral tokens:', {
          conditionId,
          tradingAddress: session.tradingAddress,
          asset,
          collateralBalances,
        })
        return c.json(withOperation({
          error: 'No redeemable position balance',
          detail: 'No position balance found for pUSD or USDC.e collateral token IDs for this condition',
          asset,
          collateralBalances,
        }, {
          ok: false,
          operation: 'redeem',
          status: 'failed',
          userMessage: 'No collectable balance was found for this pick.',
          retry: { canRetry: true },
          lifecycleError: { code: 'PREDICT_REDEEM_FAILED' },
        }), 400)
      }

      redeemContext = {
        mode: redeemMode,
        asset,
        collaterals: redeemableCollaterals.map((collateral) => ({
          label: collateral.label,
          collateralToken: collateral.collateralToken,
          totalBalanceRaw: collateral.totalBalanceRaw,
        })),
      }
      redeemTxs = redeemableCollaterals.map((collateral) => ({
        to: isPusdCollateral(collateral) ? CONTRACTS.CTF : CONTRACTS.CTF_COLLATERAL_ADAPTER,
        data: buildCtfRedeemData(collateral.collateralToken, conditionId),
        value: '0',
      }))
      if (redeemTxs.some((tx) => tx.to.toLowerCase() === CONTRACTS.CTF_COLLATERAL_ADAPTER.toLowerCase())) {
        redeemTxs = [buildSetApprovalForAllTx(CONTRACTS.CTF_COLLATERAL_ADAPTER), ...redeemTxs]
      }
    }

    try {
      for (const [i, redeemTx] of redeemTxs.entries()) {
        await polygonProvider.call({
          from: session.tradingAddress,
          to: redeemTx.to,
          data: redeemTx.data,
        })
        console.log('[clob] Redeem preflight simulation ok:', {
          mode: redeemMode,
          to: redeemTx.to,
          collateralToken: redeemableCollaterals[i]?.collateralToken,
          label: redeemableCollaterals[i]?.label,
        })
      }
    } catch (simErr: any) {
      console.error('[clob] Redeem preflight simulation failed:', {
        reason: simErr?.reason,
        message: simErr?.message,
        code: simErr?.code,
        data: simErr?.data,
        redeemContext,
        collateralBalances,
      })
      return c.json(withOperation({
        error: 'Redeem simulation failed',
        detail: simErr?.reason ?? simErr?.message ?? 'Redeem call would revert',
        code: simErr?.code ?? null,
        data: simErr?.data ?? null,
        redeemContext,
        collateralBalances,
      }, {
        ok: false,
        operation: 'redeem',
        status: 'failed',
        userMessage: 'Collect could not be submitted for this pick.',
        retry: { canRetry: true },
        lifecycleError: { code: 'PREDICT_REDEEM_FAILED' },
      }), 400)
    }

    console.log('[clob] Redeem relay execute:', {
      walletMode: session.walletMode,
      txCount: redeemTxs.length,
      ...redeemContext,
    })
    const { relay, relayInfo, execResult, response: execRes } = await submitTradingWalletCalls(
      session,
      redeemTxs,
      `Redeem positions for condition ${conditionId.slice(0, 10)}...`,
    )
    console.log('[clob] Redeem relay response:', {
      type: typeof execRes,
      keys: execRes && typeof execRes === 'object' ? Object.keys(execRes as unknown as Record<string, unknown>) : [],
      ...relayInfo,
    })
    console.log('[clob] Redeem relay wait result:', execResult ?? null)

    const txHash = execResult?.transactionHash ?? null
    if (!txHash) {
      let relayerTransaction: unknown = null
      if (relayInfo.transactionID) {
        try {
          relayerTransaction = await relay.getTransaction(relayInfo.transactionID)
          console.warn('[clob] Redeem failed relayer transaction:', relayerTransaction)
        } catch (lookupErr: any) {
          relayerTransaction = {
            error: lookupErr?.message ?? 'Relayer transaction lookup failed',
            response: lookupErr?.response?.data ?? null,
          }
        }
      }

      console.warn('[clob] Redeem relay completed without transaction hash; treating as not confirmed')
      return c.json(withOperation({
        error: 'Redeem not confirmed',
        detail: 'Relayer completed without returning a transaction hash',
        relayer: relayInfo,
        relayerTransaction,
        redeemContext,
        collateralBalances,
      }, {
        ok: false,
        operation: 'redeem',
        status: 'failed',
        userMessage: 'Collect was submitted but not confirmed. Refresh before trying again.',
        retry: { canRetry: true, pollAfterMs: 10_000 },
        lifecycleError: { code: 'PREDICT_REDEEM_FAILED' },
      }), 502)
    }

    console.log(`[clob] Redeemed positions for ${polygonAddress} condition=${conditionId.slice(0, 10)}... tx=${txHash}`)

    return c.json(withOperation({
      txHash,
      redeemContext,
      collateralBalances,
      redeemedCollaterals: redeemableCollaterals,
    }, {
      ok: true,
      operation: 'redeem',
      status: 'collecting',
      userMessage: 'Collect submitted. We will keep this pick visible until it confirms.',
      identifiers: {
        txHash,
        conditionId,
        tokenId: asset,
        relayerTransactionId: relayInfo.transactionID ?? undefined,
      },
      retry: { canRetry: false, pollAfterMs: 10_000 },
    }))
  } catch (err: any) {
    console.error('[clob] Redeem failed:', {
      message: err?.message,
      code: err?.code,
      response: err?.response?.data ?? err?.response,
      stack: err?.stack,
    })
    return c.json(failedOperation('redeem', 'Redeem failed', err.message), 500)
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
