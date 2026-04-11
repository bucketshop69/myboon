import { Platform } from 'react-native';
import type {
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

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }

  return 'http://localhost:3000';
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringArray(value: unknown): string[] {
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
    endDate: typeof market.endDate === 'string' ? market.endDate : null,
    active: typeof market.active === 'boolean' ? market.active : null,
    volume24h: toNumber(market.volume24hr ?? market.volume24h),
    volume: toNumber(market.volumeNum ?? market.volume),
    liquidity: toNumber(market.liquidityNum ?? market.liquidity),
    outcomes,
    outcomePrices,
    clobTokenIds: toStringArray(market.clobTokenIds),
    image: typeof market.image === 'string' ? market.image : null,
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
  const sport = market.sport === 'epl' || market.sport === 'ucl' ? market.sport : null;
  if (!slug || !title || !sport) return null;

  const outcomesRaw = Array.isArray(market.outcomes) ? market.outcomes : [];
  const outcomes = outcomesRaw
    .map(mapSportOutcomeDetail)
    .filter((outcome): outcome is SportOutcomeDetail => outcome !== null);

  return {
    slug,
    title,
    description: typeof market.description === 'string' ? market.description : null,
    sport,
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
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

export async function fetchCuratedMarkets(): Promise<GeopoliticsMarket[]> {
  const payload = await getJson('/predict/markets');
  if (!Array.isArray(payload)) throw new Error('Invalid markets response');

  return payload
    .map(mapGeopoliticsMarket)
    .filter((market): market is GeopoliticsMarket => market !== null);
}

export async function fetchSportsMarkets(sport: PredictSport): Promise<SportMarket[]> {
  const payload = await getJson(`/predict/sports/${sport}`);
  if (!Array.isArray(payload)) throw new Error('Invalid sports response');

  return payload
    .map(mapSportMarket)
    .filter((market): market is SportMarket => market !== null);
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
  amount: number;
  side: 'BUY' | 'SELL';
}

export interface PlaceBetResult {
  orderID?: string;
  success: boolean;
  error?: string;
}

export async function placeBet(params: PlaceBetParams): Promise<PlaceBetResult> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/clob/order`, {
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
    orderID: typeof data.orderID === 'string' ? data.orderID : undefined,
  };
}

// --- Portfolio & Positions (Gamma data-api, proxied through VPS) ---

export interface PortfolioPosition {
  proxyWallet: string;
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
}

export interface PortfolioData {
  address: string;
  portfolioValue: number | null;
  positions: PortfolioPosition[];
  profile: {
    name: string | null;
    bio: string | null;
    profileImage: string | null;
    xUsername: string | null;
  } | null;
  summary: {
    openPositions: number;
    totalPnl: number;
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
    profile: p.profile as PortfolioData['profile'] ?? null,
    summary: (p.summary as PortfolioData['summary']) ?? { openPositions: 0, totalPnl: 0 },
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

export async function fetchPriceHistory(tokenId: string, interval: '1h' | '1d' = '1h'): Promise<PriceHistory> {
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
