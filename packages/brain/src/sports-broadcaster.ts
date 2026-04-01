import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { sportsBroadcasterGraph, type FormattedMatchSignal } from './graphs/sports-broadcaster-graph.js'
import { fetchOutcomeOdds, resolveMarketBySlug } from './dome.js'
import calendarRaw from './sports-calendar.json' assert { type: 'json' }

// --- types ---

interface CalendarEntry {
  match: string
  sport: 'epl' | 'ucl'
  kickoff: string
  slugs: {
    home: string
    away: string
    draw?: string
  }
}

type Phase = 'preview' | 'live' | 'post_match'

// --- constants ---

const PREVIEW_OPEN_MS  = 26 * 60 * 60 * 1000   // kickoff - 26h
const PREVIEW_CLOSE_MS =  2 * 60 * 60 * 1000   // kickoff - 2h
const LIVE_CLOSE_MS    =  6 * 60 * 60 * 1000   // kickoff + 6h (covers UCL extra time)
const POST_MATCH_CLOSE_MS = 12 * 60 * 60 * 1000 // kickoff + 12h

const SPORTS_SLUG = /^(ucl|epl|nba|nfl|la-liga)-/
const WATCH_WINDOW_MS = 24 * 60 * 60 * 1000  // start watching 24h before kickoff

// --- supabase ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// --- helpers ---

function deriveSlug(entry: CalendarEntry): string {
  // Strip outcome suffix from home slug: "epl-bou-mun-2026-04-05-bou" → "epl-bou-mun-2026-04-05"
  const homeSlug = entry.slugs.home
  return homeSlug.slice(0, homeSlug.lastIndexOf('-'))
}

function detectPhase(kickoff: Date, now: Date): Phase | null {
  const diff = kickoff.getTime() - now.getTime()

  if (diff <= PREVIEW_OPEN_MS && diff >= PREVIEW_CLOSE_MS) return 'preview'
  if (diff < PREVIEW_CLOSE_MS && diff >= -LIVE_CLOSE_MS) return 'live'
  if (diff < -LIVE_CLOSE_MS && diff >= -POST_MATCH_CLOSE_MS) return 'post_match'
  return null
}

function kickoffHint(kickoff: Date, now: Date): string {
  const diff = kickoff.getTime() - now.getTime()
  if (diff > 0) {
    const h = Math.round(diff / (60 * 60 * 1000))
    return `~${h}h away`
  }
  const elapsed = Math.round(-diff / (60 * 60 * 1000))
  if (elapsed < LIVE_CLOSE_MS / (60 * 60 * 1000)) return 'Live now'
  return `Ended ~${elapsed}h ago`
}

async function hasPostedPhase(slug: string, phase: Phase): Promise<boolean> {
  const agentType = `sports_broadcaster_${phase}`
  const { data } = await supabase
    .from('x_posts')
    .select('id')
    .eq('agent_type', agentType)
    .eq('slug', slug)
    .eq('status', 'draft')  // draft = approved-but-not-yet-tweeted; also check posted
    .limit(1)

  if (data?.length) return true

  const { data: posted } = await supabase
    .from('x_posts')
    .select('id')
    .eq('agent_type', agentType)
    .eq('slug', slug)
    .eq('status', 'posted')
    .limit(1)

  return (posted?.length ?? 0) > 0
}

// fetchLiveOdds removed — replaced by fetchOutcomeOdds (Dome API) called in batch per match

async function fetchMarketHistory(
  allSlugs: string[]
): Promise<{ bet_count: number; distinct_wallets: number; total_volume: number }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('signals')
    .select('metadata')
    .eq('type', 'WHALE_BET')
    .in('metadata->>slug', allSlugs)
    .gte('created_at', since)

  if (!data?.length) return { bet_count: 0, distinct_wallets: 0, total_volume: 0 }
  const rows = data as Array<{ metadata: Record<string, unknown> }>
  return {
    bet_count: rows.length,
    distinct_wallets: new Set(rows.map((r) => r.metadata?.user).filter(Boolean)).size,
    total_volume: rows.reduce((sum, r) => sum + ((r.metadata?.amount as number) ?? 0), 0),
  }
}

// Upsert calendar outcome slugs into polymarket_tracked so the WebSocket stream
// starts receiving ODDS_SHIFT events for them. Idempotent — noop if already tracked.
async function ensureCollectorWatching(entry: CalendarEntry): Promise<void> {
  const allSlugs = [entry.slugs.home, entry.slugs.away, entry.slugs.draw].filter(Boolean) as string[]

  for (const slug of allSlugs) {
    // Skip if already tracked
    const { data: existing } = await supabase
      .from('polymarket_tracked')
      .select('token_id')
      .eq('slug', slug)
      .limit(1)

    if (existing?.length) continue

    // Resolve market data via Dome API (no geo-restriction)
    try {
      const market = await resolveMarketBySlug(slug)
      if (!market) {
        console.warn(`[sports_broadcaster] Dome could not resolve ${slug}`)
        continue
      }

      await supabase.from('polymarket_tracked').upsert(
        {
          token_id: market.token_id,
          no_token_id: market.no_token_id,
          market_id: market.condition_id,
          slug,
          title: market.title,
          volume: market.volume,
          end_date: market.end_date,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token_id' }
      )

      console.log(`[sports_broadcaster] Registered ${slug} in polymarket_tracked`)
    } catch (err) {
      console.warn(`[sports_broadcaster] Could not register ${slug} in polymarket_tracked:`, err)
    }
  }
}

async function fetchWhaleActivity(
  allSlugs: string[],
  since: Date
): Promise<Array<{ slug: string; amount: number; side: string }>> {
  const { data } = await supabase
    .from('signals')
    .select('metadata')
    .eq('type', 'WHALE_BET')
    .in('metadata->>slug', allSlugs)
    .gte('created_at', since.toISOString())

  if (!data?.length) return []
  const rows = data as Array<{ metadata: Record<string, unknown> }>
  return rows.map((r) => ({
    slug: (r.metadata?.slug as string) ?? '',
    amount: (r.metadata?.amount as number) ?? 0,
    side: (r.metadata?.direction as string) ?? 'unknown',
  }))
}

function formatMatchBlock(
  entry: CalendarEntry,
  phase: Phase,
  slug: string,
  outcomes: FormattedMatchSignal['outcomes'],
  history: FormattedMatchSignal['market_history'],
  whaleActivity: FormattedMatchSignal['recent_whale_activity'],
  hint: string
): string {
  const oddsLines = outcomes
    .map((o) => `  ${o.label.padEnd(20)} ${o.live_odds !== null ? `${(o.live_odds * 100).toFixed(0)}%` : 'n/a'}`)
    .join('\n')

  const whaleLine = whaleActivity.length
    ? whaleActivity
        .map((w) => `  $${w.amount.toLocaleString()} on ${w.side} (${w.slug})`)
        .join('\n')
    : '  none'

  return [
    `PHASE: ${phase.toUpperCase()}`,
    `MATCH: ${entry.match} (${entry.sport.toUpperCase()})`,
    `Kickoff: ${entry.kickoff} (${hint})`,
    '',
    'Outcomes (live odds):',
    oddsLines,
    '',
    `Volume (7d): ${history.bet_count} bets, ${history.distinct_wallets} wallets, $${history.total_volume.toLocaleString()} total`,
    '',
    'Whale activity:',
    whaleLine,
  ].join('\n')
}

// --- main runner ---

export async function runSportsBroadcaster(): Promise<void> {
  const calendar = calendarRaw as CalendarEntry[]
  const now = new Date()

  console.log(`[sports_broadcaster] Running at ${now.toISOString()} — ${calendar.length} calendar entries`)

  // Step 1: ensure all matches within 24h are registered in polymarket_tracked
  // so the WebSocket stream covers ODDS_SHIFT. WHALE_BET handled by match-watcher.ts.
  for (const entry of calendar) {
    const kickoff = new Date(entry.kickoff)
    const msUntilKickoff = kickoff.getTime() - now.getTime()
    if (msUntilKickoff <= WATCH_WINDOW_MS && msUntilKickoff >= -LIVE_CLOSE_MS) {
      await ensureCollectorWatching(entry)
    }
  }

  // Step 2: phase detection + posting
  const queue: FormattedMatchSignal[] = []

  for (const entry of calendar) {
    const kickoff = new Date(entry.kickoff)
    const phase = detectPhase(kickoff, now)

    if (!phase) {
      console.log(`[sports_broadcaster] ${entry.match} — outside all phase windows, skipping`)
      continue
    }

    const slug = deriveSlug(entry)
    const alreadyPosted = await hasPostedPhase(slug, phase)

    if (alreadyPosted) {
      console.log(`[sports_broadcaster] ${entry.match} ${phase} — already posted, skipping`)
      continue
    }

    console.log(`[sports_broadcaster] ${entry.match} — queuing ${phase} post`)

    // Fetch live odds for all outcome slugs via Dome (single batched request)
    const outcomeEntries = Object.entries(entry.slugs) as Array<['home' | 'away' | 'draw', string]>
    const allOutcomeSlugs = outcomeEntries.map(([, s]) => s)
    const oddsMap = await fetchOutcomeOdds(allOutcomeSlugs)
    const outcomes: FormattedMatchSignal['outcomes'] = outcomeEntries.map(([label, s]) => ({
      label,
      slug: s,
      live_odds: oddsMap.get(s) ?? null,
    }))

    const allSlugs = outcomeEntries.map(([, s]) => s)
    const history = await fetchMarketHistory(allSlugs)

    // Whale activity: for preview use last 48h, for live/post_match use since kickoff
    const whaleActivitySince = phase === 'preview'
      ? new Date(now.getTime() - 48 * 60 * 60 * 1000)
      : kickoff
    const whaleActivity = await fetchWhaleActivity(allSlugs, whaleActivitySince)

    const hint = kickoffHint(kickoff, now)
    const formatted_text = formatMatchBlock(entry, phase, slug, outcomes, history, whaleActivity, hint)

    queue.push({
      entry,
      phase,
      slug,
      outcomes,
      market_history: history,
      recent_whale_activity: whaleActivity,
      kickoff_hint: hint,
      formatted_text,
    })
  }

  if (!queue.length) {
    console.log('[sports_broadcaster] Nothing to post this run')
    return
  }

  console.log(`[sports_broadcaster] Queued ${queue.length} match(es) — invoking graph`)

  // Fetch recent sports broadcaster timeline for dedup context
  const { data: timelineData } = await supabase
    .from('x_posts')
    .select('draft_text, agent_type, status, created_at, slug')
    .like('agent_type', 'sports_broadcaster_%')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })

  await sportsBroadcasterGraph.invoke({
    matches: queue,
    timeline: timelineData ?? [],
  })

  console.log('[sports_broadcaster] Graph run complete')
}
