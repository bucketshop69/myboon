import 'dotenv/config'
import { startDiscoveryCron } from './polymarket/discovery'
import { startStream } from './polymarket/stream'

console.log('Starting collectors...')
startDiscoveryCron()
startStream()
