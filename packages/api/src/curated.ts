// curated.ts — hand-picked Polymarket config for Predict routes.
// Geopolitics uses curated market slugs. Sports uses supported league keys.
//
// Last refreshed: 2026-04-02
// Source: Dome API, sorted by volume_1_week, filtered active (end_time > now)

// Geopolitics slugs disabled — most expired. Will refresh when we add back.
// export const CURATED_GEOPOLITICS_SLUGS = [
//   'us-forces-enter-iran-by-april-30-899',
//   'will-the-iranian-regime-fall-by-april-30',
//   'us-x-iran-ceasefire-by-april-15-182-528-637',
//   'us-x-iran-ceasefire-by-april-7-278',
//   'us-forces-enter-iran-by-december-31-573-642-385-371-179-425-262',
//   'netanyahu-out-by-april-30',
//   'will-trump-visit-china-by-april-30',
//   'will-china-invade-taiwan-before-2027',
// ] as const
// V2 preprod test markets (have liquidity on clob-v2.polymarket.com)
export const CURATED_GEOPOLITICS_SLUGS: readonly string[] = [
  'us-iran-nuclear-deal-before-2027',
  'will-avengers-doomsday-be-the-top-grossing-movie-of-2026',
  'will-wicked-for-good-be-the-top-grossing-movie-of-2026',
]

// UCL disabled for now — focusing on EPL for testing
export const SUPPORTED_SPORTS = ['epl'] as const
export type SupportedSport = (typeof SUPPORTED_SPORTS)[number]

export const CURATED_SLUGS = {
  geopolitics: [...CURATED_GEOPOLITICS_SLUGS],
  sports: [...SUPPORTED_SPORTS],
}

/**
 * Derive a display category from Dome market tags.
 */
export function deriveCategory(tags: string[]): string {
  const t = new Set(tags.map((s) => s.toLowerCase()))
  if (t.has('crypto') || t.has('bitcoin') || t.has('ethereum') || t.has('solana')) return 'crypto'
  if (t.has('politics') || t.has('geopolitics')) return 'politics'
  if (t.has('sports') || t.has('epl') || t.has('cricket')) return 'sports'
  if (t.has('ai') || t.has('tech')) return 'tech'
  if (t.has('economics') || t.has('fed') || t.has('macro')) return 'macro'
  return tags[0]?.toLowerCase() ?? 'other'
}
