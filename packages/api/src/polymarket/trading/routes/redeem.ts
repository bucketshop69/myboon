import type { Hono } from 'hono'
import type { DepositWalletBatchRequest, Transaction } from '@polymarket/builder-relayer-client'
import { RelayClient } from '@polymarket/builder-relayer-client'
import { encodeFunctionData } from 'viem'
import {
  CHAIN_ID,
  CONTRACTS,
  CTF_PAYOUT_DENOMINATOR_ABI,
  ERC1155_BALANCE_OF_ABI,
  polygonProvider,
  RELAYER_URL,
} from '../contracts.js'
import { failedOperation, sessionExpired, withOperation } from '../operations.js'
import {
  buildCtfRedeemData,
  buildSetApprovalForAllTx,
  getCtfPositionBalance,
  getRedeemCollateralBalances,
  isPusdCollateral,
  type RedeemCollateralBalance,
} from '../redeem.js'
import { sessions } from '../sessions.js'
import { prepareTradingWalletCalls, relayerBuilderConfig, submitSignedDepositWalletBatch } from '../wallet.js'

export function registerRedeemRoutes(routes: Hono) {
  routes.post('/redeem/debug', async (c) => {
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
    if (!session) return c.json(sessionExpired('redeem'), 401)
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

  routes.get('/relayer/transaction/:transactionId', async (c) => {
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

  routes.post('/redeem', async (c) => {
    console.log('[clob] Redeem route hit')
    let body: {
      polygonAddress?: string
      conditionId?: string
      asset?: string
      outcomeIndex?: number
      negativeRisk?: boolean
      batch?: DepositWalletBatchRequest
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
      if (body.batch) {
        const { relay, relayInfo, execResult } = await submitSignedDepositWalletBatch(session, body.batch)
        const txHash = execResult?.transactionHash ?? null
        if (!txHash) {
          let relayerTransaction: unknown = null
          if (relayInfo.transactionID) {
            try {
              relayerTransaction = await relay.getTransaction(relayInfo.transactionID)
            } catch (lookupErr: any) {
              relayerTransaction = {
                error: lookupErr?.message ?? 'Relayer transaction lookup failed',
                response: lookupErr?.response?.data ?? null,
              }
            }
          }
          return c.json(withOperation({
            error: 'Redeem not confirmed',
            detail: 'Relayer completed without returning a transaction hash',
            relayer: relayInfo,
            relayerTransaction,
          }, {
            ok: false,
            operation: 'redeem',
            status: 'failed',
            userMessage: 'Collect was submitted but not confirmed. Refresh before trying again.',
            retry: { canRetry: true, pollAfterMs: 10_000 },
            lifecycleError: { code: 'PREDICT_REDEEM_FAILED' },
          }), 502)
        }
        return c.json(withOperation({ txHash }, {
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
      }

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
          await polygonProvider.call({ from: session.tradingAddress, to: redeemTx.to, data: redeemTx.data })
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
      const { signatureRequest } = await prepareTradingWalletCalls(session, redeemTxs, 'redeem')
      console.log(`[clob] Redeem signature required for ${polygonAddress} condition=${conditionId.slice(0, 10)}...`)
      return c.json(withOperation({
        signatureRequest,
        redeemContext,
        collateralBalances,
        redeemedCollaterals: redeemableCollaterals,
      }, {
        ok: false,
        operation: 'redeem',
        status: 'needs_signature',
        userMessage: 'Sign once to collect this payout.',
        identifiers: { conditionId, tokenId: asset },
        retry: { canRetry: true },
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
}
