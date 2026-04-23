import WebSocket from 'ws'
import { supabase } from './supabase'
import type { Signal } from './signal-types'
import { validateSignal } from './validate-signal'

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
const SHIFT_THRESHOLD = parseFloat(process.env.ODDS_SHIFT_THRESHOLD || '0.05')
const RECONNECT_DELAY_MS = 5000

// In-memory price cache: tokenId -> last known yes_price
const priceCache = new Map<string, number>()

interface BestBidAskMessage {
  event_type: string
  asset_id: string
  best_bid: string
  best_ask: string
}

interface TrackedMarket {
  token_id: string
  market_id: string
  slug: string
  title: string
}

async function loadTrackedMarkets(): Promise<TrackedMarket[]> {
  const { data, error } = await supabase
    .from('polymarket_tracked')
    .select('token_id, market_id, slug, title')

  if (error) {
    console.error('[stream] Failed to load tracked markets:', error)
    return []
  }

  return (data as TrackedMarket[]) ?? []
}

async function handlePriceUpdate(
  assetId: string,
  newPrice: number,
  markets: Map<string, TrackedMarket>
): Promise<void> {
  const market = markets.get(assetId)
  if (!market) return

  const prevPrice = priceCache.get(assetId)

  if (prevPrice === undefined) {
    // First price seen — seed cache, no signal
    priceCache.set(assetId, newPrice)
    return
  }

  const shift = Math.abs(newPrice - prevPrice)
  if (shift < SHIFT_THRESHOLD) return

  priceCache.set(assetId, newPrice)

  const signal: Signal = {
    source: 'POLYMARKET',
    type: 'ODDS_SHIFT',
    topic: market.title,
    slug: market.slug,
    weight: Math.round(Math.min(shift / SHIFT_THRESHOLD, 5)),
    metadata: {
      marketId: market.market_id,
      slug: market.slug,
      yes_price: newPrice,
      no_price: parseFloat((1 - newPrice).toFixed(4)),
      shift_from: prevPrice,
      shift_to: newPrice,
    },
  }

  try {
    validateSignal(signal)
  } catch (err) {
    console.error((err as Error).message)
    return
  }

  const { error } = await supabase.from('signals').insert(signal)
  if (error) {
    console.error(`[stream] Signal insert failed for asset ${assetId}:`, error)
  } else {
    console.log(
      `[stream] ODDS_SHIFT for "${market.title}": ${prevPrice.toFixed(3)} -> ${newPrice.toFixed(3)} (shift: ${shift.toFixed(3)})`
    )
  }
}

function openWebSocket(tokenIds: string[], markets: Map<string, TrackedMarket>): void {
  console.log(`[stream] Connecting to ${WS_URL} with ${tokenIds.length} assets...`)

  const ws = new WebSocket(WS_URL)

  ws.on('open', () => {
    console.log('[stream] WebSocket connected, subscribing to market channel')
    ws.send(
      JSON.stringify({
        type: 'market',
        assets_ids: tokenIds,
        custom_feature_enabled: true,
      })
    )
  })

  ws.on('message', (data: WebSocket.RawData) => {
    let raw: string
    if (Buffer.isBuffer(data)) {
      raw = data.toString('utf8')
    } else if (typeof data === 'string') {
      raw = data
    } else {
      return
    }

    let msg: BestBidAskMessage
    try {
      msg = JSON.parse(raw)
      if (msg.event_type !== 'best_bid_ask') return
    } catch {
      return
    }

    // Use best_ask as the yes_price (cost to buy YES = implied probability)
    const price = parseFloat(msg.best_ask)
    if (isNaN(price) || !msg.asset_id) return

    handlePriceUpdate(msg.asset_id, price, markets).catch((err) =>
      console.error('[stream] Error handling price update:', err)
    )
  })

  ws.on('close', (code, reason) => {
    console.warn(
      `[stream] WebSocket closed (code=${code}, reason=${reason.toString()}), reconnecting in ${RECONNECT_DELAY_MS}ms...`
    )
    setTimeout(() => startStream(), RECONNECT_DELAY_MS)
  })

  ws.on('error', (err) => {
    console.error('[stream] WebSocket error:', err)
    // 'close' event will fire after error, which triggers reconnect
  })
}

export async function startStream(): Promise<void> {
  let trackedMarkets: TrackedMarket[]
  try {
    trackedMarkets = await loadTrackedMarkets()
  } catch (err) {
    console.error('[stream] Failed to load markets, retrying in 5s:', err)
    setTimeout(() => startStream(), RECONNECT_DELAY_MS)
    return
  }

  if (trackedMarkets.length === 0) {
    console.warn('[stream] No tracked markets found, retrying in 30s...')
    setTimeout(() => startStream(), 30_000)
    return
  }

  const tokenIds = trackedMarkets.map((m) => m.token_id)
  const marketsMap = new Map<string, TrackedMarket>(
    trackedMarkets.map((m) => [m.token_id, m])
  )

  openWebSocket(tokenIds, marketsMap)
}
