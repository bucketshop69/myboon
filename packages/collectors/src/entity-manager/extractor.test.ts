import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeExtraction } from './normalization'
import type { ResearchPacket } from './types'

const packet: ResearchPacket = {
  id: 'polymarket:markets:research-1',
  source: 'polymarket',
  sourceArea: 'markets',
  sourceResearchId: 'research-1',
  sourceType: 'market_signal',
  sourceRefId: 'will-fed-cut-rates',
  title: 'Will Fed cut rates?',
  summary: 'Fed odds moved.',
  body: 'Fed odds moved.',
  observedAt: '2026-06-22T00:00:00.000Z',
  evidence: [],
  metrics: {},
  context: {},
}

test('normalizeExtraction normalizes aliases, slugs, item types, and drops orphan memory items', () => {
  const normalized = normalizeExtraction({
    primary_entities: [{
      name: 'Federal Reserve',
      type: 'organization',
      aliases: ['Fed', 'Federal Reserve', 'fed'],
      metadata: { region: 'US' },
    }],
    memories: [{
      entity_slug: 'federal-reserve',
      memory_type: 'unsupported',
      title: 'Rate cut odds moved',
      summary: 'Traders repriced rate cut odds.',
      mentions: ['FOMC', 'fomc'],
    }, {
      entity_slug: 'missing',
      memory_type: 'research_note',
      title: 'Dropped',
      summary: 'No entity candidate.',
    }],
  }, packet)

  assert.equal(normalized.primaryEntities.length, 1)
  assert.equal(normalized.primaryEntities[0].slug, 'federal-reserve')
  assert.deepEqual(normalized.primaryEntities[0].aliases, ['Fed', 'Federal Reserve'])
  assert.equal(normalized.memories.length, 1)
  assert.equal(normalized.memories[0].memoryType, 'market_signal')
  assert.deepEqual(normalized.memories[0].mentions, ['FOMC'])
})
