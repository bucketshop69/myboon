import cron from 'node-cron'
import { supabase } from './supabase'
import { PolymarketClient } from '@myboon/shared'
import type { Market } from '@myboon/shared'
import type { Signal } from './signal-types'
import pinnedSlugs from './pinned.json'

const client = new PolymarketClient()

const DOME_BASE_URL = 'https://api.domeapi.io/v1'
const VOLUME_SURGE_THRESHOLD = 0.20
const CLOSING_WINDOW_MS = 48 * 60 * 60 * 1000 // 48 hours
const CLOSING_SIGNAL_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 6 hours
const MAX_SUB_MARKETS_PER_EVENT = 5 // Cap sub-markets for multi-outcome events

function domeHeaders(): Record<string, string> {
  const key = process.env.DOME_API_KEY
  if (!key) throw new Error('DOME_API_KEY not set')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

interface DomeMarket {
  market_slug: string
  title: string
  condition_id: string
  status: string
  end_time: number | null
  volume_total: number
  side_a: { id: string; label: string }
  side_b: { id: string; label: string }
}

/** Extended Market with source metadata */
interface DiscoveryMarket extends Market {
  /** true if this market is a sub-outcome of a multi-outcome event (not independently pinned) */
  isEventExpansion?: boolean
}

/**
 * Fetch pinned markets via Dome API.
 * Tries event_slug first (multi-outcome), falls back to market_slug (single-outcome).
 * For multi-outcome events, only keeps the top sub-markets by volume to prevent signal spam.
 */
async function fetchPinnedViaDome(slugs: string[]): Promise<DiscoveryMarket[]> {
  const now = new Date()
  const results: DiscoveryMarket[] = []
  const seen = new Set<string>()

  for (const slug of slugs) {
    if (seen.has(slug)) continue // skip duplicate slugs
    seen.add(slug)

    try {
      // Try as event slug first (multi-outcome markets)
      let res = await fetch(
        `${DOME_BASE_URL}/polymarket/markets?event_slug=${encodeURIComponent(slug)}&limit=50`,
        { headers: domeHeaders() }
      )
      let data = res.ok ? await res.json() : { markets: [] }
      let domeMarkets: DomeMarket[] = data.markets ?? []
      const isEvent = domeMarkets.length > 1

      // If no event results, try as market slug (single-outcome)
      if (domeMarkets.length === 0) {
        res = await fetch(
          `${DOME_BASE_URL}/polymarket/markets?market_slug=${encodeURIComponent(slug)}&limit=1`,
          { headers: domeHeaders() }
        )
        data = res.ok ? await res.json() : { markets: [] }
        domeMarkets = data.markets ?? []
      }

      // Filter expired
      domeMarkets = domeMarkets.filter((dm) => {
        if (!dm.end_time) return true
        return new Date(dm.end_time * 1000) > now
      }).filter((dm) => dm.side_a?.id)

      // For multi-outcome events, only keep top N by volume
      if (isEvent && domeMarkets.length > MAX_SUB_MARKETS_PER_EVENT) {
        domeMarkets.sort((a, b) => (b.volume_total ?? 0) - (a.volume_total ?? 0))
        const dropped = domeMarkets.length - MAX_SUB_MARKETS_PER_EVENT
        domeMarkets = domeMarkets.slice(0, MAX_SUB_MARKETS_PER_EVENT)
        console.log(`[discovery] Event "${slug}": kept top ${MAX_SUB_MARKETS_PER_EVENT}, dropped ${dropped} low-volume sub-markets`)
      }

      for (const dm of domeMarkets) {
        results.push({
          title: dm.title,
          id: dm.condition_id,
          slug: dm.market_slug,
          tokenIds: [dm.side_a.id, dm.side_b?.id ?? ''],
          endDate: dm.end_time ? new Date(dm.end_time * 1000).toISOString() : undefined,
          volume: dm.volume_total ?? 0,
          isEventExpansion: isEvent,
        })
      }
    } catch (err) {
      console.error(`[discovery] Failed to fetch pinned slug ${slug} via Dome:`, err)
    }
  }

  return results
}

export async function runDiscovery(): Promise<void> {
  console.log('[discovery] Running market discovery...')

  let topMarkets: Market[]
  try {
    topMarkets = await client.getTopMarkets()
  } catch (err) {
    console.error('[discovery] Failed to fetch top markets:', err)
    return
  }

  // Fetch pinned markets via Dome API (supports both event slugs and market slugs)
  const now = new Date()
  const pinnedMarkets = await fetchPinnedViaDome(pinnedSlugs)

  // Wrap top markets as DiscoveryMarket (not event expansions)
  const topDiscovery: DiscoveryMarket[] = topMarkets.map((m) => ({ ...m, isEventExpansion: false }))

  // Merge: top markets first, then pinned markets not already present
  const seenIds = new Set(topDiscovery.map((m) => m.id))
  const uniquePinned = pinnedMarkets.filter((m) => !seenIds.has(m.id))
  const markets: DiscoveryMarket[] = [...topDiscovery, ...uniquePinned]

  console.log(
    `[discovery] Found ${topDiscovery.length} top markets + ${uniquePinned.length} pinned = ${markets.length} total`
  )

  let signalCount = 0

  for (const market of markets) {
    const [yesTokenId, noTokenId] = market.tokenIds

    let yes_price: number | undefined
    let no_price: number | undefined

    try {
      const book = await client.getOrderBook(yesTokenId)
      if (book) {
        yes_price = book.bestAsk > 0 ? book.bestAsk : book.bestBid
        no_price = yes_price > 0 ? parseFloat((1 - yes_price).toFixed(4)) : undefined
      }
    } catch (err) {
      console.error(`[discovery] Order book fetch failed for ${yesTokenId}:`, err)
    }

    // Read existing row before upsert to compute deltas
    const { data: existingRows } = await supabase
      .from('polymarket_tracked')
      .select('volume, last_signalled_at, volume_previous')
      .eq('token_id', yesTokenId)
      .limit(1)
    const existing = existingRows?.[0] as
      | { volume: number | null; last_signalled_at: string | null; volume_previous: number | null }
      | undefined

    const is_new = !existing

    // Compute volume delta relative to volume_previous (last signalled baseline)
    const volumePrevious = existing?.volume_previous ?? existing?.volume ?? 0
    const volumeCurrent = market.volume ?? 0
    const volume_delta =
      volumePrevious > 0 ? (volumeCurrent - volumePrevious) / volumePrevious : 0
    const volume_surged = volume_delta > VOLUME_SURGE_THRESHOLD

    // Approaching resolution: endDate within 48h AND (no prior signal OR last was >6h ago)
    let approaching = false
    if (market.endDate) {
      const endMs = new Date(market.endDate).getTime()
      const msUntilEnd = endMs - now.getTime()
      if (msUntilEnd > 0 && msUntilEnd <= CLOSING_WINDOW_MS) {
        const lastSignalled = existing?.last_signalled_at
          ? new Date(existing.last_signalled_at).getTime()
          : null
        const cooldownExpired =
          lastSignalled === null || now.getTime() - lastSignalled > CLOSING_SIGNAL_COOLDOWN_MS
        approaching = cooldownExpired
      }
    }

    // Upsert into polymarket_tracked — always runs to keep prices fresh
    const { error: upsertError } = await supabase
      .from('polymarket_tracked')
      .upsert(
        {
          token_id: yesTokenId,
          no_token_id: noTokenId,
          market_id: market.id,
          slug: market.slug,
          title: market.title,
          volume: market.volume,
          end_date: market.endDate ?? null,
          yes_price: yes_price ?? null,
          no_price: no_price ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token_id' }
      )

    if (upsertError) {
      console.error(`[discovery] Upsert failed for market ${market.id}:`, upsertError)
      continue
    }

    // Gate signal inserts on delta conditions
    let anySignalFired = false

    // Skip MARKET_DISCOVERED for event sub-markets (e.g. individual candidates in a nomination event)
    // They're just sub-outcomes of a known pinned event, not genuinely new discoveries
    if (is_new && !market.isEventExpansion) {
      const signal: Signal = {
        source: 'POLYMARKET',
        type: 'MARKET_DISCOVERED',
        topic: market.title,
        slug: market.slug,
        weight: 1,
        metadata: {
          marketId: market.id,
          slug: market.slug,
          volume: market.volume,
          endDate: market.endDate,
          yes_price,
          no_price,
        },
      }
      const { error } = await supabase.from('signals').insert(signal)
      if (error) {
        console.error(`[discovery] MARKET_DISCOVERED signal failed for ${market.id}:`, error)
      } else {
        anySignalFired = true
        signalCount++
        console.log(`[discovery] MARKET_DISCOVERED: ${market.slug}`)
      }
    }

    if (volume_surged) {
      const signal: Signal = {
        source: 'POLYMARKET',
        type: 'VOLUME_SURGE',
        topic: market.title,
        slug: market.slug,
        weight: 2,
        metadata: {
          marketId: market.id,
          slug: market.slug,
          volume: market.volume,
          endDate: market.endDate,
          yes_price,
          no_price,
          volume_delta: parseFloat(volume_delta.toFixed(4)),
        },
      }
      const { error } = await supabase.from('signals').insert(signal)
      if (error) {
        console.error(`[discovery] VOLUME_SURGE signal failed for ${market.id}:`, error)
      } else {
        anySignalFired = true
        signalCount++
        console.log(
          `[discovery] VOLUME_SURGE: ${market.slug} (+${(volume_delta * 100).toFixed(1)}%)`
        )
      }
    }

    if (approaching) {
      const signal: Signal = {
        source: 'POLYMARKET',
        type: 'MARKET_CLOSING',
        topic: market.title,
        slug: market.slug,
        weight: 2,
        metadata: {
          marketId: market.id,
          slug: market.slug,
          endDate: market.endDate,
          yes_price,
          no_price,
        },
      }
      const { error } = await supabase.from('signals').insert(signal)
      if (error) {
        console.error(`[discovery] MARKET_CLOSING signal failed for ${market.id}:`, error)
      } else {
        anySignalFired = true
        signalCount++
        console.log(`[discovery] MARKET_CLOSING: ${market.slug} (ends ${market.endDate})`)
      }
    }

    // Update signalling metadata if any signal fired
    if (anySignalFired) {
      await supabase
        .from('polymarket_tracked')
        .update({
          last_signalled_at: new Date().toISOString(),
          volume_previous: market.volume,
        })
        .eq('token_id', yesTokenId)
    }
  }

  await checkResolutions(markets).catch((err) =>
    console.error('[discovery] Resolution check failed:', err)
  )

  console.log(`[discovery] Done — ${signalCount} signals emitted across ${markets.length} markets`)
}

async function checkResolutions(markets: Market[]): Promise<void> {
  for (const market of markets) {
    // Skip markets with endDate still in the future
    if (market.endDate && new Date(market.endDate) > new Date()) continue

    // Check resolution status via Gamma API
    let resolvedOutcome: string | null = null
    try {
      const res = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${market.id}`)
      if (!res.ok) continue
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) continue
      const m = data[0] as { resolved_outcome?: string; resolution?: string }
      if (m.resolved_outcome) {
        resolvedOutcome = m.resolved_outcome
      } else if (m.resolution && m.resolution !== 'unresolved') {
        resolvedOutcome = m.resolution === 'yes' ? 'YES' : m.resolution === 'no' ? 'NO' : null
      }
    } catch {
      continue
    }

    if (!resolvedOutcome) continue

    // Find all WHALE_BET signals for this market
    const { data: bets } = await supabase
      .from('signals')
      .select('metadata')
      .eq('type', 'WHALE_BET')
      .eq('metadata->>marketId', market.id)

    if (!bets || bets.length === 0) continue

    for (const bet of bets) {
      const meta = bet.metadata as { user?: string; outcome?: string }
      if (!meta.user || !meta.outcome) continue

      const correct = meta.outcome.toUpperCase() === resolvedOutcome.toUpperCase()

      const { data: walletRows } = await supabase
        .from('polymarket_wallets')
        .select('resolved_bets, correct_bets')
        .eq('address', meta.user)
        .limit(1)

      const wallet = walletRows?.[0] as
        | { resolved_bets: number; correct_bets: number }
        | undefined
      if (!wallet) continue

      const newResolvedBets = wallet.resolved_bets + 1
      const newCorrectBets = wallet.correct_bets + (correct ? 1 : 0)
      const newWinRate =
        newResolvedBets >= 5
          ? parseFloat((newCorrectBets / newResolvedBets).toFixed(2))
          : null

      await supabase
        .from('polymarket_wallets')
        .update({
          resolved_bets: newResolvedBets,
          correct_bets: newCorrectBets,
          win_rate: newWinRate,
          updated_at: new Date().toISOString(),
        })
        .eq('address', meta.user)
    }

    console.log(`[discovery] Processed resolution for ${market.slug}: ${resolvedOutcome}`)
  }
}

export function startDiscoveryCron(): void {
  runDiscovery().catch((err) => console.error('[discovery] Unexpected error:', err))
  cron.schedule('0 */2 * * *', () => {
    runDiscovery().catch((err) => console.error('[discovery] Unexpected error:', err))
  })
}
