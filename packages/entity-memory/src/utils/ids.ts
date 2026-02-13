import { randomUUID } from 'node:crypto';

export function createId(): string {
  return randomUUID();
}

export function normalizeSymbol(symbol: string | undefined): string | undefined {
  if (!symbol) {
    return undefined;
  }

  const normalized = symbol.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
