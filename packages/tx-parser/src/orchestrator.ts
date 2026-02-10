import type { ParsedTransaction } from './types/index.js';
import {
  fetchTransactionBySignature,
  fetchWalletTransactions,
  type FetchTransactionBySignatureOptions,
  type FetchTransactionsOptions,
  type RawTransaction
} from './rpc.js';
import { parseSingleTransaction } from './parsers/transaction.js';

export function parseTransactions(transactions: RawTransaction[]): ParsedTransaction[] {
  return transactions.map((transaction) => parseSingleTransaction(transaction));
}

export async function parseWalletHistory(
  walletAddress: string,
  options: FetchTransactionsOptions = {}
): Promise<ParsedTransaction[]> {
  const transactions = await fetchWalletTransactions(walletAddress, options);
  return parseTransactions(transactions);
}

export async function parseTransactionBySignature(
  signature: string,
  options: FetchTransactionBySignatureOptions = {}
): Promise<ParsedTransaction | null> {
  const transaction = await fetchTransactionBySignature(signature, options);
  if (!transaction) {
    return null;
  }

  return parseSingleTransaction(transaction, signature);
}
