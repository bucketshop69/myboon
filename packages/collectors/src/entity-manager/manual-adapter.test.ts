import assert from 'node:assert/strict'
import test from 'node:test'
import { ManualEntityValidationError, normalizeManualEntityCommand } from './manual-adapter'

test('normalizes a manual Entity command into stable internal fields', () => {
  const command = normalizeManualEntityCommand({
    requestId: 'manual-test-001',
    actor: { kind: 'codex', name: 'Codex' },
    entity: {
      name: 'US and Iran',
      type: 'geopolitical_topic',
      aliases: ['US–Iran', 'US and Iran'],
      showInCarousel: true,
    },
    memories: [{
      memoryType: 'timeline_event',
      title: 'Negotiations resumed',
      summary: 'Officials resumed negotiations after a pause.',
      eventAt: '2026-06-01',
      sourceLabel: 'Research desk',
      sourceUrl: 'https://example.com/event',
    }],
  }, new Date('2026-07-14T10:00:00.000Z'))

  assert.equal(command.entity.slug, 'us-and-iran')
  assert.deepEqual(command.entity.aliases, ['US and Iran', 'US–Iran'])
  assert.equal(command.memories[0]?.eventAt, '2026-06-01T00:00:00.000Z')
  assert.equal(command.memories[0]?.observedAt, '2026-07-14T10:00:00.000Z')
  assert.equal(command.memories[0]?.sourceRefId, 'https://example.com/event')
})

test('rejects source markers and malformed manual input', () => {
  assert.throws(() => normalizeManualEntityCommand({
    requestId: 'manual-test-002',
    actor: { kind: 'dashboard', name: 'Founder' },
    entity: { name: 'Bitcoin', type: 'asset' },
    memories: [{
      memoryType: 'source_marker',
      title: 'Hidden marker',
      summary: 'Not permitted.',
      eventAt: '2026-07-14',
    }],
  }), ManualEntityValidationError)
})
