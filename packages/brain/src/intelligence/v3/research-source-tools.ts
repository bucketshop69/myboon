import type { HyperliquidResearchLead } from '@myboon/collectors/hyperliquid/research-leads'

export type ResearchSearchProvider = 'disabled' | 'searxng'

export interface ResearchSourceQuery {
  leadId: string
  query: string
  reason: string
}

export interface ResearchSourceResult {
  provider: ResearchSearchProvider
  leadId: string
  query: string
  rank: number
  title: string
  url: string
  snippet: string
  capturedAt: string
}

export interface ResearchSourceBundle {
  provider: ResearchSearchProvider
  leadId: string
  queries: ResearchSourceQuery[]
  results: ResearchSourceResult[]
  errors: string[]
  skippedReason?: string
}

export interface RunResearchSourceOptions {
  provider?: ResearchSearchProvider
  searxngUrl?: string
  now: string
  maxQueriesPerLead?: number
  maxResultsPerQuery?: number
}

interface SearxngResult {
  title?: unknown
  url?: unknown
  content?: unknown
  engine?: unknown
}

interface SearxngResponse {
  results?: unknown
}

function laneSearchTerms(lead: HyperliquidResearchLead): string {
  if (lead.lane === 'funding_pressure') return 'funding perp futures positioning'
  if (lead.lane === 'volume_spike') return 'trading volume catalyst crypto'
  if (lead.lane === 'price_momentum') return 'price move catalyst crypto'
  if (lead.lane === 'watchlist_wallet') return 'large trader wallet perp position'
  if (lead.lane === 'oi_expansion') return 'open interest futures leverage'
  if (lead.lane === 'price_oi_divergence') return 'price open interest divergence futures'
  return 'crypto market narrative'
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

function uniqueQueries(queries: ResearchSourceQuery[], maxQueries: number): ResearchSourceQuery[] {
  const seen = new Set<string>()
  const out: ResearchSourceQuery[] = []
  for (const item of queries) {
    const query = normalizeQuery(item.query)
    const key = query.toLowerCase()
    if (!query || seen.has(key)) continue
    seen.add(key)
    out.push({ ...item, query })
    if (out.length >= maxQueries) break
  }
  return out
}

export function buildResearchSourceQueries(
  lead: HyperliquidResearchLead,
  maxQueries = 3
): ResearchSourceQuery[] {
  const asset = lead.asset.toUpperCase()
  const laneTerms = laneSearchTerms(lead)
  const suggested = lead.suggestedResearchQuestions.slice(0, 2).map((question) => ({
    leadId: lead.id,
    query: `${asset} ${question}`,
    reason: 'lead suggested research question',
  }))

  return uniqueQueries([
    {
      leadId: lead.id,
      query: `${asset} ${laneTerms} latest`,
      reason: 'find current context for the lead lane',
    },
    {
      leadId: lead.id,
      query: `${asset} crypto news catalyst last 7 days`,
      reason: 'check whether the lead has an external catalyst',
    },
    ...suggested,
  ], maxQueries)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function fetchSearxngResults(
  searxngUrl: string,
  query: ResearchSourceQuery,
  now: string,
  maxResults: number
): Promise<ResearchSourceResult[]> {
  const url = new URL('/search', searxngUrl)
  url.searchParams.set('q', query.query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('language', 'en')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'myboon-v3-local-researcher/0.1',
    },
  })
  if (!response.ok) {
    throw new Error(`SearXNG search failed with HTTP ${response.status}`)
  }

  const payload = await response.json() as SearxngResponse
  const results = Array.isArray(payload.results) ? payload.results : []

  return results
    .map((raw, index): ResearchSourceResult | null => {
      const item = raw && typeof raw === 'object' ? raw as SearxngResult : null
      if (!item) return null
      const title = text(item.title)
      const resultUrl = text(item.url)
      if (!title || !resultUrl) return null
      return {
        provider: 'searxng',
        leadId: query.leadId,
        query: query.query,
        rank: index + 1,
        title,
        url: resultUrl,
        snippet: text(item.content),
        capturedAt: now,
      }
    })
    .filter((result): result is ResearchSourceResult => Boolean(result))
    .slice(0, maxResults)
}

export async function runResearchSourceSearch(
  leads: HyperliquidResearchLead[],
  options: RunResearchSourceOptions
): Promise<Map<string, ResearchSourceBundle>> {
  const provider = options.provider ?? 'disabled'
  const maxQueriesPerLead = options.maxQueriesPerLead ?? 3
  const maxResultsPerQuery = options.maxResultsPerQuery ?? 3
  const bundles = new Map<string, ResearchSourceBundle>()

  for (const lead of leads) {
    const queries = buildResearchSourceQueries(lead, maxQueriesPerLead)
    const bundle: ResearchSourceBundle = {
      provider,
      leadId: lead.id,
      queries,
      results: [],
      errors: [],
    }

    if (provider === 'disabled') {
      bundle.skippedReason = 'Search provider disabled; generated queries only.'
      bundles.set(lead.id, bundle)
      continue
    }

    if (provider === 'searxng' && !options.searxngUrl) {
      bundle.errors.push('V3_RESEARCH_SEARXNG_URL is required when V3_RESEARCH_SEARCH_PROVIDER=searxng')
      bundles.set(lead.id, bundle)
      continue
    }

    for (const query of queries) {
      try {
        if (provider === 'searxng') {
          bundle.results.push(...await fetchSearxngResults(options.searxngUrl!, query, options.now, maxResultsPerQuery))
        }
      } catch (err) {
        bundle.errors.push(`${query.query}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    bundles.set(lead.id, bundle)
  }

  return bundles
}
