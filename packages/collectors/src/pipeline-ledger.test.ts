import assert from 'node:assert/strict'
import test from 'node:test'
import {
  boundError,
  compactCounts,
  type PipelineLedgerStore,
  type PipelineRunFinishInput,
  type PipelineRunStartInput,
  withPipelineRun,
} from './pipeline-ledger'

class InMemoryLedgerStore implements PipelineLedgerStore {
  starts: PipelineRunStartInput[] = []
  finishes: Array<{ id: string } & PipelineRunFinishInput> = []

  async startRun(input: PipelineRunStartInput) {
    this.starts.push(input)
    return { id: `run-${this.starts.length}` }
  }

  async finishRun(id: string, input: PipelineRunFinishInput): Promise<void> {
    this.finishes.push({ id, ...input })
  }
}

test('compactCounts keeps only top-level numeric and boolean fields', () => {
  assert.deepEqual(compactCounts({
    fetched: 10,
    dryRun: false,
    observedAt: '2026-07-06T00:00:00.000Z',
    rows: [{ id: 'row-1' }],
    nested: { count: 1 },
  }), {
    fetched: 10,
    dryRun: false,
  })
})

test('withPipelineRun writes running and succeeded ledger rows with compact counts', async () => {
  const store = new InMemoryLedgerStore()
  const result = await withPipelineRun(
    store,
    { source: 'polymarket', sourceArea: 'markets', stage: 'polymarket.researcher' },
    async () => ({ pendingFetched: 4, researchRowsWritten: 2, rows: [{ id: 'heavy-row' }] })
  )

  assert.equal(result.researchRowsWritten, 2)
  assert.deepEqual(store.starts, [{
    source: 'polymarket',
    sourceArea: 'markets',
    stage: 'polymarket.researcher',
  }])
  assert.deepEqual(store.finishes, [{
    id: 'run-1',
    status: 'succeeded',
    counts: {
      pendingFetched: 4,
      researchRowsWritten: 2,
    },
  }])
})

test('withPipelineRun writes failed ledger row and rethrows', async () => {
  const store = new InMemoryLedgerStore()
  await assert.rejects(
    withPipelineRun(
      store,
      { source: 'feed', stage: 'publisher' },
      async () => {
        throw new Error('publisher exploded')
      }
    ),
    /publisher exploded/
  )

  assert.deepEqual(store.finishes, [{
    id: 'run-1',
    status: 'failed',
    error: 'publisher exploded',
  }])
})

test('boundError clips long messages', () => {
  const error = boundError(`x${'a'.repeat(20)}`, 10)
  assert.equal(error, 'xaaaaaa...')
})
