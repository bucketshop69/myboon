import { beforeAll, describe, expect, it } from 'vitest';

import { parseSingleTransaction, parseSwapTransaction } from '../parsers/index.js';
import { fetchTransactionBySignature } from '../rpc.js';
import { ensureTestEnv, TEST_SIGNATURES } from './fixtures.js';

describe('parseSwapTransaction (integration)', () => {
  beforeAll(() => {
    ensureTestEnv();
  });

  it('returns null for non-jupiter transfer tx', async () => {
    const tx = await fetchTransactionBySignature(TEST_SIGNATURES.TRANSFER);
    expect(tx).not.toBeNull();

    const details = parseSwapTransaction(tx!, 'jupiter');
    expect(details).toBeNull();
  });

  it('returns null for meteora tx', async () => {
    const tx = await fetchTransactionBySignature(TEST_SIGNATURES.LP_METEORA);
    expect(tx).not.toBeNull();

    const details = parseSwapTransaction(tx!, 'jupiter');
    expect(details).toBeNull();
  });
});

describe('parseSingleTransaction swap path (integration)', () => {
  beforeAll(() => {
    ensureTestEnv();
  });

  it('keeps generic details for known non-swap signature', async () => {
    const tx = await fetchTransactionBySignature(TEST_SIGNATURES.UNKNOWN);
    expect(tx).not.toBeNull();

    const parsed = parseSingleTransaction(tx!, TEST_SIGNATURES.UNKNOWN);
    expect(parsed.details.kind).toBe('generic');
  });
});
