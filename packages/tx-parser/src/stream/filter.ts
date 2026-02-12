import type { ParsedTransaction, TransactionType } from '../types/index.js';

const RELEVANT_TYPES: TransactionType[] = ['buy', 'sell', 'lp', 'perp'];

export function isRelevantTransaction(transaction: ParsedTransaction): boolean {
  return RELEVANT_TYPES.includes(transaction.type);
}
