import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { PacificClient } from '@myboon/shared'
import { cryptoGodGraph, type FormattedSignal, type XPostRow } from './graphs/crypto-god-graph.js'

// --- env validation ---

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!MINIMAX_API_KEY) missing.push('MINIMAX_API_KEY')

if (missing.length > 0) {
  console.error(`[crypto_god] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
const pacificClient = new PacificClient('mainnet')

// --- helpers ---

function formatUsd(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`
  return `$${Math.round(amount).toLocaleString()}`
}

function formatSignalBlock(signal: {
  id: string
  type: string
  weight: number
  metadata: Record<string, unknown>
  created_at: string
  live_price: string | null
  live_funding: string | null
  live_oi: string | null
  cluster_context: {
    signal_count: number
    total_oi_drop_usd: number
    latest_at: string
  } | null
}): FormattedSignal {
  const meta = signal.metadata
  const symbol = typeof meta.symbol === 'string' ? meta.symbol : 'UNKNOWN'
  const lines: string[] = []

  if (signal.type === 'LIQUIDATION_CASCADE') {
    const oiDropUsd = typeof meta.oi_drop_usd === 'string' ? parseFloat(meta.oi_drop_usd) : 0
    const oiDropPct = typeof meta.oi_drop_pct === 'string' ? meta.oi_drop_pct : '?'
    const priceMovePct = typeof meta.price_move_pct === 'string' ? meta.price_move_pct : '?'
    const sideLiq = typeof meta.side_liquidated === 'string' ? meta.side_liquidated : 'unknown'
    const markPrice = typeof meta.mark_price === 'string' ? meta.mark_price : null

    lines.push(`SIGNAL: LIQUIDATION_CASCADE on ${symbol}`)
    lines.push(`OI drop: ${formatUsd(oiDropUsd)} (${oiDropPct}%) | Price move: ${priceMovePct}% | Side liquidated: ${sideLiq}`)
    if (markPrice) lines.push(`Mark price: $${parseFloat(markPrice).toLocaleString()}`)
    if (signal.live_oi) lines.push(`Current OI: ${formatUsd(parseFloat(signal.live_oi))}`)
    if (signal.cluster_context && signal.cluster_context.signal_count > 1) {
      lines.push(`Cluster: ${signal.cluster_context.signal_count} liquidation signals on this symbol, total est. ${formatUsd(signal.cluster_context.total_oi_drop_usd)}`)
    }
  } else if (signal.type === 'FUNDING_SPIKE') {
    const fundingRate = typeof meta.funding_rate === 'string' ? parseFloat(meta.funding_rate) : 0
    const annualized = typeof meta.funding_rate_annualized === 'string' ? meta.funding_rate_annualized : null
    const nextFunding = typeof meta.next_funding === 'string' ? meta.next_funding : null
    const oiFormatted = typeof meta.open_interest_formatted === 'string' ? meta.open_interest_formatted : null

    lines.push(`SIGNAL: FUNDING_SPIKE on ${symbol}`)
    lines.push(`Funding rate: ${(fundingRate * 100).toFixed(4)}%/hr${annualized ? ` (${annualized}% annualized)` : ''}`)
    if (nextFunding) lines.push(`Next funding: ${(parseFloat(nextFunding) * 100).toFixed(4)}%/hr`)
    if (oiFormatted) lines.push(`Open interest: ${oiFormatted}`)
    if (signal.live_price) lines.push(`Mark price: $${parseFloat(signal.live_price).toLocaleString()}`)
  } else if (signal.type === 'OI_SURGE') {
    const oiIncreaseUsd = typeof meta.oi_increase_usd === 'string' ? parseFloat(meta.oi_increase_usd) : 0
    const oiIncreasePct = typeof meta.oi_increase_pct === 'string' ? meta.oi_increase_pct : '?'
    const markPrice = typeof meta.mark_price === 'string' ? meta.mark_price : null

    lines.push(`SIGNAL: OI_SURGE on ${symbol}`)
    lines.push(`OI increase: ${formatUsd(oiIncreaseUsd)} (+${oiIncreasePct}%)`)
    if (markPrice) lines.push(`Mark price: $${parseFloat(markPrice).toLocaleString()}`)
    if (signal.live_oi) lines.push(`Current OI: ${formatUsd(parseFloat(signal.live_oi))}`)
    if (signal.live_funding) {
      const fr = parseFloat(signal.live_funding)
      const ann = parseFloat((fr * 3 * 365 * 100).toFixed(1))
      lines.push(`Current funding: ${(fr * 100).toFixed(4)}%/hr (${ann}% annualized)`)
    }
  }

  lines.push(`Weight: ${signal.weight} | Detected: ${signal.created_at}`)

  return {
    ...signal,
    formatted_text: lines.join('\n'),
  }
}

// --- runner ---

export async function runCryptoGod(): Promise<void> {
  console.log(`[crypto_god] Running at ${new Date().toISOString()}`)

  // Step 1: fetch consumed signal_ids from recent x_posts (last 4h)
  const { data: recentPosts } = await supabase
    .from('x_posts')
    .select('signal_ids')
    .eq('agent_type', 'crypto_god')
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  const consumedIds = new Set<string>(
    (recentPosts ?? []).flatMap((p) => (p.signal_ids as string[] | null) ?? [])
  )

  // Step 2: fetch Pacific signals from last 4h
  const { data: signals, error } = await supabase
    .from('signals')
    .select('*')
    .eq('source', 'PACIFIC')
    .in('type', ['LIQUIDATION_CASCADE', 'OI_SURGE', 'FUNDING_SPIKE'])
    .gte('weight', 6)
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('[crypto_god] Failed to fetch signals:', error)
    return
  }

  // Step 3: filter consumed, cluster by symbol — one representative per symbol+type
  const unprocessed = (signals ?? []).filter((s: { id: string }) => !consumedIds.has(s.id))

  if (!unprocessed.length) {
    console.log('[crypto_god] No new Pacific signals to process')
    return
  }

  console.log(`[crypto_god] Found ${unprocessed.length} signal(s) to process`)

  // Cluster by `{symbol}:{type}` — one representative per combination
  const clusterMap = new Map<string, typeof unprocessed>()
  for (const signal of unprocessed) {
    const symbol = (signal.metadata?.symbol as string | undefined) ?? signal.id
    const key = `${symbol}:${signal.type}`
    if (!clusterMap.has(key)) clusterMap.set(key, [])
    clusterMap.get(key)!.push(signal)
  }

  const representatives = [...clusterMap.values()].map((cluster) => {
    const sorted = [...cluster].sort((a, b) =>
      b.weight !== a.weight
        ? b.weight - a.weight
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const rep = sorted[0]
    const cluster_context = cluster.length > 1
      ? {
          signal_count: cluster.length,
          total_oi_drop_usd: cluster.reduce((sum: number, s) => {
            const v = parseFloat((s.metadata?.oi_drop_usd as string | undefined) ?? '0')
            return sum + (isNaN(v) ? 0 : v)
          }, 0),
          latest_at: sorted[0].created_at,
        }
      : null
    return { ...rep, cluster_context }
  })

  console.log(`[crypto_god] ${representatives.length} representative(s) after clustering`)

  // Step 4: fetch live Pacific prices for enrichment
  let livePrices: Awaited<ReturnType<typeof pacificClient.getPrices>> = []
  try {
    livePrices = await pacificClient.getPrices()
  } catch (err) {
    console.warn('[crypto_god] Could not fetch live Pacific prices — continuing without enrichment:', err)
  }

  const priceMap = new Map(livePrices.map((p) => [p.symbol, p]))

  // Step 5: enrich + format
  const formatted_signals: FormattedSignal[] = representatives.map((signal) => {
    const symbol = (signal.metadata?.symbol as string | undefined) ?? ''
    const liveData = priceMap.get(symbol)

    return formatSignalBlock({
      id: signal.id,
      type: signal.type,
      weight: signal.weight,
      metadata: signal.metadata as Record<string, unknown>,
      created_at: signal.created_at,
      live_price: liveData?.mark ?? null,
      live_funding: liveData?.funding ?? null,
      live_oi: liveData?.open_interest ?? null,
      cluster_context: signal.cluster_context,
    })
  })

  // Step 6: fetch x_posts timelines (7d)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: fullTimelineData } = await supabase
    .from('x_posts')
    .select('draft_text, agent_type, status, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })

  const full_timeline: XPostRow[] = (fullTimelineData ?? []) as XPostRow[]
  const posted_timeline: XPostRow[] = full_timeline.filter((p) => p.status === 'posted')

  // Step 7: invoke graph
  let finalState: { why_skipped?: Record<string, string> | null }
  try {
    finalState = await cryptoGodGraph.invoke({ formatted_signals, posted_timeline, full_timeline })
  } catch (err) {
    console.error('[crypto_god] Graph error:', err)
    return
  }

  // Step 8: write why_skipped back to signals table
  const why_skipped = finalState.why_skipped ?? {}
  const skipEntries = Object.entries(why_skipped)
  if (skipEntries.length > 0) {
    await Promise.all(
      skipEntries.map(([signal_id, reason]) =>
        supabase.from('signals').update({ skip_reasoning: reason }).eq('id', signal_id)
      )
    )
    console.log(`[crypto_god] Wrote skip_reasoning for ${skipEntries.length} signal(s)`)
  }

  console.log('[crypto_god] Done.')
}
