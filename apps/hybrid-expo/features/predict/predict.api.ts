import { Platform } from 'react-native';
import type {
  GeopoliticsMarket,
  GeopoliticsMarketDetail,
  PredictSport,
  SportMarket,
  SportMarketDetail,
  SportOutcome,
  SportOutcomeDetail,
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
