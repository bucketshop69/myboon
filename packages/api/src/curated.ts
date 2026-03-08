// curated.ts — hand-picked Polymarket slugs for the Predict tab
// Edit this file to add/remove markets. No code changes elsewhere needed.

export const CURATED_SLUGS = {
  // Synced with packages/collectors/src/polymarket/pinned.json
  geopolitics: [
    'will-the-iranian-regime-fall-by-march-31',
    'will-israel-launch-a-major-ground-offensive-in-lebanon-by-march-31',
    'us-forces-enter-iran-by-march-31-222-191-243-517-878-439-519',
    'us-x-iran-ceasefire-by-march-31',
    'will-france-uk-or-germany-strike-iran-by-march-31-929',
    'will-another-country-strike-iran-by-march-31-833',
    'will-hassan-khomeini-be-the-next-supreme-leader-of-iran',
    'iran-leader-end-of-2026',
  ],
  sports: [
    'champions-league-winner-2024-25',
    'premier-league-winner-2024-25',
  ],
}

export const ALL_SLUGS: string[] = [
  ...CURATED_SLUGS.geopolitics,
  ...CURATED_SLUGS.sports,
]
