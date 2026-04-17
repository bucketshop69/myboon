/**
 * BTC Terminal — daily snapshot extractor
 *
 * Run: npx tsx src/btc-terminal/index.ts  (from packages/collectors)
 *
 * - Pulls data from Polymarket (Dome), Hyperliquid, Pacific
 * - Loads yesterday's snapshot for delta comparison
 * - Saves today's snapshot to snapshots/{date}.json
 * - Prints conversational post ready for X
 */

import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { extractPolymarket } from './extractors/polymarket'
import { extractHyperliquid } from './extractors/hyperliquid'
import { extractPacific } from './extractors/pacific'
import type { BTCTerminalSnapshot } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNAPSHOTS_DIR = join(__dirname, 'snapshots')

function todayDate(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function yesterdayDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function loadSnapshot(date: string): BTCTerminalSnapshot | null {
  const path = join(SNAPSHOTS_DIR, `${date}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function saveSnapshot(date: string, snapshot: BTCTerminalSnapshot): void {
  const path = join(SNAPSHOTS_DIR, `${date}.json`)
  writeFileSync(path, JSON.stringify(snapshot, null, 2))
  console.log(`[snapshot] Saved to ${path}`)
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

function delta(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return ''
  const diff = (current - previous) * 100
  if (Math.abs(diff) < 0.5) return ''
  const sign = diff > 0 ? '↑' : '↓'
  return ` (${sign}${Math.abs(diff).toFixed(0)}pp)`
}

function describeFunding(hlRate: number, pacRate: number | null): string {
  const hlDir = hlRate >= 0 ? 'positive' : 'negative'

  if (pacRate !== null && (hlRate >= 0) !== (pacRate >= 0)) {
    // Divergence — just describe the overall picture without comparing
    if (hlRate >= 0) {
      return 'Funding mixed. Longs paying on some venues, shorts on others. No clear consensus.'
    }
    return 'Funding mixed. Shorts paying on some venues, longs on others. Market can\'t make up its mind.'
  }

  if (hlRate >= 0 && (pacRate === null || pacRate >= 0)) {
    const hlAnn = Math.abs(hlRate * 24 * 365 * 100)
    if (hlAnn > 10) return 'Funding rates running hot positive. Longs are crowded and paying for it.'
    return 'Funding rates positive across the board. Longs paying shorts — bullish lean but not extreme.'
  }

  const hlAnn = Math.abs(hlRate * 24 * 365 * 100)
  if (hlAnn > 10) return 'Funding rates deep negative. Shorts are crowded and paying for it. Squeeze territory.'
  return 'Funding rates negative across the board. Shorts paying longs right now. Bears are crowded and paying for it.'
}

function describeFundingDelta(
  hlRate: number,
  prevHlRate: number | undefined
): string {
  if (prevHlRate === undefined) return ''
  const flipped = (hlRate >= 0) !== (prevHlRate >= 0)
  if (flipped) {
    return hlRate >= 0
      ? ' Flipped positive overnight — sentiment shifted.'
      : ' Flipped negative overnight — sentiment shifted.'
  }
  return ''
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function run() {
  const today = todayDate()
  const yesterday = yesterdayDate()
  const prev = loadSnapshot(yesterday)

  if (prev) {
    console.log(`[snapshot] Loaded yesterday's snapshot (${yesterday})`)
  } else {
    console.log(`[snapshot] No previous snapshot found for ${yesterday} — first run`)
  }

  // Fetch all sources
  const [polymarket, hyperliquid, pacific] = await Promise.allSettled([
    extractPolymarket(),
    extractHyperliquid(),
    extractPacific(),
  ])

  const snapshot: BTCTerminalSnapshot = {
    timestamp: new Date().toISOString(),
    polymarket:
      polymarket.status === 'fulfilled'
        ? polymarket.value
        : { priceTargets: {}, athTiming: {}, assetRace: {} },
    hyperliquid:
      hyperliquid.status === 'fulfilled'
        ? hyperliquid.value
        : { price: 0, change24h: 0, change24hPct: 0, fundingRate: 0, fundingAnnualized: 0, openInterest: 0, volume24h: 0 },
    pacific: pacific.status === 'fulfilled' ? pacific.value : null,
  }

  if (polymarket.status === 'rejected') console.error('[FAILED] Polymarket:', polymarket.reason)
  if (hyperliquid.status === 'rejected') console.error('[FAILED] Hyperliquid:', hyperliquid.reason)
  if (pacific.status === 'rejected') console.error('[FAILED] Pacific:', pacific.reason)

  // Save today's snapshot
  saveSnapshot(today, snapshot)

  // Also dump raw JSON for debugging
  console.log('\n--- RAW SNAPSHOT ---')
  console.log(JSON.stringify(snapshot, null, 2))

  // --- Build conversational post ---
  const hl = snapshot.hyperliquid
  const pac = snapshot.pacific
  const pm = snapshot.polymarket

  const dateStr = formatDate(new Date())
  const priceStr = `$${hl.price.toLocaleString()}`
  const changeStr = `${hl.change24hPct >= 0 ? '+' : ''}${hl.change24hPct}%`

  // Price line with yesterday comparison
  let priceLine: string
  if (prev) {
    const prevPrice = prev.hyperliquid.price
    const dayMove = hl.price - prevPrice
    const dayMovePct = prevPrice > 0 ? ((dayMove / prevPrice) * 100).toFixed(1) : '0'
    if (Math.abs(parseFloat(dayMovePct)) < 0.5) {
      priceLine = `${priceStr} (${changeStr}) — flat day but the data tells a different story.`
    } else if (parseFloat(dayMovePct) > 2) {
      priceLine = `${priceStr} (${changeStr}) — big move up from yesterday's ${prev.hyperliquid.price.toLocaleString()}.`
    } else if (parseFloat(dayMovePct) < -2) {
      priceLine = `${priceStr} (${changeStr}) — sold off from yesterday's ${prev.hyperliquid.price.toLocaleString()}.`
    } else if (parseFloat(dayMovePct) > 0) {
      priceLine = `${priceStr} (${changeStr}) — grinding up from yesterday's $${prev.hyperliquid.price.toLocaleString()}.`
    } else {
      priceLine = `${priceStr} (${changeStr}) — drifting down from yesterday's $${prev.hyperliquid.price.toLocaleString()}.`
    }
  } else {
    priceLine = `${priceStr} (${changeStr})`
  }

  // Funding
  const fundingDesc = describeFunding(hl.fundingRate, pac?.fundingRate ?? null)
  const fundingDelta = prev ? describeFundingDelta(hl.fundingRate, prev.hyperliquid.fundingRate) : ''

  // Key prediction market levels
  const p = (key: string) => pm.priceTargets[key] ?? null
  const pp = (key: string) => prev?.polymarket.priceTargets[key] ?? null

  const reach80 = p('↑ $80k')
  const reach100 = p('↑ $100k')
  const dip55 = p('↓ $55k')
  const athDec = pm.athTiming['By Dec 2026'] ?? null

  const gold = pm.assetRace['Gold'] ?? null
  const btcRace = pm.assetRace['Bitcoin'] ?? null
  const sp = pm.assetRace['the S&P 500'] ?? null

  // Build post lines
  const lines: string[] = []
  lines.push(`BTC Daily | ${dateStr}`)
  lines.push('')
  lines.push(priceLine)
  lines.push('')
  lines.push(`${fundingDesc}${fundingDelta}`)
  lines.push('')
  lines.push(`Where's the money going in prediction markets?`)
  lines.push('')

  if (reach80 !== null) {
    lines.push(`${pct(reach80)} odds BTC hits $80k this year${delta(reach80, pp('↑ $80k'))}. Only ${reach100 !== null ? pct(reach100) : '?'} for $100k${delta(reach100, pp('↑ $100k'))}.`)
  }
  if (dip55 !== null) {
    lines.push(`But ${pct(dip55)} chance it dips to $55k first${delta(dip55, pp('↓ $55k'))}. Up eventually, pain first.`)
  }

  lines.push('')
  if (athDec !== null) {
    const prevAth = prev?.polymarket.athTiming['By Dec 2026'] ?? null
    lines.push(`ATH by end of 2026? Only ${pct(athDec)} think so${delta(athDec, prevAth)}.`)
  }

  lines.push('')
  if (gold !== null && btcRace !== null && sp !== null) {
    const prevGold = prev?.polymarket.assetRace['Gold'] ?? null
    const prevBtc = prev?.polymarket.assetRace['Bitcoin'] ?? null
    lines.push(`In the 2026 asset race — Gold leads at ${pct(gold)}${delta(gold, prevGold)}, BTC at ${pct(btcRace)}${delta(btcRace, prevBtc)}, S&P at ${pct(sp)}. Real gold still winning.`)
  }

  const post = lines.join('\n')

  console.log('\n--- POST ---')
  console.log(post)
  console.log('\n--- END POST ---')
  console.log(`\nCharacters: ${post.length}`)
}

run().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
