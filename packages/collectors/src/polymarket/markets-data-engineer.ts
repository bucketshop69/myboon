import type { SupabaseClient } from '@supabase/supabase-js'
import pinnedSlugs from './pinned.json'
import defaultConfig from './markets-data-engineer-config.json'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const SOURCE = 'polymarket'
const AREA = 'markets'
const LOOKUP_CHUNK_SIZE = 50
const WRITE_CHUNK_SIZE = 50

export type PolymarketMarketCandidateType =
  | 'odds_moved'
  | 'volume_moved'
  | 'activity_spiked'
  | 'closing_soon'

export interface PolymarketMarketsDataEngineerOptions {
  now?: string
  tagSlugs?: string[]
  topMarketsPerTag?: number
  fetchLimitPerTag?: number
  includeManualPins?: boolean
  oddsMoveThreshold?: number
  volumeMoveThresholdPct?: number
  activitySpikeThresholdPct?: number
  closingSoonHours?: number
  candidateCooldownHours?: number
  manualPinMaxSelected?: number
  manualPinMaxRepresentativesPerInput?: number
  manualPinScoreBoost?: number
  candidateRetryFailedHours?: number
  candidateRecentPublishedCooldownHours?: number
  candidateMaterialMoveMultiplier?: number
}

interface GammaTag {
  id: string
  label: string
  slug: string
}

interface GammaEvent {
  id: string
  title?: string
  slug?: string
  active?: boolean
  closed?: boolean
  archived?: boolean
  endDate?: string
  volume?: unknown
  volume24hr?: unknown
  liquidity?: unknown
  liquidityClob?: unknown
  competitive?: unknown
  commentCount?: unknown
  updatedAt?: string
  markets?: GammaMarket[]
}

interface GammaMarket {
  id?: string
  conditionId?: string
  question?: string
  slug?: string
  active?: boolean
  closed?: boolean
  archived?: boolean
  acceptingOrders?: boolean
  endDate?: string
  endDateIso?: string
  volume?: unknown
  volumeNum?: unknown
  volume24hr?: unknown
  liquidity?: unknown
  liquidityNum?: unknown
  liquidityClob?: unknown
  outcomePrices?: unknown
  bestBid?: unknown
  bestAsk?: unknown
  lastTradePrice?: unknown
  oneHourPriceChange?: unknown
  oneDayPriceChange?: unknown
  oneWeekPriceChange?: unknown
  oneMonthPriceChange?: unknown
  updatedAt?: string
}

interface NormalizedMarket {
  marketId: string
  slug: string
  title: string
  tagSlug: string
  tagLabel: string
  eventSlug: string | null
  eventTitle: string | null
  endDate: string | null
  yesPrice: number | null
  noPrice: number | null
  volume: number | null
  volume24h: number | null
  liquidity: number | null
  competitive: number | null
  commentCount: number | null
  lastTradePrice: number | null
  oneHourPriceChange: number | null
  oneDayPriceChange: number | null
  oneWeekPriceChange: number | null
  updatedAt: string | null
  sourceUrl: string
  rawPayload: unknown
  isManualPin: boolean
  watchScore: number
  scoreBreakdown: Record<string, number | string | boolean>
  selectionReason: string
}

interface PreviousMarketState {
  observed_at: string | null
  yes_price: number | string | null
  volume: number | string | null
  volume_24h: number | string | null
}

interface CandidateDraft {
  candidateType: PolymarketMarketCandidateType
  whatChanged: string
  whyFlagged: string
  score: number
  scoreBreakdown: Record<string, number | string | boolean>
  metrics: Record<string, number | string | boolean | null>
  evidenceRefs: Array<Record<string, string | null>>
}

export interface PolymarketMarketsDataEngineerResult {
  observedAt: string
  tags: string[]
  fetchedMarkets: number
  selectedWatchlist: number
  watchlistUpdated: number
  candidatesWritten: number
  candidatesSkippedAsDuplicates: number
  candidatesSkippedForBacklog: number
  topWatchlist: Array<{
    slug: string
    tag: string
    title: string
    watchScore: number
    selectionReason: string
  }>
  candidates: Array<{
    slug: string
    candidateType: PolymarketMarketCandidateType
    whatChanged: string
    score: number
  }>
}

export interface PolymarketMarketsDataEngineerPreviewResult {
  observedAt: string
  previewOnly: true
  tags: string[]
  fetchedMarkets: number
  selectedWatchlist: number
  topWatchlist: PolymarketMarketsDataEngineerResult['topWatchlist']
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseCsv(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}

function compactMoney(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${round(value / 1_000_000, 1)}M`
  if (abs >= 1_000) return `$${round(value / 1_000, 1)}K`
  return `$${round(value, 0)}`
}

function parseOutcomePrices(raw: unknown): number | null {
  let value = raw
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(value) || value.length === 0) return null
  const yes = numberOrNull(value[0])
  return yes != null && yes >= 0 && yes <= 1 ? yes : null
}

function marketEndDate(market: GammaMarket, event: GammaEvent): string | null {
  return market.endDate ?? market.endDateIso ?? event.endDate ?? null
}

function isOpenMarket(market: GammaMarket, event: GammaEvent, nowMs: number): boolean {
  if (event.archived || event.closed || market.archived || market.closed) return false
  if (market.active === false || event.active === false) return false
  const endDate = marketEndDate(market, event)
  if (endDate && new Date(endDate).getTime() < nowMs) return false
  return true
}

function isSportsLike(text: string, sportsSlugs: Set<string>): boolean {
  const normalized = text.toLowerCase()
  if ([...sportsSlugs].some((slug) => normalized.includes(slug.replace(/-/g, ' ')))) return true
  return /\b(nfl|nba|nhl|mlb|epl|ucl|ipl|cricket|soccer|football|tennis|f1|formula 1|champions league|premier league)\b/i.test(text)
}

function isNoisyUpDownMarket(text: string): boolean {
  return [
    /updown/i,
    /up or down/i,
    /up\/down/i,
    /\b(up|down)\b.*\b(5m|15m|30m|1h|hour|minute)\b/i,
    /\b(5|15|30)[ -]?minute\b/i,
  ].some((pattern) => pattern.test(text))
}

function marketText(market: NormalizedMarket): string {
  return [market.slug, market.title, market.eventSlug, market.eventTitle, market.tagSlug, market.tagLabel]
    .filter((item): item is string => Boolean(item))
    .join(' ')
}

function activityScore(volume24h: number | null, commentCount: number | null): number {
  const volumePart = Math.min(Math.log10(Math.max(volume24h ?? 0, 0) + 1) / 7, 1) * 18
  const commentPart = Math.min(Math.log10(Math.max(commentCount ?? 0, 0) + 1) / 4, 1) * 7
  return round(volumePart + commentPart, 2)
}

function volatilityScore(market: Pick<NormalizedMarket, 'oneHourPriceChange' | 'oneDayPriceChange' | 'oneWeekPriceChange'>): number {
  const strongest = Math.max(
    Math.abs(market.oneHourPriceChange ?? 0),
    Math.abs(market.oneDayPriceChange ?? 0),
    Math.abs(market.oneWeekPriceChange ?? 0) * 0.5
  )
  return round(Math.min(strongest / 0.1, 1) * 25, 2)
}

function freshnessScore(updatedAt: string | null, nowMs: number): number {
  if (!updatedAt) return 0
  const ageHours = Math.max(0, (nowMs - new Date(updatedAt).getTime()) / 3_600_000)
  return round(clamp(1 - ageHours / 48, 0, 1) * 10, 2)
}

function scoreMarket(
  market: Omit<NormalizedMarket, 'watchScore' | 'scoreBreakdown' | 'selectionReason'>,
  nowMs: number,
  manualPinScoreBoost = defaultConfig.manualPinScoreBoost
): {
  watchScore: number
  scoreBreakdown: Record<string, number | string | boolean>
  selectionReason: string
} {
  const volumeLiquidityScore = round(
    Math.min(Math.log10(Math.max(market.volume24h ?? 0, market.volume ?? 0, 0) + (market.liquidity ?? 0) * 0.5 + 1) / 8, 1) * 35,
    2
  )
  const recentActivityScore = activityScore(market.volume24h, market.commentCount)
  const volScore = volatilityScore(market)
  const freshScore = freshnessScore(market.updatedAt, nowMs)
  const manualPinBonus = market.isManualPin ? manualPinScoreBoost : 0
  const watchScore = round(clamp(volumeLiquidityScore + recentActivityScore + volScore + freshScore + manualPinBonus), 2)

  const reasons = [
    `volume/liquidity ${round(volumeLiquidityScore, 1)}`,
    `activity ${round(recentActivityScore, 1)}`,
    `volatility ${round(volScore, 1)}`,
    market.isManualPin ? 'manual pin' : '',
  ].filter(Boolean)

  return {
    watchScore,
    scoreBreakdown: {
      volumeLiquidityScore,
      recentActivityScore,
      volatilityScore: volScore,
      freshnessScore: freshScore,
      manualPinBonus,
    },
    selectionReason: reasons.join(', '),
  }
}

function normalizeMarket(
  event: GammaEvent,
  market: GammaMarket,
  tag: GammaTag,
  sourceUrl: string,
  nowMs: number,
  isManualPin: boolean,
  manualPinScoreBoost = defaultConfig.manualPinScoreBoost
): NormalizedMarket | null {
  const marketId = market.conditionId ?? market.id
  const slug = market.slug ?? event.slug
  const title = market.question ?? event.title
  if (!marketId || !slug || !title) return null

  const yesPrice = parseOutcomePrices(market.outcomePrices)
    ?? numberOrNull(market.bestAsk)
    ?? numberOrNull(market.lastTradePrice)
  const noPrice = yesPrice != null ? round(1 - yesPrice) : null

  const base = {
    marketId,
    slug,
    title,
    tagSlug: tag.slug,
    tagLabel: tag.label,
    eventSlug: event.slug ?? null,
    eventTitle: event.title ?? null,
    endDate: marketEndDate(market, event),
    yesPrice,
    noPrice,
    volume: numberOrNull(market.volumeNum ?? market.volume ?? event.volume),
    volume24h: numberOrNull(market.volume24hr ?? event.volume24hr),
    liquidity: numberOrNull(market.liquidityNum ?? market.liquidityClob ?? market.liquidity ?? event.liquidityClob ?? event.liquidity),
    competitive: numberOrNull(event.competitive),
    commentCount: numberOrNull(event.commentCount),
    lastTradePrice: numberOrNull(market.lastTradePrice),
    oneHourPriceChange: numberOrNull(market.oneHourPriceChange),
    oneDayPriceChange: numberOrNull(market.oneDayPriceChange),
    oneWeekPriceChange: numberOrNull(market.oneWeekPriceChange),
    updatedAt: market.updatedAt ?? event.updatedAt ?? null,
    sourceUrl,
    rawPayload: { event, market },
    isManualPin,
  }
  const scored = scoreMarket(base, nowMs, manualPinScoreBoost)
  return { ...base, ...scored }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Polymarket Gamma fetch failed ${res.status}: ${url}`)
  return res.json() as Promise<T>
}

async function tagBySlug(slug: string): Promise<GammaTag> {
  return fetchJson<GammaTag>(`${GAMMA_API}/tags/slug/${encodeURIComponent(slug)}`)
}

async function fetchMarketsForTag(tagSlug: string, options: Required<Pick<PolymarketMarketsDataEngineerOptions, 'fetchLimitPerTag'>>, nowMs: number): Promise<NormalizedMarket[]> {
  const tag = await tagBySlug(tagSlug)
  const url = `${GAMMA_API}/events?tag_slug=${encodeURIComponent(tagSlug)}&active=true&closed=false&limit=${options.fetchLimitPerTag}&order=volume_24hr&ascending=false`
  const events = await fetchJson<GammaEvent[]>(url)
  const markets: NormalizedMarket[] = []
  for (const event of events) {
    for (const market of event.markets ?? []) {
      if (!isOpenMarket(market, event, nowMs)) continue
      const normalized = normalizeMarket(event, market, tag, url, nowMs, false)
      if (normalized) markets.push(normalized)
    }
  }
  return markets
}

function manualRepresentativeScore(market: NormalizedMarket, nowMs: number): {
  score: number
  breakdown: Record<string, number | string | boolean>
} {
  const volumeScore = round(Math.min(Math.log10(Math.max(market.volume24h ?? 0, market.volume ?? 0, 0) + 1) / 8, 1) * 28, 2)
  const liquidityScore = round(Math.min(Math.log10(Math.max(market.liquidity ?? 0, 0) + 1) / 7, 1) * 18, 2)
  const watchScoreComponent = round(market.watchScore * 0.28, 2)
  const movementScore = round(volatilityScore(market) * 0.7, 2)
  let closingRelevanceScore = 0
  if (market.endDate) {
    const hoursToClose = (new Date(market.endDate).getTime() - nowMs) / 3_600_000
    if (hoursToClose > 0 && hoursToClose <= 24 * 14) {
      closingRelevanceScore = round((1 - hoursToClose / (24 * 14)) * 12, 2)
    }
  }

  return {
    score: round(clamp(volumeScore + liquidityScore + watchScoreComponent + movementScore + closingRelevanceScore), 2),
    breakdown: {
      manualRepresentativeVolumeScore: volumeScore,
      manualRepresentativeLiquidityScore: liquidityScore,
      manualRepresentativeWatchScoreComponent: watchScoreComponent,
      manualRepresentativeMovementScore: movementScore,
      manualRepresentativeClosingRelevanceScore: closingRelevanceScore,
    },
  }
}

function selectManualPinRepresentatives(
  pinSlug: string,
  markets: NormalizedMarket[],
  nowMs: number,
  maxRepresentatives: number
): NormalizedMarket[] {
  if (markets.length <= 1) {
    return markets.map((market) => ({
      ...market,
      scoreBreakdown: {
        ...market.scoreBreakdown,
        manualPinInput: pinSlug,
        manualResolvedMarkets: markets.length,
        manualRepresentativeRank: 1,
      },
      selectionReason: `${market.selectionReason}, manual pin single market`,
    }))
  }

  return markets
    .map((market) => {
      const representative = manualRepresentativeScore(market, nowMs)
      return { market, representative }
    })
    .sort((a, b) => b.representative.score - a.representative.score || b.market.watchScore - a.market.watchScore || a.market.slug.localeCompare(b.market.slug))
    .slice(0, Math.max(1, maxRepresentatives))
    .map(({ market, representative }, index) => ({
      ...market,
      scoreBreakdown: {
        ...market.scoreBreakdown,
        ...representative.breakdown,
        manualPinInput: pinSlug,
        manualResolvedMarkets: markets.length,
        manualRepresentativeRank: index + 1,
        manualRepresentativeScore: representative.score,
      },
      selectionReason: `${market.selectionReason}, manual pin representative ${index + 1}/${Math.min(markets.length, Math.max(1, maxRepresentatives))} of ${markets.length}`,
    }))
}

async function fetchManualPin(
  slug: string,
  nowMs: number,
  options: Required<Pick<PolymarketMarketsDataEngineerOptions, 'manualPinMaxRepresentativesPerInput' | 'manualPinScoreBoost'>>
): Promise<NormalizedMarket[]> {
  const tag: GammaTag = { id: 'manual', label: 'Manual Pins', slug: 'manual' }
  const marketUrl = `${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}`
  const marketRows = await fetchJson<GammaMarket[]>(marketUrl).catch(() => [])
  if (marketRows.length > 0) {
    const fakeEvent: GammaEvent = {
      id: marketRows[0].id ?? slug,
      title: marketRows[0].question ?? slug,
      slug,
      active: true,
      closed: false,
      markets: marketRows,
    }
    const markets = marketRows
      .filter((market) => isOpenMarket(market, fakeEvent, nowMs))
      .map((market) => normalizeMarket(fakeEvent, market, tag, marketUrl, nowMs, true, options.manualPinScoreBoost))
      .filter((market): market is NormalizedMarket => market != null)
    return selectManualPinRepresentatives(slug, markets, nowMs, options.manualPinMaxRepresentativesPerInput)
  }

  const eventUrl = `${GAMMA_API}/events?slug=${encodeURIComponent(slug)}&active=true&closed=false&limit=1`
  const eventRows = await fetchJson<GammaEvent[]>(eventUrl).catch(() => [])
  const markets = eventRows.flatMap((event) => (event.markets ?? [])
    .filter((market) => isOpenMarket(market, event, nowMs))
    .map((market) => normalizeMarket(event, market, tag, eventUrl, nowMs, true, options.manualPinScoreBoost))
    .filter((market): market is NormalizedMarket => market != null)
  )
  return selectManualPinRepresentatives(slug, markets, nowMs, options.manualPinMaxRepresentativesPerInput)
}

function selectedOptions(partial: PolymarketMarketsDataEngineerOptions): Required<PolymarketMarketsDataEngineerOptions> {
  const envTags = parseCsv(process.env.POLYMARKET_MARKETS_TAGS)
  return {
    now: partial.now ?? new Date().toISOString(),
    tagSlugs: partial.tagSlugs ?? (envTags.length > 0 ? envTags : defaultConfig.tagSlugs),
    topMarketsPerTag: partial.topMarketsPerTag ?? envNumber('POLYMARKET_MARKETS_TOP_PER_TAG', defaultConfig.topMarketsPerTag),
    fetchLimitPerTag: partial.fetchLimitPerTag ?? envNumber('POLYMARKET_MARKETS_FETCH_LIMIT_PER_TAG', defaultConfig.fetchLimitPerTag),
    includeManualPins: partial.includeManualPins ?? process.env.POLYMARKET_MARKETS_INCLUDE_MANUAL_PINS !== '0',
    oddsMoveThreshold: partial.oddsMoveThreshold ?? envNumber('POLYMARKET_MARKETS_ODDS_MOVE_THRESHOLD', 0.05),
    volumeMoveThresholdPct: partial.volumeMoveThresholdPct ?? envNumber('POLYMARKET_MARKETS_VOLUME_MOVE_THRESHOLD_PCT', 0.2),
    activitySpikeThresholdPct: partial.activitySpikeThresholdPct ?? envNumber('POLYMARKET_MARKETS_ACTIVITY_SPIKE_THRESHOLD_PCT', 0.25),
    closingSoonHours: partial.closingSoonHours ?? envNumber('POLYMARKET_MARKETS_CLOSING_SOON_HOURS', 72),
    candidateCooldownHours: partial.candidateCooldownHours ?? envNumber('POLYMARKET_MARKETS_CANDIDATE_COOLDOWN_HOURS', 6),
    manualPinMaxSelected: partial.manualPinMaxSelected ?? envNumber('POLYMARKET_MARKETS_MANUAL_PIN_MAX_SELECTED', defaultConfig.manualPinMaxSelected),
    manualPinMaxRepresentativesPerInput: partial.manualPinMaxRepresentativesPerInput ?? envNumber('POLYMARKET_MARKETS_MANUAL_PIN_MAX_REPRESENTATIVES_PER_INPUT', defaultConfig.manualPinMaxRepresentativesPerInput),
    manualPinScoreBoost: partial.manualPinScoreBoost ?? envNumber('POLYMARKET_MARKETS_MANUAL_PIN_SCORE_BOOST', defaultConfig.manualPinScoreBoost),
    candidateRetryFailedHours: partial.candidateRetryFailedHours ?? envNumber('POLYMARKET_MARKETS_CANDIDATE_RETRY_FAILED_HOURS', defaultConfig.candidateRetryFailedHours),
    candidateRecentPublishedCooldownHours: partial.candidateRecentPublishedCooldownHours ?? envNumber('POLYMARKET_MARKETS_CANDIDATE_RECENT_PUBLISHED_COOLDOWN_HOURS', defaultConfig.candidateRecentPublishedCooldownHours),
    candidateMaterialMoveMultiplier: partial.candidateMaterialMoveMultiplier ?? envNumber('POLYMARKET_MARKETS_CANDIDATE_MATERIAL_MOVE_MULTIPLIER', defaultConfig.candidateMaterialMoveMultiplier),
  }
}

function filterMarket(market: NormalizedMarket, sportsSlugs: Set<string>): boolean {
  const text = marketText(market)
  if (isSportsLike(text, sportsSlugs)) return false
  if (isNoisyUpDownMarket(text)) return false
  return true
}

function marketKey(market: NormalizedMarket): string {
  return market.slug
}

function titleFamilyKey(text: string): string {
  const stopWords = new Set(['will', 'the', 'and', 'for', 'with', 'before', 'after', 'this', 'that', 'what', 'when', 'who', 'how', 'many'])
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 8)
    .join('-')
}

function marketFamilyKeys(market: Pick<NormalizedMarket, 'eventSlug' | 'eventTitle' | 'title' | 'slug'>): string[] {
  const keys = new Set<string>()
  if (market.eventSlug) keys.add(`event:${market.eventSlug}`)
  const titleKey = titleFamilyKey(market.eventTitle ?? market.title ?? market.slug)
  if (titleKey) keys.add(`title:${titleKey}`)
  keys.add(`slug:${market.slug}`)
  return [...keys]
}

function rowFamilyKeys(row: { slug: string; title: string | null }): string[] {
  const keys = new Set<string>([`slug:${row.slug}`])
  const titleKey = titleFamilyKey(row.title ?? row.slug)
  if (titleKey) keys.add(`title:${titleKey}`)
  return [...keys]
}

function chooseWatchlist(markets: NormalizedMarket[], options: Required<PolymarketMarketsDataEngineerOptions>): NormalizedMarket[] {
  const sportsSlugs = new Set(defaultConfig.sportsTagSlugs)
  const byTag = new Map<string, NormalizedMarket[]>()
  const manual: NormalizedMarket[] = []

  for (const market of markets) {
    if (!filterMarket(market, sportsSlugs)) continue
    if (market.isManualPin) {
      manual.push(market)
      continue
    }
    const group = byTag.get(market.tagSlug) ?? []
    group.push(market)
    byTag.set(market.tagSlug, group)
  }

  const selected: NormalizedMarket[] = manual
    .sort((a, b) => b.watchScore - a.watchScore || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(0, options.manualPinMaxSelected))
    .map((market, index) => ({
      ...market,
      scoreBreakdown: {
        ...market.scoreBreakdown,
        manualPinQuotaRank: index + 1,
        manualPinQuota: options.manualPinMaxSelected,
      },
      selectionReason: `${market.selectionReason}, manual pin quota rank ${index + 1}/${options.manualPinMaxSelected}`,
    }))
  for (const [tag, group] of byTag.entries()) {
    selected.push(...group
      .sort((a, b) => b.watchScore - a.watchScore || a.slug.localeCompare(b.slug))
      .slice(0, options.topMarketsPerTag)
      .map((market, index) => ({
        ...market,
        scoreBreakdown: { ...market.scoreBreakdown, rankInTag: index + 1, selectedTag: tag },
      })))
  }

  const seen = new Map<string, NormalizedMarket>()
  for (const market of selected) {
    const key = marketKey(market)
    const existing = seen.get(key)
    const shouldReplace = !existing
      || market.watchScore > existing.watchScore
      || (market.watchScore === existing.watchScore && market.isManualPin && !existing.isManualPin)
    if (shouldReplace) {
      seen.set(key, {
        ...market,
        scoreBreakdown: {
          ...market.scoreBreakdown,
          ...(existing ? { alsoSeenInTag: existing.tagSlug, alsoSeenAsManualPin: existing.isManualPin } : {}),
        },
      })
    }
  }
  return [...seen.values()].sort((a, b) => b.watchScore - a.watchScore)
}

interface CandidateInsert {
  market: NormalizedMarket
  draft: CandidateDraft
  dedupeKey: string
}

async function fetchPreviousWatchlist(db: SupabaseClient, slugs: string[]): Promise<Map<string, PreviousMarketState>> {
  const previousBySlug = new Map<string, PreviousMarketState>()
  if (slugs.length === 0) return previousBySlug

  for (const slugChunk of chunks(slugs, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('polymarket_market_watchlist')
      .select('slug, latest_observed_at, latest_yes_price, latest_volume, latest_volume_24h')
      .eq('area', AREA)
      .in('slug', slugChunk)

    if (error) throw new Error(`previous watchlist fetch failed: ${error.message}`)

    for (const row of data ?? []) {
      const previous = row as {
        slug: string
        latest_observed_at: string | null
        latest_yes_price: number | string | null
        latest_volume: number | string | null
        latest_volume_24h: number | string | null
      }
      previousBySlug.set(previous.slug, {
        observed_at: previous.latest_observed_at,
        yes_price: previous.latest_yes_price,
        volume: previous.latest_volume,
        volume_24h: previous.latest_volume_24h,
      })
    }
  }

  return previousBySlug
}

async function upsertWatchlist(db: SupabaseClient, watchlist: NormalizedMarket[], observedAt: string): Promise<void> {
  const rankBySlug = new Map(watchlist.map((market, index) => [market.slug, index + 1]))

  for (const watchlistChunk of chunks(watchlist, WRITE_CHUNK_SIZE)) {
    const { error } = await db
      .from('polymarket_market_watchlist')
      .upsert(watchlistChunk.map((market) => ({
        source: SOURCE,
        area: AREA,
        tag_slug: market.tagSlug,
        tag_label: market.tagLabel,
        market_id: market.marketId,
        slug: market.slug,
        title: market.title,
        event_slug: market.eventSlug,
        event_title: market.eventTitle,
        end_date: market.endDate,
        is_manual_pin: market.isManualPin,
        rank_in_area: rankBySlug.get(market.slug),
        watch_score: market.watchScore,
        score_breakdown: market.scoreBreakdown,
        selection_reason: market.selectionReason,
        latest_observed_at: observedAt,
        latest_yes_price: market.yesPrice,
        latest_volume: market.volume,
        latest_volume_24h: market.volume24h,
        latest_liquidity: market.liquidity,
        status: 'active',
        updated_at: observedAt,
      })), { onConflict: 'area,slug' })

    if (error) throw new Error(`watchlist upsert failed: ${error.message}`)
  }
}

async function deactivateStaleWatchlist(db: SupabaseClient, observedAt: string): Promise<void> {
  const { error } = await db
    .from('polymarket_market_watchlist')
    .update({ status: 'inactive', updated_at: observedAt })
    .eq('area', AREA)
    .eq('status', 'active')
    .neq('latest_observed_at', observedAt)

  if (error) throw new Error(`stale watchlist deactivation failed: ${error.message}`)
}

function candidateDedupeKey(market: NormalizedMarket, observedAt: string, cooldownHours: number): string {
  const bucket = Math.floor(new Date(observedAt).getTime() / (cooldownHours * 3_600_000))
  const familyKey = marketFamilyKeys(market)[0] ?? `slug:${market.slug}`
  return `${SOURCE}:${AREA}:${familyKey}:${bucket}`
}

function buildCandidates(
  market: NormalizedMarket,
  previous: PreviousMarketState | null,
  observedAt: string,
  options: Required<PolymarketMarketsDataEngineerOptions>
): CandidateDraft[] {
  const candidates: CandidateDraft[] = []
  const previousYes = numberOrNull(previous?.yes_price)
  const previousVolume = numberOrNull(previous?.volume)
  const previousVolume24h = numberOrNull(previous?.volume_24h)

  if (previousYes != null && market.yesPrice != null) {
    const delta = round(market.yesPrice - previousYes)
    if (Math.abs(delta) >= options.oddsMoveThreshold) {
      candidates.push({
        candidateType: 'odds_moved',
        whatChanged: `${market.title} odds moved from ${round(previousYes * 100, 1)}% to ${round(market.yesPrice * 100, 1)}%.`,
        whyFlagged: `Odds moved ${round(Math.abs(delta) * 100, 1)} points, above the ${round(options.oddsMoveThreshold * 100, 1)} point threshold.`,
        score: round(clamp(market.watchScore * 0.55 + Math.min(Math.abs(delta) / 0.15, 1) * 45), 2),
        scoreBreakdown: { watchScore: market.watchScore, oddsDelta: delta, threshold: options.oddsMoveThreshold },
        metrics: { previousObservedAt: previous?.observed_at ?? null, currentObservedAt: observedAt, previousYes, currentYes: market.yesPrice, oddsDelta: delta },
        evidenceRefs: [{ kind: 'polymarket_market', source_url: market.sourceUrl, observed_at: observedAt }],
      })
    }
  }

  if (previousVolume != null && market.volume != null && previousVolume > 0) {
    const deltaPct = (market.volume - previousVolume) / previousVolume
    if (deltaPct >= options.volumeMoveThresholdPct) {
      candidates.push({
        candidateType: 'volume_moved',
        whatChanged: `${market.title} volume increased from ${compactMoney(previousVolume)} to ${compactMoney(market.volume)}.`,
        whyFlagged: `Volume rose ${round(deltaPct * 100, 1)}%, above the ${round(options.volumeMoveThresholdPct * 100, 1)}% threshold.`,
        score: round(clamp(market.watchScore * 0.55 + Math.min(deltaPct / 0.75, 1) * 45), 2),
        scoreBreakdown: { watchScore: market.watchScore, volumeDeltaPct: round(deltaPct), threshold: options.volumeMoveThresholdPct },
        metrics: { previousObservedAt: previous?.observed_at ?? null, currentObservedAt: observedAt, previousVolume, currentVolume: market.volume, volumeDeltaPct: round(deltaPct) },
        evidenceRefs: [{ kind: 'polymarket_market', source_url: market.sourceUrl, observed_at: observedAt }],
      })
    }
  }

  if (previousVolume24h != null && market.volume24h != null && previousVolume24h > 0) {
    const deltaPct = (market.volume24h - previousVolume24h) / previousVolume24h
    if (deltaPct >= options.activitySpikeThresholdPct) {
      candidates.push({
        candidateType: 'activity_spiked',
        whatChanged: `${market.title} 24h activity increased from ${compactMoney(previousVolume24h)} to ${compactMoney(market.volume24h)}.`,
        whyFlagged: `24h volume rose ${round(deltaPct * 100, 1)}%, above the ${round(options.activitySpikeThresholdPct * 100, 1)}% threshold.`,
        score: round(clamp(market.watchScore * 0.55 + Math.min(deltaPct / 0.75, 1) * 45), 2),
        scoreBreakdown: { watchScore: market.watchScore, activityDeltaPct: round(deltaPct), threshold: options.activitySpikeThresholdPct },
        metrics: { previousObservedAt: previous?.observed_at ?? null, currentObservedAt: observedAt, previousVolume24h, currentVolume24h: market.volume24h, activityDeltaPct: round(deltaPct) },
        evidenceRefs: [{ kind: 'polymarket_market', source_url: market.sourceUrl, observed_at: observedAt }],
      })
    }
  }

  if (market.endDate) {
    const hoursToClose = (new Date(market.endDate).getTime() - new Date(observedAt).getTime()) / 3_600_000
    if (hoursToClose > 0 && hoursToClose <= options.closingSoonHours && (market.volume ?? 0) > 1_000) {
      candidates.push({
        candidateType: 'closing_soon',
        whatChanged: `${market.title} closes in ${round(hoursToClose, 1)} hours.`,
        whyFlagged: `Market is inside the ${options.closingSoonHours}h closing window and has ${compactMoney(market.volume ?? 0)} volume.`,
        score: round(clamp(market.watchScore * 0.65 + (1 - hoursToClose / options.closingSoonHours) * 35), 2),
        scoreBreakdown: { watchScore: market.watchScore, hoursToClose: round(hoursToClose, 2), closingSoonHours: options.closingSoonHours },
        metrics: { currentObservedAt: observedAt, hoursToClose: round(hoursToClose, 2), volume: market.volume, yesPrice: market.yesPrice },
        evidenceRefs: [{ kind: 'polymarket_market', source_url: market.sourceUrl, observed_at: observedAt }],
      })
    }
  }

  return candidates
}

async function fetchExistingCandidateKeys(db: SupabaseClient, dedupeKeys: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  if (dedupeKeys.length === 0) return existing

  for (const keyChunk of chunks(dedupeKeys, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('polymarket_market_candidates')
      .select('dedupe_key')
      .in('dedupe_key', keyChunk)

    if (error) throw new Error(`candidate dedupe check failed: ${error.message}`)
    for (const row of data ?? []) existing.add((row as { dedupe_key: string }).dedupe_key)
  }
  return existing
}

type BacklogBlockKind =
  | 'candidate_unresolved'
  | 'research_unresolved'
  | 'editor_pending_publisher'
  | 'recently_published'
  | 'research_failed_recent'
  | 'research_failed_stale'

interface BacklogBlock {
  kind: BacklogBlockKind
  slug: string
  title: string | null
  status: string
  at: string | null
  score?: number | null
}

interface DownstreamBacklog {
  bySlug: Map<string, BacklogBlock[]>
  byFamilyKey: Map<string, BacklogBlock[]>
}

function addBacklogBlock(backlog: DownstreamBacklog, block: BacklogBlock): void {
  const slugBlocks = backlog.bySlug.get(block.slug) ?? []
  slugBlocks.push(block)
  backlog.bySlug.set(block.slug, slugBlocks)

  for (const familyKey of rowFamilyKeys({ slug: block.slug, title: block.title })) {
    const familyBlocks = backlog.byFamilyKey.get(familyKey) ?? []
    familyBlocks.push(block)
    backlog.byFamilyKey.set(familyKey, familyBlocks)
  }
}

function uniqueBacklogBlocks(blocks: BacklogBlock[]): BacklogBlock[] {
  const seen = new Set<string>()
  const out: BacklogBlock[] = []
  for (const block of blocks) {
    const key = `${block.kind}:${block.slug}:${block.status}:${block.at ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(block)
  }
  return out
}

function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean)
}

function candidateBacklogBlocks(backlog: DownstreamBacklog, market: NormalizedMarket): BacklogBlock[] {
  const blocks = [...(backlog.bySlug.get(market.slug) ?? [])]
  for (const key of marketFamilyKeys(market)) {
    blocks.push(...(backlog.byFamilyKey.get(key) ?? []))
  }
  return uniqueBacklogBlocks(blocks)
}

function candidateMoveRatio(
  draft: CandidateDraft,
  options: Required<PolymarketMarketsDataEngineerOptions>
): number {
  if (draft.candidateType === 'odds_moved') {
    return options.oddsMoveThreshold > 0
      ? Math.abs(numberOrNull(draft.metrics.oddsDelta) ?? 0) / options.oddsMoveThreshold
      : 0
  }
  if (draft.candidateType === 'volume_moved') {
    return options.volumeMoveThresholdPct > 0
      ? (numberOrNull(draft.metrics.volumeDeltaPct) ?? 0) / options.volumeMoveThresholdPct
      : 0
  }
  if (draft.candidateType === 'activity_spiked') {
    return options.activitySpikeThresholdPct > 0
      ? (numberOrNull(draft.metrics.activityDeltaPct) ?? 0) / options.activitySpikeThresholdPct
      : 0
  }
  return 0
}

function isMaterialCandidate(
  draft: CandidateDraft,
  options: Required<PolymarketMarketsDataEngineerOptions>
): boolean {
  return candidateMoveRatio(draft, options) >= options.candidateMaterialMoveMultiplier || draft.score >= 90
}

function blocksCandidate(
  candidate: CandidateInsert,
  blocks: BacklogBlock[],
  observedAt: string,
  options: Required<PolymarketMarketsDataEngineerOptions>
): boolean {
  if (blocks.length === 0) return false
  if (isMaterialCandidate(candidate.draft, options)) return false

  const nowMs = new Date(observedAt).getTime()
  return blocks.some((block) => {
    if (block.kind !== 'research_failed_stale') return true
    if (!block.at) return true
    const ageHours = (nowMs - new Date(block.at).getTime()) / 3_600_000
    return ageHours < options.candidateRetryFailedHours
  })
}

function annotateBacklogOverride(candidate: CandidateInsert, blocks: BacklogBlock[]): CandidateInsert {
  return {
    ...candidate,
    draft: {
      ...candidate.draft,
      scoreBreakdown: {
        ...candidate.draft.scoreBreakdown,
        backlogOverride: true,
        backlogBlockers: blocks.map((block) => `${block.kind}:${block.slug}:${block.status}`).slice(0, 6).join(', '),
      },
    },
  }
}

function dedupeCandidateInserts(candidates: CandidateInsert[]): CandidateInsert[] {
  const byKey = new Map<string, CandidateInsert>()
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.dedupeKey)
    if (!existing || candidate.draft.score > existing.draft.score) {
      byKey.set(candidate.dedupeKey, candidate)
    }
  }
  return [...byKey.values()]
}

async function fetchResearchRowsByIds(
  db: SupabaseClient,
  ids: string[]
): Promise<Array<{ id: string; slug: string; title: string | null; status: string; researched_at: string | null }>> {
  const rows: Array<{ id: string; slug: string; title: string | null; status: string; researched_at: string | null }> = []
  const uniqueIds = [...new Set(ids)]
  for (const idChunk of chunks(uniqueIds, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('polymarket_market_candidate_research')
      .select('id, slug, title, status, researched_at')
      .in('id', idChunk)

    if (error) throw new Error(`research rows by id fetch failed: ${error.message}`)
    rows.push(...((data ?? []) as Array<{ id: string; slug: string; title: string | null; status: string; researched_at: string | null }>))
  }
  return rows
}

async function fetchDownstreamBacklog(
  db: SupabaseClient,
  markets: NormalizedMarket[],
  observedAt: string,
  options: Required<PolymarketMarketsDataEngineerOptions>
): Promise<DownstreamBacklog> {
  const backlog: DownstreamBacklog = { bySlug: new Map(), byFamilyKey: new Map() }
  if (markets.length === 0) return backlog

  const slugs = [...new Set(markets.map((market) => market.slug))]
  const watchedFamilyKeys = new Set(markets.flatMap((market) => marketFamilyKeys(market)))
  const failedRetryCutoffMs = new Date(observedAt).getTime() - options.candidateRetryFailedHours * 3_600_000
  const recentPublishedCutoffMs = new Date(observedAt).getTime() - options.candidateRecentPublishedCooldownHours * 3_600_000
  const recentPublishedCutoff = new Date(recentPublishedCutoffMs).toISOString()
  const unresolvedCandidateStatuses = ['pending_research', 'researching', 'researched']
  const candidateStatuses = [...unresolvedCandidateStatuses, 'skipped_recently_researched', 'research_failed', 'published']

  for (const slugChunk of chunks(slugs, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('polymarket_market_candidates')
      .select('slug, title, status, observed_at, score')
      .eq('source', SOURCE)
      .eq('area', AREA)
      .in('slug', slugChunk)
      .in('status', candidateStatuses)

    if (error) throw new Error(`candidate backlog slug fetch failed: ${error.message}`)
    for (const row of data ?? []) {
      const candidate = row as { slug: string; title: string | null; status: string; observed_at: string | null; score: number | string | null }
      const observedMs = candidate.observed_at ? new Date(candidate.observed_at).getTime() : 0
      if (candidate.status === 'published' && observedMs < recentPublishedCutoffMs) continue
      const kind: BacklogBlockKind = candidate.status === 'research_failed' || candidate.status === 'skipped_recently_researched'
        ? (observedMs >= failedRetryCutoffMs ? 'research_failed_recent' : 'research_failed_stale')
        : candidate.status === 'published'
          ? 'recently_published'
          : 'candidate_unresolved'
      addBacklogBlock(backlog, {
        kind,
        slug: candidate.slug,
        title: candidate.title,
        status: candidate.status,
        at: candidate.observed_at,
        score: numberOrNull(candidate.score),
      })
    }
  }

  const { data: candidateFamilyRows, error: candidateFamilyError } = await db
    .from('polymarket_market_candidates')
    .select('slug, title, status, observed_at, score')
    .eq('source', SOURCE)
    .eq('area', AREA)
    .in('status', candidateStatuses)
    .order('observed_at', { ascending: false })
    .limit(1200)

  if (candidateFamilyError) throw new Error(`candidate backlog family fetch failed: ${candidateFamilyError.message}`)
  for (const row of candidateFamilyRows ?? []) {
    const candidate = row as { slug: string; title: string | null; status: string; observed_at: string | null; score: number | string | null }
    if (!rowFamilyKeys(candidate).some((key) => watchedFamilyKeys.has(key))) continue
    const observedMs = candidate.observed_at ? new Date(candidate.observed_at).getTime() : 0
    if (candidate.status === 'published' && observedMs < recentPublishedCutoffMs) continue
    const kind: BacklogBlockKind = candidate.status === 'research_failed' || candidate.status === 'skipped_recently_researched'
      ? (observedMs >= failedRetryCutoffMs ? 'research_failed_recent' : 'research_failed_stale')
      : candidate.status === 'published'
        ? 'recently_published'
        : 'candidate_unresolved'
    addBacklogBlock(backlog, {
      kind,
      slug: candidate.slug,
      title: candidate.title,
      status: candidate.status,
      at: candidate.observed_at,
      score: numberOrNull(candidate.score),
    })
  }

  const researchStatuses = ['pending_editor', 'editing', 'edited', 'needs_more_research']
  for (const slugChunk of chunks(slugs, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await db
      .from('polymarket_market_candidate_research')
      .select('slug, title, status, researched_at')
      .eq('source', SOURCE)
      .eq('area', AREA)
      .in('slug', slugChunk)
      .in('status', researchStatuses)

    if (error) throw new Error(`research backlog slug fetch failed: ${error.message}`)
    for (const row of data ?? []) {
      const research = row as { slug: string; title: string | null; status: string; researched_at: string | null }
      addBacklogBlock(backlog, {
        kind: 'research_unresolved',
        slug: research.slug,
        title: research.title,
        status: research.status,
        at: research.researched_at,
      })
    }
  }

  const { data: researchFamilyRows, error: researchFamilyError } = await db
    .from('polymarket_market_candidate_research')
    .select('slug, title, status, researched_at')
    .eq('source', SOURCE)
    .eq('area', AREA)
    .in('status', researchStatuses)
    .order('researched_at', { ascending: false })
    .limit(1200)

  if (researchFamilyError) throw new Error(`research backlog family fetch failed: ${researchFamilyError.message}`)
  for (const row of researchFamilyRows ?? []) {
    const research = row as { slug: string; title: string | null; status: string; researched_at: string | null }
    if (!rowFamilyKeys(research).some((key) => watchedFamilyKeys.has(key))) continue
    addBacklogBlock(backlog, {
      kind: 'research_unresolved',
      slug: research.slug,
      title: research.title,
      status: research.status,
      at: research.researched_at,
    })
  }

  const { data: editorRows, error: editorError } = await db
    .from('polymarket_market_editor_decisions')
    .select('status, research_ids, created_at')
    .eq('source', SOURCE)
    .eq('area', AREA)
    .eq('status', 'pending_publisher')
    .order('created_at', { ascending: false })
    .limit(500)

  if (editorError) throw new Error(`editor pending publisher fetch failed: ${editorError.message}`)
  const editorResearchIds = (editorRows ?? []).flatMap((row) => jsonStringArray((row as { research_ids: unknown }).research_ids))
  const editorResearchRows = await fetchResearchRowsByIds(db, editorResearchIds)
  for (const research of editorResearchRows) {
    if (research.slug && (slugs.includes(research.slug) || rowFamilyKeys(research).some((key) => watchedFamilyKeys.has(key)))) {
      addBacklogBlock(backlog, {
        kind: 'editor_pending_publisher',
        slug: research.slug,
        title: research.title,
        status: 'pending_publisher',
        at: research.researched_at,
      })
    }
  }

  const { data: publishedRows, error: publishedError } = await db
    .from('published_narratives')
    .select('research_ids, created_at')
    .eq('source', SOURCE)
    .eq('area', AREA)
    .gte('created_at', recentPublishedCutoff)
    .order('created_at', { ascending: false })
    .limit(500)

  if (publishedError) throw new Error(`recent published fetch failed: ${publishedError.message}`)
  const publishedResearchIds = (publishedRows ?? []).flatMap((row) => jsonStringArray((row as { research_ids: unknown }).research_ids))
  const publishedResearchRows = await fetchResearchRowsByIds(db, publishedResearchIds)
  for (const research of publishedResearchRows) {
    if (research.slug && (slugs.includes(research.slug) || rowFamilyKeys(research).some((key) => watchedFamilyKeys.has(key)))) {
      addBacklogBlock(backlog, {
        kind: 'recently_published',
        slug: research.slug,
        title: research.title,
        status: 'published',
        at: research.researched_at,
      })
    }
  }

  return backlog
}

async function insertCandidates(
  db: SupabaseClient,
  candidates: CandidateInsert[],
  observedAt: string
): Promise<void> {
  if (candidates.length === 0) return

  for (const candidateChunk of chunks(candidates, WRITE_CHUNK_SIZE)) {
    const { error } = await db
      .from('polymarket_market_candidates')
      .insert(candidateChunk.map(({ market, draft, dedupeKey }) => ({
        source: SOURCE,
        area: AREA,
        candidate_type: draft.candidateType,
        market_id: market.marketId,
        slug: market.slug,
        title: market.title,
        tag_slug: market.tagSlug,
        tag_label: market.tagLabel,
        observed_at: observedAt,
        what_changed: draft.whatChanged,
        why_flagged: draft.whyFlagged,
        score: draft.score,
        score_breakdown: draft.scoreBreakdown,
        metrics: draft.metrics,
        evidence_refs: draft.evidenceRefs,
        status: 'pending_research',
        dedupe_key: dedupeKey,
      })))
    if (error) throw new Error(`candidate insert failed: ${error.message}`)
  }
}

export async function runPolymarketMarketsDataEngineer(
  db: SupabaseClient,
  partialOptions: PolymarketMarketsDataEngineerOptions = {}
): Promise<PolymarketMarketsDataEngineerResult> {
  const options = selectedOptions(partialOptions)
  const observedAt = options.now
  const nowMs = new Date(observedAt).getTime()

  const byTag = await Promise.all(options.tagSlugs.map((tag) => fetchMarketsForTag(tag, options, nowMs)))
  const manualPins = options.includeManualPins
    ? (await Promise.all([...new Set(pinnedSlugs as string[])].map((slug) => fetchManualPin(slug, nowMs, options)))).flat()
    : []

  const fetchedMarkets = byTag.flat().length + manualPins.length
  const watchlist = chooseWatchlist([...byTag.flat(), ...manualPins], options)

  const previousBySlug = await fetchPreviousWatchlist(db, watchlist.map((market) => market.slug))
  await upsertWatchlist(db, watchlist, observedAt)
  await deactivateStaleWatchlist(db, observedAt)

  const candidateInserts: CandidateInsert[] = []
  for (const market of watchlist) {
    const previous = previousBySlug.get(market.slug) ?? null
    const candidates = buildCandidates(market, previous, observedAt, options)
    for (const candidate of candidates) {
      const dedupeKey = candidateDedupeKey(market, observedAt, options.candidateCooldownHours)
      candidateInserts.push({ market, draft: candidate, dedupeKey })
    }
  }

  const familyDedupedCandidateInserts = dedupeCandidateInserts(candidateInserts)
  const existingCandidateKeys = await fetchExistingCandidateKeys(db, familyDedupedCandidateInserts.map((candidate) => candidate.dedupeKey))
  const dedupeFilteredCandidateInserts = familyDedupedCandidateInserts.filter((candidate) => !existingCandidateKeys.has(candidate.dedupeKey))
  const backlog = await fetchDownstreamBacklog(db, dedupeFilteredCandidateInserts.map((candidate) => candidate.market), observedAt, options)
  const newCandidateInserts: CandidateInsert[] = []
  let candidatesSkippedForBacklog = 0
  for (const candidate of dedupeFilteredCandidateInserts) {
    const blocks = candidateBacklogBlocks(backlog, candidate.market)
    if (blocksCandidate(candidate, blocks, observedAt, options)) {
      candidatesSkippedForBacklog += 1
      continue
    }
    newCandidateInserts.push(blocks.length > 0 ? annotateBacklogOverride(candidate, blocks) : candidate)
  }
  await insertCandidates(db, newCandidateInserts, observedAt)

  return {
    observedAt,
    tags: options.tagSlugs,
    fetchedMarkets,
    selectedWatchlist: watchlist.length,
    watchlistUpdated: watchlist.length,
    candidatesWritten: newCandidateInserts.length,
    candidatesSkippedAsDuplicates: candidateInserts.length - familyDedupedCandidateInserts.length + familyDedupedCandidateInserts.length - dedupeFilteredCandidateInserts.length,
    candidatesSkippedForBacklog,
    topWatchlist: watchlist.slice(0, 12).map((market) => ({
      slug: market.slug,
      tag: market.tagSlug,
      title: market.title,
      watchScore: market.watchScore,
      selectionReason: market.selectionReason,
    })),
    candidates: newCandidateInserts.map(({ market, draft }) => ({
      slug: market.slug,
      candidateType: draft.candidateType,
      whatChanged: draft.whatChanged,
      score: draft.score,
    })),
  }
}

export async function previewPolymarketMarketsDataEngineer(
  partialOptions: PolymarketMarketsDataEngineerOptions = {}
): Promise<PolymarketMarketsDataEngineerPreviewResult> {
  const options = selectedOptions(partialOptions)
  const observedAt = options.now
  const nowMs = new Date(observedAt).getTime()
  const byTag = await Promise.all(options.tagSlugs.map((tag) => fetchMarketsForTag(tag, options, nowMs)))
  const manualPins = options.includeManualPins
    ? (await Promise.all([...new Set(pinnedSlugs as string[])].map((slug) => fetchManualPin(slug, nowMs, options)))).flat()
    : []
  const fetchedMarkets = byTag.flat().length + manualPins.length
  const watchlist = chooseWatchlist([...byTag.flat(), ...manualPins], options)

  return {
    observedAt,
    previewOnly: true,
    tags: options.tagSlugs,
    fetchedMarkets,
    selectedWatchlist: watchlist.length,
    topWatchlist: watchlist.slice(0, 20).map((market) => ({
      slug: market.slug,
      tag: market.tagSlug,
      title: market.title,
      watchScore: market.watchScore,
      selectionReason: market.selectionReason,
    })),
  }
}

export const __testing = {
  blocksCandidate,
  candidateBacklogBlocks,
  candidateDedupeKey,
  chooseWatchlist,
  dedupeCandidateInserts,
  fetchDownstreamBacklog,
  marketFamilyKeys,
  selectManualPinRepresentatives,
  titleFamilyKey,
}
