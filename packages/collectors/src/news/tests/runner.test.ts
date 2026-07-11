import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_NEWS_SOURCES } from '../config'
import { fingerprintScoutCandidate } from '../fingerprint'
import {
  recoverStaleNewsWork,
  runNewsPipelineOnce,
  runNewsScoutForSourceUrl,
  runPendingNewsResearch,
} from '../runner'
import { SqliteNewsStore } from '../sqlite-store'
import type { NewsCandidateObservationInput } from '../store'
import type {
  HermesWorkerRequest,
  HermesWorkerResult,
  NewsResearchRequest,
  NewsResearchResponse,
  NewsScoutCandidate,
  NewsScoutRequest,
  NewsScoutResponse,
} from '../types'

const source = DEFAULT_NEWS_SOURCES[0]
const sourceUrl = source.urls[0]
const now = new Date('2026-07-04T12:00:00.000Z')

class FakeHermes {
  calls: HermesWorkerRequest[] = []
  scoutHandler: (request: NewsScoutRequest) => string = (request) => JSON.stringify(scoutResponse(request, [candidate()]))
  researchHandler: (request: NewsResearchRequest) => string = (request) => JSON.stringify(researchResponse(request))

  async run(request: HermesWorkerRequest): Promise<HermesWorkerResult> {
    this.calls.push(request)
    const stdout = request.taskType === 'source_scout'
      ? this.scoutHandler(extractRequest(request.prompt) as NewsScoutRequest)
      : this.researchHandler(extractRequest(request.prompt) as NewsResearchRequest)
    return {
      jobId: request.jobId,
      taskType: request.taskType,
      status: 'succeeded',
      stdout,
      stderr: '',
      exitCode: 0,
      startedAt: now.toISOString(),
      finishedAt: now.toISOString(),
      durationMs: 1,
    }
  }
}

function withStore(fn: (store: SqliteNewsStore) => Promise<void> | void): Promise<void> {
  const store = new SqliteNewsStore(':memory:')
  return Promise.resolve()
    .then(() => fn(store))
    .finally(() => store.close())
}

function candidate(overrides: Partial<NewsScoutCandidate> = {}): NewsScoutCandidate {
  return {
    headline: 'CoinDesk BTC treasury update',
    article_url: 'https://www.coindesk.com/markets/2026/07/04/btc-treasury-update?utm_source=x',
    summary: 'Observed summary.',
    observed_at: now.toISOString(),
    ...overrides,
  }
}

function scoutResponse(request: NewsScoutRequest, candidates: NewsScoutCandidate[]): NewsScoutResponse {
  return {
    schema_version: 'myboon.hermes.scout_response.v1',
    job_id: request.job_id,
    source_id: request.source.source_id,
    url_id: request.source_url.url_id,
    status: 'success',
    source_observed: {
      url: request.source_url.url,
      observed_at: request.requested_at,
      access_method: 'browser',
      access_status: 'ok',
    },
    candidates,
    errors: [],
  }
}

function researchResponse(request: NewsResearchRequest): NewsResearchResponse {
  return {
    schema_version: 'myboon.hermes.research_response.v1',
    job_id: request.job_id,
    candidate_id: request.candidate_id,
    source_id: request.source.source_id,
    url_id: request.source_url.url_id,
    status: 'ready_for_entity_memory',
    source_signal: {
      source_name: request.source.name,
      source_url: request.source_url.url,
      article_url: request.article.article_url,
      canonical_article_url: request.article.canonical_article_url,
      headline: request.article.headline,
      visible_summary: request.article.visible_summary,
      published_at: request.article.published_at,
      observed_at: request.article.observed_at,
    },
    research_summary: {
      one_liner: 'Checked article context.',
      what_was_checked: ['Article page'],
      requires_followup: false,
    },
    article_claims: [{ claim_id: 'claim_1', claim: 'Article claim.' }],
    verified_facts: [{ fact: 'Verified fact.', evidence_refs: ['evidence_1'] }],
    unresolved_claims: [],
    entity_hints: [{ name: 'CoinDesk', source: 'article' }],
    evidence: [{ evidence_id: 'evidence_1', title: 'Article', url: request.article.article_url }],
    open_questions: [],
    limitations: [],
    errors: [],
  }
}

function observationInput(inputCandidate: NewsScoutCandidate): NewsCandidateObservationInput {
  return {
    source,
    sourceUrl,
    candidate: inputCandidate,
    fingerprint: fingerprintScoutCandidate(source.sourceId, sourceUrl.urlId, inputCandidate),
    dedupeOutcome: 'new_candidate',
    observedAt: inputCandidate.observed_at ?? now.toISOString(),
  }
}

function extractRequest(prompt: string): unknown {
  const marker = 'Request JSON:\n'
  const start = prompt.indexOf(marker)
  const schemaStart = prompt.indexOf('\n\nReturn schema:', start)
  assert.notEqual(start, -1)
  assert.notEqual(schemaStart, -1)
  return JSON.parse(prompt.slice(start + marker.length, schemaStart))
}

test('scout success creates a source run and candidate observation rows', async () => {
  await withStore(async (store) => {
    const hermes = new FakeHermes()
    const result = await runNewsScoutForSourceUrl({
      store,
      hermes,
      source,
      sourceUrl,
      options: { now },
    })

    assert.equal(result.status, 'succeeded')
    assert.equal(result.candidatesFound, 1)
    assert.equal(result.candidatesNew, 1)
    assert.equal(result.candidateObservationsInserted, 1)
    const pending = await store.fetchPendingCandidateObservations(10)
    assert.equal(pending.length, 1)
    assert.equal(pending[0].headline, 'CoinDesk BTC treasury update')
  })
})

test('unchanged candidates update counters and do not insert rows', async () => {
  await withStore(async (store) => {
    const inputCandidate = candidate()
    await store.insertCandidateObservations([observationInput(inputCandidate)])
    const hermes = new FakeHermes()
    hermes.scoutHandler = (request) => JSON.stringify(scoutResponse(request, [inputCandidate]))

    const result = await runNewsScoutForSourceUrl({
      store,
      hermes,
      source,
      sourceUrl,
      options: { now },
    })

    assert.equal(result.candidatesUnchanged, 1)
    assert.equal(result.candidateObservationsInserted, 0)
    const prior = await store.fetchPriorObservations(source.sourceId, [
      fingerprintScoutCandidate(source.sourceId, sourceUrl.urlId, inputCandidate).canonicalArticleUrl,
    ])
    assert.equal(prior.length, 1)
  })
})

test('materially changed candidates insert observations', async () => {
  await withStore(async (store) => {
    await store.insertCandidateObservations([observationInput(candidate({ headline: 'Old headline' }))])
    const hermes = new FakeHermes()
    hermes.scoutHandler = (request) => JSON.stringify(scoutResponse(request, [candidate({ headline: 'New headline' })]))

    const result = await runNewsScoutForSourceUrl({
      store,
      hermes,
      source,
      sourceUrl,
      options: { now },
    })

    assert.equal(result.candidatesMateriallyChanged, 1)
    assert.equal(result.candidateObservationsInserted, 1)
    assert.equal((await store.fetchPendingCandidateObservations(10)).length, 2)
  })
})

test('invalid candidates update invalid counters and do not insert rows', async () => {
  await withStore(async (store) => {
    const hermes = new FakeHermes()
    hermes.scoutHandler = (request) => JSON.stringify(scoutResponse(request, [candidate({ article_url: 'not a url' })]))

    const result = await runNewsScoutForSourceUrl({
      store,
      hermes,
      source,
      sourceUrl,
      options: { now },
    })

    assert.equal(result.candidatesInvalid, 1)
    assert.equal(result.candidateObservationsInserted, 0)
    assert.deepEqual(await store.fetchPendingCandidateObservations(10), [])
  })
})

test('scout parse failure marks run failed and appears in result', async () => {
  await withStore(async (store) => {
    const hermes = new FakeHermes()
    hermes.scoutHandler = () => 'not json'

    const result = await runNewsScoutForSourceUrl({
      store,
      hermes,
      source,
      sourceUrl,
      options: { now },
    })

    assert.equal(result.status, 'failed')
    assert.equal(result.jsonValidationFailures, 1)
    assert.equal(result.failures[0].stage, 'scout')
    assert.match(result.failures[0].error, /JSON object/)
  })
})

test('valid failed Scout responses are recorded and counted as failed runs', async () => {
  await withStore(async (store) => {
    const statuses: Array<{ status?: string; error?: string | null }> = []
    const markSourceRun = store.markSourceRun.bind(store)
    store.markSourceRun = async (input) => {
      statuses.push({ status: input.status, error: input.error })
      await markSourceRun(input)
    }
    const hermes = new FakeHermes()
    hermes.scoutHandler = (request) => JSON.stringify(scoutResponse(request, []))
    const priorHandler = hermes.scoutHandler
    hermes.scoutHandler = (request) => JSON.stringify({
      ...JSON.parse(priorHandler(request)),
      status: 'failed',
      errors: ['Cloudflare blocked every allowed access method.'],
    })

    const result = await runNewsScoutForSourceUrl({
      store,
      hermes,
      source,
      sourceUrl,
      options: { now },
    })

    assert.equal(result.status, 'failed')
    assert.equal(result.jsonValidationFailures, 0)
    assert.equal(result.candidateObservationsInserted, 0)
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0].error, /Cloudflare blocked/)
    assert.equal(statuses.at(-1)?.status, 'failed_transient')
    assert.match(statuses.at(-1)?.error ?? '', /Cloudflare blocked/)
  })
})

test('partial Scout responses process the candidates they contain', async () => {
  await withStore(async (store) => {
    const hermes = new FakeHermes()
    hermes.scoutHandler = (request) => JSON.stringify({
      ...scoutResponse(request, [candidate()]),
      status: 'partial',
      errors: ['One page section was unavailable.'],
    })

    const result = await runNewsScoutForSourceUrl({
      store,
      hermes,
      source,
      sourceUrl,
      options: { now },
    })

    assert.equal(result.status, 'succeeded')
    assert.equal(result.candidatesFound, 1)
    assert.equal(result.candidateObservationsInserted, 1)
  })
})

test('pending research candidates are processed into research results and marked researched', async () => {
  await withStore(async (store) => {
    const [storedCandidate] = await store.insertCandidateObservations([observationInput(candidate())])
    const hermes = new FakeHermes()

    const result = await runPendingNewsResearch({
      store,
      hermes,
      options: { now, batchSize: 10 },
    })

    assert.equal(result.researchCandidatesFetched, 1)
    assert.equal(result.researchSucceeded, 1)
    assert.equal(result.researchResultsInserted, 1)
    const pendingResults = await store.fetchPendingResearchResults(10)
    assert.equal(pendingResults.length, 1)
    assert.equal(pendingResults[0].candidate.id, storedCandidate.id)
    assert.equal(pendingResults[0].candidate.status, 'researched')
  })
})

test('non-ready research responses are stored but not queued for entity handoff', async () => {
  await withStore(async (store) => {
    const [storedCandidate] = await store.insertCandidateObservations([observationInput(candidate())])
    const hermes = new FakeHermes()
    hermes.researchHandler = (request) => JSON.stringify({
      ...researchResponse(request),
      status: 'needs_followup',
      research_summary: {
        one_liner: 'Checked article context but needs followup.',
        what_was_checked: ['Article page'],
        requires_followup: true,
        followup_reason: 'Original filing not yet available.',
      },
      open_questions: ['Need original filing.'],
    })

    const result = await runPendingNewsResearch({
      store,
      hermes,
      options: { now, batchSize: 10 },
    })

    assert.equal(result.researchCandidatesFetched, 1)
    assert.equal(result.researchSucceeded, 1)
    assert.equal(result.researchResultsInserted, 1)
    assert.deepEqual(await store.fetchPendingResearchResults(10), [])
    assert.equal((await store.fetchCandidateObservation(storedCandidate.id))?.status, 'researched')
  })
})

test('research parse failure does not insert a research result', async () => {
  await withStore(async (store) => {
    const [storedCandidate] = await store.insertCandidateObservations([observationInput(candidate())])
    const hermes = new FakeHermes()
    hermes.researchHandler = () => 'not json'

    const result = await runPendingNewsResearch({
      store,
      hermes,
      options: { now, batchSize: 10 },
    })

    assert.equal(result.researchFailed, 1)
    assert.equal(result.jsonValidationFailures, 1)
    assert.deepEqual(await store.fetchPendingResearchResults(10), [])
    const failedCandidate = await store.fetchCandidateObservation(storedCandidate.id)
    assert.equal(failedCandidate?.status, 'failed_research')
    assert.equal(failedCandidate?.researchWorkerStatus, 'succeeded')
    assert.match(failedCandidate?.researchError ?? '', /JSON object/)
    assert.equal(failedCandidate?.researchRawResponse, 'not json')
    assert.equal(failedCandidate?.lastResearchJobId?.startsWith(`news_research_${storedCandidate.id}_`), true)
  })
})

test('recoverStaleNewsWork resets old running source runs and researching candidates', async () => {
  await withStore(async (store) => {
    await store.createSourceRun({
      jobId: 'runner-stale-source',
      source,
      sourceUrl,
      status: 'running',
      startedAt: now.toISOString(),
    })
    const [storedCandidate] = await store.insertCandidateObservations([observationInput(candidate())])
    await store.markCandidateResearchStarted(storedCandidate.id, 'runner-stale-research')

    const recovered = await recoverStaleNewsWork(store, {
      now: new Date('2100-01-01T00:00:00.000Z'),
      staleWorkCutoffMs: 1,
    })

    assert.equal(recovered.sourceRunsRecovered, 1)
    assert.equal(recovered.candidatesRecovered, 1)
    const candidateAfterRecovery = await store.fetchCandidateObservation(storedCandidate.id)
    assert.equal(candidateAfterRecovery?.status, 'pending_research')
    assert.match(candidateAfterRecovery?.researchError ?? '', /Recovered stale researching candidate/)
  })
})

test('top-level runner returns aggregate counters and stops before downstream stages', async () => {
  await withStore(async (store) => {
    const hermes = new FakeHermes()
    hermes.scoutHandler = (request) => JSON.stringify(scoutResponse(request, [
      candidate({ headline: 'First article', article_url: 'https://www.coindesk.com/a' }),
      candidate({ headline: 'Second article', article_url: 'https://www.coindesk.com/b' }),
    ]))

    const result = await runNewsPipelineOnce({
      store,
      hermes,
      sources: [source],
      options: { now, batchSize: 10 },
    })

    assert.equal(result.sourcesChecked, 1)
    assert.equal(result.sourceUrlsChecked, 1)
    assert.equal(result.scoutSucceeded, 1)
    assert.equal(result.candidatesFound, 2)
    assert.equal(result.candidatesNew, 2)
    assert.equal(result.candidateObservationsInserted, 2)
    assert.equal(result.researchCandidatesFetched, 2)
    assert.equal(result.researchSucceeded, 2)
    assert.equal(result.researchResultsInserted, 2)
    assert.equal(result.failures.length, 0)
    assert.deepEqual(hermes.calls.map((call) => call.taskType), [
      'source_scout',
      'source_aware_research',
      'source_aware_research',
    ])
  })
})

test('top-level runner scouts every active configured URL once in configuration order', async () => {
  await withStore(async (store) => {
    const hermes = new FakeHermes()
    hermes.scoutHandler = (request) => JSON.stringify(scoutResponse(request, [candidate({
      headline: `${request.source.name} article`,
      article_url: `${request.source_url.url.replace(/\/$/, '')}/test-article`,
    })]))

    const result = await runNewsPipelineOnce({
      store,
      hermes,
      options: { now, batchSize: 5 },
    })
    const scoutRequests = hermes.calls
      .filter((call) => call.taskType === 'source_scout')
      .map((call) => extractRequest(call.prompt) as NewsScoutRequest)

    assert.equal(result.sourcesChecked, 5)
    assert.equal(result.sourceUrlsChecked, 5)
    assert.equal(result.scoutRuns, 5)
    assert.equal(result.scoutSucceeded, 5)
    assert.deepEqual(scoutRequests.map((item) => [
      item.source.source_id,
      item.source_url.url_id,
    ]), [
      ['coindesk', 'latest_crypto_news'],
      ['theblock', 'news'],
      ['decrypt', 'editors_picks'],
      ['unchained', 'news'],
      ['thedefiant', 'homepage'],
    ])
    assert.deepEqual(hermes.calls.map((call) => call.taskType), [
      'source_scout',
      'source_scout',
      'source_scout',
      'source_scout',
      'source_scout',
      'source_aware_research',
      'source_aware_research',
      'source_aware_research',
      'source_aware_research',
      'source_aware_research',
    ])
  })
})

test('pending research uses the default five-item batch when options are omitted', async () => {
  await withStore(async (store) => {
    await store.insertCandidateObservations(Array.from({ length: 6 }, (_, index) => (
      observationInput(candidate({
        headline: `Article ${index + 1}`,
        article_url: `https://www.coindesk.com/article-${index + 1}`,
      }))
    )))
    const hermes = new FakeHermes()

    const result = await runPendingNewsResearch({ store, hermes })

    assert.equal(result.researchCandidatesFetched, 5)
    assert.equal(result.researchProcessed, 5)
    assert.equal(result.researchSucceeded, 5)
    assert.equal((await store.fetchPendingCandidateObservations(10)).length, 1)
  })
})
