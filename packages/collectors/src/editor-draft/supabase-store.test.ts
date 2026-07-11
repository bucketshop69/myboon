import assert from 'node:assert/strict'
import test from 'node:test'
import { __testing } from './supabase-store'

test('editor draft Entity reads include and normalize carousel selection', () => {
  const base = {
    id: 'entity-1',
    slug: 'bitcoin',
    name: 'Bitcoin',
    type: 'asset',
    aliases: ['BTC'],
    summary: null,
    status: 'active',
    metadata: {},
  }

  assert.match(__testing.ENTITY_SELECT, /show_in_carousel/)
  assert.equal(__testing.normalizeEntity(base).show_in_carousel, false)
  assert.equal(__testing.normalizeEntity({ ...base, show_in_carousel: true }).show_in_carousel, true)
})
