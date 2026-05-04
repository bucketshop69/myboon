/**
 * Match-aware collector — Phase 2 of #050 Sports Content Pipeline
 *
 * For every match in sports-calendar.json with kickoff <= 24h away,
 * polls Polymarket trade activity on all outcome slugs and writes
 * WHALE_BET signals to the signals table.
 *
 * Runs every 5 minutes alongside the existing user-tracker.
 * Complements (does not replace) user-tracker — covers bets from any wallet,
 * not just the tracked-users.json whitelist.
 */

import path from 'path'
import { supabase } from './supabase'
import { validateSignal } from './validate-signal'
import type { Signal } from './signal-types'

// Load sports calendar from brain package — same source of truth
// __dirname is available in CommonJS (collectors tsconfig uses module: CommonJS)
const CALENDAR_PATH = path.resolve(__dirname, '../../../brain/src/sports-calendar.json')

const DATA_API = 'https://data-api.polymarket.com'
const POLL_INTERVAL_MS = 5 * 60 * 1000
const WATCH_WINDOW_MS = 24 * 60 * 60 * 1000   // start watching 24h before kickoff
const MATCH_WINDOW_MS = 12 * 60 * 60 * 1000   // stop watching 12h after kickoff
const MIN_BET_AMOUNT = 500                      // same threshold as user-tracker

interface CalendarEntry {
  match: string
  sport: string
  kickoff: string
  slugs: { home: string; away: string; draw?: string }
}

interface PolyTrade {
  id: string
  proxyWallet: string
  side?: string
  outcome?: string
  size?: number
  amount?: number
  price?: number
  tradePrice?: number
  marketPrice?: number
  conditionId?: string
  asset?: string
  title?: string
  question?: string
  timestamp: string
}

// In-memory: conditionId -> last seen trade timestamp
const lastSeen = new Map<string, string>()

function loadCalendar(): CalendarEntry[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(CALENDAR_PATH) as CalendarEntry[]
  } catch (err) {
    console.error('[match-watcher] Failed to load sports calendar:', err)
    return []
  }
}

function isInWatchWindow(kickoff: Date, now: Date): boolean {
  const diff = kickoff.getTime() - now.getTime()
  return diff <= WATCH_WINDOW_MS && diff >= -MATCH_WINDOW_MS
}

// Resolve slug -> conditionId via polymarket_tracked table
async function resolveConditionId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('polymarket_tracked')
    .select('market_id')
    .eq('slug', slug)
    .limit(1)

  const row = data?.[0] as { market_id?: string } | undefined
  if (row?.market_id) return row.market_id

  // Fallback: Dome API (geo-unrestricted)
  try {
    const key = process.env.DOME_API_KEY
    if (!key) return null
    const res = await fetch(
      `https://api.domeapi.io/v1/polymarket/markets?market_slug=${encodeURIComponent(slug)}&limit=1`,
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
    )
    if (!res.ok) return null
    const data = await res.json() as { markets?: Array<{ condition_id?: string }> }
    return data.markets?.[0]?.condition_id ?? null
  } catch {
    return null
  }
}


function normalizeOdds(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null
}

async function fetchMarketOddsAtBet(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`)
    if (!res.ok) return null
    const data = await res.json() as Array<{ outcomePrices?: string[] }>
    const price = Number(data[0]?.outcomePrices?.[0])
    return normalizeOdds(price)
  } catch {
    return null
  }
}

function betWeight(amount?: number): number {
  if (!amount || amount < MIN_BET_AMOUNT) return 0
  if (amount < 2000) return 6
  if (amount < 10000) return 8
  return 10
}

async function pollMatchTrades(
  slug: string,
  conditionId: string,
  matchTitle: string
): Promise<void> {
  const url = `${DATA_API}/activity?market=${conditionId}&limit=50&sortBy=TIMESTAMP&sortDirection=DESC`

  let trades: PolyTrade[]
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[match-watcher] Trade fetch failed for ${slug}: ${res.status}`)
      return
    }
    trades = await res.json()
  } catch (err) {
    console.error(`[match-watcher] Fetch error for ${slug}:`, err)
    return
  }

  if (!trades?.length) return

  const previous = lastSeen.get(conditionId)
  const newTrades = previous
    ? trades.filter((t) => t.timestamp > previous)
    : trades

  if (!newTrades.length) return

  let signalCount = 0

  for (const trade of newTrades) {
    const amount = trade.size ?? trade.amount
    const weight = betWeight(amount)
    if (weight === 0) continue

    const tradePrice = normalizeOdds(trade.tradePrice ?? trade.price ?? trade.marketPrice ?? null)
    const marketOddsAtBet = tradePrice ?? await fetchMarketOddsAtBet(slug)

    const signal: Signal = {
      source: 'POLYMARKET',
      type: 'WHALE_BET',
      topic: trade.title ?? trade.question ?? matchTitle,
      slug,
      weight,
      metadata: {
        user: trade.proxyWallet,
        amount,
        side: trade.side,
        outcome: trade.outcome,
        marketId: conditionId,
        slug,
        activityTimestamp: trade.timestamp,
        tradePrice,
        marketOddsAtBet,
        source: 'match-watcher',   // distinguishes from user-tracker signals
      },
    }

    try {
      validateSignal(signal)
    } catch (err) {
      continue
    }

    const { error } = await supabase.from('signals').insert(signal)
    if (error) {
      console.error(`[match-watcher] Signal insert failed for ${slug}:`, error)
    } else {
      signalCount++
    }
  }

  lastSeen.set(conditionId, trades[0].timestamp)

  if (signalCount > 0) {
    console.log(`[match-watcher] ${matchTitle} (${slug}): ${signalCount} WHALE_BET signal(s)`)
  }
}

async function runMatchWatcher(): Promise<void> {
  const calendar = loadCalendar()
  const now = new Date()

  const activeMatches = calendar.filter((e) => isInWatchWindow(new Date(e.kickoff), now))

  if (!activeMatches.length) return

  console.log(`[match-watcher] Watching ${activeMatches.length} match(es)`)

  for (const entry of activeMatches) {
    const allSlugs = [entry.slugs.home, entry.slugs.away, entry.slugs.draw].filter(Boolean) as string[]

    for (const slug of allSlugs) {
      const conditionId = await resolveConditionId(slug)
      if (!conditionId) {
        console.warn(`[match-watcher] Could not resolve conditionId for slug: ${slug}`)
        continue
      }
      await pollMatchTrades(slug, conditionId, entry.match)
    }
  }
}

export function startMatchWatcher(): void {
  runMatchWatcher().catch((err) => console.error('[match-watcher] Unexpected error:', err))
  setInterval(() => {
    runMatchWatcher().catch((err) => console.error('[match-watcher] Unexpected error:', err))
  }, POLL_INTERVAL_MS)
}
