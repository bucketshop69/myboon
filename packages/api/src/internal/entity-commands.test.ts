import assert from 'node:assert/strict'
import test from 'node:test'
import entityManager from '@myboon/collectors/entity-manager'
import { createInternalEntityCommandRoutes } from './entity-commands.js'
import type { EntityCommandService } from './entity-commands.js'

const { ManualEntityConflictError, ManualEntityValidationError } = entityManager

const token = 'w'.repeat(48)
const command = {
  requestId: 'manual-api-001',
  actor: { kind: 'codex', name: 'Codex' },
  entity: { name: 'US and Iran', type: 'geopolitical_topic' },
  memories: [],
}

function service(): EntityCommandService {
  return {
    async previewManual(input) {
      return {
        requestId: 'manual-api-001',
        command: input as never,
        entity: {
          action: 'create',
          existingEntityId: null,
          currentUpdatedAt: null,
          slug: 'us-and-iran',
          name: 'US and Iran',
          type: 'geopolitical_topic',
          aliases: ['US and Iran'],
          summary: null,
          status: 'active',
          showInCarousel: false,
          metadata: {},
          changes: ['entity'],
        },
        memories: [],
        warnings: [],
        planHash: 'preview-hash',
      }
    },
    async applyManual(_input, previewHash) {
      assert.equal(previewHash, 'preview-hash')
      return {
        requestId: 'manual-api-001',
        entity: {
          id: 'entity-1',
          slug: 'us-and-iran',
          name: 'US and Iran',
          type: 'geopolitical_topic',
          aliases: ['US and Iran'],
          summary: null,
          status: 'active',
          show_in_carousel: false,
          metadata: {},
        },
        memoriesWritten: 0,
        duplicateMemoriesSkipped: 0,
        auditMarkerWritten: true,
        replayed: false,
      }
    },
  }
}

function request(path: string, body: unknown, authorization = `Bearer ${token}`) {
  return createInternalEntityCommandRoutes({ internalWriteToken: token, service: service() }).request(path, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('manual Entity command routes require a separate strong write token', async () => {
  assert.equal((await request('/preview', { command }, '')).status, 401)
  const unavailable = createInternalEntityCommandRoutes({ internalWriteToken: 'short', service: service() })
  assert.equal((await unavailable.request('/preview', { method: 'POST' })).status, 503)
})

test('manual Entity command routes preview and apply through the injected service', async () => {
  const preview = await request('/preview', { command })
  assert.equal(preview.status, 200)
  assert.equal((await preview.json() as { planHash: string }).planHash, 'preview-hash')

  const apply = await request('/apply', { command, previewHash: 'preview-hash' })
  assert.equal(apply.status, 200)
  assert.equal((await apply.json() as { entity: { id: string } }).entity.id, 'entity-1')
})

test('manual Entity command routes map validation and stale-preview errors', async () => {
  const validationService: EntityCommandService = {
    async previewManual() { throw new ManualEntityValidationError('Bad command') },
    async applyManual() { throw new ManualEntityConflictError('Stale preview') },
  }
  const app = createInternalEntityCommandRoutes({ internalWriteToken: token, service: validationService })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  assert.equal((await app.request('/preview', { method: 'POST', headers, body: JSON.stringify({ command }) })).status, 400)
  assert.equal((await app.request('/apply', { method: 'POST', headers, body: JSON.stringify({ command, previewHash: 'hash' }) })).status, 409)
})
