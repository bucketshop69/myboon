import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env' })
loadEnv({ path: '../../.env' })
loadEnv()

import { summarizeHyperliquidSqlite } from './sqlite-store'

const summary = summarizeHyperliquidSqlite(process.env.HYPERLIQUID_SQLITE_PATH)
console.log(JSON.stringify(summary, null, 2))
