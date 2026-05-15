import { Hono } from 'hono'
import type { Context } from 'hono'

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

interface PhoenixFetchOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

interface PhoenixInstructionBuilderResult {
  venueId: 'phoenix'
  action: string
  mode: 'solana_instruction_builder'
  endpoint: string
  instructions: unknown[]
  raw: unknown
  estimatedLiquidationPriceUsd?: number | null
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

function asNonEmptyString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
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

function parseNonNegativeInteger(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isSafeInteger(input) && input >= 0 ? input : null
  }

  if (typeof input !== 'string' || !/^\d+$/.test(input)) return null
  const parsed = Number.parseInt(input, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isNonNegativeInteger(input: unknown): boolean {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0
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

async function phoenixFetchJson<T>(path: string, options: PhoenixFetchOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  const init: RequestInit = { method, signal: controller.signal, headers }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  try {
    const res = await fetch(`${PHOENIX_API_BASE}${path}`, init)

    if (!res.ok) {
      const upstreamBody = await res.text().catch(() => '')
      throw new PhoenixUpstreamError(res.status, upstreamBody)
    }

    const text = await res.text()
    if (text.trim() === '') return null as T
    return JSON.parse(text) as T
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

async function readJsonRecord(c: Context): Promise<{ body: Record<string, unknown> } | { response: Response }> {
  let parsed: unknown
  try {
    parsed = await c.req.json()
  } catch {
    return { response: c.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, 400) }
  }

  const body = !Array.isArray(parsed) ? asRecord(parsed) : null
  if (!body) {
    return { response: c.json({ error: 'Expected JSON object body', code: 'INVALID_JSON_OBJECT' }, 400) }
  }

  return { body }
}

function missingStringFields(body: Record<string, unknown>, fields: string[]): string[] {
  return fields.filter((field) => asNonEmptyString(body[field]) === null)
}

function invalidNonNegativeIntegerFields(body: Record<string, unknown>, fields: string[]): string[] {
  return fields.filter((field) => !isNonNegativeInteger(body[field]))
}

function missingFieldsPayload(fields: string[]) {
  return {
    error: 'Missing required fields',
    code: 'MISSING_REQUIRED_FIELDS',
    fields,
  }
}

function invalidFieldsPayload(fields: string[]) {
  return {
    error: 'Invalid required fields',
    code: 'INVALID_REQUIRED_FIELDS',
    fields,
  }
}

function instructionBuilderResponse(
  action: string,
  endpoint: string,
  raw: unknown,
): PhoenixInstructionBuilderResult {
  const rawRecord = asRecord(raw)
  const instructions = Array.isArray(raw)
    ? raw
    : (Array.isArray(rawRecord?.instructions) ? rawRecord.instructions : [])
  const result: PhoenixInstructionBuilderResult = {
    venueId: 'phoenix',
    action,
    mode: 'solana_instruction_builder',
    endpoint,
    instructions,
    raw,
  }

  if (rawRecord && 'estimatedLiquidationPriceUsd' in rawRecord) {
    result.estimatedLiquidationPriceUsd = parseNullableNumber(rawRecord.estimatedLiquidationPriceUsd)
  }

  return result
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

function upstreamProxyStatusCode(err: unknown): 400 | 404 | 409 | 429 | 502 | 504 {
  if (err instanceof PhoenixUpstreamError) {
    if (err.status === 400 || err.status === 404 || err.status === 409 || err.status === 429 || err.status === 504) {
      return err.status
    }
  }
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
    readOnly: false,
    executionMode: 'solana_instruction_builder',
    depositBuilderAvailable: false,
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

// GET /perps/phoenix/trader/:authority/state?pdaIndex=0
phoenixRoutes.get('/trader/:authority/state', async (c) => {
  const authority = asNonEmptyString(c.req.param('authority'))
  if (!authority) return c.json({ error: 'Missing or invalid authority' }, 400)

  const pdaIndex = parseNonNegativeInteger(c.req.query('pdaIndex') ?? '0')
  if (pdaIndex === null) {
    return c.json({ error: 'Invalid pdaIndex', code: 'INVALID_PDA_INDEX' }, 400)
  }

  const params = new URLSearchParams({ pdaIndex: String(pdaIndex) })
  try {
    const raw = await phoenixFetchJson<unknown>(`/trader/${encodeURIComponent(authority)}/state?${params.toString()}`)
    const rawRecord = asRecord(raw)
    return c.json({
      venueId: 'phoenix',
      action: 'get_trader_state',
      authority,
      pdaIndex,
      slot: parseNullableInt(rawRecord?.slot),
      slotIndex: parseNullableInt(rawRecord?.slotIndex),
      traders: Array.isArray(rawRecord?.traders) ? rawRecord.traders : [],
      raw,
    })
  } catch (err) {
    console.error(`[api] Phoenix trader state ${authority} unavailable:`, err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix trader state unavailable'), upstreamProxyStatusCode(err))
  }
})

// POST /perps/phoenix/invite/activate
phoenixRoutes.post('/invite/activate', async (c) => {
  const parsed = await readJsonRecord(c)
  if ('response' in parsed) return parsed.response

  const missing = missingStringFields(parsed.body, ['authority', 'code'])
  if (missing.length > 0) return c.json(missingFieldsPayload(missing), 400)

  try {
    const raw = await phoenixFetchJson<unknown>('/v1/invite/activate', { method: 'POST', body: parsed.body })
    const rawRecord = asRecord(raw)
    return c.json({
      venueId: 'phoenix',
      action: 'activate_invite',
      authority: asNonEmptyString(parsed.body.authority),
      traderPda: asString(rawRecord?.trader_pda),
      raw,
    })
  } catch (err) {
    console.error('[api] Phoenix invite activation unavailable:', err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix invite activation unavailable'), upstreamProxyStatusCode(err))
  }
})

// POST /perps/phoenix/invite/activate-with-referral
phoenixRoutes.post('/invite/activate-with-referral', async (c) => {
  const parsed = await readJsonRecord(c)
  if ('response' in parsed) return parsed.response

  const missing = missingStringFields(parsed.body, ['authority', 'referral_code'])
  if (missing.length > 0) return c.json(missingFieldsPayload(missing), 400)

  try {
    const raw = await phoenixFetchJson<unknown>('/v1/invite/activate-with-referral', { method: 'POST', body: parsed.body })
    const rawRecord = asRecord(raw)
    return c.json({
      venueId: 'phoenix',
      action: 'activate_referral',
      authority: asNonEmptyString(parsed.body.authority),
      traderPda: asString(rawRecord?.trader_pda),
      raw,
    })
  } catch (err) {
    console.error('[api] Phoenix referral activation unavailable:', err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix referral activation unavailable'), upstreamProxyStatusCode(err))
  }
})

// POST /perps/phoenix/tx/market-order
phoenixRoutes.post('/tx/market-order', async (c) => {
  const parsed = await readJsonRecord(c)
  if ('response' in parsed) return parsed.response

  const missing = missingStringFields(parsed.body, ['authority', 'symbol', 'side'])
  if (missing.length > 0) return c.json(missingFieldsPayload(missing), 400)

  const endpoint = '/v1/ix/place-isolated-market-order-enhanced'
  try {
    const raw = await phoenixFetchJson<unknown>(endpoint, { method: 'POST', body: parsed.body })
    return c.json(instructionBuilderResponse('place_isolated_market_order', endpoint, raw))
  } catch (err) {
    console.error('[api] Phoenix market order builder unavailable:', err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix market order builder unavailable'), upstreamProxyStatusCode(err))
  }
})

// POST /perps/phoenix/tx/limit-order
phoenixRoutes.post('/tx/limit-order', async (c) => {
  const parsed = await readJsonRecord(c)
  if ('response' in parsed) return parsed.response

  const missing = missingStringFields(parsed.body, ['authority', 'symbol', 'side'])
  if (missing.length > 0) return c.json(missingFieldsPayload(missing), 400)

  const endpoint = '/v1/ix/place-isolated-limit-order-enhanced'
  try {
    const raw = await phoenixFetchJson<unknown>(endpoint, { method: 'POST', body: parsed.body })
    return c.json(instructionBuilderResponse('place_isolated_limit_order', endpoint, raw))
  } catch (err) {
    console.error('[api] Phoenix limit order builder unavailable:', err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix limit order builder unavailable'), upstreamProxyStatusCode(err))
  }
})

// POST /perps/phoenix/tx/cancel-conditional-order
phoenixRoutes.post('/tx/cancel-conditional-order', async (c) => {
  const parsed = await readJsonRecord(c)
  if ('response' in parsed) return parsed.response

  const missing = missingStringFields(parsed.body, ['authority', 'symbol', 'executionDirection'])
  if (missing.length > 0) return c.json(missingFieldsPayload(missing), 400)

  const invalid = invalidNonNegativeIntegerFields(parsed.body, ['traderPdaIndex', 'conditionalOrderIndex'])
  if (invalid.length > 0) return c.json(invalidFieldsPayload(invalid), 400)

  const endpoint = '/v1/ix/cancel-conditional-order'
  try {
    const raw = await phoenixFetchJson<unknown>(endpoint, { method: 'POST', body: parsed.body })
    return c.json(instructionBuilderResponse('cancel_conditional_order', endpoint, raw))
  } catch (err) {
    console.error('[api] Phoenix conditional cancel builder unavailable:', err instanceof Error ? err.message : err)
    return c.json(upstreamErrorPayload(err, 'Phoenix conditional cancel builder unavailable'), upstreamProxyStatusCode(err))
  }
})

// POST /perps/phoenix/tx/deposit
phoenixRoutes.post('/tx/deposit', (c) => {
  return c.json({
    venueId: 'phoenix',
    action: 'deposit',
    mode: 'solana_instruction_builder',
    code: 'PHOENIX_DEPOSIT_BUILDER_UNAVAILABLE',
    error: 'Phoenix deposit instruction builder is not available through the public REST API',
    detail: 'No deposit or withdraw builder route exists in the public Phoenix OpenAPI. This route is intentionally a 501 instead of inventing an upstream path.',
    instructions: [],
  }, 501)
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
