import { beforeAll, describe, expect, it } from 'vitest';

import { fetchTransactionBySignature } from '../rpc.js';
import { identifyTransactionType, parseSingleTransaction } from '../parsers/index.js';
import { ensureTestEnv, TEST_SIGNATURES } from './fixtures.js';

describe('identifyTransactionType (integration)', () => {
  beforeAll(() => {
    ensureTestEnv();
  });

  it('identifies transfer signature', async () => {
    const tx = await fetchTransactionBySignature(TEST_SIGNATURES.TRANSFER);
    expect(tx).not.toBeNull();

    const result = identifyTransactionType(tx!);
    expect(result).toEqual({ type: 'transfer', protocol: 'spl-token' });
  });

  it('identifies meteora signature', async () => {
    const tx = await fetchTransactionBySignature(TEST_SIGNATURES.LP_METEORA);
    expect(tx).not.toBeNull();

    const result = identifyTransactionType(tx!);
    expect(result).toEqual({ type: 'lp', protocol: 'meteora-dlmm' });
  });

  it('identifies unknown signature as unknown', async () => {
    const tx = await fetchTransactionBySignature(TEST_SIGNATURES.UNKNOWN);
    expect(tx).not.toBeNull();

    const result = identifyTransactionType(tx!);
    expect(result).toEqual({ type: 'unknown', protocol: 'unknown' });
  });
});

describe('parseSingleTransaction (integration)', () => {
  beforeAll(() => {
    ensureTestEnv();
  });

  it('returns parsed transfer with generic details', async () => {
    const tx = await fetchTransactionBySignature(TEST_SIGNATURES.TRANSFER);
    expect(tx).not.toBeNull();

    const result = parseSingleTransaction(tx!, TEST_SIGNATURES.TRANSFER);

    expect(result.signature).toBe(TEST_SIGNATURES.TRANSFER);
    expect(result.type).toBe('transfer');
    expect(result.protocol).toBe('spl-token');
    expect(result.details.kind).toBe('generic');
  });
});
