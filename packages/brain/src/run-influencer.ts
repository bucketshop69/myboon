import 'dotenv/config'
import { runInfluencer } from './influencer.js'

// Stagger startup by 240s to avoid MiniMax concurrency storm with analyst/publisher
const STARTUP_DELAY_MS = 240_000
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

delay(STARTUP_DELAY_MS)
  .then(() => runInfluencer())
  .then(() => {
    console.log('[influencer] Run complete.')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[influencer] Fatal error:', err)
    process.exit(1)
  })
