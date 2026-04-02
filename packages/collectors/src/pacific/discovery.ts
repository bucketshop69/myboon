import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'
import { PacificClient } from '@myboon/shared'
import type { Signal } from '../polymarket/signal-types'
import { formatUsd, annualizedFundingPct, sideLiquidated } from './utils'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const client = new PacificClient('mainnet')

// Thresholds
const LIQUIDATION_OI_DROP_PCT = 0.10   // OI must drop >10%
const LIQUIDATION_PRICE_MOVE_PCT = 0.02 // Price must move >2% in correlated direction
const OI_SURGE_PCT = 0.25              // OI must rise >25%
const FUNDING_SPIKE_THRESHOLD = 0.0001 // 0.01%/hr (~87.6% annualized)
const FUNDING_SPIKE_HIGH = 0.0005      // 0.05%/hr (~438% annualized)
const SIGNAL_COOLDOWN_MS = 2 * 60 * 60 * 1000 // 2h cooldown per symbol per signal type

export async function runPacificDiscovery(): Promise<void> {
  console.log('[pacific/discovery] Running...')

  let prices: Awaited<ReturnType<typeof client.getPrices>>
  try {
    prices = await client.getPrices()
  } catch (err) {
    console.error('[pacific/discovery] Failed to fetch prices:', err)
    return
  }

  console.log(`[pacific/discovery] Fetched ${prices.length} markets`)

  let signalCount = 0
  const now = new Date()

  for (const price of prices) {
    const symbol = price.symbol
    const currentOI = parseFloat(price.open_interest)
    const currentMark = parseFloat(price.mark)
    const yesterdayPrice = parseFloat(price.yesterday_price)
    const fundingRate = parseFloat(price.funding)
    const volume24h = parseFloat(price.volume_24h)

    if (isNaN(currentOI) || isNaN(currentMark)) continue

    // Load existing tracked row
    const { data: rows } = await supabase
      .from('pacific_tracked')
      .select('open_interest, oi_previous, last_signalled_at, funding_rate')
      .eq('symbol', symbol)
      .limit(1)

    const existing = rows?.[0] as
      | { open_interest: number | null; oi_previous: number | null; last_signalled_at: string | null; funding_rate: number | null }
      | undefined

    const previousOI = existing?.open_interest ?? null

    // Upsert current snapshot — always keep fresh
    const { error: upsertErr } = await supabase
      .from('pacific_tracked')
      .upsert(
        {
          symbol,
          open_interest: currentOI,
          volume_24h: isNaN(volume24h) ? null : volume24h,
          mark_price: currentMark,
          funding_rate: isNaN(fundingRate) ? null : fundingRate,
          updated_at: now.toISOString(),
        },
        { onConflict: 'symbol' }
      )

    if (upsertErr) {
      console.error(`[pacific/discovery] Upsert failed for ${symbol}:`, upsertErr)
      continue
    }

    // Skip signal checks if no previous OI to compare against
    if (previousOI === null || previousOI <= 0) continue

    const lastSignalledAt = existing?.last_signalled_at
      ? new Date(existing.last_signalled_at).getTime()
      : null
    const cooldownExpired =
      lastSignalledAt === null || now.getTime() - lastSignalledAt > SIGNAL_COOLDOWN_MS

    if (!cooldownExpired) continue

    const oiDelta = (currentOI - previousOI) / previousOI
    const priceDelta =
      !isNaN(yesterdayPrice) && yesterdayPrice > 0
        ? (currentMark - yesterdayPrice) / yesterdayPrice
        : 0

    let anySignalFired = false

    // --- LIQUIDATION_CASCADE ---
    // OI dropped AND price moved in a correlated direction
    const oiDropped = oiDelta < -LIQUIDATION_OI_DROP_PCT
    const priceMoved = Math.abs(priceDelta) > LIQUIDATION_PRICE_MOVE_PCT
    const correlated =
      (priceDelta < 0 && oiDropped) || // price down + OI down = long liquidations
      (priceDelta > 0 && oiDropped)    // price up + OI down = short liquidations

    if (oiDropped && priceMoved && correlated) {
      const oiDropUsd = Math.abs(currentOI - previousOI)
      const weight = oiDropUsd >= 5_000_000 ? 9 : 7
      const signal: Signal = {
        source: 'PACIFIC',
        type: 'LIQUIDATION_CASCADE',
        topic: `${symbol} liquidation cascade on Pacific`,
        slug: `pacific-liquidation-${symbol.toLowerCase()}-${now.toISOString().slice(0, 13)}`,
        weight,
        metadata: {
          symbol,
          oi_before: previousOI.toString(),
          oi_after: currentOI.toString(),
          oi_drop_usd: oiDropUsd.toFixed(0),
          oi_drop_pct: (Math.abs(oiDelta) * 100).toFixed(1),
          price_move_pct: (priceDelta * 100).toFixed(2),
          side_liquidated: sideLiquidated(priceDelta),
          mark_price: currentMark.toString(),
          oi_drop_formatted: formatUsd(oiDropUsd),
          timestamp: price.timestamp,
        },
      }
      const { error } = await supabase.from('signals').insert(signal)
      if (error) {
        console.error(`[pacific/discovery] LIQUIDATION_CASCADE failed for ${symbol}:`, error)
      } else {
        anySignalFired = true
        signalCount++
        console.log(
          `[pacific/discovery] LIQUIDATION_CASCADE: ${symbol} OI -${(Math.abs(oiDelta) * 100).toFixed(1)}% (${formatUsd(oiDropUsd)}) price ${priceDelta > 0 ? '+' : ''}${(priceDelta * 100).toFixed(1)}%`
        )
      }
    }

    // --- OI_SURGE ---
    if (oiDelta > OI_SURGE_PCT) {
      const oiIncreaseUsd = currentOI - previousOI
      const signal: Signal = {
        source: 'PACIFIC',
        type: 'OI_SURGE',
        topic: `${symbol} open interest surge on Pacific`,
        slug: `pacific-oi-surge-${symbol.toLowerCase()}-${now.toISOString().slice(0, 13)}`,
        weight: 6,
        metadata: {
          symbol,
          oi_before: previousOI.toString(),
          oi_after: currentOI.toString(),
          oi_increase_usd: oiIncreaseUsd.toFixed(0),
          oi_increase_pct: (oiDelta * 100).toFixed(1),
          oi_increase_formatted: formatUsd(oiIncreaseUsd),
          mark_price: currentMark.toString(),
          funding_rate: fundingRate.toString(),
          timestamp: price.timestamp,
        },
      }
      const { error } = await supabase.from('signals').insert(signal)
      if (error) {
        console.error(`[pacific/discovery] OI_SURGE failed for ${symbol}:`, error)
      } else {
        anySignalFired = true
        signalCount++
        console.log(
          `[pacific/discovery] OI_SURGE: ${symbol} +${(oiDelta * 100).toFixed(1)}% (${formatUsd(oiIncreaseUsd)})`
        )
      }
    }

    // --- FUNDING_SPIKE ---
    if (!isNaN(fundingRate) && Math.abs(fundingRate) > FUNDING_SPIKE_THRESHOLD) {
      const annualized = annualizedFundingPct(Math.abs(fundingRate))
      const weight = Math.abs(fundingRate) > FUNDING_SPIKE_HIGH ? 9 : 8
      const signal: Signal = {
        source: 'PACIFIC',
        type: 'FUNDING_SPIKE',
        topic: `${symbol} funding spike on Pacific`,
        slug: `pacific-funding-${symbol.toLowerCase()}-${now.toISOString().slice(0, 13)}`,
        weight,
        metadata: {
          symbol,
          funding_rate: fundingRate.toString(),
          funding_rate_annualized: annualized.toString(),
          next_funding: price.next_funding,
          open_interest: currentOI.toString(),
          open_interest_formatted: formatUsd(currentOI),
          timestamp: price.timestamp,
        },
      }
      const { error } = await supabase.from('signals').insert(signal)
      if (error) {
        console.error(`[pacific/discovery] FUNDING_SPIKE failed for ${symbol}:`, error)
      } else {
        anySignalFired = true
        signalCount++
        console.log(
          `[pacific/discovery] FUNDING_SPIKE: ${symbol} funding ${(fundingRate * 100).toFixed(4)}%/period (${annualized}% annualized)`
        )
      }
    }

    // Update last_signalled_at and oi_previous when any signal fired
    if (anySignalFired) {
      await supabase
        .from('pacific_tracked')
        .update({
          last_signalled_at: now.toISOString(),
          oi_previous: currentOI,
        })
        .eq('symbol', symbol)
    }
  }

  console.log(`[pacific/discovery] Done — ${signalCount} signals emitted across ${prices.length} markets`)
}

export function startPacificDiscoveryCron(): void {
  runPacificDiscovery().catch((err) =>
    console.error('[pacific/discovery] Unexpected error:', err)
  )
  cron.schedule('0 */2 * * *', () => {
    runPacificDiscovery().catch((err) =>
      console.error('[pacific/discovery] Unexpected error:', err)
    )
  })
}
