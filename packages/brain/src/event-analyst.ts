/**
 * Polymarket Event Analyst
 *
 * Usage: pnpm tsx src/event-analyst.ts <event-or-market-slug>
 *
 * Fetches all data for a Polymarket event, enriches each child market
 * with orderbook + activity data, then feeds everything to MiniMax
 * for insight extraction.
 */
import 'dotenv/config'
import * as readline from 'readline'
import { callMinimax, extractText } from './minimax.js'

// --- constants ---

const GAMMA_API = 'https://gamma-api.polymarket.com'
const CLOB_API = 'https://clob.polymarket.com'
const DATA_API = 'https://data-api.polymarket.com'

// --- types ---

interface GammaMarketRaw {
  id: string
  question?: string
  slug?: string
  conditionId?: string
  clobTokenIds?: unknown
  outcomePrices?: string
  volumeNum?: number
  volume?: number
  endDateIso?: string
  outcomes?: string[]
}

interface GammaEventRaw {
  id: string
  title: string
  slug: string
  endDate?: string
  volume?: number
  volumeNum?: number
  markets?: GammaMarketRaw[]
}

interface ParsedMarket {
  question: string
  slug: string
  conditionId: string
  yesTokenId: string
  noTokenId: string
  yesPrice: number | null
  noPrice: number | null
  volume: number
  endDate: string | null
}

interface OrderbookData {
  bestBid: number
  bestAsk: number
  spread: number
  totalBidSize: number
  totalAskSize: number
  bidLevels: number
  askLevels: number
}

interface TradeRaw {
  proxyWallet: string
  name?: string
  pseudonym?: string
  side: string
  outcome: string
  size: number
  price: number
  timestamp: number
  transactionHash?: string
}

interface TradeData {
  totalTrades: number
  distinctWallets: number
  totalVolumeUsd: number
  byOutcome: { outcome: string; trades: number; volumeUsd: number }[]
  bySide: { side: string; count: number }[]
  topTraders: { wallet: string; name: string; trades: number; totalUsd: number }[]
  biggestTrade: { wallet: string; name: string; side: string; outcome: string; size: number; price: number; usd: number } | null
  recentTrades: { wallet: string; name: string; side: string; outcome: string; usd: number; timestamp: number }[]
}

interface EnrichedMarket extends ParsedMarket {
  orderbook: OrderbookData | null
  trades: TradeData | null
}

// --- helpers ---

function parseTokenIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch { /* ignore */ }
  }
  return []
}

function parseOutcomePrices(raw?: string): [number, number] | null {
  if (!raw) return null
  try {
    const prices = JSON.parse(raw)
    if (Array.isArray(prices) && prices.length >= 2) {
      return [parseFloat(prices[0]), parseFloat(prices[1])]
    }
  } catch { /* ignore */ }
  return null
}

function formatVolume(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`
  return `$${Math.round(amount)}`
}

function displayAddr(addr: string): string {
  return addr
}

// --- Phase 1: resolve event ---

async function fetchEvent(slug: string): Promise<{ title: string; slug: string; volume: number; endDate: string | null; markets: ParsedMarket[] } | null> {
  // Try event slug first
  const eventRes = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`)
  if (eventRes.ok) {
    const events: GammaEventRaw[] = await eventRes.json()
    if (events.length > 0 && events[0].markets && events[0].markets.length > 0) {
      const event = events[0]
      return {
        title: event.title,
        slug: event.slug,
        volume: event.volumeNum ?? event.volume ?? 0,
        endDate: event.endDate ?? null,
        markets: event.markets!.map(parseGammaMarket).filter((m): m is ParsedMarket => m !== null),
      }
    }
  }

  // Fallback: try as a market slug
  console.log('[event-analyst] No event found, trying as market slug...')
  const marketRes = await fetch(`${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}`)
  if (marketRes.ok) {
    const markets: GammaMarketRaw[] = await marketRes.json()
    if (markets.length > 0) {
      const parsed = markets.map(parseGammaMarket).filter((m): m is ParsedMarket => m !== null)
      if (parsed.length > 0) {
        return {
          title: parsed[0].question,
          slug,
          volume: parsed.reduce((sum, m) => sum + m.volume, 0),
          endDate: parsed[0].endDate,
          markets: parsed,
        }
      }
    }
  }

  return null
}

function parseGammaMarket(m: GammaMarketRaw): ParsedMarket | null {
  const tokenIds = parseTokenIds(m.clobTokenIds)
  if (tokenIds.length < 2) return null
  const prices = parseOutcomePrices(m.outcomePrices)
  return {
    question: m.question ?? m.slug ?? 'Unknown',
    slug: m.slug ?? '',
    conditionId: m.conditionId ?? m.id,
    yesTokenId: tokenIds[0],
    noTokenId: tokenIds[1],
    yesPrice: prices ? prices[0] : null,
    noPrice: prices ? prices[1] : null,
    volume: m.volumeNum ?? m.volume ?? 0,
    endDate: m.endDateIso ?? null,
  }
}

// --- Phase 2: enrich ---

async function fetchOrderbook(yesTokenId: string): Promise<OrderbookData | null> {
  try {
    const res = await fetch(`${CLOB_API}/book?token_id=${yesTokenId}`)
    if (!res.ok) return null
    const data: { bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[] } = await res.json()

    const bids = data.bids ?? []
    const asks = data.asks ?? []
    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0
    const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0
    const totalBidSize = bids.reduce((sum, b) => sum + parseFloat(b.size), 0)
    const totalAskSize = asks.reduce((sum, a) => sum + parseFloat(a.size), 0)

    return {
      bestBid,
      bestAsk,
      spread: bestAsk > 0 && bestBid > 0 ? +(bestAsk - bestBid).toFixed(4) : 0,
      totalBidSize: Math.round(totalBidSize),
      totalAskSize: Math.round(totalAskSize),
      bidLevels: bids.length,
      askLevels: asks.length,
    }
  } catch {
    return null
  }
}

async function fetchTrades(conditionId: string): Promise<TradeData | null> {
  try {
    const res = await fetch(`${DATA_API}/trades?market=${conditionId}&limit=100`)
    if (!res.ok) return null
    const raw: TradeRaw[] = await res.json()

    if (!Array.isArray(raw) || raw.length === 0) return null

    // Aggregate by outcome
    const outcomeMap = new Map<string, { trades: number; volumeUsd: number }>()
    const sideMap = new Map<string, number>()
    const walletMap = new Map<string, { name: string; trades: number; totalUsd: number }>()
    let biggest: TradeData['biggestTrade'] = null

    for (const t of raw) {
      const usd = t.size * t.price

      // By outcome
      const oc = outcomeMap.get(t.outcome) ?? { trades: 0, volumeUsd: 0 }
      oc.trades++
      oc.volumeUsd += usd
      outcomeMap.set(t.outcome, oc)

      // By side
      sideMap.set(t.side, (sideMap.get(t.side) ?? 0) + 1)

      // By wallet
      const w = walletMap.get(t.proxyWallet) ?? { name: t.name || t.pseudonym || '', trades: 0, totalUsd: 0 }
      w.trades++
      w.totalUsd += usd
      walletMap.set(t.proxyWallet, w)

      // Biggest trade
      if (!biggest || usd > biggest.usd) {
        biggest = {
          wallet: displayAddr(t.proxyWallet),
          name: t.name || t.pseudonym || '',
          side: t.side,
          outcome: t.outcome,
          size: t.size,
          price: t.price,
          usd: Math.round(usd),
        }
      }
    }

    // Top traders by volume
    const topTraders = Array.from(walletMap.entries())
      .map(([addr, w]) => ({ wallet: displayAddr(addr), name: w.name, trades: w.trades, totalUsd: Math.round(w.totalUsd) }))
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, 10)

    // Recent trades (last 10)
    const recentTrades = raw.slice(0, 10).map(t => ({
      wallet: displayAddr(t.proxyWallet),
      name: t.name || t.pseudonym || '',
      side: t.side,
      outcome: t.outcome,
      usd: Math.round(t.size * t.price),
      timestamp: t.timestamp,
    }))

    return {
      totalTrades: raw.length,
      distinctWallets: walletMap.size,
      totalVolumeUsd: Math.round(raw.reduce((sum, t) => sum + t.size * t.price, 0)),
      byOutcome: Array.from(outcomeMap.entries()).map(([outcome, d]) => ({
        outcome, trades: d.trades, volumeUsd: Math.round(d.volumeUsd),
      })),
      bySide: Array.from(sideMap.entries()).map(([side, count]) => ({ side, count })),
      topTraders,
      biggestTrade: biggest,
      recentTrades,
    }
  } catch {
    return null
  }
}

async function enrichMarket(market: ParsedMarket): Promise<EnrichedMarket> {
  const [obResult, trResult] = await Promise.allSettled([
    fetchOrderbook(market.yesTokenId),
    fetchTrades(market.conditionId),
  ])

  return {
    ...market,
    orderbook: obResult.status === 'fulfilled' ? obResult.value : null,
    trades: trResult.status === 'fulfilled' ? trResult.value : null,
  }
}

// --- Phase 3: build context + call LLM ---

function buildContext(title: string, slug: string, volume: number, endDate: string | null, markets: EnrichedMarket[]): string {
  const lines: string[] = []
  lines.push(`EVENT: ${title}`)
  lines.push(`Slug: ${slug}`)
  lines.push(`Total volume: ${formatVolume(volume)}`)
  if (endDate) lines.push(`End date: ${endDate}`)
  lines.push(`Markets: ${markets.length}`)
  lines.push('')

  // Sum implied probabilities for anomaly detection
  const impliedSum = markets.reduce((sum, m) => sum + (m.yesPrice ?? 0), 0)
  lines.push(`Sum of YES prices (implied probabilities): ${(impliedSum * 100).toFixed(1)}%`)
  lines.push('')

  for (let i = 0; i < markets.length; i++) {
    const m = markets[i]
    lines.push(`--- MARKET ${i + 1}: ${m.question} ---`)
    lines.push(`Slug: ${m.slug}`)

    const yes = m.yesPrice !== null ? m.yesPrice.toFixed(2) : '?'
    const no = m.noPrice !== null ? m.noPrice.toFixed(2) : '?'
    lines.push(`YES: ${yes} | NO: ${no} | Volume: ${formatVolume(m.volume)}`)
    if (m.endDate) lines.push(`End date: ${m.endDate}`)

    if (m.orderbook) {
      const ob = m.orderbook
      lines.push(`Orderbook: bid ${ob.bestBid.toFixed(2)} / ask ${ob.bestAsk.toFixed(2)} | spread: ${ob.spread.toFixed(4)}`)
      lines.push(`  Bid depth: ${ob.totalBidSize.toLocaleString()} shares (${ob.bidLevels} levels) | Ask depth: ${ob.totalAskSize.toLocaleString()} shares (${ob.askLevels} levels)`)
    } else {
      lines.push(`Orderbook: unavailable`)
    }

    if (m.trades) {
      const tr = m.trades
      lines.push(`Trade history (${tr.totalTrades} trades, ${tr.distinctWallets} wallets, ${formatVolume(tr.totalVolumeUsd)} volume):`)

      // Breakdown by outcome
      for (const oc of tr.byOutcome) {
        lines.push(`  ${oc.outcome}: ${oc.trades} trades, ${formatVolume(oc.volumeUsd)}`)
      }

      // Buy/sell breakdown
      const buys = tr.bySide.find(s => s.side === 'BUY')?.count ?? 0
      const sells = tr.bySide.find(s => s.side === 'SELL')?.count ?? 0
      lines.push(`  Buys: ${buys} | Sells: ${sells}`)

      // Biggest trade
      if (tr.biggestTrade) {
        const bt = tr.biggestTrade
        lines.push(`  Biggest trade: ${formatVolume(bt.usd)} ${bt.side} "${bt.outcome}" @ ${bt.price.toFixed(3)} by ${bt.name || bt.wallet}`)
      }

      // Top traders
      if (tr.topTraders.length > 0) {
        lines.push(`  Top traders:`)
        for (const tt of tr.topTraders.slice(0, 5)) {
          lines.push(`    ${tt.name || tt.wallet}: ${tt.trades} trade(s), ${formatVolume(tt.totalUsd)}`)
        }
      }

      // Recent trades
      if (tr.recentTrades.length > 0) {
        lines.push(`  Most recent trades:`)
        for (const rt of tr.recentTrades.slice(0, 5)) {
          const when = new Date(rt.timestamp * 1000).toISOString().slice(0, 16)
          lines.push(`    ${when} | ${rt.side} "${rt.outcome}" ${formatVolume(rt.usd)} by ${rt.name || rt.wallet}`)
        }
      }
    } else {
      lines.push(`Trade history: unavailable`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a sharp, opinionated prediction market analyst. You don't just report — you take a stance.
Your job is to dig into Polymarket event data and produce compelling, persuasive takes for social media.

IMPORTANT RULES:
- Always use FULL wallet addresses and usernames. Never truncate addresses. Write the complete 0x... address.
- Always use FULL Polymarket URLs when referencing markets: https://polymarket.com/event/{eventSlug}
- Take a clear position. Don't hedge with "could be" or "might suggest." Say what you think happened and why.
- End with a verdict — your final take on what this data means.

You have access to:
- Market prices and volumes
- Orderbook depth (bid/ask levels and liquidity)
- Trade history: who traded, how much, which side, which outcome
- Top traders by volume and their usernames/wallets

Look for:
- WHO is betting big and on what side (name the traders with full addresses, show the money)
- Smart money vs retail patterns (few big traders vs many small ones)
- Contrarian positions (big bets against the consensus — who and how much?)
- Winners and losers (for resolved markets: who made money, who got wrecked)
- Pricing anomalies and liquidity imbalances
- Timing patterns (last-minute flips, coordinated trades)

Output format:

## Event Summary
One paragraph: what this event is, current state of odds, total volume context.

## The Money Story
Who bet what. Name the biggest traders by full username or full wallet address. Show the dollar amounts.
Which side won? How much did the winners make? Who got wrecked? Be specific — names, amounts, sides.

## Insights
3-5 numbered insights. For each:
**[Punchy headline that could be a tweet hook]**
2-3 sentences of persuasive analysis. Take a position. Don't sit on the fence.
Confidence: HIGH / MEDIUM / LOW

## Verdict
Your final take in 2-3 sentences. What's the real story here? What should people know? Be bold.

## Content Ideas
2-3 tweet-length hooks (under 280 chars). These should be attention-grabbing, opinionated observations. Think "wait, really?" not "here are the odds."
`

// --- interactive market picker ---

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function pickMarkets(markets: ParsedMarket[]): Promise<ParsedMarket[]> {
  if (markets.length <= 3) return markets // no need to pick for small events

  console.log('\nFound markets:')
  for (let i = 0; i < markets.length; i++) {
    const m = markets[i]
    const yes = m.yesPrice !== null ? `${(m.yesPrice * 100).toFixed(0)}%` : '?'
    const vol = formatVolume(m.volume)
    console.log(`  [${i + 1}] ${m.question}  (YES: ${yes}, Vol: ${vol})`)
  }

  console.log(`  [a] All markets`)
  const answer = await ask('\nSelect markets (e.g. 1,3,5 or "a" for all): ')

  if (answer.toLowerCase() === 'a' || answer === '') return markets

  const indices = answer.split(',')
    .map(s => parseInt(s.trim(), 10) - 1)
    .filter(i => i >= 0 && i < markets.length)

  if (indices.length === 0) {
    console.log('No valid selection, using all markets.')
    return markets
  }

  return indices.map(i => markets[i])
}

// --- main ---

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Usage: pnpm tsx src/event-analyst.ts <event-or-market-slug>')
    process.exit(1)
  }

  console.log(`[event-analyst] Resolving: ${slug}`)

  // Phase 1: resolve
  const event = await fetchEvent(slug)
  if (!event) {
    console.error(`[event-analyst] No event or market found for slug: ${slug}`)
    process.exit(1)
  }

  console.log(`[event-analyst] Found: "${event.title}" with ${event.markets.length} market(s)`)

  // Phase 1b: let user pick markets (interactive for 4+ markets)
  const selectedMarkets = await pickMarkets(event.markets)
  console.log(`[event-analyst] Selected ${selectedMarkets.length} market(s)`)

  // Phase 2: enrich selected markets in parallel
  console.log(`[event-analyst] Enriching ${selectedMarkets.length} market(s)...`)
  const enriched = await Promise.all(selectedMarkets.map(enrichMarket))

  const enrichedOb = enriched.filter(m => m.orderbook).length
  const enrichedTr = enriched.filter(m => m.trades).length
  console.log(`[event-analyst] Enrichment complete: ${enrichedOb} orderbooks, ${enrichedTr} trade histories`)

  // Phase 3: build context
  const context = buildContext(event.title, event.slug, event.volume, event.endDate, enriched)

  const separator = '='.repeat(60)
  console.log(`\n${separator}`)
  console.log(`Polymarket Event Analyst — ${slug}`)
  console.log(`Fetched at: ${new Date().toISOString()}`)
  console.log(separator)

  // If no MINIMAX_API_KEY, print raw data and exit
  if (!process.env.MINIMAX_API_KEY) {
    console.log('\n[No MINIMAX_API_KEY — printing raw data context]\n')
    console.log(context)
    console.log(separator)
    process.exit(0)
  }

  // Phase 3b: call LLM
  console.log('\n[event-analyst] Calling MiniMax for analysis...\n')

  const response = await callMinimax(
    [{ role: 'user', content: `Analyze this Polymarket event data and provide insights:\n\n${context}` }],
    [],
    SYSTEM_PROMPT,
    { temperature: 0.4, max_tokens: 4096 },
  )

  const analysis = extractText(response)
  console.log(analysis)
  console.log(`\n${separator}`)
}

main().catch((err) => {
  console.error('[event-analyst] Fatal error:', err)
  process.exit(1)
})
