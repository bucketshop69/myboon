import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_NEWS_SOURCES } from '../news/config'
import { fingerprintScoutCandidate } from '../news/fingerprint'
import { SqliteNewsStore } from '../news/sqlite-store'
import type { NewsCandidateObservationRow } from '../news/store'
import type { NewsResearchResponse, NewsScoutCandidate } from '../news/types'
import { InMemoryEntityMemoryStore } from './test-helpers'
import { fetchUnprocessedNewsPackets, runNewsEntityManager } from './run-news'
import type { EntityMemoryExtraction, ExtractionProvider, ResearchPacket } from './types'

const source = DEFAULT_NEWS_SOURCES[0]
const sourceUrl = source.urls[0]
const observedAt = '2026-07-04T12:00:00.000Z'

class CapturingExtractionProvider implements ExtractionProvider {
  packets: ResearchPacket[] = []

  constructor(private readonly extraction: EntityMemoryExtraction | Error) {}

  async extract(packet: ResearchPacket): Promise<EntityMemoryExtraction> {
    this.packets.push(packet)
    if (this.extraction instanceof Error) throw this.extraction
    return this.extraction
  }
}

function withNewsStore(fn: (store: SqliteNewsStore) => Promise<void> | void): Promise<void> {
  const store = new SqliteNewsStore(':memory:')
  return Promise.resolve()
    .then(() => fn(store))
    .finally(() => store.close())
}

function candidate(overrides: Partial<NewsScoutCandidate> = {}): NewsScoutCandidate {
  return {
    headline: 'Ethereum treasury article',
    article_url: 'https://www.coindesk.com/markets/2026/07/04/ethereum-treasury-article?utm_source=x',
    summary: 'Observed article summary.',
    published_at: '2026-07-04T11:00:00.000Z',
    evidence: ['article card'],
    ...overrides,
  }
}

async function insertResearchResult(
  store: SqliteNewsStore,
  inputCandidate = candidate()
): Promise<Awaited<ReturnType<SqliteNewsStore['insertResearchResult']>>> {
  const [storedCandidate] = await store.insertCandidateObservations([{
    source,
    sourceUrl,
    candidate: inputCandidate,
    fingerprint: fingerprintScoutCandidate(source.sourceId, sourceUrl.urlId, inputCandidate),
    dedupeOutcome: 'new_candidate',
    observedAt,
  }])
  return store.insertResearchResult({
    candidate: storedCandidate,
    response: researchResponse(storedCandidate),
    researchedAt: '2026-07-04T13:00:00.000Z',
  })
}

function researchResponse(storedCandidate: NewsCandidateObservationRow): NewsResearchResponse {
  return {
    schema_version: 'myboon.hermes.research_response.v1',
    job_id: `research-${storedCandidate.id}`,
    candidate_id: storedCandidate.id,
    source_id: storedCandidate.sourceId,
    url_id: storedCandidate.urlId,
    status: 'ready_for_entity_memory',
    source_signal: {
      source_name: storedCandidate.sourceName,
      source_url: storedCandidate.sourceUrl,
      article_url: storedCandidate.rawCandidate.article_url,
      canonical_article_url: storedCandidate.canonicalArticleUrl,
      headline: storedCandidate.headline,
      visible_summary: storedCandidate.visibleSummary,
      published_at: storedCandidate.publishedAt,
      observed_at: storedCandidate.observedAt,
    },
    research_summary: {
      one_liner: 'Research gathered article context.',
      what_was_checked: ['Article page'],
      requires_followup: false,
    },
    article_claims: [{ claim_id: 'claim_1', claim: 'Article claim.' }],
    verified_facts: [{ fact: 'Verified fact.', evidence_refs: ['evidence_1'] }],
    unresolved_claims: [],
    entity_hints: [{ name: 'Ethereum', source: 'article' }],
    evidence: [{ evidence_id: 'evidence_1', title: 'Evidence', url: 'https://example.com/evidence' }],
    open_questions: [],
    limitations: [],
    errors: [],
  }
}

function extraction(): EntityMemoryExtraction {
  return {
    primaryEntities: [{
      name: 'Ethereum',
      type: 'asset',
      slug: 'ethereum',
      aliases: ['ETH'],
      summary: 'Ethereum asset.',
      createIfMissing: true,
    }],
    memories: [{
      entitySlug: 'ethereum',
      memoryType: 'news_event',
      title: 'Ethereum treasury article observed',
      summary: 'CoinDesk article context was gathered for Ethereum.',
      body: 'Neutral source context.',
      observedAt,
      evidence: [{ url: 'https://example.com/evidence' }],
      mentions: ['CoinDesk'],
      metrics: { articleClaimCount: 1 },
      context: { source: 'news' },
    }],
  }
}

test('fetchUnprocessedNewsPackets adapts pending local news research into ResearchPacket', async () => {
  await withNewsStore(async (newsStore) => {
    const entityStore = new InMemoryEntityMemoryStore()
    const result = await insertResearchResult(newsStore)

    const packets = await fetchUnprocessedNewsPackets({
      newsStore,
      entityStore,
      batchSize: 10,
    })

    assert.equal(packets.length, 1)
    assert.equal(packets[0].result.id, result.id)
    assert.equal(packets[0].packet.source, 'news')
    assert.equal(packets[0].packet.sourceArea, source.sourceId)
    assert.equal(packets[0].packet.sourceResearchId, result.id)
    assert.equal(packets[0].packet.sourceType, 'article')
    assert.equal(packets[0].packet.sourceRefId, result.canonicalArticleUrl)
  })
})

test('runNewsEntityManager writes entity memory, processed marker, and local handed-off status', async () => {
  await withNewsStore(async (newsStore) => {
    const entityStore = new InMemoryEntityMemoryStore()
    const provider = new CapturingExtractionProvider(extraction())
    const resultRow = await insertResearchResult(newsStore)

    const result = await runNewsEntityManager({
      newsStore,
      entityStore,
      extractionProvider: provider,
      batchSize: 10,
    })

    assert.equal(result.fetched, 1)
    assert.equal(result.processed, 1)
    assert.equal(result.failed, 0)
    assert.equal(result.skippedAlreadyMarked, 0)
    assert.equal(provider.packets.length, 1)
    assert.equal(provider.packets[0].sourceResearchId, resultRow.id)
    assert.equal(result.results[0].markerStatus, 'processed')

    const stored = await newsStore.fetchResearchResult(resultRow.id)
    assert.equal(stored?.status, 'handed_to_entity_memory')

    const normalMemory = entityStore.memories.find((memory) => memory.title === 'Ethereum treasury article observed')
    assert.equal(normalMemory?.memory_type, 'news_event')
    const marker = entityStore.memories.find((memory) => memory.title === 'entity_manager:processed')
    assert.equal(marker?.source, 'news')
    assert.equal(marker?.source_area, source.sourceId)
    assert.equal(marker?.source_research_id, resultRow.id)
    assert.equal(marker?.memory_type, 'source_marker')
  })
})

test('runNewsEntityManager writes failed marker and local failed status when extraction fails', async () => {
  await withNewsStore(async (newsStore) => {
    const entityStore = new InMemoryEntityMemoryStore()
    const provider = new CapturingExtractionProvider(new Error('extract failed'))
    const resultRow = await insertResearchResult(newsStore)

    const result = await runNewsEntityManager({
      newsStore,
      entityStore,
      extractionProvider: provider,
      batchSize: 10,
    })

    assert.equal(result.fetched, 1)
    assert.equal(result.processed, 0)
    assert.equal(result.failed, 1)
    assert.equal(result.failures[0].sourceResearchId, resultRow.id)
    assert.match(result.failures[0].error, /extract failed/)
    assert.equal(result.memoriesWritten, 1)

    const stored = await newsStore.fetchResearchResult(resultRow.id)
    assert.equal(stored?.status, 'failed_entity_memory')
    const marker = entityStore.memories.find((memory) => memory.title === 'entity_manager:failed')
    assert.equal(marker?.source, 'news')
    assert.equal(marker?.source_area, source.sourceId)
    assert.equal(marker?.source_research_id, resultRow.id)
    assert.equal(marker?.memory_type, 'source_marker')
  })
})

test('runNewsEntityManager skips already processed or failed source markers', async () => {
  await withNewsStore(async (newsStore) => {
    const entityStore = new InMemoryEntityMemoryStore()
    const processed = await insertResearchResult(newsStore, candidate({ article_url: 'https://www.coindesk.com/a' }))
    const failed = await insertResearchResult(newsStore, candidate({ article_url: 'https://www.coindesk.com/b' }))
    await entityStore.upsertMemories([
      markerMemory(processed.id, processed.sourceId, 'entity_manager:processed'),
      markerMemory(failed.id, failed.sourceId, 'entity_manager:failed'),
    ])
    const provider = new CapturingExtractionProvider(extraction())

    const result = await runNewsEntityManager({
      newsStore,
      entityStore,
      extractionProvider: provider,
      batchSize: 10,
    })

    assert.equal(result.fetched, 2)
    assert.equal(result.skippedAlreadyMarked, 2)
    assert.equal(result.processed, 0)
    assert.equal(result.failed, 0)
    assert.equal(provider.packets.length, 0)
    assert.equal((await newsStore.fetchResearchResult(processed.id))?.status, 'pending_entity_memory')
    assert.equal((await newsStore.fetchResearchResult(failed.id))?.status, 'pending_entity_memory')
  })
})

test('runNewsEntityManager rerun after processed marker does not duplicate memories', async () => {
  await withNewsStore(async (newsStore) => {
    const entityStore = new InMemoryEntityMemoryStore()
    const firstProvider = new CapturingExtractionProvider(extraction())
    const secondProvider = new CapturingExtractionProvider(extraction())
    const resultRow = await insertResearchResult(newsStore)

    const first = await runNewsEntityManager({
      newsStore,
      entityStore,
      extractionProvider: firstProvider,
      batchSize: 10,
    })
    const memoryCountAfterFirstRun = entityStore.memories.length
    const second = await runNewsEntityManager({
      newsStore,
      entityStore,
      extractionProvider: secondProvider,
      batchSize: 10,
    })

    assert.equal(first.processed, 1)
    assert.equal(second.fetched, 0)
    assert.equal(second.processed, 0)
    assert.equal(second.skippedAlreadyMarked, 0)
    assert.equal(secondProvider.packets.length, 0)
    assert.equal(entityStore.memories.length, memoryCountAfterFirstRun)
    assert.equal((await newsStore.fetchResearchResult(resultRow.id))?.status, 'handed_to_entity_memory')
  })
})

test('runNewsEntityManager does not call downstream stages or Hermes scout/research code', async () => {
  await withNewsStore(async (newsStore) => {
    const entityStore = new InMemoryEntityMemoryStore()
    const provider = new CapturingExtractionProvider(extraction())
    await insertResearchResult(newsStore)

    const result = await runNewsEntityManager({
      newsStore,
      entityStore,
      extractionProvider: provider,
      batchSize: 10,
    })

    assert.equal(result.processed, 1)
    assert.deepEqual(provider.packets.map((packet) => packet.source), ['news'])
    assert.equal(entityStore.memories.some((memory) => memory.title.includes('editor')), false)
    assert.equal(entityStore.memories.some((memory) => memory.title.includes('publisher')), false)
  })
})

function markerMemory(sourceResearchId: string, sourceArea: string, title: 'entity_manager:processed' | 'entity_manager:failed') {
  return {
    entity_id: null,
    source: 'news',
    source_area: sourceArea,
    source_type: 'article',
    source_ref_id: 'https://www.coindesk.com/already-marked',
    source_research_id: sourceResearchId,
    memory_type: 'source_marker' as const,
    title,
    summary: 'already marked',
    body: null,
    event_at: observedAt,
    observed_at: observedAt,
    confidence: null,
    evidence: [],
    mentions: [],
    metrics: {},
    context: {},
  }
}
