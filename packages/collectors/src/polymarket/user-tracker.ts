import { supabase } from './supabase'
import { validateSignal } from './validate-signal'
import trackedUsers from './tracked-users.json'

const DATA_API = 'https://data-api.polymarket.com'
const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// In-memory: address -> last seen activity timestamp
const lastSeen = new Map<string, string>()

interface PolyActivity {
  id: string
  type: string
  proxyWallet: string
  size?: number
  amount?: number
  side?: string
  outcome?: string
  title?: string
  question?: string
  marketQuestion?: string
  conditionId?: string
  asset?: string
  timestamp: string
}

// Noise filter — skip short-term binary markets
const NOISE_PATTERNS = [
  /updown/i,
  /up or down/i,
  /up\/down/i,
]

function isNoisyMarket(topic: string, conditionId?: string): boolean {
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(topic)) return true
    if (conditionId && pattern.test(conditionId)) return true
  }
  return false
}

// Weight based on bet size — returns 0 to skip
function betWeight(amount?: number): number {
  if (!amount || amount < 500) return 0
  if (amount < 2000) return 6
  if (amount < 10000) return 8
  return 10
}

// Cache conditionId -> { title, slug } to avoid repeated lookups
const marketCache = new Map<string, { title: string; slug: string | null }>()

async function resolveMarket(conditionId: string): Promise<{ title: string; slug: string | null }> {
  if (!conditionId) return { title: 'Unknown market', slug: null }
  if (marketCache.has(conditionId)) return marketCache.get(conditionId)!

  // Check polymarket_tracked first — has both title and slug
  const { data: rows } = await supabase
    .from('polymarket_tracked')
    .select('title, slug')
    .eq('market_id', conditionId)
    .limit(1)

  const tracked = rows?.[0]
  if (tracked?.title) {
    const result = { title: tracked.title, slug: tracked.slug ?? null }
    marketCache.set(conditionId, result)
    return result
  }

  // Fallback to Gamma API
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`)
    if (!res.ok) return { title: conditionId, slug: null }
    const markets = await res.json()
    if (!Array.isArray(markets) || markets.length === 0) {
      return { title: conditionId, slug: null }
    }
    const m = markets[0]
    const title: string = typeof m.question === 'string' ? m.question
      : typeof m.title === 'string' ? m.title
      : conditionId
    const slug: string | null = typeof m.slug === 'string' ? m.slug : null
    const result = { title, slug }
    marketCache.set(conditionId, result)
    return result
  } catch {
    return { title: conditionId, slug: null }
  }
}

async function upsertWallet(
  address: string,
  amount: number,
  label: string
): Promise<{ total_bets: number; win_rate: number | null; label: string }> {
  const { data: existing } = await supabase
    .from('polymarket_wallets')
    .select('total_bets, total_volume, win_rate, label')
    .eq('address', address)
    .limit(1)

  const prev = existing?.[0] as
    | { total_bets: number; total_volume: number; win_rate: number | null; label: string }
    | undefined

  const newTotalBets = (prev?.total_bets ?? 0) + 1
  const newTotalVolume = (prev?.total_volume ?? 0) + amount

  const { error } = await supabase
    .from('polymarket_wallets')
    .upsert(
      {
        address,
        label,
        total_bets: newTotalBets,
        total_volume: newTotalVolume,
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        win_rate: prev?.win_rate ?? null,
      },
      { onConflict: 'address' }
    )

  if (error) {
    console.error(`[user-tracker] Wallet upsert failed for ${address}:`, error)
  }

  return {
    total_bets: newTotalBets,
    win_rate: prev?.win_rate ?? null,
    label,
  }
}

async function pollUser(address: string): Promise<void> {
  const url = `${DATA_API}/activity?user=${address}&limit=20&sortBy=TIMESTAMP&sortDirection=DESC`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`[user-tracker] Activity fetch failed for ${address}: ${res.status} ${res.statusText}`)
    return
  }

  const activities: PolyActivity[] = await res.json()
  if (!activities || activities.length === 0) return

  const previous = lastSeen.get(address)

  const newActivities = previous
    ? activities.filter((a) => a.timestamp > previous)
    : activities

  if (newActivities.length === 0) return

  for (const activity of newActivities) {
    const rawAmount = activity.size ?? activity.amount

    // Skip tiny bets
    const weight = betWeight(rawAmount)
    if (weight === 0) continue

    // Resolve market title + slug (polymarket_tracked first, Gamma API fallback)
    const conditionId = activity.conditionId ?? activity.asset
    const { title: resolvedTitle, slug } = conditionId
      ? await resolveMarket(conditionId)
      : { title: 'Unknown market', slug: null }

    const topic =
      activity.title ??
      activity.question ??
      activity.marketQuestion ??
      resolvedTitle

    // Skip noise markets
    if (isNoisyMarket(topic, conditionId)) continue

    // Skip WHALE_BET if slug is unresolvable — loud warning
    if (slug === null) {
      console.warn(`[user-tracker] Skipping WHALE_BET for ${conditionId} — slug unresolvable`)
      continue
    }

    // Determine wallet label and upsert stats
    const isTracked = (trackedUsers as string[]).includes(address)
    const walletLabel = isTracked ? 'tracked-whale' : 'unknown'
    const walletStats = await upsertWallet(address, rawAmount ?? 0, walletLabel)

    const signal = {
      source: 'POLYMARKET' as const,
      type: 'WHALE_BET' as const,
      topic,
      slug,
      weight,
      metadata: {
        user: address,
        amount: rawAmount,
        side: activity.side,
        outcome: activity.outcome,
        marketId: conditionId,
        slug, // keep in metadata for backwards compat
        walletTotalBets: walletStats.total_bets,
        walletWinRate: walletStats.win_rate,
        walletLabel: walletStats.label,
      },
    }

    try {
      validateSignal(signal)
    } catch (err) {
      console.error((err as Error).message)
      continue
    }

    const { error } = await supabase.from('signals').insert(signal)
    if (error) {
      console.error(`[user-tracker] Signal insert failed for ${address}:`, error)
    }
  }

  lastSeen.set(address, activities[0].timestamp)
  console.log(`[user-tracker] ${address.slice(0, 10)}...: ${newActivities.length} new activities`)
}

export function startUserTracker(): void {
  const addresses: string[] = trackedUsers

  const pollAll = (): void => {
    for (const address of addresses) {
      pollUser(address).catch((err) => {
        console.error(`[user-tracker] Unexpected error polling ${address}:`, err)
      })
    }
  }

  pollAll()
  setInterval(pollAll, POLL_INTERVAL_MS)
}
