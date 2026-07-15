import {
  parseNullableNumber,
  parseNullableString,
  parseStringArray,
} from './market-read.js'

export const SPORT_SERIES: Record<string, string> = {
  epl: '10188',
  ucl: '10204',
  ipl: '11213',
  fifwc: '11433',
}

// Temporary: featured markets are pinned to a single cricket match during the revamp.
// TODO: replace this pin with the configurable featured-market selection system.
export const FEATURED_MARKET_SLUG = 'crint-zwe2-bgd2-2026-07-15'
/**
 * Featured market — either a binary market (yes/no) or a sport match (multiple outcomes).
 *
 * Binary (type="binary"):
 *   question, yesPrice, noPrice, clobTokenIds[0]=YES / [1]=NO, conditionId
 *
 * Match (type="match"):
 *   title, sport ("epl"|"ucl"|"ipl"|"fifwc"), outcomes[].label/price/clobTokenIds, status, gameStartTime
 *   - EPL/UCL/FIFA World Cup: 3 outcomes (Team A / Team B / Draw)
 *   - IPL: 2 outcomes (Team A / Team B, no draw in cricket)
 */
export interface FeaturedMarket {
  type: 'binary' | 'match'
  slug: string                              // Polymarket market/event slug — unique identifier
  question?: string                         // Binary only: market question text
  title?: string                            // Match only: "Team A vs Team B"
  category: string                          // crypto | politics | sports | tech | macro | entertainment | other
  tags: string[]                            // Category-related tags
  sport?: string                            // Match only: "epl" | "ucl" | "ipl" | "fifwc"
  status?: 'live' | 'upcoming' | 'ended'    // Match only: derived from gameStartTime vs now
  gameStartTime?: string | null             // Match only: actual kickoff time (ISO/UTC)
  yesPrice?: number | null                  // Binary only: YES outcome price (0-1)
  noPrice?: number | null                   // Binary only: NO outcome price (0-1)
  volume: number | null                     // 24h trading volume in USD
  endDate: string | null                    // Market resolution/expiry date
  startDate?: string | null                 // Market creation date (not game start)
  active: boolean | null                    // Market accepting trades
  image: string | null                      // Market/event thumbnail URL
  clobTokenIds?: string[]                   // Binary only: [yesTokenId, noTokenId] for CLOB trades
  conditionId?: string | null               // Binary only: Polymarket condition ID for CLOB
  outcomes?: {                              // Match only: one entry per possible outcome
    label: string                           //   Team name or "Draw"
    price: number | null                    //   Outcome price (0-1)
    conditionId?: string | null             //   Condition ID for this outcome's market
    clobTokenIds: string[]                  //   Token IDs for placing trades
  }[]
}

/** Derive match status from multiple signals (Gamma's active/closed flags are buggy for sports).
 *  Priority order:
 *  1. closed flag (if Gamma eventually flips it)
 *  2. UMA oracle status — "proposed" or "resolved" means outcome is decided on-chain
 *  3. Price signal — any outcome ≥0.995 means market is effectively resolved
 *  4. Time elapsed — match can't be live after max duration (5h IPL, 3h EPL)
 *  5. gameStartTime vs now — upcoming / live fallback */
export function deriveMatchStatus(
  gameStartTime: string | null | undefined,
  active: boolean,
  closed: boolean,
  outcomePrices: (number | null)[] = [],
  sport?: string,
  umaResolutionStatus?: string | null,
): 'live' | 'upcoming' | 'ended' {
  if (closed) return 'ended'
  // UMA oracle: proposed = outcome asserted (2h dispute window), resolved = finalized
  if (umaResolutionStatus === 'proposed' || umaResolutionStatus === 'resolved') return 'ended'
  // Price-based: ≥0.995 means decided (not 0.95 — comebacks happen up to ~0.96)
  if (outcomePrices.some((p) => p !== null && p >= 0.995)) return 'ended'
  if (!gameStartTime) return active ? 'upcoming' : 'ended'
  const start = new Date(gameStartTime).getTime()
  const now = Date.now()
  if (now < start) return 'upcoming'
  // Time-based: match can't still be live after max duration
  const hoursElapsed = (now - start) / (1000 * 60 * 60)
  const maxDuration = sport === 'ipl' ? 5 : sport === 'epl' ? 3 : 4
  if (hoursElapsed > maxDuration) return 'ended'
  if (active) return 'live'
  return 'ended'
}

export function mapSingleMatchGammaEventToFeaturedMarket(e: Record<string, unknown>): FeaturedMarket | null {
  const markets = (e.markets ?? []) as Record<string, unknown>[]
  const mainMarket = markets.find((m) => m.slug === e.slug) ?? markets[0]
  if (!mainMarket) return null

  const outcomesRaw = parseStringArray(mainMarket.outcomes)
  const outcomePrices = parseStringArray(mainMarket.outcomePrices)
  const clobTokenIds = parseStringArray(mainMarket.clobTokenIds)

  const outcomes = outcomesRaw.map((label, idx) => ({
    label,
    price: parseNullableNumber(outcomePrices[idx]),
    conditionId: parseNullableString(mainMarket.conditionId ?? mainMarket.condition_id),
    clobTokenIds: clobTokenIds[idx] ? [clobTokenIds[idx]] : [],
  }))

  const gameStart = String(mainMarket.gameStartTime ?? e.startTime ?? '')
  const isActive = (e.active as boolean) ?? false
  const isClosed = (e.closed as boolean) ?? false
  const umaStatus = (mainMarket.umaResolutionStatus as string) ?? null

  return {
    type: 'match' as const,
    slug: e.slug as string,
    title: e.title as string,
    category: 'sports',
    sport: 'cricket',
    tags: ['sports', 'cricket'],
    status: deriveMatchStatus(gameStart || null, isActive, isClosed, outcomes.map((o) => o.price), 'cricket', umaStatus),
    gameStartTime: gameStart || null,
    startDate: (e.startDate as string) ?? null,
    endDate: (e.endDate as string) ?? null,
    image: (e.image as string) ?? null,
    active: isActive,
    volume: (e.volume24hr ?? e.volume ?? null) as number | null,
    outcomes,
  }
}
