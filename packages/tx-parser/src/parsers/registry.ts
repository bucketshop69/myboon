import type { ParsedTransactionWithMeta } from '@solana/web3.js';

import type { ParsedDetails } from '../types/index.js';
import type { TransactionClassification } from './base.js';
import { buildGenericDetails } from './details.js';
import { parseSwapTransaction } from './swap.js';
import { parseTransferTransaction } from './transfer.js';

type DetailsParser = (transaction: ParsedTransactionWithMeta) => ParsedDetails | null;

const detailsParserRegistry: Record<string, DetailsParser> = {
  'swap:jupiter': (transaction) => parseSwapTransaction(transaction, 'jupiter'),
  'transfer:spl-token': (transaction) => parseTransferTransaction(transaction, 'spl-token'),
  'transfer:associated-token': (transaction) => parseTransferTransaction(transaction, 'associated-token'),
  'transfer:system': (transaction) => parseTransferTransaction(transaction, 'system')
};

export function resolveTransactionDetails(
  transaction: ParsedTransactionWithMeta,
  classification: TransactionClassification
): ParsedDetails {
  const parser = detailsParserRegistry[toRegistryKey(classification)];
  if (!parser) {
    return buildGenericDetails(transaction);
  }

  const details = parser(transaction);
  if (!details) {
    return buildGenericDetails(transaction);
  }

  return details;
}

function toRegistryKey(classification: TransactionClassification): string {
  return `${classification.type}:${classification.protocol}`;
}
