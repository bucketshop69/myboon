import { describe, expect, it } from 'vitest';

import { formatTransactionForLLM } from '../stream/formatter.js';
import type { ParsedBuyTransaction, ParsedLpTransaction, ParsedSellTransaction } from '../types/index.js';

const wallet = '7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C';

describe('formatTransactionForLLM', () => {
  it('formats buy transaction with natural-language verb and research flag', () => {
    const transaction: ParsedBuyTransaction = {
      type: 'buy',
      protocol: 'jupiter',
      timestamp: 1_700_000_000,
      signature: '4zmtrBKRTtW7rQ21qs1zSwMdZkpTMn2RbR5fzKEUajQWU4hXFTcRN85beozH6z2bJg4i7dsp3sH8rPeaLvVxXuiD',
      details: {
        kind: 'buy',
        dex: 'jupiter',
        fundingToken: { mint: 'So11111111111111111111111111111111111111112', isKnown: true },
        targetToken: { mint: 'XYZabc1234567890', isKnown: false, needsResearch: true },
        fundingAmount: '2.5',
        targetAmount: '50000',
        direction: 'buy',
        feeAmount: '5000'
      }
    };

    const summary = formatTransactionForLLM(transaction, wallet);
    expect(summary).toContain('bought');
    expect(summary).toContain('(needsResearch)');
    expect(summary).toContain('2.5 SOL');
    expect(summary).toContain('via Jupiter');
  });

  it('formats sell transaction with natural-language verb', () => {
    const transaction: ParsedSellTransaction = {
      type: 'sell',
      protocol: 'jupiter',
      timestamp: 1_700_000_000,
      signature: '9PhxC5S2JLPA31mHLowcKnoh7uqpGvBYwt5r2w73ZZHhiS8jL2CoZd5pdRKXfRxSY5QpaX9krDy3FApN7F8iDD7',
      details: {
        kind: 'sell',
        dex: 'jupiter',
        fundingToken: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', isKnown: true },
        targetToken: { mint: 'XYZabc1234567890', isKnown: false, needsResearch: true },
        fundingAmount: '120',
        targetAmount: '1000',
        direction: 'sell',
        feeAmount: '5000'
      }
    };

    const summary = formatTransactionForLLM(transaction, wallet);
    expect(summary).toContain('sold');
    expect(summary).toContain('120 USDC');
    expect(summary).toContain('via Jupiter');
  });

  it('formats lp transaction in fallback lp format', () => {
    const transaction: ParsedLpTransaction = {
      type: 'lp',
      protocol: 'meteora-dlmm',
      timestamp: 1_700_000_000,
      signature: '2x9G9zEVboB71yURYobxboTZPGk4D6HPWW8hJiaZH6eJRQbx87UVoVmk2ZNXndyDMeYpfZsASYRKvsQVUNCfCVdq',
      details: {
        kind: 'generic',
        instructionCount: 1,
        fee: 5000,
        hasError: false,
        preTokenBalanceCount: 1,
        postTokenBalanceCount: 1
      }
    };

    const summary = formatTransactionForLLM(transaction, wallet);
    expect(summary).toContain('lp on meteora-dlmm');
  });
});
