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
  amount?: number
  side?: string
  outcome?: string
  marketQuestion?: string
  conditionId?: string
  timestamp: string
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

  // Filter to activities newer than the last seen timestamp
  const newActivities = previous
    ? activities.filter((a) => a.timestamp > previous)
    : activities

  if (newActivities.length === 0) return

  for (const activity of newActivities) {
    const signal = {
      source: 'POLYMARKET',
      type: 'WHALE_BET',
      topic: activity.marketQuestion ?? 'Unknown market',
      weight: 7,
      metadata: {
        user: address,
        amount: activity.amount,
        side: activity.side,
        outcome: activity.outcome,
        marketId: activity.conditionId,
      },
    }

    const { error } = await supabase.from('signals').insert(signal)
    if (error) {
      console.error(`[user-tracker] Signal insert failed for ${address} activity ${activity.id}:`, error)
    }
  }

  // Update lastSeen to the most recent activity timestamp
  // Activities are sorted DESC so the first element is the most recent
  lastSeen.set(address, activities[0].timestamp)
  console.log(`[user-tracker] ${address}: ${newActivities.length} new activities processed`)
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
