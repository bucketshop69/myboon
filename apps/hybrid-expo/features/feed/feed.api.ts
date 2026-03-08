import { Platform } from 'react-native';
import type { FeedCategory, FeedItem, FeedSentiment } from '@/features/feed/feed.types';

interface PublishedNarrativeListItem {
  id: string;
  narrative_id: string;
  content_small: string;
  tags: string[];
  priority: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveCategory(tags: string[]): FeedCategory {
  const normalized = tags.map((tag) => tag.toLowerCase());

  if (normalized.some((tag) => ['geopolitics', 'war', 'election', 'policy', 'iran', 'us', 'china'].includes(tag))) {
    return 'Geopolitics';
  }
  if (normalized.some((tag) => ['tech', 'ai', 'gpu', 'compute', 'semiconductor'].includes(tag))) {
    return 'Tech';
  }
  if (normalized.some((tag) => ['market', 'markets', 'equity', 'stocks', 'crypto', 'trading'].includes(tag))) {
    return 'Markets';
  }
  return 'Macro';
}

function deriveSentiment(priority: number): FeedSentiment {
  return priority >= 6 ? 'up' : 'down';
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

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function extractCopy(contentSmall: string): { title: string; description: string } {
  const text = contentSmall.trim();
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);

  const primary = parts[0] ?? text;
  const secondary = parts.slice(1).join(' ').trim();

  return {
    title: truncate(primary, 94),
    description: truncate(secondary || text, 220),
  };
}

function mapNarrativeToFeedItem(item: PublishedNarrativeListItem, index: number): FeedItem {
  const priority = clamp(item.priority ?? 1, 1, 10);
  const { title, description } = extractCopy(item.content_small ?? '');

  return {
    id: item.id,
    percent: priority * 10,
    category: deriveCategory(item.tags ?? []),
    timeAgo: toRelativeTime(item.created_at),
    title,
    description,
    sentiment: deriveSentiment(priority),
    isTop: index === 0,
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
