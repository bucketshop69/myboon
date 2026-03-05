import 'dotenv/config'
import { startDiscoveryCron } from './polymarket/discovery'
import { startStream } from './polymarket/stream'
import { startUserTracker } from './polymarket/user-tracker'

console.log('Starting collectors...')
startDiscoveryCron()
startStream()
startUserTracker()
