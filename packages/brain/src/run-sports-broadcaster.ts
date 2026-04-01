import 'dotenv/config'
import { runSportsBroadcaster } from './sports-broadcaster.js'

runSportsBroadcaster()
  .then(() => {
    console.log('[sports_broadcaster] Run complete.')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[sports_broadcaster] Fatal error:', err)
    process.exit(1)
  })
