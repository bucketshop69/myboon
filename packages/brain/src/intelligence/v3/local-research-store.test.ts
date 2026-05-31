import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { HyperliquidResearchLead } from '@myboon/collectors/hyperliquid/research-leads'

import { buildHyperliquidEntityResearch } from './hyperliquid-entity-research.js'
import {
  loadLocalEntityBooks,
  writeLocalEntityResearchResult,
} from './local-research-store.js'

const now = '2026-05-29T10:00:00.000Z'

function lead(overrides: Partial<HyperliquidResearchLead> = {}): HyperliquidResearchLead {
  return {
    id: 'hyperliquid:lead:hype:funding:7d',
    asset: 'HYPE',
    lane: 'funding_pressure',
    status: 'research',
    priority: 8.4,
    observedAt: '2026-05-29T09:45:00.000Z',
    storyKey: 'hyperliquid:funding-pressure:hype:7d',
    headline: 'HYPE funding pressure: longs paying shorts',
    whatChanged: 'HYPE funding averaged 0.085 bps over 168 hourly samples.',
    whyInteresting: 'Sustained positive funding can point to long-side demand or crowding.',
    suggestedResearchQuestions: ['Is this HYPE-specific or market-wide?'],
    metrics: { windowDays: 7, averageFundingBps: 0.085 },
    checks: [{ name: 'research average funding', passed: true, value: '0.085 bps', threshold: '>= 0.075 bps' }],
    receipts: [{ source: 'hyperliquid', sourceId: 'fundingHistory:HYPE:7d', capturedAt: now }],
    uncertainty: ['Funding alone does not explain the reason for demand.'],
    supportingLeadIds: [],
    ...overrides,
  }
}

describe('local research store', () => {
  it('writes packets, books, and idempotent note logs', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'myboon-local-research-'))
    try {
      const result = buildHyperliquidEntityResearch([lead()], { now })

      const first = await writeLocalEntityResearchResult(result, { rootDir, inputPath: '/tmp/leads.json' })
      expect(first.packetCount).toBe(1)
      expect(first.entityBookCount).toBe(1)
      expect(first.appendedNoteCount).toBe(1)
      expect(first.skippedDuplicateNoteCount).toBe(0)

      const books = await loadLocalEntityBooks(rootDir)
      expect(books).toHaveLength(1)
      expect(books[0]!.entity.id).toBe('HYPE')
      expect(books[0]!.notes).toHaveLength(1)

      const packetRecord = JSON.parse(await readFile(first.packetPaths[0]!, 'utf8')) as { inputPath?: string }
      expect(packetRecord.inputPath).toBe('/tmp/leads.json')

      const second = await writeLocalEntityResearchResult(result, { rootDir, inputPath: '/tmp/leads.json' })
      expect(second.appendedNoteCount).toBe(0)
      expect(second.skippedDuplicateNoteCount).toBe(1)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
