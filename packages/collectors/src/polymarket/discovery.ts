import cron from 'node-cron'
import { supabase, fetchTopMarkets, fetchOrderBook } from './client'
import type { Signal } from './types'

export async function runDiscovery(): Promise<void> {
  console.log('[discovery] Running market discovery...')

  let markets
  try {
    markets = await fetchTopMarkets()
  } catch (err) {
    console.error('[discovery] Failed to fetch top markets:', err)
    return
  }

  console.log(`[discovery] Found ${markets.length} markets`)

  let discoveredCount = 0

  for (const market of markets) {
    const [yesTokenId, noTokenId] = market.tokenIds

    let yes_price: number | undefined
    let no_price: number | undefined

    try {
      const book = await fetchOrderBook(yesTokenId)
      if (book) {
        yes_price = book.bestAsk > 0 ? book.bestAsk : book.bestBid
        no_price = yes_price > 0 ? parseFloat((1 - yes_price).toFixed(4)) : undefined
      }
    } catch (err) {
      console.error(`[discovery] Order book fetch failed for ${yesTokenId}:`, err)
    }

    // Upsert into polymarket_tracked
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

    // Insert MARKET_DISCOVERED signal
    const signal: Signal = {
      source: 'POLYMARKET',
      type: 'MARKET_DISCOVERED',
      topic: market.title,
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

    const { error: signalError } = await supabase.from('signals').insert(signal)

    if (signalError) {
      console.error(`[discovery] Signal insert failed for market ${market.id}:`, signalError)
    } else {
      discoveredCount++
    }
  }

  console.log(`[discovery] Done — ${discoveredCount} markets discovered and signalled`)
}

export function startDiscoveryCron(): void {
  runDiscovery().catch((err) => console.error('[discovery] Unexpected error:', err))
  cron.schedule('0 */2 * * *', () => {
    runDiscovery().catch((err) => console.error('[discovery] Unexpected error:', err))
  })
}
