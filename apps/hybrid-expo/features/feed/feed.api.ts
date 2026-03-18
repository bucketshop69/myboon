import { Platform } from 'react-native';
import type { FeedItem, NarrativeAction } from '@/features/feed/feed.types';

interface PublishedNarrativeListItem {
  id: string;
  narrative_id: string;
  content_small: string;
  tags: string[];
  priority: number;
  actions: unknown;
  created_at: string;
}

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  // Local defaults for development when env is not set.
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }

  return 'http://localhost:3000';
}

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}


function toRelativeTime(iso: string): string {
  const createdAt = new Date(iso).getTime();
  if (Number.isNaN(createdAt)) return 'now';

  const diffMs = Math.max(0, Date.now() - createdAt);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

function parseActions(raw: unknown): NarrativeAction[] {
  if (!Array.isArray(raw)) return [];
  const result: NarrativeAction[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && 'type' in item) {
      const action = item as Record<string, unknown>;
      const type = action.type;
      if (type === 'predict' || type === 'perps') {
        result.push({
          type,
          asset: typeof action.asset === 'string' ? action.asset : undefined,
          slug: typeof action.slug === 'string' ? action.slug : undefined,
        });
      }
    }
  }
  return result;
}

function mapNarrativeToFeedItem(item: PublishedNarrativeListItem, index: number): FeedItem {
  return {
    id: item.id,
    category: item.tags?.[0] ?? 'macro',
    timeAgo: toRelativeTime(item.created_at),
    description: item.content_small?.trim() ?? '',
    isTop: index === 0,
    actions: parseActions(item.actions),
  };
}

export async function fetchFeedItems(limit = 20): Promise<FeedItem[]> {
  const clamped = clamp(limit, 1, 20);
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/narratives?limit=${clamped}`);

  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('Invalid feed response');
  }

  return payload
    .filter((row): row is PublishedNarrativeListItem => typeof row === 'object' && row !== null && 'id' in row)
    .map(mapNarrativeToFeedItem);
}

export interface NarrativeDetail {
  id: string;
  content_full: string;
  content_small: string;
  tags: string[];
  priority: number;
  actions: unknown;
  created_at: string;
}

export async function fetchNarrativeDetail(id: string): Promise<NarrativeDetail> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/narratives/${encodeURIComponent(id)}`);

  if (!response.ok) {
    throw new Error(`Narrative detail request failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid narrative detail response');
  }

  return payload as NarrativeDetail;
}

export interface PredictMarketData {
  slug: string;
  question: string | null;
  yesPrice: number | null;
  noPrice: number | null;
  volume24h: number | null;
}

export async function fetchPredictMarket(slug: string): Promise<PredictMarketData> {
  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}/predict/markets/${encodeURIComponent(slug)}`);

  if (!response.ok) {
    throw new Error(`Predict market request failed (${response.status})`);
  }

  const raw = (await response.json()) as Record<string, unknown>;

  function parseNullableNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  // The /predict/markets/:slug endpoint returns the raw Gamma market object.
  // We need to derive yesPrice/noPrice from outcomePrices or bestBid/bestAsk if available,
  // or fall back to the prices already embedded in the response from the all-markets endpoint
  // which fetches them via CLOB. For the single-slug route the API returns raw Gamma data,
  // so we parse outcomePrices[0] (Yes) and outcomePrices[1] (No) from the first market
  // in the markets array if present, otherwise from top-level outcomePrices.
  let yesPrice: number | null = null;
  let noPrice: number | null = null;

  // Try top-level outcomePrices array (binary market)
  const topOutcomePrices = Array.isArray(raw.outcomePrices) ? raw.outcomePrices : null;
  if (topOutcomePrices && topOutcomePrices.length >= 2) {
    yesPrice = parseNullableNumber(topOutcomePrices[0]);
    noPrice = parseNullableNumber(topOutcomePrices[1]);
  }

  // If already computed by the all-markets route (it enriches yesPrice/noPrice), use those
  if (typeof raw.yesPrice === 'number' || typeof raw.yesPrice === 'string') {
    yesPrice = parseNullableNumber(raw.yesPrice);
  }
  if (typeof raw.noPrice === 'number' || typeof raw.noPrice === 'string') {
    noPrice = parseNullableNumber(raw.noPrice);
  }

  return {
    slug: typeof raw.slug === 'string' ? raw.slug : slug,
    question: typeof raw.question === 'string' ? raw.question : (typeof raw.title === 'string' ? raw.title : null),
    yesPrice,
    noPrice,
    volume24h: parseNullableNumber(raw.volume24hr ?? raw.volume_24h ?? raw.volume ?? null),
  };
}
