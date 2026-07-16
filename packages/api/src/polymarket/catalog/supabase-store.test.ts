import assert from 'node:assert/strict'
import test from 'node:test'
import { PolymarketCatalogConflictError } from './contracts.js'
import { SupabasePolymarketCatalogStore } from './supabase-store.js'

const collectionRow = {
  collection_key: 'featured',
  name: 'Featured markets',
  description: null,
  is_enabled: true,
  default_limit: 20,
  created_at: '2026-07-15T00:00:00.000Z',
  updated_at: '2026-07-15T00:00:00.000Z',
}

const releaseRow = {
  id: '00000000-0000-4000-8000-000000000001',
  version: 1,
  revision: 1,
  status: 'published',
  note: null,
  created_by: 'migration',
  published_by: 'migration',
  created_at: '2026-07-15T00:00:00.000Z',
  updated_at: '2026-07-15T00:00:00.000Z',
  published_at: '2026-07-15T00:00:00.000Z',
}

test('reads the collection graph through service-role-only REST requests', async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    requests.push({ url, init })
    if (url.pathname.endsWith('/polymarket_catalog_collections')) return Response.json([collectionRow])
    if (url.pathname.endsWith('/polymarket_catalog_releases')) return Response.json([releaseRow])
    if (url.pathname.endsWith('/polymarket_catalog_items')) return Response.json([{
      id: 'item-1',
      release_id: releaseRow.id,
      source_kind: 'event',
      source_slug: 'match-one',
      source_id: '42',
      condition_id: null,
      title: 'Match one',
      category: 'sports',
      sport: 'cricket',
      position: 0,
      is_enabled: true,
      active_from: null,
      active_until: null,
      display_overrides: {},
    }])
    throw new Error(`Unexpected request ${url}`)
  }

  const store = new SupabasePolymarketCatalogStore('https://project.supabase.co', 'service-key', fetchImpl)
  const state = await store.getCollection('featured')

  assert.equal(state?.published?.items[0]?.sourceSlug, 'match-one')
  assert.equal(state?.draft, null)
  assert.equal(requests.length, 3)
  for (const request of requests) {
    assert.equal((request.init?.headers as Record<string, string>).Authorization, 'Bearer service-key')
  }
})

test('maps database revision conflicts to the catalog conflict contract', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/rpc/save_polymarket_catalog_draft')) {
      return new Response(JSON.stringify({ code: '40001', message: 'catalog draft revision conflict' }), { status: 400 })
    }
    throw new Error(`Unexpected request ${url}`)
  }
  const store = new SupabasePolymarketCatalogStore('https://project.supabase.co', 'service-key', fetchImpl)

  await assert.rejects(
    store.saveDraft({ key: 'featured', expectedRevision: 2, items: [], actor: 'dashboard' }),
    PolymarketCatalogConflictError,
  )
})
