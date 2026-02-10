import type { ParsedTransactionWithMeta } from '@solana/web3.js';

import type {
  ParsedLpTransaction,
  ParsedSwapTransaction,
  ParsedTransaction,
  ParsedTransferTransaction,
  ParsedUnknownTransaction
} from '../types/index.js';
import { identifyTransactionType } from './base.js';
import { resolveTransactionDetails } from './registry.js';

export function parseSingleTransaction(
  transaction: ParsedTransactionWithMeta,
  signature?: string
): ParsedTransaction {
  const classification = identifyTransactionType(transaction);
  const common = {
    timestamp: transaction.blockTime ?? null,
    signature: signature ?? transaction.transaction.signatures[0] ?? 'unknown-signature'
  };

  if (classification.type === 'swap' && classification.protocol === 'jupiter') {
    return {
      ...common,
      type: 'swap',
      protocol: 'jupiter',
      details: resolveTransactionDetails(transaction, classification)
    } as ParsedSwapTransaction;
  }

  if (classification.type === 'lp' && classification.protocol === 'meteora-dlmm') {
    return {
      ...common,
      type: 'lp',
      protocol: 'meteora-dlmm',
      details: resolveTransactionDetails(transaction, classification)
    } as ParsedLpTransaction;
  }

  if (classification.type === 'transfer') {
    return {
      ...common,
      type: 'transfer',
      protocol: classification.protocol,
      details: resolveTransactionDetails(transaction, classification)
    } as ParsedTransferTransaction;
  }

  return {
    ...common,
    type: 'unknown',
    protocol: 'unknown',
    details: resolveTransactionDetails(transaction, classification)
  } as ParsedUnknownTransaction;
}
