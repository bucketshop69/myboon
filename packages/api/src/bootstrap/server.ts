import { serve } from '@hono/node-server'
import { startMarketReadPolling } from '../polymarket/read/market-read.js'
import { loadApiConfig } from './config.js'
import { createApp } from './create-app.js'

export function startApiServer(): void {
  const config = loadApiConfig()
  const app = createApp(config)
  startMarketReadPolling()

  serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
    console.log(`[api] Listening on http://${config.host}:${config.port}`)
  })
}
