import type { ParsedTransactionWithMeta } from '@solana/web3.js';

import type { GenericDetails } from '../types/index.js';

export function buildGenericDetails(
  transaction: ParsedTransactionWithMeta
): GenericDetails {
  const instructionCount = transaction.transaction.message.instructions.length;
  const fee = transaction.meta?.fee ?? 0;
  const hasError = transaction.meta?.err != null;
  const preTokenBalanceCount = transaction.meta?.preTokenBalances?.length ?? 0;
  const postTokenBalanceCount = transaction.meta?.postTokenBalances?.length ?? 0;

  return {
    kind: 'generic',
    instructionCount,
    fee,
    hasError,
    preTokenBalanceCount,
    postTokenBalanceCount
  };
}
