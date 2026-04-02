/**
 * test-crypto-god.ts
 *
 * End-to-end test harness for the crypto_god pipeline.
 *
 * What it does:
 *   1. Seeds 3 realistic Pacific signals into the `signals` table
 *      (LIQUIDATION_CASCADE, FUNDING_SPIKE, OI_SURGE)
 *   2. Runs runCryptoGod() immediately against them
 *   3. Prints what landed in x_posts
 *   4. Cleans up seeded signals (optional — set KEEP_SEEDS=1 to skip)
 *
 * Usage:
 *   pnpm --filter @myboon/brain tsx src/test-crypto-god.ts
 *   KEEP_SEEDS=1 pnpm --filter @myboon/brain tsx src/test-crypto-god.ts
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { runCryptoGod } from './crypto-god.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KEEP_SEEDS = process.env.KEEP_SEEDS === '1'
const RUN_ID = `test-${Date.now()}`

// --- seed data ---

const SEEDS = [
  {
    source: 'PACIFIC',
    type: 'LIQUIDATION_CASCADE',
    topic: 'BTC liquidation cascade on Pacific',
    slug: `pacific-liquidation-btc-${RUN_ID}`,
    weight: 9,
    metadata: {
      symbol: 'BTC',
      oi_before: '22400000',
      oi_after: '18800000',
      oi_drop_usd: '3600000',
      oi_drop_formatted: '$3.6M',
      oi_drop_pct: '16.1',
      price_move_pct: '-8.2',
      side_liquidated: 'long',
      mark_price: '87000',
      timestamp: Date.now(),
    },
    processed: false,
  },
  {
    source: 'PACIFIC',
    type: 'FUNDING_SPIKE',
    topic: 'ETH funding spike on Pacific',
    slug: `pacific-funding-eth-${RUN_ID}`,
    weight: 8,
    metadata: {
      symbol: 'ETH',
      funding_rate: '0.00015',
      funding_rate_annualized: '131.4',
      next_funding: '0.00018',
      open_interest: '8200000',
      open_interest_formatted: '$8.2M',
      timestamp: Date.now(),
    },
    processed: false,
  },
  {
    source: 'PACIFIC',
    type: 'OI_SURGE',
    topic: 'SOL open interest surge on Pacific',
    slug: `pacific-oi-surge-sol-${RUN_ID}`,
    weight: 6,
    metadata: {
      symbol: 'SOL',
      oi_before: '1200000',
      oi_after: '1560000',
      oi_increase_usd: '360000',
      oi_increase_formatted: '$360K',
      oi_increase_pct: '30.0',
      mark_price: '148.50',
      funding_rate: '0.00004',
      timestamp: Date.now(),
    },
    processed: false,
  },
]

async function seedSignals(): Promise<string[]> {
  console.log(`\n[test] Seeding ${SEEDS.length} Pacific signals (run_id=${RUN_ID})...`)
  const { data, error } = await supabase
    .from('signals')
    .insert(SEEDS)
    .select('id')

  if (error || !data?.length) {
    throw new Error(`Failed to seed signals: ${JSON.stringify(error)}`)
  }

  const ids = data.map((r) => r.id as string)
  console.log(`[test] Seeded signal IDs: ${ids.join(', ')}`)
  return ids
}

async function cleanupSignals(ids: string[]): Promise<void> {
  console.log(`\n[test] Cleaning up ${ids.length} seeded signal(s)...`)
  await supabase.from('signals').delete().in('id', ids)
  console.log('[test] Cleanup done.')
}

async function printResults(runStart: Date): Promise<void> {
  const { data: posts } = await supabase
    .from('x_posts')
    .select('id, status, agent_type, draft_text, broadcaster_reasoning, created_at')
    .eq('agent_type', 'crypto_god')
    .gte('created_at', runStart.toISOString())
    .order('created_at', { ascending: true })

  console.log('\n' + '═'.repeat(60))
  console.log(`RESULTS — x_posts created this run: ${posts?.length ?? 0}`)
  console.log('═'.repeat(60))

  if (!posts?.length) {
    console.log('No posts saved. Check logs above for ranker/broadcaster decisions.')
    return
  }

  for (const post of posts) {
    console.log(`\n[${post.status.toUpperCase()}] id=${post.id}`)
    console.log(`Broadcaster: ${post.broadcaster_reasoning ?? '—'}`)
    console.log('─'.repeat(40))
    console.log(post.draft_text)
    console.log('─'.repeat(40))
  }
}

async function main(): Promise<void> {
  const runStart = new Date()
  let seededIds: string[] = []

  try {
    seededIds = await seedSignals()

    console.log('\n[test] Running crypto_god pipeline...\n')
    await runCryptoGod()

    await printResults(runStart)
  } finally {
    if (!KEEP_SEEDS && seededIds.length > 0) {
      await cleanupSignals(seededIds)
    } else if (KEEP_SEEDS) {
      console.log(`\n[test] KEEP_SEEDS=1 — signals left in DB: ${seededIds.join(', ')}`)
    }
  }
}

main().catch((err) => {
  console.error('[test] Fatal:', err)
  process.exit(1)
})
