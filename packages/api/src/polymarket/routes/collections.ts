import { Hono } from 'hono'
import type { HydratedPolymarketCollection } from '../catalog/hydrate.js'
import { hydratePolymarketCatalogRelease } from '../catalog/hydrate.js'
import type { PolymarketCatalogRelease, PolymarketCatalogStore } from '../catalog/contracts.js'

interface PolymarketCollectionRoutesConfig {
  store?: PolymarketCatalogStore
  hydrate?: (release: PolymarketCatalogRelease, options?: { limit?: number }) => Promise<HydratedPolymarketCollection>
}

const SAFE_COLLECTION_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/

export function createPolymarketCollectionRoutes(config: PolymarketCollectionRoutesConfig = {}): Hono {
  const routes = new Hono()
  const hydrate = config.hydrate ?? hydratePolymarketCatalogRelease

  routes.get('/:key', async (c) => {
    const key = c.req.param('key')
    if (!SAFE_COLLECTION_KEY_RE.test(key)) return c.json({ error: 'Invalid collection key' }, 400)
    if (!config.store) return c.json({ error: 'Polymarket catalog is not configured' }, 503)

    try {
      const state = await config.store.getCollection(key)
      if (!state) return c.json({ error: 'Collection not found' }, 404)
      if (!state.collection.isEnabled || !state.published) {
        return c.json({ error: 'Collection is not published' }, 503)
      }

      const hydrated = await hydrate(state.published, { limit: state.collection.defaultLimit })
      c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=45')
      return c.json({
        collection: {
          key: state.collection.key,
          name: state.collection.name,
          description: state.collection.description,
          version: state.published.version,
          publishedAt: state.published.publishedAt,
        },
        ...hydrated,
      })
    } catch (error) {
      console.error(`[api] GET /polymarket/collections/${key} failed`, error instanceof Error ? error.message : 'unknown error')
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  return routes
}
