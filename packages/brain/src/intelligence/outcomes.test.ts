import { describe, expect, it } from 'vitest'
import { INTELLIGENCE_SCHEMA_VERSION, INTELLIGENCE_SCORING_VERSION, oddsMoveCriterion } from './contracts.js'
import { narrativeOutcomeToRow } from './outcomes.js'

describe('narrative outcome persistence mapping', () => {
  it('maps frozen outcome criteria to durable DB row shape', () => {
    const row = narrativeOutcomeToRow({
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      id: 'outcome:classified-1',
      narrativeId: 'published-narrative-1',
      evaluatedAt: '2026-01-02T00:00:00.000Z',
      criteria: [oddsMoveCriterion('up', 0.03, 24)],
      result: 'hit',
      measuredValues: { startPrice: 0.4, latestPrice: 0.45, measuredMove: 0.05 },
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
    })

    expect(row.id).toBeUndefined()
    expect(row.narrative_id).toBe('published-narrative-1')
    expect(row.criteria[0]).toMatchObject({ kind: 'odds_move', targetDelta: 0.03 })
    expect(row.schema_version).toBe(INTELLIGENCE_SCHEMA_VERSION)
    expect(row.scoring_version).toBe(INTELLIGENCE_SCORING_VERSION)
  })
})
