import { supabase } from './supabase'
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

interface GammaMarketLookup {
  question?: string
  title?: string
  slug?: string
}

// Noise filter — skip short-term binary markets (updown slugs)
const NOISE_SLUG_PATTERN = /updown/i

function isNoisyMarket(topic: string, conditionId?: string): boolean {
  if (NOISE_SLUG_PATTERN.test(topic)) return true
  if (conditionId && NOISE_SLUG_PATTERN.test(conditionId)) return true
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
  const { data } = await supabase
    .from('polymarket_tracked')
    .select('title, slug')
    .eq('market_id', conditionId)
    .limit(1)
    .single()

  if (data?.title) {
    const result = { title: data.title, slug: data.slug ?? null }
    marketCache.set(conditionId, result)
    return result
  }

  // Fallback to Gamma API — title only, no slug
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`)
    if (!res.ok) return { title: conditionId, slug: null }
    const markets: GammaMarketLookup[] = await res.json()
    const title = markets?.[0]?.question ?? markets?.[0]?.title ?? conditionId
    const slug = markets?.[0]?.slug ?? null
    const result = { title, slug }
    marketCache.set(conditionId, result)
    return result
  } catch {
    return { title: conditionId, slug: null }
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

    const signal = {
      source: 'POLYMARKET',
      type: 'WHALE_BET',
      topic,
      weight,
      metadata: {
        user: address,
        amount: rawAmount,
        side: activity.side,
        outcome: activity.outcome,
        marketId: conditionId,
        ...(slug ? { slug } : {}),
      },
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
