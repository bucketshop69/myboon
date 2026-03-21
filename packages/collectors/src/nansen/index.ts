import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { NansenClient } from '@myboon/shared'

const POLL_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const DEDUP_WINDOW_HOURS = 2

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const nansenClient = new NansenClient({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  nansenApiKey: process.env.NANSEN_API_KEY!,
})

// --- types for nansen screener responses ---

interface MarketScreenerItem {
  market_id?: string
  question?: string
  title?: string
  slug?: string
  volume_24h?: number
  category?: string
  open_interest?: number
}

interface EventScreenerItem {
  event_id?: string
  title?: string
  slug?: string
  total_volume_24hr?: number
  volume_24h?: number
  open_interest?: number
  category?: string
  top_market_question?: string
}

// --- weight helpers ---

export function marketSurgeWeight(volume24h: number): number {
  return Math.min(Math.floor(volume24h / 1_000_000) + 5, 10)
}

export function eventTrendingWeight(totalVolume24h: number): number {
  return Math.min(Math.floor(totalVolume24h / 5_000_000) + 4, 10)
}

// --- dedup check ---

async function isDuplicate(type: string, slug: string | null | undefined): Promise<boolean> {
  if (!slug) return false

  const windowStart = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('signals')
    .select('id')
    .eq('type', type)
    .eq('slug', slug)
    .gte('created_at', windowStart)
    .limit(1)

  if (error) {
    console.error('[nansen-collector] Dedup check failed:', error)
    return false
  }

  return (data?.length ?? 0) > 0
}

// --- retry helper ---

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000

export async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn()
    } catch (err) {
      console.error(`[nansen-collector] ${label} attempt ${i + 1}/${MAX_RETRIES} failed:`, err)
      if (i < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (i + 1)))
      }
    }
  }
  return null
}

// --- poll cycle ---

async function pollMarketScreener(): Promise<void> {
  const raw = await withRetry(() => nansenClient.marketScreener(''), 'marketScreener')
  if (!raw) return

  const items = (Array.isArray(raw) ? raw : []) as MarketScreenerItem[]
  const top5 = items
    .filter((m) => typeof m.volume_24h === 'number' && m.volume_24h > 0)
    .sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0))
    .slice(0, 5)

  for (const market of top5) {
    const topic = market.question ?? market.title ?? 'Unknown market'
    const slug = market.slug ?? null
    const volume24h = market.volume_24h ?? 0
    const weight = marketSurgeWeight(volume24h)

    const dup = await isDuplicate('PM_MARKET_SURGE', slug)
    if (dup) {
      console.log(`[nansen-collector] Skipping duplicate PM_MARKET_SURGE for slug: ${slug}`)
      continue
    }

    const signal = {
      source: 'NANSEN' as const,
      type: 'PM_MARKET_SURGE' as const,
      topic,
      slug: slug ?? undefined,
      weight,
      metadata: {
        market_id: market.market_id,
        volume_24h: volume24h,
        open_interest: market.open_interest,
        category: market.category,
        source_endpoint: 'market-screener' as const,
      },
      processed: false,
    }

    const { error } = await supabase.from('signals').insert(signal)
    if (error) {
      console.error(`[nansen-collector] Signal insert failed for PM_MARKET_SURGE (${slug}):`, error)
    } else {
      console.log(`[nansen-collector] Inserted PM_MARKET_SURGE: "${topic}" (slug: ${slug}, weight: ${weight})`)
    }
  }
}

async function pollEventScreener(): Promise<void> {
  const raw = await withRetry(() => nansenClient.eventScreener(''), 'eventScreener')
  if (!raw) return

  const items = (Array.isArray(raw) ? raw : []) as EventScreenerItem[]
  const top5 = items
    .filter((e) => {
      const vol = e.total_volume_24hr ?? e.volume_24h ?? 0
      return vol > 0
    })
    .sort((a, b) => {
      const volA = a.total_volume_24hr ?? a.volume_24h ?? 0
      const volB = b.total_volume_24hr ?? b.volume_24h ?? 0
      return volB - volA
    })
    .slice(0, 5)

  for (const event of top5) {
    const topic = event.title ?? 'Unknown event'
    const slug = event.slug ?? null
    const totalVol = event.total_volume_24hr ?? event.volume_24h ?? 0
    const weight = eventTrendingWeight(totalVol)

    const dup = await isDuplicate('PM_EVENT_TRENDING', slug)
    if (dup) {
      console.log(`[nansen-collector] Skipping duplicate PM_EVENT_TRENDING for slug: ${slug}`)
      continue
    }

    const signal = {
      source: 'NANSEN' as const,
      type: 'PM_EVENT_TRENDING' as const,
      topic,
      slug: slug ?? undefined,
      weight,
      metadata: {
        open_interest: event.open_interest,
        category: event.category,
        top_market_question: event.top_market_question,
        source_endpoint: 'event-screener' as const,
      },
      processed: false,
    }

    const { error } = await supabase.from('signals').insert(signal)
    if (error) {
      console.error(`[nansen-collector] Signal insert failed for PM_EVENT_TRENDING (${slug}):`, error)
    } else {
      console.log(`[nansen-collector] Inserted PM_EVENT_TRENDING: "${topic}" (slug: ${slug}, weight: ${weight})`)
    }
  }
}

async function poll(): Promise<void> {
  console.log(`[nansen-collector] Poll cycle starting at ${new Date().toISOString()}`)
  await pollMarketScreener()
  await pollEventScreener()
  console.log('[nansen-collector] Poll cycle complete')
}

export function startNansenCollector(): void {
  poll().catch((err) => {
    console.error('[nansen-collector] Unexpected error during initial poll:', err)
  })
  setInterval(() => {
    poll().catch((err) => {
      console.error('[nansen-collector] Unexpected error during poll:', err)
    })
  }, POLL_INTERVAL_MS)
}

// Allow running as a standalone PM2 entry point (e.g. myboon-nansen-collector)
// When imported by src/index.ts, the caller invokes startNansenCollector() explicitly.
const isMain = process.argv[1]?.endsWith('nansen/index.ts') ||
  process.argv[1]?.endsWith('nansen/index.js')

if (isMain) {
  startNansenCollector()
}
