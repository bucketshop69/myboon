// curated.ts — hand-picked Polymarket config for Predict routes.
// Geopolitics uses curated market slugs. Sports uses supported league keys.
//
// Last refreshed: 2026-04-02
// Source: Dome API, sorted by volume_1_week, filtered active (end_time > now)

export const CURATED_GEOPOLITICS_SLUGS = [
  'us-forces-enter-iran-by-april-30-899',
  'will-the-iranian-regime-fall-by-april-30',
  'us-x-iran-ceasefire-by-april-15-182-528-637',
  'us-x-iran-ceasefire-by-april-7-278',
  'us-forces-enter-iran-by-december-31-573-642-385-371-179-425-262',
  'netanyahu-out-by-april-30',
  'will-trump-visit-china-by-april-30',
  'will-china-invade-taiwan-before-2027',
] as const

export const SUPPORTED_SPORTS = ['epl', 'ucl'] as const
export type SupportedSport = (typeof SUPPORTED_SPORTS)[number]

export const CURATED_SLUGS = {
  geopolitics: [...CURATED_GEOPOLITICS_SLUGS],
  sports: [...SUPPORTED_SPORTS],
}
