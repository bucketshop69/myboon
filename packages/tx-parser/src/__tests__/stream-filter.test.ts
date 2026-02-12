import { describe, expect, it } from 'vitest';

import { isRelevantTransaction } from '../stream/filter.js';
import type { ParsedTransaction, TransactionType } from '../types/index.js';

function createMockTransaction(type: TransactionType): ParsedTransaction {
  if (type === 'buy') {
    return {
      type: 'buy',
      protocol: 'jupiter',
      timestamp: 1_700_000_000,
      signature: 'buy-signature',
      details: {
        kind: 'buy',
        dex: 'jupiter',
        fundingToken: { mint: 'So11111111111111111111111111111111111111112', isKnown: true },
        targetToken: { mint: 'target-mint', isKnown: false, needsResearch: true },
        fundingAmount: '1',
        targetAmount: '100',
        direction: 'buy',
        feeAmount: '5000'
      }
    };
  }

  if (type === 'sell') {
    return {
      type: 'sell',
      protocol: 'jupiter',
      timestamp: 1_700_000_000,
      signature: 'sell-signature',
      details: {
        kind: 'sell',
        dex: 'jupiter',
        fundingToken: { mint: 'So11111111111111111111111111111111111111112', isKnown: true },
        targetToken: { mint: 'target-mint', isKnown: false, needsResearch: true },
        fundingAmount: '1',
        targetAmount: '100',
        direction: 'sell',
        feeAmount: '5000'
      }
    };
  }

  if (type === 'lp') {
    return {
      type: 'lp',
      protocol: 'meteora-dlmm',
      timestamp: 1_700_000_000,
      signature: 'lp-signature',
      details: {
        kind: 'generic',
        instructionCount: 1,
        fee: 5000,
        hasError: false,
        preTokenBalanceCount: 1,
        postTokenBalanceCount: 1
      }
    };
  }

  return {
    type: type as 'swap' | 'transfer' | 'unknown',
    protocol: type === 'transfer' ? 'spl-token' : type === 'swap' ? 'jupiter' : 'unknown',
    timestamp: 1_700_000_000,
    signature: `${type}-signature`,
    details:
      type === 'swap'
        ? {
            kind: 'swap',
            dex: 'jupiter',
            inputMint: 'in',
            outputMint: 'out',
            inputAmount: '1',
            outputAmount: '2',
            feeAmount: '5000',
            feeMint: null
          }
        : {
            kind: 'generic',
            instructionCount: 1,
            fee: 5000,
            hasError: false,
            preTokenBalanceCount: 1,
            postTokenBalanceCount: 1
          }
  } as ParsedTransaction;
}

describe('isRelevantTransaction', () => {
  it('allows buy and sell transactions', () => {
    expect(isRelevantTransaction(createMockTransaction('buy'))).toBe(true);
    expect(isRelevantTransaction(createMockTransaction('sell'))).toBe(true);
  });

  it('allows lp transactions', () => {
    expect(isRelevantTransaction(createMockTransaction('lp'))).toBe(true);
  });

  it('filters out transfer and unknown transactions', () => {
    expect(isRelevantTransaction(createMockTransaction('transfer'))).toBe(false);
    expect(isRelevantTransaction(createMockTransaction('unknown'))).toBe(false);
  });
});
