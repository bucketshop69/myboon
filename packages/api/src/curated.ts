// curated.ts — hand-picked Polymarket config for Predict routes.
// Geopolitics uses curated market slugs. Sports uses supported league keys.

export const CURATED_GEOPOLITICS_SLUGS = [
  'will-the-iranian-regime-fall-by-march-31',
  'will-israel-launch-a-major-ground-offensive-in-lebanon-by-march-31',
  'us-forces-enter-iran-by-march-31-222-191-243-517-878-439-519',
  'us-x-iran-ceasefire-by-march-31',
  'will-france-uk-or-germany-strike-iran-by-march-31-929',
  'will-another-country-strike-iran-by-march-31-833',
  'will-hassan-khomeini-be-the-next-supreme-leader-of-iran',
  'iran-leader-end-of-2026',
] as const

export const SUPPORTED_SPORTS = ['epl', 'ucl'] as const
export type SupportedSport = (typeof SUPPORTED_SPORTS)[number]

export const CURATED_SLUGS = {
  geopolitics: [...CURATED_GEOPOLITICS_SLUGS],
  sports: [...SUPPORTED_SPORTS],
}
