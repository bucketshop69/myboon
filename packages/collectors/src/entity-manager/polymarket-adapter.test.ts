import assert from 'node:assert/strict'
import test from 'node:test'
import { polymarketResearchToPacket } from './polymarket-adapter'

test('polymarketResearchToPacket converts research row and candidate context into a source-agnostic packet', () => {
  const packet = polymarketResearchToPacket({
    id: 'research-1',
    candidate_id: 'candidate-1',
    source: 'polymarket',
    area: 'markets',
    slug: 'will-fed-cut-rates',
    title: 'Will Fed cut rates?',
    candidate_type: 'odds_moved',
    research_mode: 'macro',
    summary: 'Evidence review verdict: reject. This likely reflects thin-liquidity noise.',
    notes: 'Evidence quality is weak and needs more research.',
    key_findings: ['CPI cooled'],
    evidence_links: [{ url: 'https://example.com/cpi', title: 'CPI' }],
    uncertainty: 'Research had source limitations.',
    editor_notes: 'Do not publish directly.',
    researched_at: '2026-06-22T00:00:00.000Z',
    research_family_key: 'title:fed-rates',
    research_cluster_key: 'polymarket:markets:title:fed-rates',
  }, {
    id: 'candidate-1',
    market_id: 'market-1',
    slug: 'will-fed-cut-rates',
    title: 'Will Fed cut rates?',
    observed_at: '2026-06-21T00:00:00.000Z',
    what_changed: 'Odds moved up.',
    why_flagged: 'Large delta.',
    evidence_refs: [{ source_url: 'https://polymarket.com/event/fed' }],
    metrics: { current_yes: 0.28, previous_yes: 0.18 },
  })

  assert.equal(packet.id, 'polymarket:markets:research-1')
  assert.equal(packet.sourceResearchId, 'research-1')
  assert.equal(packet.sourceArea, 'markets')
  assert.equal(packet.sourceType, 'market_signal')
  assert.equal(packet.sourceRefId, 'will-fed-cut-rates')
  assert.equal(packet.eventAt, '2026-06-21T00:00:00.000Z')
  assert.equal(packet.url, 'https://example.com/cpi')
  assert.match(packet.summary, /Research packet for Polymarket market "Will Fed cut rates\?"/)
  assert.match(packet.body, /Collector observation: Odds moved up\./)
  assert.doesNotMatch(packet.summary, /reject|noise|weak|needs more research/i)
  assert.doesNotMatch(packet.body, /reject|noise|weak|needs more research/i)
  assert.deepEqual(packet.metrics, { current_yes: 0.28, previous_yes: 0.18 })
  assert.deepEqual(packet.evidence, [
    { url: 'https://example.com/cpi', title: 'CPI' },
    { source_url: 'https://polymarket.com/event/fed' },
  ])
  assert.equal((packet.context.candidate as { what_changed: string }).what_changed, 'Odds moved up.')
  assert.equal('uncertainty' in packet.context, false)
  assert.equal('editor_notes' in packet.context, false)
  assert.equal('evidence_quality' in packet.context, false)
  assert.equal('recommended_editor_action' in packet.context, false)
  assert.deepEqual(packet.context.source_object, {
    type: 'polymarket_market',
    slug: 'will-fed-cut-rates',
    title: 'Will Fed cut rates?',
    url: 'https://polymarket.com/market/will-fed-cut-rates',
  })
})
