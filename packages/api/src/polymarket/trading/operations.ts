import {
  createOperationId,
  storeOperation,
  type PredictOperation,
  type PredictOperationEnvelope,
  type PredictOperationStatus,
} from '../lifecycle.js'

export function withOperation<T extends Record<string, unknown>>(
  payload: T,
  args: Omit<PredictOperationEnvelope, 'operationId'> & { operationId?: string; rawProviderPayload?: unknown },
): T & PredictOperationEnvelope {
  const operationId = args.operationId ?? createOperationId(args.operation)
  const envelope = {
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
  return storeOperation(envelope, args.rawProviderPayload) as T & PredictOperationEnvelope
}

export function sessionExpired(operation: PredictOperation = 'predict_session') {
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

export function orderIdFromResult(result: any): string | undefined {
  const id = result?.orderID ?? result?.orderId ?? result?.id
  return typeof id === 'string' ? id : undefined
}

export function safeOrderPayload(result: any) {
  const orderId = orderIdFromResult(result)
  return {
    ...(orderId ? { orderID: orderId, orderId } : {}),
  }
}

function stableErrorCode(operation: PredictOperation, detail: string) {
  if (/FOK_ORDER_NOT_FILLED|not filled|fill[- ]?or[- ]?kill|liquidity/iu.test(detail)) {
    return operation === 'buy' ? 'PREDICT_BUY_NOT_FILLED' : 'PREDICT_ORDER_NOT_FILLED'
  }
  if (/balance|allowance|insufficient funds/iu.test(detail)) return 'PREDICT_INSUFFICIENT_FUNDS'
  if (/builder|relayer/iu.test(detail)) return 'PREDICT_RELAYER_UNAVAILABLE'
  return `PREDICT_${operation.toUpperCase()}_FAILED`
}

export function failedOperation(
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
