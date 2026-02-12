import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransactionBatcher } from '../stream/batcher.js';

describe('TransactionBatcher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits batch when batch size is reached', () => {
    const batches: string[][] = [];
    const batcher = new TransactionBatcher(
      { batchSize: 3, flushIntervalMs: 60_000 },
      (batch) => batches.push(batch)
    );

    batcher.add('tx1');
    batcher.add('tx2');
    expect(batches.length).toBe(0);

    batcher.add('tx3');
    expect(batches.length).toBe(1);
    expect(batches[0]).toEqual(['tx1', 'tx2', 'tx3']);
  });

  it('flushes partial batch on stop', () => {
    const batches: string[][] = [];
    const batcher = new TransactionBatcher(
      { batchSize: 10, flushIntervalMs: 60_000 },
      (batch) => batches.push(batch)
    );

    batcher.add('tx1');
    batcher.add('tx2');
    batcher.stop();

    expect(batches.length).toBe(1);
    expect(batches[0]).toEqual(['tx1', 'tx2']);
  });

  it('flushes partial batch when interval elapses', () => {
    vi.useFakeTimers();

    const batches: string[][] = [];
    const batcher = new TransactionBatcher(
      { batchSize: 10, flushIntervalMs: 1000 },
      (batch) => batches.push(batch)
    );

    batcher.add('tx1');
    expect(batches.length).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(batches.length).toBe(1);
    expect(batches[0]).toEqual(['tx1']);
  });
});
