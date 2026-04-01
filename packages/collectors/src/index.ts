import 'dotenv/config'
import { startDiscoveryCron } from './polymarket/discovery'
import { startStream } from './polymarket/stream'
import { startUserTracker } from './polymarket/user-tracker'
import { startMatchWatcher } from './polymarket/match-watcher.js'
import { startNansenCollector } from './nansen/index.js'

console.log('Starting collectors...')
startDiscoveryCron()
startStream()
startUserTracker()
startMatchWatcher()
startNansenCollector()
