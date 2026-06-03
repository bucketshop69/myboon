import { config as loadEnv } from 'dotenv'

loadEnv({ path: '../../.env' })
loadEnv({ path: '.env' })
loadEnv()

import { createClient } from '@supabase/supabase-js'
import {
  previewPolymarketMarketsDataEngineer,
  runPolymarketMarketsDataEngineer,
} from './markets-data-engineer'

const THIRTY_MINUTES_MS = 30 * 60 * 1000

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function runOnce(): Promise<void> {
  if (process.env.POLYMARKET_MARKETS_PREVIEW_ONLY === '1') {
    const result = await previewPolymarketMarketsDataEngineer()
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  )

  const result = await runPolymarketMarketsDataEngineer(supabase)
  console.log(JSON.stringify(result, null, 2))
}

async function main(): Promise<void> {
  await runOnce()

  if (process.env.POLYMARKET_MARKETS_RUN_ONCE === '1') return

  setInterval(() => {
    runOnce().catch((err) => {
      console.error('[polymarket-markets-data-engineer] run failed:', err)
    })
  }, THIRTY_MINUTES_MS)
}

main().catch((err) => {
  console.error('[polymarket-markets-data-engineer] fatal:', err)
  process.exit(1)
})
