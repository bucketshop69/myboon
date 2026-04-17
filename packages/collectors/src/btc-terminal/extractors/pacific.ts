/**
 * Pacific BTC extractor — uses existing PacificClient from @myboon/shared
 * No auth needed for getPrices() (public endpoint)
 */

import { PacificClient } from '@myboon/shared'
import type { PacificBTCData } from '../types'

const client = new PacificClient('mainnet')

export async function extractPacific(): Promise<PacificBTCData | null> {
  const prices = await client.getPrices()

  // Find BTC market — symbol could be BTC, BTC-PERP, BTCUSD, etc.
  const btc = prices.find(
    (p) => p.symbol === 'BTC' || p.symbol === 'BTC-PERP' || p.symbol.startsWith('BTC')
  )

  if (!btc) {
    console.warn('[pacific] No BTC market found. Available:', prices.map((p) => p.symbol).join(', '))
    return null
  }

  const markPrice = parseFloat(btc.mark)
  // Use next_funding (upcoming rate) — matches what Pacific app displays
  const fundingRate = parseFloat(btc.next_funding ?? btc.funding)
  const openInterest = parseFloat(btc.open_interest)
  const volume24h = parseFloat(btc.volume_24h)

  // Annualize: Pacific funding is per 1h, so * 24 * 365
  const fundingAnnualized = parseFloat((fundingRate * 24 * 365 * 100).toFixed(2))

  return {
    markPrice,
    fundingRate,
    fundingAnnualized,
    openInterest,
    volume24h,
  }
}
