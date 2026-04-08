/**
 * collections.ts — config-driven market discovery.
 *
 * Adding a new category (sport, topic, etc.) = add one entry to COLLECTIONS.
 * Zero code changes needed in routes or mobile.
 *
 * Discovery strategies:
 *   - tag + slugPrefix: fetch by Dome tag, filter by event_slug prefix, group by event
 *   - tag + curatedSlugs: fetch specific slugs from Dome (geopolitics-style)
 *   - tag only: fetch by Dome tag, return flat (future: elections, crypto, etc.)
 */

export interface MarketCollection {
  /** Internal key — used in URLs and filter chips. Unique. */
  key: string
  /** Display label for the UI */
  label: string
  /**
   * Market type:
   *   'grouped' = multi-outcome event (sport match: team A / draw / team B)
   *   'binary'  = single yes/no market (geopolitics, elections)
   */
  type: 'grouped' | 'binary'
  /** How to discover markets on Dome */
  discovery: {
    /** Dome API tag to search */
    domeTag: string
    /** Filter event_slug prefix (e.g. 'epl', 'cricipl'). Null = no prefix filter. */
    slugPrefix: string | null
    /** Hardcoded market slugs (used when tag-based discovery isn't enough). */
    curatedSlugs?: string[]
  }
}

export const COLLECTIONS: MarketCollection[] = [
  // ── Sports ──
  {
    key: 'epl',
    label: 'Premier League',
    type: 'grouped',
    discovery: {
      domeTag: 'epl',
      slugPrefix: 'epl',
    },
  },
  {
    key: 'ucl',
    label: 'Champions League',
    type: 'grouped',
    discovery: {
      domeTag: 'ucl',
      slugPrefix: 'ucl',
    },
  },
  {
    key: 'ipl',
    label: 'IPL Cricket',
    type: 'grouped',
    discovery: {
      domeTag: 'indian premier league',
      slugPrefix: 'cricipl',
    },
  },

  // ── Binary / curated ──
  {
    key: 'geopolitics',
    label: 'Geopolitics',
    type: 'binary',
    discovery: {
      domeTag: 'geopolitics',
      slugPrefix: null,
      curatedSlugs: [
        'us-forces-enter-iran-by-april-30-899',
        'will-the-iranian-regime-fall-by-april-30',
        'us-x-iran-ceasefire-by-april-15-182-528-637',
        'us-x-iran-ceasefire-by-april-7-278',
        'us-forces-enter-iran-by-december-31-573-642-385-371-179-425-262',
        'netanyahu-out-by-april-30',
        'will-trump-visit-china-by-april-30',
        'will-china-invade-taiwan-before-2027',
      ],
    },
  },
]

/** Look up a collection by key. Returns undefined if not found. */
export function getCollection(key: string): MarketCollection | undefined {
  return COLLECTIONS.find((c) => c.key === key)
}

/** All collection keys (for validation). */
export function collectionKeys(): string[] {
  return COLLECTIONS.map((c) => c.key)
}
