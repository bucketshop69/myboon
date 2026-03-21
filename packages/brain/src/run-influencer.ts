import 'dotenv/config'
import { runInfluencer } from './influencer.js'

runInfluencer()
  .then(() => {
    console.log('[influencer] Run complete.')
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('[influencer] Fatal error:', err)
    process.exit(1)
  })
