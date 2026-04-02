import 'dotenv/config'
import { runCryptoGod } from './crypto-god.js'

runCryptoGod()
  .then(() => {
    console.log('[crypto_god] Run complete.')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[crypto_god] Fatal error:', err)
    process.exit(1)
  })
