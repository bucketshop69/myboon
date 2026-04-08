/**
 * Dome API client for packages/api
 * REST base: https://api.domeapi.io/v1
 *
 * Confirmed endpoints (verified via live testing):
 *   GET /v1/polymarket/markets?market_slug=...           → { markets: DomeMarket[] }
 *   GET /v1/polymarket/markets?event_slug=...            → { markets: DomeMarket[] }
 *   GET /v1/polymarket/markets?tags=ucl&status=open      → { markets: DomeMarket[] }
 *   GET /v1/polymarket/market-price/:tokenId             → { price: number, at_time: number }
 *
 * Events endpoint (/polymarket/events) is NOT used for sports — it returns individual
 * outcome markets as "events", not grouped match events, and lacks nested markets.
 * Sports use the markets endpoint grouped by event_slug.
 */

const DOME_BASE = 'https://api.domeapi.io/v1'

// ---- availability ----

export function isDomeAvailable(): boolean {
  return !!process.env.DOME_API_KEY?.trim()
}

function domeHeaders(): Record<string, string> {
  const key = process.env.DOME_API_KEY
  if (!key) throw new Error('DOME_API_KEY not set')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function domeFetch(path: string): Promise<Response> {
  return fetch(`${DOME_BASE}${path}`, { headers: domeHeaders() })
}

// ---- types (confirmed from live API responses) ----

export interface DomeMarket {
  market_slug: string
  event_slug: string
  title: string
  condition_id: string
  status: string                       // "open" | "closed" | "resolved"
  start_time: number | null
  end_time: number | null
  completed_time: number | null
  close_time: number | null
  volume_1_week: number
  volume_1_month: number
  volume_1_year: number
  volume_total: number
  resolution_source: string | null
  image: string | null
  description: string | null
  negative_risk_id: string | null
  game_start_time: string | null       // ISO string, set for match-level outcome markets
  side_a: { id: string; label: string }
  side_b: { id: string; label: string } | null
  winning_side: { id: string; label: string } | null  // object, NOT a string
  tags: string[]
  extra_fields: Record<string, unknown>
}

export interface DomeMarketsResponse {
  markets: DomeMarket[]
  pagination: {
    limit: number
    offset?: number
    total?: number
    has_more: boolean
    pagination_key?: string | null
  }
}

// ---- market endpoints ----

/**
 * Fetch one or more markets by slug.
 * Returns a map of market_slug → DomeMarket.
 */
export async function domeGetMarketsBySlugs(slugs: string[]): Promise<Map<string, DomeMarket>> {
  const params = slugs.map((s) => `market_slug=${encodeURIComponent(s)}`).join('&')
  const res = await domeFetch(`/polymarket/markets?${params}&limit=${slugs.length}`)
  if (!res.ok) throw new Error(`Dome markets failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as DomeMarketsResponse
  const map = new Map<string, DomeMarket>()
  for (const m of data.markets ?? []) {
    if (m.market_slug) map.set(m.market_slug, m)
  }
  return map
}

export async function domeGetMarketBySlug(slug: string): Promise<DomeMarket | null> {
  const map = await domeGetMarketsBySlugs([slug])
  return map.get(slug) ?? null
}

/**
 * Fetch all outcome markets for a specific event (match).
 * Used for sport detail endpoints: GET /predict/sports/:sport/:slug
 */
export async function domeGetMarketsByEventSlug(eventSlug: string): Promise<DomeMarket[]> {
  const res = await domeFetch(`/polymarket/markets?event_slug=${encodeURIComponent(eventSlug)}`)
  if (!res.ok) throw new Error(`Dome markets by event_slug failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as DomeMarketsResponse
  return data.markets ?? []
}

/**
 * Fetch open markets by tag — generic, returns raw flat list.
 * Used for trending endpoint. Caller filters/sorts as needed.
 */
export async function domeGetMarketsByTag(tag: string, limit = 50): Promise<DomeMarket[]> {
  const res = await domeFetch(
    `/polymarket/markets?tags=${encodeURIComponent(tag)}&status=open&limit=${limit}`
  )
  if (!res.ok) throw new Error(`Dome markets by tag failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as DomeMarketsResponse
  return data.markets ?? []
}

/**
 * Fetch open sport outcome markets by tag (e.g. 'ucl', 'epl').
 * Returns FLAT list — call groupMatchOutcomes() to reconstruct match-level data.
 */
export async function domeGetSportMarkets(tag: string): Promise<DomeMarket[]> {
  const res = await domeFetch(
    `/polymarket/markets?tags=${encodeURIComponent(tag)}&status=open&limit=100`
  )
  if (!res.ok) throw new Error(`Dome sport markets failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as DomeMarketsResponse
  return data.markets ?? []
}

// ---- price endpoint (confirmed working) ----

/**
 * Get current YES price for a single token ID.
 * Never throws — returns null on any failure.
 */
export async function domeGetMarketPrice(tokenId: string): Promise<number | null> {
  try {
    const res = await domeFetch(`/polymarket/market-price/${encodeURIComponent(tokenId)}`)
    if (!res.ok) return null
    const data = await res.json() as { price?: unknown; at_time?: unknown }
    return typeof data.price === 'number' ? data.price : null
  } catch {
    return null
  }
}

// ---- sport grouping helpers ----

export interface DomeMatchGroup {
  eventSlug: string
  outcomes: DomeMarket[]
  gameStartTime: string | null
  endTime: number | null
  image: string | null
  volume1Week: number
}

/**
 * Group flat sport outcome markets by event_slug.
 * Filters to only match-outcome markets (game_start_time != null or slug pattern match).
 * Excludes tournament-winner and player-of-match type markets.
 */
export function domeGroupMatchOutcomes(markets: DomeMarket[]): DomeMatchGroup[] {
  const groups = new Map<string, DomeMatchGroup>()

  for (const m of markets) {
    const es = m.event_slug
    if (!es) continue

    // Only include proper match events: event_slug must end with a date (YYYY-MM-DD).
    if (!isMatchSlug(es)) continue

    // Filter out prop/secondary markets (completed-match, toss-winner, etc.)
    if (isPropMarket(m)) continue

    if (!groups.has(es)) {
      groups.set(es, {
        eventSlug: es,
        outcomes: [],
        gameStartTime: m.game_start_time ?? null,
        endTime: m.end_time ?? null,
        image: m.image ?? null,
        volume1Week: 0,
      })
    }
    const group = groups.get(es)!
    group.outcomes.push(m)
    group.volume1Week += m.volume_1_week ?? 0
    if (!group.gameStartTime && m.game_start_time) group.gameStartTime = m.game_start_time
    if (!group.image && m.image) group.image = m.image
  }

  // Return matches with at least 1 outcome market (cricket = 1 binary, football = 3)
  return Array.from(groups.values()).filter((g) => g.outcomes.length >= 1)
}

/**
 * Derive a match title from the set of outcome markets for that match.
 * Handles multiple title formats:
 *   Football: "Will X win on ...?" / "Will X vs. Y end in a draw?"
 *   Cricket:  "Indian Premier League: Team A vs Team B"
 */
export function deriveMatchTitle(outcomes: DomeMarket[]): string {
  // Draw market title: "Will X vs. Y end in a draw?" → "X vs. Y"
  const drawMarket = outcomes.find((m) => m.market_slug.endsWith('-draw'))
  if (drawMarket) {
    const match = drawMarket.title.match(/^Will (.+?) end in a draw\?/)
    if (match) return match[1]
  }

  // "League: Team A vs Team B" pattern (cricket, etc.)
  // Use the main match market (slug === event_slug, no suffix beyond the date)
  const mainMarket = outcomes.find((m) => m.market_slug === m.event_slug)
  if (mainMarket) {
    const colonMatch = mainMarket.title.match(/:\s*(.+)/)
    if (colonMatch) return colonMatch[1].trim()
  }

  // Fallback: extract team names from "Will X win on..." titles
  const teamNames = outcomes
    .filter((m) => !m.market_slug.endsWith('-draw'))
    .map((m) => extractTeamName(m.title))
    .filter(Boolean)
  if (teamNames.length >= 2) return `${teamNames[0]} vs ${teamNames[1]}`
  if (teamNames.length === 1) return teamNames[0]

  // Last resort: try colon pattern on any market
  for (const m of outcomes) {
    const colonMatch = m.title.match(/:\s*(.+?)(?:\s*-\s*.+)?$/)
    if (colonMatch) return colonMatch[1].trim()
  }

  return outcomes[0]?.event_slug ?? 'Unknown Match'
}

/**
 * Extract team name from "Will X win on YYYY-MM-DD?" pattern.
 * Returns empty string if pattern doesn't match.
 */
export function extractTeamName(title: string): string {
  const match = title.match(/^Will (.+?) win on /)
  return match ? match[1].trim() : ''
}

/**
 * Extract outcome label for a sport outcome market.
 * Draw markets → "Draw", team win → team name from title or side_a label.
 */
export function domeOutcomeLabel(m: DomeMarket): string {
  if (m.market_slug.endsWith('-draw')) return 'Draw'

  // Try extracting from "Will X win on ...?" title first (football)
  const name = extractTeamName(m.title)
  if (name) return name

  // Fall back to side_a label — useful for cricket where label = team name
  // Skip generic labels like "Yes" / "No"
  const sideLabel = m.side_a?.label
  if (sideLabel && sideLabel !== 'Yes' && sideLabel !== 'No') return sideLabel

  return m.market_slug
}

/**
 * Is this a prop/secondary market within an event?
 * Prop markets have slugs like: {event-slug}-completed-match, {event-slug}-toss-winner, etc.
 * The main match market either has slug === event_slug or is a team-win / draw market.
 */
export function isPropMarket(m: DomeMarket): boolean {
  const slug = m.market_slug
  if (slug.endsWith('-completed-match')) return true
  if (slug.endsWith('-toss-winner')) return true
  if (slug.includes('-most-sixes')) return true
  if (slug.includes('-exact-score')) return true
  if (slug.includes('-halftime-result')) return true
  if (slug.includes('-more-markets')) return true
  return false
}

// ---- binary market helpers ----

/**
 * Convert a DomeMarket to [yesTokenId, noTokenId].
 * side_a = YES (index 0), side_b = NO (index 1).
 */
export function domeMarketToClobTokenIds(m: DomeMarket): string[] {
  const ids: string[] = []
  if (m.side_a?.id) ids.push(m.side_a.id)
  if (m.side_b?.id) ids.push(m.side_b.id)
  return ids
}

/**
 * Convert Dome end_time (Unix seconds) to ISO string, or null.
 */
export function domeEndTimeToIso(endTime: number | null | undefined): string | null {
  if (!endTime) return null
  return new Date(endTime * 1000).toISOString()
}

/**
 * Map Dome market status to active boolean.
 */
export function domeStatusToActive(status: string | undefined): boolean | null {
  if (!status) return null
  return status === 'open'
}

// ---- private ----

/**
 * Heuristic: is this event_slug a specific match event (not a tournament-wide or prop market)?
 * Match event slugs end with a date: {sport}-{code1}-{code2}-{YYYY}-{MM}-{DD}
 * Examples: ucl-rma1-bay1-2026-04-07, epl-mun-ars-2026-04-05
 * Excluded: ucl-rma1-bay1-2026-04-07-more-markets (extra prop markets for the same game)
 */
function isMatchSlug(slug: string): boolean {
  return /\d{4}-\d{2}-\d{2}$/.test(slug)
}

