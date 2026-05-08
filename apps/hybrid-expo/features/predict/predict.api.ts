import type {
  FeedItem,
  FeedItemBinary,
  FeedItemMatch,
  FeedItemStatus,
  FeedOutcome,
  FeedResponse,
  GeopoliticsMarket,
  GeopoliticsMarketDetail,
  LivePrice,
  PredictSport,
  PriceHistory,
  PricePoint,
  SportMarket,
  SportMarketDetail,
  SportOutcome,
  SportOutcomeDetail,
  TrendingMarket,
} from '@/features/predict/predict.types';
import { resolveApiBaseUrl, fetchWithTimeout } from '@/lib/api';

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((e): e is string => typeof e === 'string');
    } catch { /* not JSON */ }
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function mapGeopoliticsMarket(row: unknown): GeopoliticsMarket | null {
  if (!row || typeof row !== 'object') return null;
  const market = row as Record<string, unknown>;

  const slug = typeof market.slug === 'string' ? market.slug : null;
  const question = typeof market.question === 'string' ? market.question : null;
  if (!slug || !question) return null;

  return {
    slug,
    question,
    category: 'geopolitics',
    conditionId: typeof market.conditionId === 'string' ? market.conditionId : null,
    clobTokenIds: toStringArray(market.clobTokenIds),
    yesPrice: toNumber(market.yesPrice),
    noPrice: toNumber(market.noPrice),
    volume24h: toNumber(market.volume24h),
    liquidity: toNumber(market.liquidityNum ?? market.liquidity),
    endDate: typeof market.endDate === 'string' ? market.endDate : null,
    active: typeof market.active === 'boolean' ? market.active : null,
    image: typeof market.image === 'string' ? market.image : null,
  };
}

function mapSportOutcome(row: unknown): SportOutcome | null {
  if (!row || typeof row !== 'object') return null;
  const outcome = row as Record<string, unknown>;
  const label = typeof outcome.label === 'string' ? outcome.label : null;
  if (!label) return null;

  return {
    label,
    price: toNumber(outcome.price),
    conditionId: typeof outcome.conditionId === 'string' ? outcome.conditionId : null,
    clobTokenIds: toStringArray(outcome.clobTokenIds),
  };
}

function mapSportMarket(row: unknown): SportMarket | null {
  if (!row || typeof row !== 'object') return null;
  const market = row as Record<string, unknown>;

  const slug = typeof market.slug === 'string' ? market.slug : null;
  const title = typeof market.title === 'string' ? market.title : null;
  const sport = market.sport === 'epl' || market.sport === 'ucl' ? market.sport : null;
  if (!slug || !title || !sport) return null;

  const outcomesRaw = Array.isArray(market.outcomes) ? market.outcomes : [];
  const outcomes = outcomesRaw.map(mapSportOutcome).filter((outcome): outcome is SportOutcome => outcome !== null);

  return {
    slug,
    title,
    sport,
    startDate: typeof market.startDate === 'string' ? market.startDate : null,
    endDate: typeof market.endDate === 'string' ? market.endDate : null,
    image: typeof market.image === 'string' ? market.image : null,
    active: typeof market.active === 'boolean' ? market.active : null,
    volume24h: toNumber(market.volume24h),
    liquidity: toNumber(market.liquidity),
    negRisk: market.negRisk === true,
    outcomes,
  };
}

function mapGeopoliticsMarketDetail(row: unknown): GeopoliticsMarketDetail | null {
  if (!row || typeof row !== 'object') return null;
  const market = row as Record<string, unknown>;

  const slug = typeof market.slug === 'string' ? market.slug : null;
  const question = typeof market.question === 'string' ? market.question : null;
  if (!slug || !question) return null;

  const outcomesRaw = typeof market.outcomes === 'string' ? market.outcomes : null;
  const outcomePricesRaw = typeof market.outcomePrices === 'string' ? market.outcomePrices : null;

  let outcomes: string[] = [];
  let outcomePrices: number[] = [];

  if (outcomesRaw) {
    try {
      const parsed = JSON.parse(outcomesRaw) as unknown;
      if (Array.isArray(parsed)) outcomes = parsed.filter((value): value is string => typeof value === 'string');
    } catch {
      outcomes = [];
    }
  }

  if (outcomePricesRaw) {
    try {
      const parsed = JSON.parse(outcomePricesRaw) as unknown;
      if (Array.isArray(parsed)) {
        outcomePrices = parsed
          .map((value) => toNumber(value))
          .filter((value): value is number => value !== null);
      }
    } catch {
      outcomePrices = [];
    }
  }

  return {
    slug,
    question,
    description: typeof market.description === 'string' ? market.description : null,
    category: typeof market.category === 'string' ? market.category : null,
    endDate: typeof market.endDate === 'string' ? market.endDate : null,
    active: typeof market.active === 'boolean' ? market.active : null,
    volume24h: toNumber(market.volume24hr ?? market.volume24h),
    volume: toNumber(market.volumeNum ?? market.volume),
    liquidity: toNumber(market.liquidityNum ?? market.liquidity),
    outcomes,
    outcomePrices,
    clobTokenIds: toStringArray(market.clobTokenIds),
    image: typeof market.image === 'string' ? market.image : null,
    negRisk: market.negRisk === true,
  };
}

function mapSportOutcomeDetail(row: unknown): SportOutcomeDetail | null {
  if (!row || typeof row !== 'object') return null;
  const outcome = row as Record<string, unknown>;
  const label = typeof outcome.label === 'string' ? outcome.label : null;
  if (!label) return null;

  return {
    label,
    question: typeof outcome.question === 'string' ? outcome.question : null,
    price: toNumber(outcome.price),
    conditionId: typeof outcome.conditionId === 'string' ? outcome.conditionId : null,
    clobTokenIds: toStringArray(outcome.clobTokenIds),
    liquidity: toNumber(outcome.liquidity),
    volume24h: toNumber(outcome.volume24h),
    bestBid: toNumber(outcome.bestBid),
    bestAsk: toNumber(outcome.bestAsk),
    acceptingOrders: typeof outcome.acceptingOrders === 'boolean' ? outcome.acceptingOrders : null,
  };
}

function mapSportMarketDetail(row: unknown): SportMarketDetail | null {
  if (!row || typeof row !== 'object') return null;
  const market = row as Record<string, unknown>;

  const slug = typeof market.slug === 'string' ? market.slug : null;
  const title = typeof market.title === 'string' ? market.title : null;
  const sport =
    market.sport === 'epl' || market.sport === 'ucl' || market.sport === 'ipl'
      ? (market.sport as PredictSport)
      : null;
  if (!slug || !title || !sport) return null;

  const outcomesRaw = Array.isArray(market.outcomes) ? market.outcomes : [];
  const outcomes = outcomesRaw
    .map(mapSportOutcomeDetail)
    .filter((outcome): outcome is SportOutcomeDetail => outcome !== null);

  const rawStatus = typeof market.status === 'string' ? market.status : 'n/a';
  const status: FeedItemStatus =
    rawStatus === 'live' || rawStatus === 'upcoming' || rawStatus === 'closed'
      ? rawStatus
      : 'n/a';

  return {
    slug,
    title,
    description: typeof market.description === 'string' ? market.description : null,
    sport,
    status,
    startDate: typeof market.startDate === 'string' ? market.startDate : null,
    endDate: typeof market.endDate === 'string' ? market.endDate : null,
    image: typeof market.image === 'string' ? market.image : null,
    active: typeof market.active === 'boolean' ? market.active : null,
    negRisk: market.negRisk === true,
    volume24h: toNumber(market.volume24h),
    liquidity: toNumber(market.liquidity),
    outcomes,
  };
}

async function getJson(path: string): Promise<unknown> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

/**
 * @deprecated Use fetchPredictFeed() instead. This endpoint returns the old per-category
 * curated markets list and will be removed once all screens migrate to the unified feed.
 */
export async function fetchCuratedMarkets(): Promise<GeopoliticsMarket[]> {
  const payload = await getJson('/predict/markets');
  if (!Array.isArray(payload)) throw new Error('Invalid markets response');

  return payload
    .map(mapGeopoliticsMarket)
    .filter((market): market is GeopoliticsMarket => market !== null);
}

/**
 * @deprecated Use fetchPredictFeed() instead. This endpoint returns sport-specific markets
 * and will be removed once all screens migrate to the unified feed.
 */
export async function fetchSportsMarkets(sport: PredictSport): Promise<SportMarket[]> {
  const payload = await getJson(`/predict/sports/${sport}`);
  if (!Array.isArray(payload)) throw new Error('Invalid sports response');

  return payload
    .map(mapSportMarket)
    .filter((market): market is SportMarket => market !== null);
}

const SLUG_BLOCKLIST = ['halftime', 'exact-score'];

function isBlockedSlug(slug: string): boolean {
  return SLUG_BLOCKLIST.some((term) => slug.includes(term));
}

function mapFeedOutcome(raw: unknown): FeedOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label : null;
  const price = toNumber(o.price);
  if (!label || price === null) return null;
  return {
    label,
    price,
    conditionId: typeof o.conditionId === 'string' ? o.conditionId : undefined,
    clobTokenIds: Array.isArray(o.clobTokenIds)
      ? (o.clobTokenIds as unknown[]).filter((t): t is string => typeof t === 'string')
      : undefined,
  };
}

function mapFeedItem(raw: unknown): FeedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;

  const type = item.type;
  const slug = typeof item.slug === 'string' ? item.slug : null;
  if (!slug || isBlockedSlug(slug)) return null;

  const title = typeof item.title === 'string' ? item.title : typeof item.question === 'string' ? item.question : null;
  if (!title) return null;

  const category = typeof item.category === 'string' ? item.category : 'other';
  const tags = Array.isArray(item.tags)
    ? (item.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  const status = typeof item.status === 'string' ? (item.status as FeedItemMatch['status']) : 'n/a';
  const image = typeof item.image === 'string' ? item.image : null;
  const active = item.active === true;
  const volume = toNumber(item.volume) ?? 0;
  const endDate = typeof item.endDate === 'string' ? item.endDate : null;

  const outcomesRaw = Array.isArray(item.outcomes) ? item.outcomes : [];
  const outcomes = outcomesRaw.map(mapFeedOutcome).filter((o): o is FeedOutcome => o !== null);

  if (type === 'match') {
    const sport = item.sport;
    if (sport !== 'epl' && sport !== 'ucl' && sport !== 'ipl') return null;
    const result: FeedItemMatch = {
      type: 'match',
      slug,
      title,
      category,
      sport,
      tags,
      status,
      gameStartTime: typeof item.gameStartTime === 'string' && item.gameStartTime !== '' ? item.gameStartTime : null,
      startDate: typeof item.startDate === 'string' && item.startDate !== '' ? item.startDate : null,
      endDate,
      image,
      active,
      volume,
      outcomes,
    };
    return result;
  }

  if (type === 'binary') {
    const price = toNumber(item.price) ?? toNumber(item.yesPrice) ?? 0;
    const result: FeedItemBinary = {
      type: 'binary',
      slug,
      title,
      category,
      tags,
      status,
      image,
      active,
      volume,
      price,
      endDate,
      outcomes,
    };
    return result;
  }

  return null;
}

/** Fetch the unified predict feed from /predict/feed. Strips halftime and exact-score markets client-side. */
export async function fetchPredictFeed(): Promise<FeedResponse> {
  const payload = await getJson('/predict/feed');
  if (!payload || typeof payload !== 'object') throw new Error('Invalid feed response');
  const p = payload as Record<string, unknown>;

  const rawItems = Array.isArray(p.items) ? p.items : [];
  const items = rawItems.map(mapFeedItem).filter((item): item is FeedItem => item !== null);

  const categories = Array.isArray(p.categories)
    ? (p.categories as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

  return { items, categories };
}

export async function fetchCuratedMarketDetail(slug: string): Promise<GeopoliticsMarketDetail> {
  const payload = await getJson(`/predict/markets/${encodeURIComponent(slug)}`);
  const detail = mapGeopoliticsMarketDetail(payload);
  if (!detail) throw new Error('Invalid market detail response');
  return detail;
}

export async function fetchSportMarketDetail(sport: PredictSport, slug: string): Promise<SportMarketDetail> {
  const payload = await getJson(`/predict/sports/${sport}/${encodeURIComponent(slug)}`);
  const detail = mapSportMarketDetail(payload);
  if (!detail) throw new Error('Invalid sport detail response');
  return detail;
}

function mapTrendingMarket(row: unknown): TrendingMarket | null {
  if (!row || typeof row !== 'object') return null;
  const m = row as Record<string, unknown>;
  const slug = typeof m.slug === 'string' ? m.slug : null;
  const question = typeof m.question === 'string' ? m.question : null;
  if (!slug || !question) return null;
  return {
    slug,
    question,
    category: typeof m.category === 'string' ? m.category : 'geopolitics',
    yesPrice: toNumber(m.yesPrice),
    noPrice: toNumber(m.noPrice),
    volume24h: toNumber(m.volume24h),
    endDate: typeof m.endDate === 'string' ? m.endDate : null,
    active: typeof m.active === 'boolean' ? m.active : null,
    image: typeof m.image === 'string' ? m.image : null,
  };
}

export async function fetchTrendingMarkets(limit = 10): Promise<TrendingMarket[]> {
  const payload = await getJson(`/predict/trending?limit=${limit}`);
  if (!Array.isArray(payload)) throw new Error('Invalid trending response');
  return payload.map(mapTrendingMarket).filter((m): m is TrendingMarket => m !== null);
}

export async function fetchMarketPrice(slug: string): Promise<LivePrice> {
  const payload = await getJson(`/predict/markets/${encodeURIComponent(slug)}/price`);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid price response');
  const p = payload as Record<string, unknown>;
  return {
    slug: typeof p.slug === 'string' ? p.slug : slug,
    yesPrice: toNumber(p.yesPrice),
    noPrice: toNumber(p.noPrice),
    fetchedAt: typeof p.fetchedAt === 'string' ? p.fetchedAt : new Date().toISOString(),
  };
}

export interface PlaceBetParams {
  polygonAddress: string;
  tokenID: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  negRisk?: boolean;
  orderType?: 'GTC' | 'FOK';
}

export interface PlaceBetResult {
  orderID?: string;
  success: boolean;
  error?: string;
}

/**
 * Place bet through the server-side deposit-wallet order path.
 */
export async function placeBet(params: PlaceBetParams): Promise<PlaceBetResult> {
  const baseUrl = resolveApiBaseUrl();

  const response = await fetchWithTimeout(`${baseUrl}/clob/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : typeof data.error === 'string' ? data.error : 'Order failed';
    return { success: false, error: detail };
  }

  return {
    success: true,
    orderID: typeof data.orderID === 'string'
      ? data.orderID
      : typeof data.orderId === 'string'
        ? data.orderId
        : typeof data.id === 'string'
          ? data.id
          : undefined,
  };
}

// --- CLOB Open Orders ---

export interface OpenOrder {
  id: string;
  status: string;
  market: string;
  asset_id: string;
  side: string;
  original_size: string;
  size_matched: string;
  price: string;
  outcome: string;
  created_at: number;
  order_type: string;
}

export async function fetchOpenOrders(polygonAddress: string): Promise<OpenOrder[]> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/clob/positions/${encodeURIComponent(polygonAddress)}`);
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>;
  return Array.isArray(data.orders) ? data.orders as OpenOrder[] : [];
}

export async function cancelOrder(polygonAddress: string, orderId: string): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(
    `${baseUrl}/clob/order/${encodeURIComponent(orderId)}?address=${encodeURIComponent(polygonAddress)}`,
    { method: 'DELETE' },
  );
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    return { ok: false, error: typeof data.detail === 'string' ? data.detail : 'Cancel failed' };
  }
  return { ok: true };
}

// --- CLOB Balance ---

export interface ClobBalance {
  balance: number;
  allowance: number;
  wrap?: {
    attempted: boolean;
    wrapped: boolean;
    amount: number;
    txHash: string | null;
    error: string | null;
  };
}

export async function fetchClobBalance(polygonAddress: string): Promise<ClobBalance | null> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/clob/balance/${encodeURIComponent(polygonAddress)}`);
  if (!response.ok) {
    // 401 = no active CLOB session (server restart / TTL expired) — not a crash
    return null;
  }
  const data = await response.json() as Record<string, unknown>;
  return {
    balance: typeof data.balance === 'number' ? data.balance : 0,
    allowance: typeof data.allowance === 'number' ? data.allowance : 0,
    wrap: data.wrap && typeof data.wrap === 'object'
      ? data.wrap as ClobBalance['wrap']
      : undefined,
  };
}

// --- Deposit Status ---

export type DepositBridgeStatus =
  | 'DEPOSIT_DETECTED'
  | 'PROCESSING'
  | 'ORIGIN_TX_CONFIRMED'
  | 'SUBMITTED'
  | 'COMPLETED'
  | 'FAILED';

export interface DepositBridgeTransaction {
  fromChainId?: string;
  fromTokenAddress?: string;
  fromAmountBaseUnit?: string;
  toChainId?: string;
  toTokenAddress?: string;
  status?: DepositBridgeStatus;
  txHash?: string;
  createdTimeMs?: number;
}

export async function fetchDepositStatus(depositAddress: string): Promise<DepositBridgeTransaction[]> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/clob/deposit-status/${encodeURIComponent(depositAddress)}`);
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>;
  return Array.isArray(data.transactions)
    ? data.transactions.filter((entry): entry is DepositBridgeTransaction => !!entry && typeof entry === 'object')
    : [];
}

// --- Portfolio & Positions (Gamma data-api, proxied through VPS) ---

export interface PortfolioPosition {
  proxyWallet: string;
  /** Token ID — used as tokenID for sell orders */
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number;
  title: string;
  slug: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  icon: string | null;
  endDate: string | null;
  /** Whether this market uses the neg-risk exchange contract */
  negativeRisk: boolean;
}

export interface ClosedPortfolioPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  avgPrice: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  timestamp: number;
  title: string;
  slug: string;
  icon: string | null;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string | null;
}

export interface PortfolioData {
  address: string;
  portfolioValue: number | null;
  positions: PortfolioPosition[];
  redeemablePositions: PortfolioPosition[];
  closedPositions: ClosedPortfolioPosition[];
  activity: ActivityItem[];
  profile: {
    name: string | null;
    bio: string | null;
    profileImage: string | null;
    xUsername: string | null;
  } | null;
  summary: {
    openPositions: number;
    totalPnl: number;
    cashOutNow?: number;
    readyToCollect?: number;
    activePickCount?: number;
    closedPickCount?: number;
    activityCount?: number;
    hasActivity?: boolean;
    hasAnyPicks?: boolean;
    totalCollected?: number;
  };
}

export async function fetchPortfolio(polygonAddress: string): Promise<PortfolioData> {
  const payload = await getJson(`/predict/portfolio/${encodeURIComponent(polygonAddress)}`);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid portfolio response');
  const p = payload as Record<string, unknown>;
  return {
    address: typeof p.address === 'string' ? p.address : polygonAddress,
    portfolioValue: toNumber(p.portfolioValue),
    positions: Array.isArray(p.positions) ? (p.positions as PortfolioPosition[]) : [],
    redeemablePositions: Array.isArray(p.redeemablePositions)
      ? (p.redeemablePositions as PortfolioPosition[]).filter((position) => (position.currentValue ?? 0) >= 0.01)
      : [],
    closedPositions: Array.isArray(p.closedPositions) ? (p.closedPositions as ClosedPortfolioPosition[]) : [],
    activity: Array.isArray(p.activity) ? (p.activity as ActivityItem[]) : [],
    profile: p.profile as PortfolioData['profile'] ?? null,
    summary: (p.summary as PortfolioData['summary']) ?? { openPositions: 0, totalPnl: 0, totalCollected: 0 },
  };
}

export interface ActivityItem {
  timestamp: number;
  type: string;
  side: string;
  size: number;
  usdcSize: number;
  price: number;
  title: string;
  slug: string;
  outcome: string;
}

export async function fetchActivity(polygonAddress: string): Promise<ActivityItem[]> {
  const payload = await getJson(`/predict/activity/${encodeURIComponent(polygonAddress)}`);
  if (!Array.isArray(payload)) return [];
  return payload as ActivityItem[];
}

export async function fetchMarketPositions(polygonAddress: string, slug: string): Promise<PortfolioPosition[]> {
  const payload = await getJson(`/predict/positions/${encodeURIComponent(polygonAddress)}/market/${encodeURIComponent(slug)}`);
  if (!Array.isArray(payload)) return [];
  return payload as PortfolioPosition[];
}

// --- Withdraw ---

export interface WithdrawParams {
  polygonAddress: string;
  amount: number;
  solanaAddress: string;
}

export interface WithdrawResult {
  ok: boolean;
  amount?: number;
  txHash?: string | null;
  error?: string;
}

export async function withdrawFromPolymarket(params: WithdrawParams): Promise<WithdrawResult> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/clob/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : typeof data.error === 'string' ? data.error : 'Withdraw failed';
    return { ok: false, error: detail };
  }

  return {
    ok: true,
    amount: typeof data.amount === 'number' ? data.amount : undefined,
    txHash: typeof data.txHash === 'string' ? data.txHash : null,
  };
}

// --- Redeem ---

export interface RedeemResult {
  ok: boolean;
  txHash?: string | null;
  error?: string;
}

export interface RedeemPositionInput {
  conditionId: string;
  asset?: string;
  outcomeIndex?: number;
  negativeRisk?: boolean;
}

export async function redeemPosition(
  polygonAddress: string,
  position: RedeemPositionInput,
): Promise<RedeemResult> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/clob/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      polygonAddress,
      conditionId: position.conditionId,
      asset: position.asset,
      outcomeIndex: position.outcomeIndex,
      negativeRisk: position.negativeRisk,
    }),
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.error === 'string'
          ? data.error
          : `Redeem failed (${response.status})`;
    return { ok: false, error: detail };
  }

  return {
    ok: true,
    txHash: typeof data.txHash === 'string' ? data.txHash : null,
  };
}

export async function fetchPriceHistory(tokenId: string, interval: '5m' | '1h' | '1d' = '1h'): Promise<PriceHistory> {
  const payload = await getJson(`/predict/history/${encodeURIComponent(tokenId)}?interval=${interval}`);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid history response');
  const p = payload as Record<string, unknown>;
  const rawHistory = Array.isArray(p.history) ? p.history : [];
  const history: PricePoint[] = rawHistory
    .filter((pt): pt is Record<string, unknown> => !!pt && typeof pt === 'object')
    .map((pt) => ({ t: toNumber(pt.t) ?? 0, p: toNumber(pt.p) ?? 0 }))
    .filter((pt) => pt.t > 0);
  return { history };
}

export async function fetchOrderbook(tokenId: string): Promise<import('./predict.types').Orderbook> {
  const payload = await getJson(`/predict/book/${encodeURIComponent(tokenId)}`);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid orderbook response');
  const p = payload as Record<string, unknown>;

  function parseLevels(raw: unknown): import('./predict.types').OrderbookLevel[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((lv): lv is Record<string, unknown> => !!lv && typeof lv === 'object')
      .map((lv) => ({
        price: toNumber(lv.price) ?? 0,
        size: toNumber(lv.size) ?? 0,
      }))
      .filter((lv) => lv.price > 0 && lv.size > 0);
  }

  const bids = parseLevels(p.bids);
  const asks = parseLevels(p.asks);

  const bestBid = bids.length > 0 ? Math.max(...bids.map((b) => b.price)) : null;
  const bestAsk = asks.length > 0 ? Math.min(...asks.map((a) => a.price)) : null;
  const spread = bestBid !== null && bestAsk !== null ? Math.abs(bestAsk - bestBid) : null;
  const lastPrice = toNumber(p.last_trade_price) ?? toNumber(p.last_price) ?? toNumber(p.lastPrice) ?? bestBid;

  return { bids, asks, lastPrice, spread };
}
