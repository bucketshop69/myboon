// curated.ts — hand-picked Polymarket slugs for the Predict tab
// Edit this file to add/remove markets. No code changes elsewhere needed.

export const CURATED_SLUGS = {
  geopolitics: [
    'will-iran-change-its-regime-in-2025',
    'will-russia-and-ukraine-sign-a-peace-deal-in-2025',
    'will-there-be-a-us-iran-nuclear-deal-in-2025',
    'will-israel-and-hamas-reach-a-ceasefire-deal-in-2025',
    'will-north-korea-conduct-a-nuclear-test-in-2025',
  ],
  sports: [
    'nba-championship-2025',
    'champions-league-winner-2024-25',
    'nfl-super-bowl-2026',
    'world-series-winner-2025',
  ],
}

export const ALL_SLUGS: string[] = [
  ...CURATED_SLUGS.geopolitics,
  ...CURATED_SLUGS.sports,
]
