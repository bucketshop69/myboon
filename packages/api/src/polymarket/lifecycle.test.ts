import assert from 'node:assert/strict'
import {
  cancelStatusFromProviderPayload,
  findStoredOperation,
  storeOperation,
  type PredictOperationEnvelope,
} from './lifecycle.js'

function operation(overrides: Partial<PredictOperationEnvelope> = {}): PredictOperationEnvelope {
  return {
    ok: true,
    operationId: `op_test_${Math.random().toString(36).slice(2)}`,
    operation: 'buy',
    status: 'waiting_to_match',
    userMessage: 'submitted',
    identifiers: { orderId: 'order-1', tokenId: 'token-1' },
    ...overrides,
  }
}

assert.equal(
  cancelStatusFromProviderPayload({ canceled: ['order-1'] }, 'order-1').status,
  'cancelled',
)
assert.equal(
  cancelStatusFromProviderPayload({ canceled: { 'order-1': true } }, 'order-1').status,
  'cancelled',
)

const notCancelled = cancelStatusFromProviderPayload({ not_canceled: ['order-1'] }, 'order-1')
assert.equal(notCancelled.ok, false)
assert.equal(notCancelled.status, 'failed')

const notCancelledMap = cancelStatusFromProviderPayload({ not_canceled: { 'order-1': 'not found' } }, 'order-1')
assert.equal(notCancelledMap.ok, false)
assert.equal(notCancelledMap.status, 'failed')

assert.equal(
  cancelStatusFromProviderPayload({ success: true }, 'order-1').status,
  'cancel_requested',
)

const stored = storeOperation(
  {
    ...operation({ operationId: 'op_test_store_1' }),
    orderID: 'order-1',
    detail: 'provider detail must stay server-side',
    error: 'provider error must stay server-side',
    relayer: { provider: 'raw' },
  } as PredictOperationEnvelope & Record<string, unknown>,
  { providerSecret: 'server-only' },
)
assert.equal(findStoredOperation({ operationId: stored.operationId })?.operationId, stored.operationId)
assert.equal(findStoredOperation({ identifiers: { orderId: 'order-1' } })?.operationId, stored.operationId)
const safeStored = findStoredOperation({ operationId: stored.operationId }) as Record<string, unknown>
assert.equal(safeStored.orderID, 'order-1')
assert.equal(safeStored.rawProviderPayload, undefined)
assert.equal(safeStored.detail, undefined)
assert.equal(safeStored.error, undefined)
assert.equal(safeStored.relayer, undefined)

console.log('lifecycle tests passed')
