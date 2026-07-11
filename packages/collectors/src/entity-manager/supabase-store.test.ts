import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseEntityMemoryStore, __testing } from './supabase-store'
import type { EntityInput, EntityRecord } from './types'

const baseEntity: EntityRecord = {
  id: 'entity-1',
  slug: 'bitcoin',
  name: 'Bitcoin',
  type: 'asset',
  aliases: ['BTC'],
  summary: 'A decentralized cryptocurrency.',
  status: 'active',
  show_in_carousel: false,
  metadata: { symbol: 'BTC' },
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

test('entity row normalization defaults the carousel flag to false and preserves true', () => {
  const { show_in_carousel: _flag, ...legacyRow } = baseEntity

  assert.equal(__testing.normalizeEntity(legacyRow).show_in_carousel, false)
  assert.equal(__testing.normalizeEntity({ ...legacyRow, show_in_carousel: true }).show_in_carousel, true)
  assert.match(__testing.ENTITY_SELECT, /show_in_carousel/)
})

test('createEntities uses database defaults without sending or nulling carousel selection', async () => {
  const input: EntityInput = {
    slug: 'bitcoin',
    name: 'Bitcoin',
    type: 'asset',
    aliases: ['BTC'],
    summary: 'A decentralized cryptocurrency.',
    status: 'active',
    metadata: { symbol: 'BTC' },
  }
  const db = {
    from(table: string) {
      assert.equal(table, 'entities')
      return {
        upsert(payload: EntityInput[], options: Record<string, unknown>) {
          assert.deepEqual(payload, [input])
          assert.equal(Object.hasOwn(payload[0], 'show_in_carousel'), false)
          assert.deepEqual(options, { onConflict: 'slug', defaultToNull: false })
          return {
            async select(columns: string) {
              assert.equal(columns, __testing.ENTITY_SELECT)
              return {
                data: [{ ...baseEntity, show_in_carousel: false }],
                error: null,
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient

  const store = new SupabaseEntityMemoryStore(db)
  const created = await store.createEntities([input])

  assert.equal(created[0].show_in_carousel, false)
})

test('updateEntity persists carousel selection changes', async () => {
  const updatePayloads: Array<Record<string, unknown>> = []
  const db = {
    from(table: string) {
      assert.equal(table, 'entities')
      return {
        update(payload: Record<string, unknown>) {
          updatePayloads.push(payload)
          return {
            eq(column: string, value: string) {
              assert.equal(column, 'id')
              assert.equal(value, baseEntity.id)
              return {
                select(columns: string) {
                  assert.equal(columns, __testing.ENTITY_SELECT)
                  return {
                    async single() {
                      return {
                        data: { ...baseEntity, ...payload },
                        error: null,
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient

  const store = new SupabaseEntityMemoryStore(db)
  const updated = await store.updateEntity({ ...baseEntity, show_in_carousel: true })
  const removed = await store.updateEntity({ ...updated, show_in_carousel: false })

  assert.equal(updatePayloads[0]?.show_in_carousel, true)
  assert.equal(updatePayloads[1]?.show_in_carousel, false)
  assert.equal(updated.show_in_carousel, true)
  assert.equal(removed.show_in_carousel, false)
})
