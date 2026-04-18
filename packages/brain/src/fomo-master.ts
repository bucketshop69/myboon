import 'dotenv/config'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PolymarketProfileClient } from '@myboon/shared'
import { fomoMasterGraph, type FormattedSignal, type XPostRow } from './graphs/fomo-master-graph.js'

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')

if (missing.length > 0) {
  console.error(`[fomo_master] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

const profileClient = new PolymarketProfileClient({
  cache: {
    supabaseUrl: SUPABASE_URL!,
    supabaseKey: SUPABASE_SERVICE_ROLE_KEY!,
  },
})

// --- helpers ---

async function fetchPolymarketOdds(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`)
    if (!res.ok) return null
    const data = await res.json() as Array<{ outcomePrices?: string[] }>
    const prices = data[0]?.outcomePrices
    if (!prices?.length) return null
    return parseFloat(prices[0])
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchMarketHistory(
  db: SupabaseClient<any>,
  slug: string
): Promise<{ bet_count: number; distinct_wallets: number; total_volume: number }> {
  const { data } = await db
    .from('signals')
    .select('metadata')
    .eq('type', 'WHALE_BET')
    .filter('metadata->>slug', 'eq', slug)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  if (!data?.length) return { bet_count: 0, distinct_wallets: 0, total_volume: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = data as Array<{ metadata: any }>
  return {
    bet_count: rows.length,
    distinct_wallets: new Set(rows.map((s) => s.metadata?.user).filter(Boolean)).size,
    total_volume: rows.reduce((sum, s) => sum + ((s.metadata?.amount as number) ?? 0), 0),
  }
}

function formatVolume(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`
  return `$${Math.round(amount).toLocaleString()}`
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`
  return `$${Math.round(amount).toLocaleString()}`
}

interface BettorProfile {
  portfolio_value: number
  markets_traded: number
  trade_count: number
  win_rate: number | null
  total_pnl: number
}

async function fetchBettorProfile(address: string): Promise<BettorProfile | null> {
  try {
    const [value, traded, closed] = await Promise.all([
      profileClient.getPortfolioValue(address),
      profileClient.getMarketsTraded(address),
      profileClient.getClosedPositions({ user: address, limit: 50, sortBy: 'REALIZEDPNL' }),
    ])

    const wins = closed.filter((p) => p.realizedPnl > 0).length
    const win_rate = closed.length > 0 ? wins / closed.length : null
    const total_pnl = closed.reduce((sum, p) => sum + p.realizedPnl, 0)

    return {
      portfolio_value: value?.value ?? 0,
      markets_traded: traded?.traded ?? 0,
      trade_count: closed.length,
      win_rate,
      total_pnl,
    }
  } catch (err) {
    console.warn(`[fomo_master] fetchBettorProfile failed for ${address}:`, err)
    return null
  }
}

function formatSignalBlock(signal: {
  id: string
  type: string
  weight: number
  metadata: Record<string, unknown>
  created_at: string
  bettor_profile: BettorProfile | null
  live_odds: number | null
  market_history: { bet_count: number; distinct_wallets: number; total_volume: number }
  cluster_context: {
    signal_count: number
    distinct_wallets: number
    total_volume: number
    latest_at: string
  } | null
}): FormattedSignal {
  const meta = signal.metadata
  const amount = typeof meta?.amount === 'number' ? meta.amount : null
  const direction = typeof meta?.direction === 'string' ? meta.direction : null
  const question = typeof meta?.question === 'string' ? meta.question : typeof meta?.title === 'string' ? meta.title : 'Unknown market'
  const slug = typeof meta?.slug === 'string' ? meta.slug : null
  const address = typeof meta?.user === 'string' ? meta.user : null

  // Line 1: SIGNAL
  const amountStr = amount !== null ? formatAmount(amount) : 'Unknown amount'
  const directionStr = direction ? ` ${direction}` : ''
  const line1 = `SIGNAL: ${amountStr}${directionStr} bet on "${question}"`

  // Line 2: Market + odds
  const oddsStr = signal.live_odds !== null ? `${(signal.live_odds * 100).toFixed(0)}% YES` : 'unknown'
  const line2 = `Market: ${slug ?? 'unknown'} | Current odds: ${oddsStr}`

  // Line 3: Bettor profile (from Polymarket data APIs)
  const profile = signal.bettor_profile
  const win_rate = profile?.win_rate !== null && profile?.win_rate !== undefined ? (profile.win_rate * 100).toFixed(0) : null
  const total_pnl = profile?.total_pnl ?? null
  const trade_count = profile?.trade_count ?? null

  let line3: string
  if (profile && (win_rate !== null || total_pnl !== null || trade_count !== null)) {
    const pnlStr = total_pnl !== null
      ? (total_pnl >= 0 ? `+$${Math.round(total_pnl).toLocaleString()}` : `-$${Math.round(Math.abs(total_pnl)).toLocaleString()}`)
      : null
    const parts: string[] = []
    if (win_rate !== null) parts.push(`Win rate: ${win_rate}%`)
    if (pnlStr !== null) parts.push(`PnL: ${pnlStr}`)
    if (trade_count !== null) parts.push(`Trades: ${trade_count}`)
    if (profile.portfolio_value > 0) parts.push(`Portfolio: ${formatVolume(profile.portfolio_value)}`)
    line3 = `Bettor: ${address ?? 'unknown'} | ${parts.join(' | ')}`
  } else {
    line3 = `Bettor: ${address ?? 'unknown'} | No wallet history on record`
  }

  // Line 4: Market activity (7d)
  const { bet_count, distinct_wallets, total_volume } = signal.market_history
  const line4 = bet_count > 0
    ? `Market activity (7d): ${bet_count} bets, ${distinct_wallets} wallets, ${formatVolume(total_volume)} total volume`
    : `Market activity (7d): no prior bets on record`

  // Line 5: Cluster (only if cluster_context exists)
  const lines = [line1, line2, line3, line4]
  if (signal.cluster_context) {
    const cc = signal.cluster_context
    const line5 = `Cluster: ${cc.signal_count} bets in last 4h, ${cc.distinct_wallets} wallets, ${formatVolume(cc.total_volume)} total`
    lines.push(line5)
  }

  return {
    ...signal,
    formatted_text: lines.join('\n'),
  }
}

// --- runner ---

export async function runFomoMaster(): Promise<void> {
  console.log(`[fomo_master] Running at ${new Date().toISOString()}`)

  // Step 1: fetch consumed signal_ids from recent x_posts (last 4h)
  const { data: recentPosts } = await supabase
    .from('x_posts')
    .select('signal_ids')
    .eq('agent_type', 'fomo_master')
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  const consumedIds = new Set<string>(
    (recentPosts ?? []).flatMap((p) => (p.signal_ids as string[] | null) ?? [])
  )

  // Step 2: fetch high-weight WHALE_BET signals from last 4h
  const { data: signals, error } = await supabase
    .from('signals')
    .select('*')
    .eq('type', 'WHALE_BET')
    .gte('weight', 8)
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('[fomo_master] Failed to fetch signals:', error)
    return
  }

  // Step 3: dedup — filter out already-consumed signal IDs, exclude sports slugs (handled by sports_broadcaster)
  const SPORTS_SLUG = /^(ucl|epl|nba|nfl|la-liga)-/
  const unprocessed = (signals ?? [])
    .filter((s: { id: string }) => !consumedIds.has(s.id))
    .filter((s) => !SPORTS_SLUG.test((s.metadata?.slug as string | undefined) ?? ''))

  if (!unprocessed.length) {
    console.log('[fomo_master] No new high-weight signals to process')
    return
  }

  console.log(`[fomo_master] Found ${unprocessed.length} signal(s) to process`)

  // Step 4: cluster by slug → pick one representative per cluster
  const clusterMap = new Map<string, typeof unprocessed>()
  for (const signal of unprocessed) {
    const slug = (signal.metadata?.slug as string | undefined) ?? signal.id
    if (!clusterMap.has(slug)) clusterMap.set(slug, [])
    clusterMap.get(slug)!.push(signal)
  }

  const representatives = [...clusterMap.values()].map((cluster) => {
    // Sort: highest weight first, tiebreaker: most recent created_at
    const sorted = [...cluster].sort((a, b) =>
      b.weight !== a.weight
        ? b.weight - a.weight
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const rep = sorted[0]
    const cluster_context = cluster.length > 1
      ? {
          signal_count: cluster.length,
          distinct_wallets: new Set(cluster.map((s) => s.metadata?.user).filter(Boolean)).size,
          total_volume: cluster.reduce((sum: number, s) => sum + ((s.metadata?.amount as number) ?? 0), 0),
          latest_at: sorted[0].created_at,
        }
      : null
    return { ...rep, cluster_context }
  })

  console.log(`[fomo_master] ${representatives.length} cluster representative(s) after dedup`)

  // Step 5: enrich each representative in parallel (profile + live odds + market history)
  const enriched = await Promise.all(
    representatives.map(async (signal) => {
      const address = signal.metadata?.user as string | undefined
      const slug = signal.metadata?.slug as string | undefined

      const [profileResult, oddsResult, historyResult] = await Promise.allSettled([
        address ? fetchBettorProfile(address) : Promise.resolve(null),
        slug ? fetchPolymarketOdds(slug) : Promise.resolve(null),
        slug
          ? fetchMarketHistory(supabase, slug)
          : Promise.resolve({ bet_count: 0, distinct_wallets: 0, total_volume: 0 }),
      ])

      if (profileResult.status === 'rejected') {
        console.warn(`[fomo_master] Profile enrichment failed for ${address}:`, profileResult.reason)
      }
      if (oddsResult.status === 'rejected') {
        console.warn(`[fomo_master] Odds fetch failed for ${slug}:`, oddsResult.reason)
      }
      if (historyResult.status === 'rejected') {
        console.warn(`[fomo_master] Market history fetch failed for ${slug}:`, historyResult.reason)
      }

      return {
        ...signal,
        bettor_profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
        live_odds: oddsResult.status === 'fulfilled' ? oddsResult.value : null,
        market_history:
          historyResult.status === 'fulfilled'
            ? historyResult.value
            : { bet_count: 0, distinct_wallets: 0, total_volume: 0 },
      }
    })
  )

  // Step 6: format into plaintext signal blocks
  const formatted_signals: FormattedSignal[] = enriched.map((signal) =>
    formatSignalBlock({
      id: signal.id,
      type: signal.type,
      weight: signal.weight,
      metadata: signal.metadata as Record<string, unknown>,
      created_at: signal.created_at,
      bettor_profile: signal.bettor_profile,
      live_odds: signal.live_odds,
      market_history: signal.market_history,
      cluster_context: signal.cluster_context,
    })
  )

  // Step 7: fetch timelines
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: fullTimelineData } = await supabase
    .from('x_posts')
    .select('draft_text, agent_type, status, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })

  const full_timeline: XPostRow[] = (fullTimelineData ?? []) as XPostRow[]
  const posted_timeline: XPostRow[] = full_timeline.filter((p) => p.status === 'posted')

  // Step 8: invoke graph
  let finalState: { why_skipped?: Record<string, string> | null }
  try {
    finalState = await fomoMasterGraph.invoke({ formatted_signals, posted_timeline, full_timeline })
  } catch (err) {
    console.error('[fomo_master] Graph error:', err)
    return
  }

  // Step 9: write why_skipped back to signals table
  const why_skipped = finalState.why_skipped ?? {}
  const skipEntries = Object.entries(why_skipped)
  if (skipEntries.length > 0) {
    await Promise.all(
      skipEntries.map(([signal_id, reason]) =>
        supabase.from('signals').update({ skip_reasoning: reason }).eq('id', signal_id)
      )
    )
    console.log(`[fomo_master] Wrote skip_reasoning for ${skipEntries.length} signal(s)`)
  }

  console.log('[fomo_master] Done.')
}
