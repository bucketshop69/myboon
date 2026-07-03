import type { PublishedAction, PublisherMemoryRecord } from './types'

const POLYMARKET_HOST_RE = /(^|\.)polymarket\.com$/i
const MARKET_PATH_RE = /^\/(?:event|market)\/([^/?#]+)/
const MAX_PUBLIC_ACTIONS = 3
const MARKET_SLUG_KEYS = new Set([
  'source_market_slug',
  'source_market_event_slug',
  'source_event_slug',
  'market_slug',
  'event_slug',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeSlug(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return slugFromPolymarketUrl(trimmed)
  if (!/^[a-z0-9][a-z0-9-]{2,}$/i.test(trimmed)) return null
  return trimmed.toLowerCase()
}

function slugFromPolymarketUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!POLYMARKET_HOST_RE.test(url.hostname)) return null
    const match = MARKET_PATH_RE.exec(url.pathname)
    return match ? normalizeSlug(decodeURIComponent(match[1])) : null
  } catch {
    return null
  }
}

function collectExplicitSlugsFromValue(value: unknown, out: string[], keyHint = ''): void {
  if (typeof value === 'string') {
    if (MARKET_SLUG_KEYS.has(keyHint.toLowerCase())) {
      const directSlug = normalizeSlug(value)
      if (directSlug) out.push(directSlug)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectExplicitSlugsFromValue(item, out, keyHint)
    return
  }

  const record = asRecord(value)
  if (!record) return

  for (const [key, nested] of Object.entries(record)) {
    collectExplicitSlugsFromValue(nested, out, key)
  }
}

function collectUrlSlugsFromValue(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    const urlSlug = slugFromPolymarketUrl(value)
    if (urlSlug) out.push(urlSlug)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectUrlSlugsFromValue(item, out)
    return
  }

  const record = asRecord(value)
  if (!record) return

  for (const nested of Object.values(record)) {
    collectUrlSlugsFromValue(nested, out)
  }
}

function takeUnique(values: string[], limit: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

export function deriveActionsFromMemories(memories: PublisherMemoryRecord[]): PublishedAction[] {
  const sourceRefSlugs: string[] = []
  const explicitSlugs: string[] = []
  const evidenceUrlSlugs: string[] = []

  for (const memory of memories) {
    if (memory.source.toLowerCase() === 'polymarket') {
      const refSlug = normalizeSlug(memory.source_ref_id)
      if (refSlug) sourceRefSlugs.push(refSlug)
    }

    collectExplicitSlugsFromValue(memory.context, explicitSlugs)
    collectUrlSlugsFromValue(memory.evidence, evidenceUrlSlugs)
  }

  return takeUnique(
    [...sourceRefSlugs, ...explicitSlugs, ...evidenceUrlSlugs],
    MAX_PUBLIC_ACTIONS
  ).map((slug) => ({
    type: 'predict' as const,
    label: 'Open market',
    slug,
  }))
}
