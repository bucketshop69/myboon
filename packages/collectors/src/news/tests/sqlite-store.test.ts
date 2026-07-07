import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DEFAULT_NEWS_SOURCES } from '../config'
import { fingerprintScoutCandidate } from '../fingerprint'
import { SqliteNewsStore, __newsSqliteTesting } from '../sqlite-store'
import type { NewsCandidateObservationInput, NewsCandidateObservationRow } from '../store'
import type { NewsDedupeOutcome, NewsResearchResponse, NewsScoutCandidate } from '../types'

const source = DEFAULT_NEWS_SOURCES[0]
const sourceUrl = source.urls[0]
const observedAt = '2026-07-04T12:00:00.000Z'

function candidate(overrides: Partial<NewsScoutCandidate> = {}): NewsScoutCandidate {
  return {
    headline: 'CoinDesk observes BTC treasury flows',
    article_url: 'https://www.coindesk.com/markets/2026/07/04/btc-treasury-flows?utm_source=x',
    summary: 'Observed article summary.',
    published_at: '2026-07-04T11:00:00.000Z',
    author: 'CoinDesk Staff',
    evidence: ['visible article card'],
    ...overrides,
  }
}

function observationInput(
  overrides: {
    sourceRunId?: string | null
    candidate?: NewsScoutCandidate
    sourceId?: string
    outcome?: NewsDedupeOutcome
    urlId?: string
  } = {}
): NewsCandidateObservationInput {
  const inputCandidate = overrides.candidate ?? candidate()
  const inputSource = overrides.sourceId ? { ...source, sourceId: overrides.sourceId } : source
  const inputSourceUrl = overrides.urlId ? { ...sourceUrl, urlId: overrides.urlId } : sourceUrl
  return {
    sourceRunId: overrides.sourceRunId ?? null,
    source: inputSource,
    sourceUrl: inputSourceUrl,
    candidate: inputCandidate,
    fingerprint: fingerprintScoutCandidate(inputSource.sourceId, inputSourceUrl.urlId, inputCandidate),
    dedupeOutcome: overrides.outcome ?? 'new_candidate',
    observedAt,
  }
}

function researchResponse(
  storedCandidate: NewsCandidateObservationRow,
  overrides: Partial<NewsResearchResponse> = {}
): NewsResearchResponse {
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
      one_liner: 'Research summary.',
      what_was_checked: ['Article', 'Evidence'],
      requires_followup: false,
    },
    article_claims: [{ claim_id: 'claim_1', claim: 'Article claim.' }],
    verified_facts: [{ fact: 'Verified fact.', evidence_refs: ['evidence_1'] }],
    unresolved_claims: [],
    entity_hints: [{ name: 'CoinDesk', source: 'article' }],
    evidence: [{
      evidence_id: 'evidence_1',
      title: 'Evidence',
      url: 'https://example.com/evidence',
    }],
    open_questions: [],
    limitations: [],
    errors: [],
    ...overrides,
  }
}

function withStore(fn: (store: SqliteNewsStore) => Promise<void> | void): Promise<void> {
  const store = new SqliteNewsStore(':memory:')
  return Promise.resolve()
    .then(() => fn(store))
    .finally(() => store.close())
}

test('news SQLite schema creates source run, candidate observation, and research result tables', () => {
  const db = __newsSqliteTesting.openNewsSqlite(':memory:')
  try {
    __newsSqliteTesting.ensureNewsSqliteSchema(db)
    const rows = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>

    assert.deepEqual(rows.map((row) => row.name), [
      'news_candidate_observations',
      'news_research_results',
      'news_source_runs',
    ])

    const candidateColumns = db.prepare('PRAGMA table_info(news_candidate_observations)').all() as Array<{ name: string }>
    assert.equal(candidateColumns.some((row) => row.name === 'last_research_job_id'), true)
    assert.equal(candidateColumns.some((row) => row.name === 'research_worker_status'), true)
    assert.equal(candidateColumns.some((row) => row.name === 'research_error'), true)
    assert.equal(candidateColumns.some((row) => row.name === 'research_raw_response'), true)
    assert.equal(candidateColumns.some((row) => row.name === 'research_stderr'), true)
  } finally {
    db.close()
  }
})

test('default SQLite path is stable under the collectors package', () => {
  assert.match(
    __newsSqliteTesting.sqlitePath(),
    /packages\/collectors\/\.data\/news\.sqlite$/
  )
})

test('insertResearchResult persists a validated response and marks candidate researched', async () => {
  await withStore(async (store) => {
    const [storedCandidate] = await store.insertCandidateObservations([observationInput()])
    const row = await store.insertResearchResult({
      candidate: storedCandidate,
      response: researchResponse(storedCandidate),
      researchedAt: '2026-07-04T13:00:00.000Z',
    })

    assert.equal(row.candidateObservationId, storedCandidate.id)
    assert.equal(row.researchJobId, `research-${storedCandidate.id}`)
    assert.equal(row.status, 'pending_entity_memory')
    assert.equal(row.responseStatus, 'ready_for_entity_memory')
    assert.equal(row.researchSummary.one_liner, 'Research summary.')
    assert.equal(row.evidence[0].url, 'https://example.com/evidence')

    const pending = await store.fetchPendingResearchResults(10)
    assert.equal(pending.length, 1)
    assert.equal(pending[0].result.id, row.id)
    assert.equal(pending[0].candidate.id, storedCandidate.id)
    assert.equal(pending[0].candidate.status, 'researched')
  })
})

test('insertResearchResult stores non-ready responses without pending entity handoff', async () => {
  await withStore(async (store) => {
    const needsFollowupInput = observationInput({
      candidate: candidate({ article_url: 'https://www.coindesk.com/needs-followup' }),
    })
    const failedInput = observationInput({
      candidate: candidate({ article_url: 'https://www.coindesk.com/failed-research' }),
    })
    const [needsFollowupCandidate, failedCandidate] = await store.insertCandidateObservations([
      needsFollowupInput,
      failedInput,
    ])

    const needsFollowup = await store.insertResearchResult({
      candidate: needsFollowupCandidate,
      response: researchResponse(needsFollowupCandidate, {
        status: 'needs_followup',
        research_summary: {
          one_liner: 'Research needs followup.',
          what_was_checked: ['Article'],
          requires_followup: true,
        },
        open_questions: ['Need original filing.'],
      }),
      researchedAt: '2026-07-04T13:00:00.000Z',
    })
    const failed = await store.insertResearchResult({
      candidate: failedCandidate,
      response: researchResponse(failedCandidate, {
        status: 'failed',
        research_summary: {
          one_liner: 'Research failed cleanly.',
          what_was_checked: ['Article'],
          requires_followup: true,
        },
        errors: ['Article unavailable.'],
      }),
      researchedAt: '2026-07-04T13:05:00.000Z',
    })

    assert.equal(needsFollowup.status, 'not_ready_for_entity_memory')
    assert.equal(failed.status, 'not_ready_for_entity_memory')
    assert.equal((await store.fetchResearchResult(needsFollowup.id))?.responseStatus, 'needs_followup')
    assert.equal((await store.fetchResearchResult(failed.id))?.responseStatus, 'failed')
    assert.deepEqual(await store.fetchPendingResearchResults(10), [])
  })
})

test('fetchPendingResearchResults reconciles legacy pending non-ready rows', async () => {
  await withStore(async (store) => {
    const [storedCandidate] = await store.insertCandidateObservations([
      observationInput({ candidate: candidate({ article_url: 'https://www.coindesk.com/legacy-needs-followup' }) }),
    ])
    const row = await store.insertResearchResult({
      candidate: storedCandidate,
      response: researchResponse(storedCandidate, {
        status: 'needs_followup',
        research_summary: {
          one_liner: 'Legacy pending row needs followup.',
          what_was_checked: ['Article'],
          requires_followup: true,
        },
      }),
      researchedAt: '2026-07-04T13:00:00.000Z',
      status: 'pending_entity_memory',
    })

    assert.equal(row.status, 'pending_entity_memory')
    assert.deepEqual(await store.fetchPendingResearchResults(10), [])
    assert.equal((await store.fetchResearchResult(row.id))?.status, 'not_ready_for_entity_memory')
  })
})

test('duplicate research result inserts are idempotent by candidate and research job', async () => {
  await withStore(async (store) => {
    const [storedCandidate] = await store.insertCandidateObservations([observationInput()])
    const response = researchResponse(storedCandidate)
    const first = await store.insertResearchResult({
      candidate: storedCandidate,
      response,
      researchedAt: '2026-07-04T13:00:00.000Z',
    })
    const second = await store.insertResearchResult({
      candidate: storedCandidate,
      response,
      researchedAt: '2026-07-04T13:05:00.000Z',
    })

    assert.equal(second.id, first.id)
    assert.equal(second.candidateObservationId, first.candidateObservationId)
    assert.equal(second.researchJobId, first.researchJobId)
  })
})

test('recordCandidateResearchFailure stores debug metadata for failed attempts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'news-sqlite-'))
  const path = join(dir, 'news.sqlite')
  const store = new SqliteNewsStore(path)
  try {
    const [storedCandidate] = await store.insertCandidateObservations([observationInput()])
    await store.markCandidateResearchStarted(storedCandidate.id, 'research-job-1')
    await store.recordCandidateResearchFailure({
      id: storedCandidate.id,
      jobId: 'research-job-1',
      workerStatus: 'failed',
      error: 'Research response did not contain a JSON object',
      rawResponse: 'not json',
      stderr: 'browser failed',
    })
    store.close()

    const db = __newsSqliteTesting.openNewsSqlite(path)
    try {
      const row = db.prepare('SELECT * FROM news_candidate_observations WHERE id = ?')
        .get(storedCandidate.id) as Record<string, unknown>
      assert.equal(row.status, 'failed_research')
      assert.equal(row.last_research_job_id, 'research-job-1')
      assert.equal(row.research_worker_status, 'failed')
      assert.equal(row.research_error, 'Research response did not contain a JSON object')
      assert.equal(row.research_raw_response, 'not json')
      assert.equal(row.research_stderr, 'browser failed')
    } finally {
      db.close()
    }
  } finally {
    try {
      store.close()
    } catch {
      // Store may already be closed for inspection.
    }
    await rm(dir, { recursive: true, force: true })
  }
})

test('recoverStaleWork marks old running source runs failed and resets old researching candidates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'news-sqlite-'))
  const path = join(dir, 'news.sqlite')
  const store = new SqliteNewsStore(path)
  try {
    const sourceRun = await store.createSourceRun({
      jobId: 'stale-source-run',
      source,
      sourceUrl,
      status: 'running',
      startedAt: '2026-07-04T10:00:00.000Z',
    })
    const [storedCandidate] = await store.insertCandidateObservations([observationInput()])
    await store.markCandidateResearchStarted(storedCandidate.id, 'research-job-stale')
    store.close()

    const db = __newsSqliteTesting.openNewsSqlite(path)
    try {
      db.prepare('UPDATE news_source_runs SET updated_at = ? WHERE id = ?')
        .run('2026-07-04T10:00:00.000Z', sourceRun.id)
      db.prepare('UPDATE news_candidate_observations SET updated_at = ? WHERE id = ?')
        .run('2026-07-04T10:00:00.000Z', storedCandidate.id)
    } finally {
      db.close()
    }

    const recoveringStore = new SqliteNewsStore(path)
    try {
      const recovered = await recoveringStore.recoverStaleWork({
        sourceRunCutoffIso: '2026-07-04T11:00:00.000Z',
        candidateCutoffIso: '2026-07-04T11:00:00.000Z',
      })
      assert.equal(recovered.sourceRunsRecovered, 1)
      assert.equal(recovered.candidatesRecovered, 1)
    } finally {
      recoveringStore.close()
    }

    const inspected = __newsSqliteTesting.openNewsSqlite(path)
    try {
      const runRow = inspected.prepare('SELECT * FROM news_source_runs WHERE id = ?')
        .get(sourceRun.id) as Record<string, unknown>
      const candidateRow = inspected.prepare('SELECT * FROM news_candidate_observations WHERE id = ?')
        .get(storedCandidate.id) as Record<string, unknown>
      assert.equal(runRow.status, 'failed_transient')
      assert.match(String(runRow.error), /Recovered stale running source run/)
      assert.equal(candidateRow.status, 'pending_research')
      assert.match(String(candidateRow.research_error), /Recovered stale researching candidate/)
    } finally {
      inspected.close()
    }
  } finally {
    try {
      store.close()
    } catch {
      // Store may already be closed for inspection.
    }
    await rm(dir, { recursive: true, force: true })
  }
})

test('fetchResearchResult and markResearchResultStatus work for pending entity memory rows', async () => {
  await withStore(async (store) => {
    const [storedCandidate] = await store.insertCandidateObservations([observationInput()])
    const row = await store.insertResearchResult({
      candidate: storedCandidate,
      response: researchResponse(storedCandidate),
      researchedAt: '2026-07-04T13:00:00.000Z',
    })

    const fetched = await store.fetchResearchResult(row.id)
    assert.equal(fetched?.id, row.id)

    await store.markResearchResultStatus(row.id, 'handed_to_entity_memory')
    const handedOff = await store.fetchResearchResult(row.id)
    assert.equal(handedOff?.status, 'handed_to_entity_memory')
    assert.equal((await store.fetchCandidateObservation(storedCandidate.id))?.status, 'handed_to_entity_memory')

    await store.markResearchResultStatus(row.id, 'failed_entity_memory')
    const failed = await store.fetchResearchResult(row.id)
    assert.equal(failed?.status, 'failed_entity_memory')
    assert.deepEqual(await store.fetchPendingResearchResults(10), [])
  })
})

test('createSourceRun creates a source URL run', async () => {
  await withStore(async (store) => {
    const run = await store.createSourceRun({
      jobId: 'job-create-run',
      source,
      sourceUrl,
      status: 'running',
      startedAt: observedAt,
    })

    assert.equal(run.jobId, 'job-create-run')
    assert.equal(run.sourceId, 'coindesk')
    assert.equal(run.urlId, 'latest_crypto_news')
    assert.equal(run.status, 'running')
    assert.equal(run.startedAt, observedAt)
  })
})

test('markSourceRun updates status, counters, and JSON payload fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'news-sqlite-'))
  const path = join(dir, 'news.sqlite')
  const store = new SqliteNewsStore(path)
  try {
    const run = await store.createSourceRun({
      jobId: 'job-mark-run',
      source,
      sourceUrl,
    })

    await store.markSourceRun({
      id: run.id,
      status: 'candidates_classified',
      observedAt,
      finishedAt: observedAt,
      counters: {
        candidatesFound: 4,
        candidatesNew: 1,
        candidatesUnchanged: 1,
        candidatesMateriallyChanged: 1,
        candidatesInvalid: 1,
      },
      rawResponse: { raw: true },
      validatedPayload: { schema_version: 'myboon.hermes.scout_response.v1', candidates: [] },
    })

    store.close()

    const db = __newsSqliteTesting.openNewsSqlite(path)
    try {
      const row = db.prepare('SELECT * FROM news_source_runs WHERE id = ?').get(run.id) as Record<string, unknown>

      assert.equal(row.status, 'candidates_classified')
      assert.equal(row.candidates_found, 4)
      assert.equal(row.candidates_new, 1)
      assert.equal(row.candidates_unchanged, 1)
      assert.equal(row.candidates_materially_changed, 1)
      assert.equal(row.candidates_invalid, 1)
      assert.deepEqual(JSON.parse(String(row.raw_response)), { raw: true })
      assert.deepEqual(JSON.parse(String(row.validated_payload)), {
        schema_version: 'myboon.hermes.scout_response.v1',
        candidates: [],
      })
    } finally {
      db.close()
    }
  } finally {
    try {
      store.close()
    } catch {
      // Store may already be closed for inspection.
    }
    await rm(dir, { recursive: true, force: true })
  }
})

test('insertCandidateObservations inserts new_candidate rows', async () => {
  await withStore(async (store) => {
    const run = await store.createSourceRun({
      jobId: 'job-insert-new',
      source,
      sourceUrl,
    })

    const rows = await store.insertCandidateObservations([
      observationInput({ sourceRunId: run.id, outcome: 'new_candidate' }),
    ])

    assert.equal(rows.length, 1)
    assert.equal(rows[0].sourceRunId, run.id)
    assert.equal(rows[0].dedupeOutcome, 'new_candidate')
    assert.equal(rows[0].rawCandidate.headline, 'CoinDesk observes BTC treasury flows')
  })
})

test('insertCandidateObservations inserts known_materially_changed rows', async () => {
  await withStore(async (store) => {
    const rows = await store.insertCandidateObservations([
      observationInput({
        outcome: 'known_materially_changed',
        candidate: candidate({ headline: 'CoinDesk updates BTC treasury flows' }),
      }),
    ])

    assert.equal(rows.length, 1)
    assert.equal(rows[0].dedupeOutcome, 'known_materially_changed')
    assert.equal(rows[0].headline, 'CoinDesk updates BTC treasury flows')
  })
})

test('duplicate observation_dedupe_key inserts are idempotent', async () => {
  await withStore(async (store) => {
    const input = observationInput()
    const first = await store.insertCandidateObservations([input])
    const second = await store.insertCandidateObservations([input])

    assert.equal(first.length, 1)
    assert.equal(second.length, 1)
    assert.equal(second[0].id, first[0].id)
    assert.equal(second[0].observationDedupeKey, first[0].observationDedupeKey)
  })
})

test('fetchPriorObservations returns only same-source matching canonical URLs', async () => {
  await withStore(async (store) => {
    const sameSourceInput = observationInput()
    const otherSourceInput = observationInput({ sourceId: 'other_source' })
    await store.insertCandidateObservations([sameSourceInput, otherSourceInput])

    const rows = await store.fetchPriorObservations(source.sourceId, [
      sameSourceInput.fingerprint.canonicalArticleUrl,
    ])

    assert.equal(rows.length, 1)
    assert.equal(rows[0].sourceId, source.sourceId)
    assert.equal(rows[0].canonicalArticleUrl, sameSourceInput.fingerprint.canonicalArticleUrl)
  })
})

test('known_unchanged and ignored_invalid_candidate inputs are not inserted as candidate observations', async () => {
  await withStore(async (store) => {
    const rows = await store.insertCandidateObservations([
      observationInput({ outcome: 'known_unchanged' }),
      observationInput({
        outcome: 'ignored_invalid_candidate',
        candidate: candidate({ article_url: 'https://www.coindesk.com/other-article' }),
      }),
    ])
    const prior = await store.fetchPriorObservations(source.sourceId, [
      observationInput().fingerprint.canonicalArticleUrl,
      fingerprintScoutCandidate(source.sourceId, sourceUrl.urlId, candidate({
        article_url: 'https://www.coindesk.com/other-article',
      })).canonicalArticleUrl,
    ])

    assert.deepEqual(rows, [])
    assert.deepEqual(prior, [])
  })
})
