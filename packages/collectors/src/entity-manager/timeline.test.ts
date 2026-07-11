import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEntityTimeline } from './timeline'
import type { EntityMemoryRecord } from './types'

function memory(overrides: Partial<EntityMemoryRecord>): EntityMemoryRecord {
  return {
    id: 'memory-1',
    entity_id: 'entity-1',
    source: 'news',
    source_area: 'articles',
    source_type: 'article',
    source_ref_id: 'article-1',
    source_research_id: 'research-1',
    memory_type: 'news_event',
    title: 'Event',
    summary: 'A concrete event happened.',
    body: 'Internal research detail.',
    event_at: '2026-07-03T00:00:00.000Z',
    observed_at: '2026-07-04T00:00:00.000Z',
    confidence: 0.8,
    evidence: [{ url: 'https://example.com' }],
    mentions: [],
    metrics: {},
    context: {},
    ...overrides,
  }
}

test('buildEntityTimeline excludes markers and other entities, then orders by event date', () => {
  const memories = [
    memory({ id: 'latest', memory_type: 'metric_change', summary: 'Metric change.', event_at: '2026-07-06T00:00:00.000Z' }),
    memory({ id: 'other', entity_id: 'entity-2', summary: 'Other Entity.', event_at: '2026-07-01T00:00:00.000Z' }),
    memory({
      id: 'marker',
      entity_id: 'entity-1',
      memory_type: 'source_marker',
      summary: 'Processed Entity Manager packet.',
      event_at: '2026-07-02T00:00:00.000Z',
    }),
    memory({ id: 'timeline', memory_type: 'timeline_event', summary: 'Timeline event.', event_at: '2026-07-05T00:00:00.000Z' }),
    memory({ id: 'social', memory_type: 'social_signal', summary: 'Social signal.', event_at: '2026-07-04T00:00:00.000Z' }),
    memory({ id: 'news', memory_type: 'news_event', summary: 'News event.', event_at: '2026-07-03T00:00:00.000Z' }),
    memory({ id: 'market', memory_type: 'market_signal', summary: 'Market signal.', event_at: '2026-07-02T00:00:00.000Z' }),
    memory({ id: 'earliest', memory_type: 'research_note', summary: 'Research note.', event_at: '2026-07-01T00:00:00.000Z' }),
  ]
  const original = structuredClone(memories)
  const timeline = buildEntityTimeline('entity-1', memories)

  assert.deepEqual(timeline, [
    { summary: 'Research note.', event_at: '2026-07-01T00:00:00.000Z' },
    { summary: 'Market signal.', event_at: '2026-07-02T00:00:00.000Z' },
    { summary: 'News event.', event_at: '2026-07-03T00:00:00.000Z' },
    { summary: 'Social signal.', event_at: '2026-07-04T00:00:00.000Z' },
    { summary: 'Timeline event.', event_at: '2026-07-05T00:00:00.000Z' },
    { summary: 'Metric change.', event_at: '2026-07-06T00:00:00.000Z' },
  ])
  assert.deepEqual(memories, original)
})

test('buildEntityTimeline uses observed_at when a legacy memory has no event_at', () => {
  const timeline = buildEntityTimeline('entity-1', [
    memory({ id: 'event-date', summary: 'Event date.', event_at: '2026-07-04T00:00:00.000Z' }),
    memory({
      id: 'observed-date',
      summary: 'Observed date fallback.',
      event_at: null,
      observed_at: '2026-07-02T00:00:00.000Z',
    }),
  ])

  assert.deepEqual(timeline, [
    { summary: 'Observed date fallback.', event_at: '2026-07-02T00:00:00.000Z' },
    { summary: 'Event date.', event_at: '2026-07-04T00:00:00.000Z' },
  ])
})
