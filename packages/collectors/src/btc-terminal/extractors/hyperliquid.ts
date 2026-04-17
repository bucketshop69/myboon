/**
 * Hyperliquid BTC extractor — public API, no auth needed
 * Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */

import type { HyperliquidBTCData } from '../types'

const API_URL = 'https://api.hyperliquid.xyz/info'

async function post(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Hyperliquid API error: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function extractHyperliquid(): Promise<HyperliquidBTCData> {
  // 1. Get all asset metadata to find BTC index
  const meta = await post({ type: 'meta' })
  const btcIndex = meta.universe.findIndex(
    (a: { name: string }) => a.name === 'BTC'
  )
  if (btcIndex === -1) throw new Error('BTC not found in Hyperliquid universe')

  // 2. Get asset contexts (funding, OI, price, volume)
  const contexts = await post({ type: 'metaAndAssetCtxs' })
  const ctx = contexts[1][btcIndex]

  const markPrice = parseFloat(ctx.markPx)
  const prevDayPrice = parseFloat(ctx.prevDayPx)
  const fundingRate = parseFloat(ctx.funding)
  const openInterest = parseFloat(ctx.openInterest)
  const volume24h = parseFloat(ctx.dayNtlVlm)

  const change24h = markPrice - prevDayPrice
  const change24hPct = prevDayPrice > 0 ? (change24h / prevDayPrice) * 100 : 0

  // Annualize: Hyperliquid funding is per 1h, so * 24 * 365
  const fundingAnnualized = parseFloat((fundingRate * 24 * 365 * 100).toFixed(2))

  return {
    price: markPrice,
    change24h: parseFloat(change24h.toFixed(2)),
    change24hPct: parseFloat(change24hPct.toFixed(2)),
    fundingRate,
    fundingAnnualized,
    openInterest,
    volume24h,
  }
}
