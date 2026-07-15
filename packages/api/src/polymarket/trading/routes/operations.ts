import type { Hono } from 'hono'
import {
  findStoredOperation,
  getStoredOperation,
  type OperationStoreLookup,
  type PredictOperationIdentifiers,
} from '../../lifecycle.js'

export function registerOperationRoutes(routes: Hono) {
  routes.get('/operation/:operationId', async (c) => {
    const operationId = c.req.param('operationId')
    const operation = getStoredOperation(operationId)
    if (!operation) return c.json({ ok: false, error: 'Operation not found' }, 404)
    return c.json(operation)
  })

  routes.post('/operations/reconcile', async (c) => {
    let body: {
      operationIds?: unknown
      operations?: unknown
      identifiers?: PredictOperationIdentifiers
    }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ ok: false, error: 'Bad request' }, 400)
    }

    const lookups: OperationStoreLookup[] = []
    if (Array.isArray(body.operationIds)) {
      for (const operationId of body.operationIds) {
        if (typeof operationId === 'string') lookups.push({ operationId })
      }
    }
    if (Array.isArray(body.operations)) {
      for (const entry of body.operations) {
        if (!entry || typeof entry !== 'object') continue
        const item = entry as Record<string, unknown>
        lookups.push({
          operationId: typeof item.operationId === 'string' ? item.operationId : undefined,
          identifiers: item.identifiers && typeof item.identifiers === 'object'
            ? item.identifiers as PredictOperationIdentifiers
            : undefined,
        })
      }
    }
    if (body.identifiers && typeof body.identifiers === 'object') lookups.push({ identifiers: body.identifiers })

    const operations = lookups
      .map((lookup) => ({ lookup, operation: findStoredOperation(lookup) }))
      .filter((result) => result.operation)

    return c.json({ ok: true, operations })
  })
}
