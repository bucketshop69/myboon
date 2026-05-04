import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTELLIGENCE_SCHEMA_VERSION, INTELLIGENCE_SCORING_VERSION } from './contracts.js'
import { writeBacktestArtifact, type BacktestRunArtifact } from './backtest-artifacts.js'

const artifact: BacktestRunArtifact = {
  params: { days: 30, rawSignals: 2 },
  summary: {
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    id: 'backtest:polymarket.odds_shift:test',
    source: 'polymarket',
    signalKind: 'polymarket.odds_shift',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2026-01-02T00:00:00.000Z',
    requestedWindowDays: 1,
    actualWindowDays: 1,
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
    baseline: 'largest_raw_odds_delta',
    candidateCount: 1,
    hitRate: 1,
    baselineHitRate: 0,
    confidenceInterval: { lower: 0.2, upper: 1, level: 0.95 },
  },
  selected: [],
  baseline: [],
  examples: { hits: [], misses: [] },
}

describe('backtest artifacts', () => {
  it('writes a complete JSON artifact', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'myboon-backtest-'))
    const outputPath = path.join(dir, 'result.json')

    const written = await writeBacktestArtifact(artifact, outputPath)
    const parsed = JSON.parse(await readFile(written, 'utf8')) as BacktestRunArtifact

    expect(parsed.summary.id).toBe(artifact.summary.id)
    expect(parsed.params.rawSignals).toBe(2)
    expect(parsed.examples.hits).toEqual([])
  })
})
