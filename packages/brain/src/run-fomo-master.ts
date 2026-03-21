import 'dotenv/config'
import { runFomoMaster } from './fomo-master.js'

runFomoMaster()
  .then(() => {
    console.log('[fomo_master] Run complete.')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[fomo_master] Fatal error:', err)
    process.exit(1)
  })
