import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  PolymarketCatalogCollectionState,
  PolymarketCatalogStore,
} from '../catalog/contracts.js'
import { createPolymarketCollectionRoutes } from './collections.js'

const state: PolymarketCatalogCollectionState = {
  collection: {
    key: 'featured',
    name: 'Featured markets',
    description: 'Selected markets',
    isEnabled: true,
    defaultLimit: 20,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T01:00:00.000Z',
  },
  draft: null,
  published: {
    id: 'release-1',
    version: 1,
    revision: 1,
    status: 'published',
    note: null,
    createdBy: 'migration',
    publishedBy: 'migration',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    publishedAt: '2026-07-15T00:00:00.000Z',
    items: [],
  },
  hasUnpublishedChanges: false,
}

function store(value: PolymarketCatalogCollectionState | null = state): PolymarketCatalogStore {
  return {
    async getCollection() { return value },
    async saveDraft() { throw new Error('not used') },
    async publish() { throw new Error('not used') },
  }
}

test('serves only the published collection through the new public collection route', async () => {
  let requestedLimit: number | undefined
  const app = createPolymarketCollectionRoutes({
    store: store(),
    async hydrate(release, options) {
      assert.equal(release.status, 'published')
      requestedLimit = options?.limit
      return { items: [], categories: [] }
    },
  })

  const response = await app.request('/featured')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control') ?? '', /stale-while-revalidate/)
  assert.equal(requestedLimit, 20)
  assert.deepEqual(await response.json(), {
    collection: {
      key: 'featured',
      name: 'Featured markets',
      description: 'Selected markets',
      version: 1,
      publishedAt: '2026-07-15T00:00:00.000Z',
    },
    items: [],
    categories: [],
  })
})

test('rejects invalid, missing, unpublished, and unconfigured collections', async () => {
  assert.equal((await createPolymarketCollectionRoutes().request('/featured')).status, 503)
  assert.equal((await createPolymarketCollectionRoutes({ store: store(null) }).request('/unknown')).status, 404)
  assert.equal((await createPolymarketCollectionRoutes({
    store: store({ ...state, published: null }),
  }).request('/featured')).status, 503)
  assert.equal((await createPolymarketCollectionRoutes({ store: store() }).request('/BAD!')).status, 400)
})
