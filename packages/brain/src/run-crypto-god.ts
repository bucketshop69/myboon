import 'dotenv/config'
import { runCryptoGod } from './crypto-god.js'

// Stagger startup by 180s to avoid MiniMax concurrency storm with analyst/publisher
const STARTUP_DELAY_MS = 180_000
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

delay(STARTUP_DELAY_MS)
  .then(() => runCryptoGod())
  .then(() => {
    console.log('[crypto_god] Run complete.')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[crypto_god] Fatal error:', err)
    process.exit(1)
  })
