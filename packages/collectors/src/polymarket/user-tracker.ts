import { supabase } from './client'
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
}

// Cache conditionId -> market title to avoid repeated lookups
const marketTitleCache = new Map<string, string>()

async function resolveMarketTitle(conditionId: string): Promise<string> {
  if (!conditionId) return 'Unknown market'
  if (marketTitleCache.has(conditionId)) return marketTitleCache.get(conditionId)!

  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`)
    if (!res.ok) return conditionId
    const markets: GammaMarketLookup[] = await res.json()
    const title = markets?.[0]?.question ?? markets?.[0]?.title ?? conditionId
    marketTitleCache.set(conditionId, title)
    return title
  } catch {
    return conditionId
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
    // Try all possible field names for market title
    const topic =
      activity.title ??
      activity.question ??
      activity.marketQuestion ??
      (activity.conditionId ? await resolveMarketTitle(activity.conditionId) : 'Unknown market')

    const signal = {
      source: 'POLYMARKET',
      type: 'WHALE_BET',
      topic,
      weight: 7,
      metadata: {
        user: address,
        amount: activity.size ?? activity.amount,
        side: activity.side,
        outcome: activity.outcome,
        marketId: activity.conditionId ?? activity.asset,
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
