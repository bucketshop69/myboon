import { Hono } from 'hono'

const PHOENIX_API_BASE = process.env.PHOENIX_API_BASE || 'https://perp-api.phoenix.trade'
const REQUEST_TIMEOUT_MS = parseEnvInt('PHOENIX_REQUEST_TIMEOUT_MS', 10_000)
const STATUS_CACHE_TTL_MS = parseEnvInt('PHOENIX_STATUS_CACHE_TTL_MS', 15_000)
const MARKETS_CACHE_TTL_MS = parseEnvInt('PHOENIX_MARKETS_CACHE_TTL_MS', 60_000)
const CANDLES_CACHE_TTL_MS = parseEnvInt('PHOENIX_CANDLES_CACHE_TTL_MS', 15_000)
const MAX_CANDLE_LIMIT = parseEnvInt('PHOENIX_MAX_CANDLE_LIMIT', 500)

const SUPPORTED_CANDLE_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d'])

type CacheEntry<T> = {
  data: T
  fetchedAt: number
  expiresAt: number
}

interface PhoenixLeverageTier {
  maxLeverage?: unknown
  maxSizeBaseLots?: unknown
  limitOrderRiskFactor?: unknown
}

interface PhoenixFundingConfig {
  fundingIntervalSeconds?: unknown
  fundingPeriodSeconds?: unknown
  maxFundingRatePerInterval?: unknown
}

interface PhoenixMarketConfig {
  symbol?: unknown
  assetId?: unknown
  marketStatus?: unknown
  marketPubkey?: unknown
  splinePubkey?: unknown
  tickSize?: unknown
  baseLotsDecimals?: unknown
  takerFee?: unknown
  makerFee?: unknown
  leverageTiers?: PhoenixLeverageTier[]
  riskFactors?: unknown
  fundingIntervalSeconds?: unknown
  fundingPeriodSeconds?: unknown
  fundingConfig?: PhoenixFundingConfig
  maxFundingRatePerInterval?: unknown
  maxFundingRatePerIntervalPercentage?: unknown
  openInterestCapBaseLots?: unknown
  maxLiquidationSizeBaseLots?: unknown
  isolatedOnly?: unknown
  commodityMetadata?: unknown
  markPriceParameters?: unknown
}

interface PhoenixExchangeSnapshot {
  version?: unknown
  slot?: unknown
  slotIndex?: unknown
  sequenceNumber?: unknown
  exchange?: {
    active?: unknown
    gated?: unknown
    exchangeStatusBits?: unknown
    exchangeStatusFeatures?: unknown
    programId?: unknown
    canonicalMint?: unknown
    usdcMint?: unknown
  }
  markets?: PhoenixMarketConfig[]
}

interface PhoenixCandle {
  time?: unknown
  open?: unknown
  high?: unknown
  low?: unknown
  close?: unknown
  volume?: unknown
  volumeQuote?: unknown
  tradeCount?: unknown
  markOpen?: unknown
  markHigh?: unknown
  markLow?: unknown
  markClose?: unknown
  externalSource?: unknown
}

interface NormalizedPhoenixMarket {
  venueId: 'phoenix'
  symbol: string
  venueSymbol: string
  baseSymbol: string
  quoteSymbol: 'USDC'
  status: string
  marketStatus: string
  tradeable: boolean
  maxLeverage: number | null
  tickSize: string | null
  lotSize: string | null
  minOrderSize: string | null
  markPrice: number | null
  oraclePrice: number | null
  midPrice: number | null
  fundingRate: number | null
  openInterest: number | null
  volume24h: number | null
  change24h: number | null
  yesterdayPrice: number | null
  iconPath: string | null
  dataFreshness: 'partial'
  dataFreshnessReason: string
  configFetchedAt: string
  precision: {
    tickSize: string | null
    rawTickSize: number | string | null
    baseLotsDecimals: number | null
  }
  limits: {
    openInterestCapBaseLots: string | null
    maxLiquidationSizeBaseLots: string | null
    leverageTiers: PhoenixLeverageTier[]
  }
  fees: {
    makerFee: number | null
    takerFee: number | null
  }
  funding: {
    fundingIntervalSeconds: number | null
    fundingPeriodSeconds: number | null
    maxFundingRatePerInterval: string | null
    maxFundingRatePerIntervalPercentage: number | null
  }
  metadata: {
    assetId: number | null
    marketPubkey: string | null
    splinePubkey: string | null
    isolatedOnly: boolean | null
    riskFactors: unknown
    commodityMetadata: unknown
    markPriceParameters?: unknown
  }
}

const statusCache = new Map<string, CacheEntry<PhoenixExchangeSnapshot>>()
const marketsCache = new Map<string, CacheEntry<PhoenixMarketConfig[]>>()
const candlesCache = new Map<string, CacheEntry<unknown[]>>()

function parseEnvInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? input as Record<string, unknown> : null
}

function asString(input: unknown): string | null {
  return typeof input === 'string' && input.length > 0 ? input : null
}

function asBoolean(input: unknown): boolean | null {
  return typeof input === 'boolean' ? input : null
}

function parseNullableNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input !== 'string') return null
  const parsed = Number.parseFloat(input)
  return Number.isFinite(parsed) ? parsed : null
}

function parseNullableInt(input: unknown): number | null {
  const value = parseNullableNumber(input)
  return value === null ? null : Math.trunc(value)
}

function stringifyNullable(input: unknown): string | null {
  if (typeof input === 'string') return input
  if (typeof input === 'number' && Number.isFinite(input)) return String(input)
  if (typeof input === 'bigint') return input.toString()
  return null
}

function rawNumberOrString(input: unknown): number | string | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (typeof input === 'string') return input
  return null
}

function normalizeVenueSymbol(input: string | null | undefined): string | null {
  if (!input) return null
  const normalized = input.trim().toUpperCase().replace(/-PERP$/, '')
  return /^[A-Z0-9]{1,24}$/.test(normalized) ? normalized : null
}

function appSymbolFromVenueSymbol(venueSymbol: string): string {
  return `${venueSymbol}-PERP`
}

function maxLeverage(leverageTiers: PhoenixLeverageTier[] | undefined): number | null {
  if (!Array.isArray(leverageTiers)) return null
  const leverages = leverageTiers
    .map((tier) => parseNullableNumber(tier.maxLeverage))
    .filter((value): value is number => value !== null)
  if (leverages.length === 0) return null
  return Math.max(...leverages)
}

function fundingConfig(market: PhoenixMarketConfig): PhoenixFundingConfig {
  return {
    fundingIntervalSeconds: market.fundingConfig?.fundingIntervalSeconds ?? market.fundingIntervalSeconds,
    fundingPeriodSeconds: market.fundingConfig?.fundingPeriodSeconds ?? market.fundingPeriodSeconds,
    maxFundingRatePerInterval: market.fundingConfig?.maxFundingRatePerInterval ?? market.maxFundingRatePerInterval,
  }
}

async function phoenixFetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${PHOENIX_API_BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      const upstreamBody = await res.text().catch(() => '')
      throw new PhoenixUpstreamError(res.status, upstreamBody)
    }

    return await res.json() as T
  } finally {
    clearTimeout(timeout)
  }
}

class PhoenixUpstreamError extends Error {
  constructor(readonly status: number, readonly upstreamBody: string) {
    super(`Phoenix upstream failed (${status})`)
  }
}

async function cachedJson<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<CacheEntry<T>> {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached

  const data = await fetcher()
  const entry = { data, fetchedAt: now, expiresAt: now + ttlMs }
  cache.set(key, entry)
  return entry
}

async function getExchangeSnapshot(): Promise<CacheEntry<PhoenixExchangeSnapshot>> {
  return cachedJson(statusCache, 'snapshot', STATUS_CACHE_TTL_MS, () => (
    phoenixFetchJson<PhoenixExchangeSnapshot>('/v1/exchange/snapshot')
  ))
}

async function getRawMarkets(): Promise<CacheEntry<PhoenixMarketConfig[]>> {
  return cachedJson(marketsCache, 'markets', MARKETS_CACHE_TTL_MS, () => (
    phoenixFetchJson<PhoenixMarketConfig[]>('/exchange/markets')
  ))
}

async function getMarketByVenueSymbol(venueSymbol: string): Promise<{ market: PhoenixMarketConfig; fetchedAt: number } | null> {
  const entry = await getRawMarkets()
  const market = entry.data.find((candidate) => normalizeVenueSymbol(asString(candidate.symbol)) === venueSymbol)
  return market ? { market, fetchedAt: entry.fetchedAt } : null
}

function normalizeMarket(market: PhoenixMarketConfig, fetchedAt: number): NormalizedPhoenixMarket | null {
  const venueSymbol = normalizeVenueSymbol(asString(market.symbol))
  if (!venueSymbol) return null

  const marketStatus = asString(market.marketStatus) ?? 'unknown'
  const config = fundingConfig(market)

  return {
    venueId: 'phoenix',
    symbol: appSymbolFromVenueSymbol(venueSymbol),
    venueSymbol,
    baseSymbol: venueSymbol,
    quoteSymbol: 'USDC',
    status: marketStatus,
    marketStatus,
    tradeable: marketStatus === 'active',
    maxLeverage: maxLeverage(market.leverageTiers),
    tickSize: stringifyNullable(market.tickSize),
    lotSize: null,
    minOrderSize: null,
    markPrice: null,
    oraclePrice: null,
    midPrice: null,
    fundingRate: null,
    openInterest: null,
    volume24h: null,
    change24h: null,
    yesterdayPrice: null,
    iconPath: null,
    dataFreshness: 'partial',
    dataFreshnessReason: 'Phoenix REST market config does not include WS-only mark, mid, oracle, funding, open interest, or 24h volume stats in this slice.',
    configFetchedAt: new Date(fetchedAt).toISOString(),
    precision: {
      tickSize: stringifyNullable(market.tickSize),
      rawTickSize: rawNumberOrString(market.tickSize),
      baseLotsDecimals: parseNullableInt(market.baseLotsDecimals),
    },
    limits: {
      openInterestCapBaseLots: stringifyNullable(market.openInterestCapBaseLots),
      maxLiquidationSizeBaseLots: stringifyNullable(market.maxLiquidationSizeBaseLots),
      leverageTiers: Array.isArray(market.leverageTiers) ? market.leverageTiers : [],
    },
    fees: {
      makerFee: parseNullableNumber(market.makerFee),
      takerFee: parseNullableNumber(market.takerFee),
    },
    funding: {
      fundingIntervalSeconds: parseNullableInt(config.fundingIntervalSeconds),
      fundingPeriodSeconds: parseNullableInt(config.fundingPeriodSeconds),
      maxFundingRatePerInterval: stringifyNullable(config.maxFundingRatePerInterval),
      maxFundingRatePerIntervalPercentage: parseNullableNumber(market.maxFundingRatePerIntervalPercentage),
    },
    metadata: {
      assetId: parseNullableInt(market.assetId),
      marketPubkey: asString(market.marketPubkey),
      splinePubkey: asString(market.splinePubkey),
      isolatedOnly: asBoolean(market.isolatedOnly),
      riskFactors: market.riskFactors ?? null,
      commodityMetadata: market.commodityMetadata ?? null,
      markPriceParameters: market.markPriceParameters,
    },
  }
}

function normalizedStatus(snapshot: CacheEntry<PhoenixExchangeSnapshot>) {
  const exchange = snapshot.data.exchange ?? {}
  return {
    venueId: 'phoenix',
    status: asBoolean(exchange.active) ? 'active' : 'inactive',
    active: asBoolean(exchange.active) ?? false,
    gated: asBoolean(exchange.gated) ?? null,
    slot: parseNullableInt(snapshot.data.slot),
    slotIndex: parseNullableInt(snapshot.data.slotIndex),
    version: parseNullableInt(snapshot.data.version),
    sequenceNumber: stringifyNullable(snapshot.data.sequenceNumber),
    features: Array.isArray(exchange.exchangeStatusFeatures) ? exchange.exchangeStatusFeatures : [],
    exchangeStatusBits: parseNullableInt(exchange.exchangeStatusBits),
    programId: asString(exchange.programId),
    canonicalMint: asString(exchange.canonicalMint),
    usdcMint: asString(exchange.usdcMint),
    dataFreshness: 'snapshot',
    fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
  }
}

function parseCandleLimit(input: string | undefined): number {
  const parsed = Number.parseInt(input ?? '100', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 100
  return Math.min(parsed, MAX_CANDLE_LIMIT)
}

function appendOptionalQuery(params: URLSearchParams, name: string, value: string | undefined): void {
  if (value !== undefined && value.trim() !== '') params.set(name, value)
}

function normalizeCandle(raw: unknown) {
  const candle = asRecord(raw) as PhoenixCandle | null
  if (!candle) return null

  const time = parseNullableInt(candle.time)
  const open = parseNullableNumber(candle.open)
  const high = parseNullableNumber(candle.high)
  const low = parseNullableNumber(candle.low)
  const close = parseNullableNumber(candle.close)
  if (time === null || open === null || high === null || low === null || close === null) return null

  return {
    time,
    open,
    close,
    high,
    low,
    volume: parseNullableNumber(candle.volume) ?? 0,
    volumeQuote: parseNullableNumber(candle.volumeQuote),
    tradeCount: parseNullableInt(candle.tradeCount),
    mark: {
      open: parseNullableNumber(candle.markOpen),
      high: parseNullableNumber(candle.markHigh),
      low: parseNullableNumber(candle.markLow),
      close: parseNullableNumber(candle.markClose),
    },
    externalSource: asString(candle.externalSource),
  }
}

function upstreamStatusCode(err: unknown): 429 | 502 {
  if (err instanceof PhoenixUpstreamError && err.status === 429) return 429
  return 502
}

function upstreamErrorPayload(err: unknown, fallback: string) {
  if (err instanceof PhoenixUpstreamError) {
    const upstream = err.upstreamBody ? asRecord(safeJsonParse(err.upstreamBody)) : null
    const upstreamError = upstream?.error
    return {
      error: typeof upstreamError === 'string' ? upstreamError : fallback,
      upstreamStatus: err.status,
    }
  }
  return { error: fallback }
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input) as unknown
  } catch {
    return null
  }
}

export const phoenixRoutes = new Hono()

// GET /perps/phoenix/health
phoenixRoutes.get('/health', (c) => {
  return c.json({
    venueId: 'phoenix',
    status: 'ok',
    upstreamBase: PHOENIX_API_BASE,
    readOnly: true,
  })
})

// GET /perps/phoenix/status
phoenixRoutes.get('/status', async (c) => {
  try {
    return c.json(normalizedStatus(await getExchangeSnapshot()))
  } catch (err) {
    console.error('[api] Phoenix status unavailable:', err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix status unavailable'), upstreamStatusCode(err))
  }
})

// GET /perps/phoenix/markets
phoenixRoutes.get('/markets', async (c) => {
  try {
    const markets = await getRawMarkets()
    const data = markets.data
      .map((market) => normalizeMarket(market, markets.fetchedAt))
      .filter((market): market is NormalizedPhoenixMarket => market !== null)
      .sort((a, b) => a.baseSymbol.localeCompare(b.baseSymbol))

    return c.json(data)
  } catch (err) {
    console.error('[api] Phoenix markets unavailable:', err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix markets unavailable'), upstreamStatusCode(err))
  }
})

// GET /perps/phoenix/markets/:symbol
phoenixRoutes.get('/markets/:symbol', async (c) => {
  const venueSymbol = normalizeVenueSymbol(c.req.param('symbol'))
  if (!venueSymbol) return c.json({ error: 'Invalid Phoenix market symbol' }, 400)

  try {
    const result = await getMarketByVenueSymbol(venueSymbol)
    if (!result) return c.json({ error: 'Phoenix market not found' }, 404)

    const market = normalizeMarket(result.market, result.fetchedAt)
    if (!market) return c.json({ error: 'Phoenix market not found' }, 404)

    return c.json(market)
  } catch (err) {
    console.error(`[api] Phoenix market ${venueSymbol} unavailable:`, err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix market unavailable'), upstreamStatusCode(err))
  }
})

// GET /perps/phoenix/candles?symbol=&interval=&count=&startTime=&endTime=
phoenixRoutes.get('/candles', async (c) => {
  const venueSymbol = normalizeVenueSymbol(c.req.query('symbol'))
  if (!venueSymbol) return c.json({ error: 'Missing or invalid symbol' }, 400)

  const interval = c.req.query('interval') ?? '1h'
  if (!SUPPORTED_CANDLE_INTERVALS.has(interval)) {
    return c.json({
      error: 'Unsupported Phoenix candle interval',
      code: 'UNSUPPORTED_INTERVAL',
      supportedIntervals: [...SUPPORTED_CANDLE_INTERVALS],
    }, 400)
  }

  try {
    const knownMarket = await getMarketByVenueSymbol(venueSymbol)
    if (!knownMarket) return c.json({ error: 'Phoenix market not found' }, 404)

    const limit = parseCandleLimit(c.req.query('count') ?? c.req.query('limit'))
    const params = new URLSearchParams({ symbol: venueSymbol, timeframe: interval, limit: String(limit) })
    appendOptionalQuery(params, 'startTime', c.req.query('startTime'))
    appendOptionalQuery(params, 'endTime', c.req.query('endTime'))
    appendOptionalQuery(params, 'enableExternalSource', c.req.query('enableExternalSource'))

    const cacheKey = params.toString()
    const raw = await cachedJson(candlesCache, cacheKey, CANDLES_CACHE_TTL_MS, () => (
      phoenixFetchJson<unknown[]>(`/candles?${cacheKey}`)
    ))
    const candles = raw.data.map(normalizeCandle).filter((candle): candle is NonNullable<ReturnType<typeof normalizeCandle>> => candle !== null)
    return c.json(candles)
  } catch (err) {
    console.error(`[api] Phoenix candles ${venueSymbol} unavailable:`, err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix candles unavailable'), upstreamStatusCode(err))
  }
})
