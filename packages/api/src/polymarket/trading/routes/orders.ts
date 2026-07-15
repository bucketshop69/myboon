import type { Hono } from 'hono'
import { OrderType, Side } from '@polymarket/clob-client-v2'
import type { SignedOrder } from '@polymarket/clob-client-v2'
import { cancelStatusFromProviderPayload, type PredictOperation } from '../../lifecycle.js'
import { BUILDER_CODE, roundDown } from '../contracts.js'
import {
  failedOperation,
  orderIdFromResult,
  safeOrderPayload,
  sessionExpired,
  withOperation,
} from '../operations.js'
import { getClient, sessions } from '../sessions.js'

export function registerOrderRoutes(routes: Hono) {
  routes.post('/order', async (c) => {
    let body: {
      polygonAddress?: string
      tokenID?: string
      price?: number
      size?: number
      amount?: number
      side?: 'BUY' | 'SELL'
      negRisk?: boolean
      orderType?: 'GTC' | 'GTD' | 'FOK' | 'FAK'
      signedOrder?: SignedOrder
    }
    try {
      body = await c.req.json()
    } catch {
      return c.json(failedOperation('buy', 'Bad request', null), 400)
    }

    const { polygonAddress, tokenID, price, size, amount, side, negRisk, orderType, signedOrder } = body
    const operation: PredictOperation = side === 'SELL' ? 'sell' : 'buy'
    const resolvedOrderType = orderType === 'FAK'
      ? OrderType.FAK
      : orderType === 'FOK'
        ? OrderType.FOK
        : orderType === 'GTD'
          ? OrderType.GTD
          : OrderType.GTC
    const isMarketOrder = resolvedOrderType === OrderType.FOK || resolvedOrderType === OrderType.FAK

    if (!polygonAddress || !side || (!signedOrder && (!tokenID || typeof price !== 'number'))) {
      return c.json(failedOperation(operation, 'Missing required fields: polygonAddress, tokenID, price, side', null), 400)
    }
    if (!signedOrder && !isMarketOrder && typeof size !== 'number') {
      return c.json(failedOperation(operation, 'Missing required field: size', null), 400)
    }
    const marketAmount = isMarketOrder
      ? typeof amount === 'number'
        ? amount
        : side === 'BUY' && typeof size === 'number' && typeof price === 'number'
          ? size * price
          : size
      : null
    if (!signedOrder && isMarketOrder && (typeof marketAmount !== 'number' || !Number.isFinite(marketAmount) || marketAmount <= 0)) {
      return c.json(failedOperation(operation, 'Missing required field: amount', null), 400)
    }

    const session = sessions.get(polygonAddress.toLowerCase())
    if (!session) return c.json(sessionExpired(operation), 401)

    try {
      const client = getClient(session)
      const clobSide = side === 'BUY' ? Side.BUY : Side.SELL
      let result: any
      if (signedOrder) {
        result = await client.postOrder(signedOrder, resolvedOrderType)
      } else if (isMarketOrder) {
        const marketOrderType = resolvedOrderType === OrderType.FAK ? OrderType.FAK : OrderType.FOK
        const normalizedMarketAmount = roundDown(marketAmount as number, 2)
        if (normalizedMarketAmount <= 0) {
          return c.json(failedOperation(operation, 'Amount is too small after precision rounding', null), 400)
        }
        result = await client.createAndPostMarketOrder({
          tokenID: tokenID as string,
          price: price as number,
          amount: normalizedMarketAmount,
          side: clobSide,
          orderType: marketOrderType,
          builderCode: BUILDER_CODE,
        }, { tickSize: '0.01', negRisk: !!negRisk }, marketOrderType)
      } else {
        const limitOrderType = resolvedOrderType === OrderType.GTD ? OrderType.GTD : OrderType.GTC
        result = await client.createAndPostOrder({
          tokenID: tokenID as string,
          price: price as number,
          size: size as number,
          side: clobSide,
          builderCode: BUILDER_CODE,
        }, { tickSize: '0.01', negRisk: !!negRisk }, limitOrderType)
      }

      if (result?.error || result?.errorMsg || result?.status === 'error' || result?.success === false) {
        const detail = result.error || result.errorMsg || result.message || JSON.stringify(result)
        console.error(`[clob] CLOB rejected deposit-wallet order for ${polygonAddress}:`, detail)
        const status = isMarketOrder && /FOK_ORDER_NOT_FILLED|not filled|liquidity/iu.test(detail) ? 'not_filled' : 'failed'
        return c.json(failedOperation(operation, 'Order rejected by CLOB', detail, status), 400)
      }

      console.log(`[clob] Deposit-wallet order posted for ${polygonAddress}: ${side}`)
      const orderId = orderIdFromResult(result)
      const payload = safeOrderPayload(result)
      return c.json(withOperation(payload, {
        ok: true,
        operation,
        status: isMarketOrder ? 'filled' : 'waiting_to_match',
        userMessage: isMarketOrder
          ? 'Pick filled at the best available market price.'
          : 'Pick submitted and waiting to match.',
        identifiers: { orderId, tokenId: tokenID ?? signedOrder?.tokenId },
        retry: isMarketOrder ? undefined : { canRetry: false, pollAfterMs: 5_000 },
        rawProviderPayload: result,
      }))
    } catch (err: any) {
      console.error('[clob] Deposit-wallet order failed:', err.message || err)
      return c.json(failedOperation(operation, 'Order failed', err.message), 500)
    }
  })

  routes.get('/positions/:polygonAddress', async (c) => {
    const polygonAddress = c.req.param('polygonAddress')
    const session = sessions.get(polygonAddress.toLowerCase())
    if (!session) return c.json(sessionExpired('predict_session'), 401)
    try {
      const orders = await getClient(session).getOpenOrders()
      return c.json({ orders: orders ?? [] })
    } catch (err: any) {
      console.error('[clob] Positions fetch failed:', err.message || err)
      return c.json(failedOperation('predict_session', 'Failed to fetch positions', err.message), 500)
    }
  })

  routes.delete('/order/:orderId', async (c) => {
    const orderId = c.req.param('orderId')
    const polygonAddress = c.req.query('address')
    if (!polygonAddress) return c.json(failedOperation('cancel', 'Missing address query param', null), 400)
    const session = sessions.get(polygonAddress.toLowerCase())
    if (!session) return c.json(sessionExpired('cancel'), 401)
    try {
      const result = await getClient(session).cancelOrder({ orderID: orderId })
      const cancelStatus = cancelStatusFromProviderPayload(result, orderId)
      console.log(`[clob] Order cancel result ${cancelStatus.status}: ${orderId} for ${polygonAddress}`)
      const payload = cancelStatus.error ? { error: cancelStatus.error } : {}
      return c.json(withOperation(payload, {
        ok: cancelStatus.ok,
        operation: 'cancel',
        status: cancelStatus.status,
        userMessage: cancelStatus.userMessage,
        identifiers: { orderId },
        retry: cancelStatus.status === 'cancel_requested' ? { canRetry: false, pollAfterMs: 5_000 } : undefined,
        ...(cancelStatus.ok ? {} : { lifecycleError: { code: 'PREDICT_CANCEL_FAILED' } }),
        rawProviderPayload: result,
      }), cancelStatus.ok ? 200 : 400)
    } catch (err: any) {
      console.error('[clob] Cancel failed:', err.message || err)
      return c.json(failedOperation('cancel', 'Cancel failed', err.message), 500)
    }
  })
}
