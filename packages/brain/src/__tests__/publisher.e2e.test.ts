import { describe, it, expect } from 'vitest'
import 'dotenv/config'
import { publisherGraph } from '../graphs/publisher-graph.js'
import type { Narrative } from '../publisher-types.js'

const SKIP = !process.env.MINIMAX_API_KEY || !process.env.SUPABASE_URL

const mockNarrative: Narrative = {
  id: 'test-e2e-' + Date.now(),
  cluster: 'UCL Champions League knockout stage betting surge',
  observation:
    'Multiple wallets placed large bets on Manchester City to advance past Real Madrid. Total volume $180K in 2 hours.',
  score: 8,
  signal_count: 4,
  key_signals: [
    'Wallet 0xabc placed $45K on Man City UCL advance at 62¢',
    'Wallet 0xdef placed $38K on Man City at 61¢',
    'Open interest increased 23% in 90 minutes',
    'Volume spike 4x above 7-day average',
  ],
  slugs: ['man-city-ucl-advance-2025', 'real-madrid-ucl-exit-2025'],
  status: 'draft',
  created_at: new Date().toISOString(),
}

describe.skipIf(SKIP)('publisherGraph (e2e)', () => {
  it('produces a draft with all required fields', async () => {
    const result = await publisherGraph.invoke({ narrative: mockNarrative })

    expect(result).toHaveProperty('draft')
    const draft = result.draft!


    expect(typeof draft.content_small).toBe('string')
    expect(draft.content_small.length).toBeGreaterThan(0)
    expect(draft.content_small.length).toBeLessThanOrEqual(300) // enforced ~200 target, allow some flex
    expect(draft.content_small).not.toMatch(/^A tracked wallet/i) // must not start with generic wallet ref
    expect(draft.content_small).not.toMatch(/^A wallet/i)

    expect(typeof draft.content_full).toBe('string')
    expect(draft.content_full.length).toBeGreaterThan(0)
    expect(draft.content_full.length).toBeLessThanOrEqual(1200) // 3-5 sentences max

    expect(['fomo', 'signal', 'news', 'sports', 'macro', 'crypto']).toContain(draft.content_type)

    expect(typeof draft.publisher_score).toBe('number')
    expect(draft.publisher_score).toBeGreaterThanOrEqual(1)
    expect(draft.publisher_score).toBeLessThanOrEqual(10)

    expect(Array.isArray(draft.tags)).toBe(true)
    expect(draft.tags.length).toBeGreaterThan(0)

    expect(Array.isArray(draft.actions)).toBe(true)
  })

  it('predict actions use slugs from the narrative', async () => {
    const result = await publisherGraph.invoke({ narrative: mockNarrative })
    const draft = result.draft!

    const predictActions = draft.actions.filter((a: { type: string }) => a.type === 'predict')
    for (const action of predictActions) {
      expect(mockNarrative.slugs).toContain(action.slug)
    }
  })
}, 60_000)
