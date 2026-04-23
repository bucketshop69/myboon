import 'dotenv/config'
import { runFomoMaster } from './fomo-master.js'

// Stagger startup by 120s to avoid MiniMax concurrency storm with analyst/publisher
const STARTUP_DELAY_MS = 120_000
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

delay(STARTUP_DELAY_MS)
  .then(() => runFomoMaster())
  .then(() => {
    console.log('[fomo_master] Run complete.')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[fomo_master] Fatal error:', err)
    process.exit(1)
  })
