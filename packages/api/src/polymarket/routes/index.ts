import { Hono } from 'hono'
import type { PolymarketCatalogStore } from '../catalog/contracts.js'
import { createPolymarketAccountRoutes } from './accounts.js'
import { createPolymarketCollectionRoutes } from './collections.js'
import { createPolymarketMarketRoutes } from './markets.js'
import { createPolymarketSportsRoutes } from './sports.js'

interface PolymarketReadRoutesConfig {
  catalogStore?: PolymarketCatalogStore
}

/** Compose the existing Polymarket read API without starting timers or a server. */
export function createPolymarketReadRoutes(config: PolymarketReadRoutesConfig = {}): Hono {
  const routes = new Hono()
  routes.route('/collections', createPolymarketCollectionRoutes({ store: config.catalogStore }))
  routes.route('/', createPolymarketMarketRoutes())
  routes.route('/', createPolymarketSportsRoutes())
  routes.route('/', createPolymarketAccountRoutes())
  return routes
}
