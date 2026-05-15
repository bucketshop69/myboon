export type PredictOperation =
  | 'predict_setup'
  | 'buy'
  | 'sell'
  | 'cancel'
  | 'redeem'
  | 'withdraw'
  | 'deposit'
  | 'wrap'
  | 'predict_session'

export type PredictOperationStatus =
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

export type PredictOperationIdentifiers = {
  orderId?: string
  tokenId?: string
  conditionId?: string
  txHash?: string
  bridgeAddress?: string
  relayerTransactionId?: string
  tradingAddress?: string
  depositWalletAddress?: string
}

export type PredictOperationEnvelope = {
  ok: boolean
  operationId: string
  operation: PredictOperation
  status: PredictOperationStatus
  userMessage: string
  identifiers?: PredictOperationIdentifiers
  retry?: { canRetry: boolean; retryAfterMs?: number; pollAfterMs?: number }
  lifecycleError?: { code: string; detailsId?: string }
}

export type StoredPredictOperation = PredictOperationEnvelope & Record<string, unknown> & {
  createdAt: number
  updatedAt: number
  rawProviderPayload?: unknown
}

export type OperationStoreLookup = {
  operationId?: string
  identifiers?: PredictOperationIdentifiers
}

const OPERATION_TTL_MS = 24 * 60 * 60 * 1000
const operationStore = new Map<string, StoredPredictOperation>()

export function createOperationId(operation: PredictOperation) {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `op_${operation}_${Date.now()}_${suffix}`
}

function compactIdentifiers(identifiers?: PredictOperationIdentifiers): PredictOperationIdentifiers | undefined {
  if (!identifiers) return undefined
  const entries = Object.entries(identifiers).filter(([, value]) => typeof value === 'string' && value.length > 0)
  return entries.length > 0 ? Object.fromEntries(entries) as PredictOperationIdentifiers : undefined
}

function sanitizeOperation(operation: StoredPredictOperation): PredictOperationEnvelope {
  const safeOperation: Record<string, unknown> = {
    ok: operation.ok,
    operationId: operation.operationId,
    operation: operation.operation,
    status: operation.status,
    userMessage: operation.userMessage,
    ...(operation.identifiers ? { identifiers: operation.identifiers } : {}),
    ...(operation.retry ? { retry: operation.retry } : {}),
    ...(operation.lifecycleError ? { lifecycleError: operation.lifecycleError } : {}),
  }

  for (const key of [
    'orderID',
    'orderId',
    'polygonAddress',
    'walletMode',
    'tradingAddress',
    'safeAddress',
    'depositWalletAddress',
    'amount',
    'amountWrapped',
    'bridgeAddress',
    'solanaAddress',
    'txHash',
  ]) {
    const value = operation[key]
    if (typeof value === 'string' || typeof value === 'number' || value === null) safeOperation[key] = value
  }

  return safeOperation as PredictOperationEnvelope
}

function matchesIdentifiers(
  operation: StoredPredictOperation,
  identifiers?: PredictOperationIdentifiers,
) {
  const query = compactIdentifiers(identifiers)
  if (!query || !operation.identifiers) return false

  return Object.entries(query).every(([key, value]) => {
    const current = operation.identifiers?.[key as keyof PredictOperationIdentifiers]
    return typeof current === 'string' && current.toLowerCase() === value.toLowerCase()
  })
}

export function cleanOperationStore(now = Date.now()) {
  for (const [operationId, operation] of operationStore) {
    if (now - operation.updatedAt > OPERATION_TTL_MS) operationStore.delete(operationId)
  }
}

export function storeOperation(
  envelope: PredictOperationEnvelope,
  rawProviderPayload?: unknown,
): PredictOperationEnvelope {
  const now = Date.now()
  operationStore.set(envelope.operationId, {
    ...envelope,
    identifiers: compactIdentifiers(envelope.identifiers),
    createdAt: operationStore.get(envelope.operationId)?.createdAt ?? now,
    updatedAt: now,
    ...(rawProviderPayload === undefined ? {} : { rawProviderPayload }),
  })
  return envelope
}

export function getStoredOperation(operationId: string): PredictOperationEnvelope | null {
  cleanOperationStore()
  const operation = operationStore.get(operationId)
  return operation ? sanitizeOperation(operation) : null
}

export function findStoredOperation(lookup: OperationStoreLookup): PredictOperationEnvelope | null {
  cleanOperationStore()
  if (lookup.operationId) {
    const operation = getStoredOperation(lookup.operationId)
    if (operation || !lookup.identifiers) return operation
  }

  for (const operation of operationStore.values()) {
    if (matchesIdentifiers(operation, lookup.identifiers)) return sanitizeOperation(operation)
  }
  return null
}

function valuesFromProviderCollection(collection: unknown): string[] {
  if (Array.isArray(collection)) {
    return collection
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry === 'object') {
          const value = entry as Record<string, unknown>
          return value.orderID ?? value.orderId ?? value.id
        }
        return null
      })
      .filter((value): value is string => typeof value === 'string')
  }

  if (collection && typeof collection === 'object') {
    return Object.entries(collection as Record<string, unknown>)
      .filter(([, value]) => value !== false && value !== null && value !== undefined)
      .map(([key]) => key)
  }

  return []
}

export function providerCollectionIncludesOrder(collection: unknown, orderId: string) {
  const normalized = orderId.toLowerCase()
  return valuesFromProviderCollection(collection).some((value) => value.toLowerCase() === normalized)
}

export function cancelStatusFromProviderPayload(
  result: unknown,
  orderId: string,
): { ok: boolean; status: PredictOperationStatus; userMessage: string; error?: string } {
  const payload = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  const cancelled = providerCollectionIncludesOrder(payload.canceled ?? payload.cancelled, orderId)
  const notCancelled = providerCollectionIncludesOrder(payload.not_canceled ?? payload.notCancelled, orderId)

  if (cancelled) {
    return {
      ok: true,
      status: 'cancelled',
      userMessage: 'Pick cancelled. Reserved cash should be available again shortly.',
    }
  }

  if (notCancelled || payload.error || payload.errorMsg || payload.success === false) {
    const error = typeof payload.error === 'string'
      ? payload.error
      : typeof payload.errorMsg === 'string'
        ? payload.errorMsg
        : typeof payload.message === 'string'
          ? payload.message
          : 'Cancel was not accepted by Polymarket.'
    return {
      ok: false,
      status: 'failed',
      userMessage: 'Cancel failed. Refresh your picks and try again.',
      error,
    }
  }

  return {
    ok: true,
    status: 'cancel_requested',
    userMessage: 'Cancel requested. We will keep this pick visible until Polymarket confirms it.',
  }
}
