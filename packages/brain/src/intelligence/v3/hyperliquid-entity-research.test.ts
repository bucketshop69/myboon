import { describe, expect, it } from 'vitest'
import type { HyperliquidResearchLead } from '@myboon/collectors/hyperliquid/research-leads'

import { buildHyperliquidEntityResearch } from './hyperliquid-entity-research.js'
import { validateResearchPacket } from './packet-validator.js'

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
    suggestedResearchQuestions: [
      'Is price also moving up, or is funding rising while price stalls?',
      'Is this HYPE-specific or market-wide?',
    ],
    metrics: {
      windowDays: 7,
      averageFundingBps: 0.085,
      positiveSampleSharePct: 82.1,
    },
    checks: [
      { name: 'research average funding', passed: true, value: '0.085 bps', threshold: '>= 0.075 bps' },
      { name: 'sustained direction', passed: true, value: '82.1%', threshold: '>= 75%' },
    ],
    receipts: [
      {
        source: 'hyperliquid',
        sourceId: 'fundingHistory:HYPE:7d',
        capturedAt: now,
      },
    ],
    uncertainty: ['Funding alone does not explain the reason for demand.'],
    supportingLeadIds: [],
    ...overrides,
  }
}

describe('hyperliquid entity research', () => {
  it('turns a research lead into a valid ResearchPacket and entity book note', () => {
    const result = buildHyperliquidEntityResearch([lead()], { now })

    expect(result.packets).toHaveLength(1)
    expect(result.entityBooks).toHaveLength(1)

    const item = result.packets[0]!
    expect(item.packet.entities).toEqual(expect.arrayContaining([
      { type: 'asset', id: 'HYPE', canonicalName: 'HYPE' },
    ]))
    expect(item.packet.segment).toBe('Crowded Trade')
    expect(item.packet.archetype).toBe('funding_pressure')
    expect(item.packet.thesis).toContain('Existing book context')
    expect(item.entityBookNote.memoryUpdate).toContain('HYPE')
    expect(result.entityBooks[0]!.notes).toHaveLength(1)
    expect(validateResearchPacket(item.packet, item.decision)).toEqual({ valid: true, errors: [] })
  })

  it('uses prior entity notes to mark later packets as developing', () => {
    const first = lead()
    const second = lead({
      id: 'hyperliquid:lead:hype:volume:7d',
      lane: 'volume_spike',
      priority: 6.1,
      storyKey: 'hyperliquid:volume-spike:hype:7d',
      headline: 'HYPE volume expanded',
      whatChanged: 'HYPE volume reached 1.7x its seven-day baseline.',
      metrics: { windowDays: 7, spikeMultiple: 1.7 },
      checks: [{ name: 'research spike multiple', passed: true, value: '1.7x', threshold: '>= 1.5x' }],
    })

    const result = buildHyperliquidEntityResearch([first, second], { now })
    const volumePacket = result.packets.find((item) => item.packet.archetype === 'volume_expansion')!.packet

    expect(volumePacket.status).toBe('developing')
    expect(volumePacket.thesis).toContain('existing thesis')
    expect(volumePacket.materiality.reasons).toContain('entity book already has 1 prior note(s)')
    expect(result.entityBooks[0]!.notes).toHaveLength(2)
  })
})
