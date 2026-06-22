const GAMMA_API = 'https://gamma-api.polymarket.com'

export interface GammaEvent {
  id?: string
  ticker?: string
  slug?: string
  title?: string
  description?: string
  endDate?: string
  volume?: unknown
  liquidity?: unknown
  volume24hr?: unknown
  updatedAt?: string
  markets?: GammaMarket[]
}

export interface GammaMarket {
  id?: string
  conditionId?: string
  question?: string
  slug?: string
  description?: string
  resolutionSource?: string
  endDate?: string
  endDateIso?: string
  volume?: unknown
  volumeNum?: unknown
  volume24hr?: unknown
  liquidity?: unknown
  liquidityNum?: unknown
  liquidityClob?: unknown
  outcomePrices?: unknown
  lastTradePrice?: unknown
  updatedAt?: string
  events?: GammaEvent[]
}

export interface PolymarketNativeContext {
  source_url: string
  market: {
    id: string | null
    condition_id: string | null
    slug: string
    title: string
    description: string | null
    resolution_source: string | null
    end_date: string | null
    updated_at: string | null
  }
  market_structure: {
    yes_price: number | null
    volume: number | null
    volume_24h: number | null
    liquidity: number | null
  }
  parent_event: {
    id: string | null
    slug: string | null
    title: string | null
    description: string | null
    end_date: string | null
    volume: number | null
    volume_24h: number | null
    liquidity: number | null
  } | null
  sibling_markets: Array<{
    slug: string
    title: string
    yes_price: number | null
    end_date: string | null
    volume: number | null
    volume_24h: number | null
    liquidity: number | null
  }>
  source_native_questions: string[]
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function parseOutcomePrices(raw: unknown): number | null {
  let value = raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(value)) return null
  const yes = numberOrNull(value[0])
  return yes != null && yes >= 0 && yes <= 1 ? yes : null
}

function cleanSlug(slug: string): string {
  return slug.split('/').filter(Boolean).at(-1) ?? slug
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Polymarket Gamma fetch failed ${res.status}: ${url}`)
  return res.json() as Promise<T>
}

async function fetchMarket(slug: string): Promise<GammaMarket> {
  const marketSlug = cleanSlug(slug)
  const markets = await fetchJson<GammaMarket[]>(`${GAMMA_API}/markets?slug=${encodeURIComponent(marketSlug)}`)
  const market = markets[0]
  if (!market) throw new Error(`No Polymarket market found for slug: ${slug}`)
  return market
}

async function fetchParentEvent(market: GammaMarket): Promise<GammaEvent | null> {
  const eventSlug = market.events?.[0]?.slug
  if (!eventSlug) return market.events?.[0] ?? null
  const events = await fetchJson<GammaEvent[]>(`${GAMMA_API}/events?slug=${encodeURIComponent(eventSlug)}&limit=1`).catch(() => [])
  return events[0] ?? market.events?.[0] ?? null
}

function siblingMarkets(event: GammaEvent | null, currentSlug: string): PolymarketNativeContext['sibling_markets'] {
  return (event?.markets ?? [])
    .filter((market) => market.slug && market.slug !== currentSlug)
    .slice(0, 12)
    .map((market) => ({
      slug: market.slug ?? '',
      title: market.question ?? market.slug ?? '',
      yes_price: parseOutcomePrices(market.outcomePrices) ?? numberOrNull(market.lastTradePrice),
      end_date: market.endDate ?? market.endDateIso ?? null,
      volume: numberOrNull(market.volumeNum ?? market.volume),
      volume_24h: numberOrNull(market.volume24hr),
      liquidity: numberOrNull(market.liquidityNum ?? market.liquidityClob ?? market.liquidity),
    }))
}

export function sourceNativeQuestions(context: Pick<PolymarketNativeContext, 'market'>): string[] {
  const title = context.market.title
  return [
    `What is the market "${title}" about in plain terms?`,
    'What are the exact resolution rules and resolution source from Polymarket?',
    'Are there deadline/date inconsistencies between title, rule text, end date, and event group?',
    'What sibling markets exist in the same parent event, and do they form a date ladder or related outcome set?',
    'What does Polymarket-native structure show: price, liquidity, volume, 24h activity, and freshness?',
    'Based only on Polymarket-native data, what is known, what is unknown, and what external research is needed?',
  ]
}

export async function fetchPolymarketNativeContext(slug: string): Promise<PolymarketNativeContext> {
  const market = await fetchMarket(slug)
  const currentSlug = market.slug ?? cleanSlug(slug)
  const event = await fetchParentEvent(market)
  const sourceUrl = `https://polymarket.com/event/${event?.slug ?? currentSlug}/${currentSlug}`
  const context: PolymarketNativeContext = {
    source_url: sourceUrl,
    market: {
      id: market.id ?? null,
      condition_id: market.conditionId ?? null,
      slug: currentSlug,
      title: market.question ?? currentSlug,
      description: market.description ?? null,
      resolution_source: market.resolutionSource ?? null,
      end_date: market.endDate ?? market.endDateIso ?? null,
      updated_at: market.updatedAt ?? null,
    },
    market_structure: {
      yes_price: parseOutcomePrices(market.outcomePrices) ?? numberOrNull(market.lastTradePrice),
      volume: numberOrNull(market.volumeNum ?? market.volume),
      volume_24h: numberOrNull(market.volume24hr),
      liquidity: numberOrNull(market.liquidityNum ?? market.liquidityClob ?? market.liquidity),
    },
    parent_event: event ? {
      id: event.id ?? null,
      slug: event.slug ?? null,
      title: event.title ?? null,
      description: event.description ?? null,
      end_date: event.endDate ?? null,
      volume: numberOrNull(event.volume),
      volume_24h: numberOrNull(event.volume24hr),
      liquidity: numberOrNull(event.liquidity),
    } : null,
    sibling_markets: siblingMarkets(event, currentSlug),
    source_native_questions: [],
  }
  return {
    ...context,
    source_native_questions: sourceNativeQuestions(context),
  }
}
