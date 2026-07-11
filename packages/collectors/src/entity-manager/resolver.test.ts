import assert from 'node:assert/strict'
import test from 'node:test'
import { writeExtraction } from './resolver'
import { InMemoryEntityMemoryStore } from './test-helpers'
import type { EntityMemoryExtraction, ExtractionProvider, ResearchPacket } from './types'

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
  eventAt: '2026-06-21T00:00:00.000Z',
  evidence: [],
  metrics: {},
  context: {},
}

function provider(extraction: EntityMemoryExtraction): ExtractionProvider {
  return {
    async extract() {
      return extraction
    },
  }
}

test('writeExtraction creates entities, writes memory items, and adds a processed marker', async () => {
  const store = new InMemoryEntityMemoryStore()
  const result = await writeExtraction(store, packet, provider({
    primaryEntities: [{
      name: 'Federal Reserve',
      type: 'organization',
      slug: 'federal-reserve',
      aliases: ['Fed'],
      summary: 'US central bank.',
    }],
    memories: [{
      entitySlug: 'federal-reserve',
      memoryType: 'market_signal',
      title: 'Rate cut odds moved',
      summary: 'Research noted a repricing in rate cut odds.',
      context: { market: packet.title },
      evidence: [{ url: 'https://example.com' }],
    }],
  }))

  assert.equal(result.entitiesCreated, 1)
  assert.equal(result.memoriesWritten, 2)
  assert.equal(store.entities.some((entity) => entity.slug === 'federal-reserve'), true)
  assert.equal(store.entities[0].show_in_carousel, false)
  assert.equal(store.memories.some((memory) => memory.title === 'entity_manager:processed' && memory.entity_id === null), true)
})

test('writeExtraction is idempotent for the same packet and memory item keys', async () => {
  const store = new InMemoryEntityMemoryStore()
  const extraction: EntityMemoryExtraction = {
    primaryEntities: [{
      name: 'Federal Reserve',
      type: 'organization',
      slug: 'federal-reserve',
      aliases: ['Fed'],
    }],
    memories: [{
      entitySlug: 'federal-reserve',
      memoryType: 'research_note',
      title: 'Rate cut odds moved',
      summary: 'Research noted a repricing in rate cut odds.',
    }],
  }

  const first = await writeExtraction(store, packet, provider(extraction))
  const second = await writeExtraction(store, packet, provider(extraction))

  assert.equal(first.memoriesWritten, 2)
  assert.equal(second.memoriesWritten, 0)
  assert.equal(store.memories.length, 2)
})

test('writeExtraction reuses entities by alias and merges aliases', async () => {
  const store = new InMemoryEntityMemoryStore()
  await store.createEntities([{
    slug: 'federal-reserve',
    name: 'Federal Reserve',
    type: 'organization',
    aliases: ['Federal Reserve'],
    summary: null,
    status: 'active',
    metadata: {},
  }])

  const result = await writeExtraction(store, packet, provider({
    primaryEntities: [{
      name: 'Fed',
      type: 'organization',
      slug: 'fed',
      aliases: ['Federal Reserve', 'FOMC'],
      summary: 'US central bank.',
    }],
    memories: [{
      entitySlug: 'fed',
      memoryType: 'research_note',
      title: 'FOMC evidence',
      summary: 'Evidence mentions the FOMC.',
    }],
  }))

  assert.equal(result.entitiesCreated, 0)
  assert.equal(result.entitiesReused, 1)
  const entity = store.entities.find((item) => item.slug === 'federal-reserve')
  assert.ok(entity)
  assert.deepEqual(entity.aliases, ['Federal Reserve', 'Fed', 'FOMC'])
})

test('writeExtraction preserves carousel selection while reusing and enriching an entity', async () => {
  const store = new InMemoryEntityMemoryStore()
  const [selected] = await store.createEntities([{
    slug: 'bitcoin',
    name: 'Bitcoin',
    type: 'asset',
    aliases: ['Bitcoin'],
    summary: null,
    status: 'active',
    metadata: {},
  }])
  await store.updateEntity({ ...selected, show_in_carousel: true })

  await writeExtraction(store, packet, provider({
    primaryEntities: [{
      name: 'Bitcoin',
      type: 'asset',
      slug: 'bitcoin',
      aliases: ['BTC'],
      summary: 'A decentralized cryptocurrency.',
    }],
    memories: [{
      entitySlug: 'bitcoin',
      memoryType: 'market_signal',
      title: 'Bitcoin market moved',
      summary: 'Bitcoin market odds moved.',
    }],
  }))

  assert.equal(store.entities[0].show_in_carousel, true)
  assert.deepEqual(store.entities[0].aliases, ['Bitcoin', 'BTC'])
})

test('writeExtraction stores a market signal under the durable entity instead of the market', async () => {
  const store = new InMemoryEntityMemoryStore()
  await writeExtraction(store, {
    ...packet,
    title: 'Will Ethereum reach $3,000 by December 31?',
    sourceRefId: 'will-ethereum-reach-3000-by-december-31',
  }, provider({
    primaryEntities: [{
      name: 'Ethereum',
      type: 'asset',
      slug: 'ethereum',
      aliases: ['ETH'],
      summary: 'Ethereum network and ETH asset.',
    }],
    memories: [{
      entitySlug: 'ethereum',
      memoryType: 'market_signal',
      title: 'ETH $3,000 odds moved',
      summary: 'Polymarket research observed movement in an ETH $3,000 market.',
      mentions: ['Polymarket', 'Will Ethereum reach $3,000 by December 31?'],
      context: { source_market_slug: 'will-ethereum-reach-3000-by-december-31' },
    }],
  }))

  assert.deepEqual(store.entities.map((entity) => entity.slug), ['ethereum'])
  assert.equal(store.memories.filter((memory) => memory.memory_type !== 'source_marker').length, 1)
  assert.equal(store.memories.find((memory) => memory.memory_type === 'market_signal')?.entity_id, 'entity-1')
})
