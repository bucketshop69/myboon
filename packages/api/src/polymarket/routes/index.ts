import { Hono } from 'hono'
import { createPolymarketAccountRoutes } from './accounts.js'
import { createPolymarketMarketRoutes } from './markets.js'
import { createPolymarketSportsRoutes } from './sports.js'

/** Compose the existing Polymarket read API without starting timers or a server. */
export function createPolymarketReadRoutes(): Hono {
  const routes = new Hono()
  routes.route('/', createPolymarketMarketRoutes())
  routes.route('/', createPolymarketSportsRoutes())
  routes.route('/', createPolymarketAccountRoutes())
  return routes
}
