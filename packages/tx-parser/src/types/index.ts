import type { ParsedTransactionWithMeta } from '@solana/web3.js';

export type TransactionType =
  | 'swap'
  | 'perp'
  | 'lp'
  | 'nft'
  | 'transfer'
  | 'unknown';

export type SupportedProtocol =
  | 'jupiter'
  | 'meteora-dlmm'
  | 'spl-token'
  | 'associated-token'
  | 'system'
  | 'unknown';

export interface GenericDetails {
  kind: 'generic';
  instructionCount: number;
  fee: number;
  hasError: boolean;
  preTokenBalanceCount: number;
  postTokenBalanceCount: number;
}

export interface SwapDetails {
  kind: 'swap';
  dex: 'jupiter';
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  feeAmount: string;
  feeMint: string | null;
}

export type ParsedDetails = GenericDetails | SwapDetails;

interface ParsedTransactionBase {
  timestamp: number | null;
  signature: string;
}

export interface ParsedSwapTransaction extends ParsedTransactionBase {
  type: 'swap';
  protocol: 'jupiter';
  details: SwapDetails;
}

export interface ParsedLpTransaction extends ParsedTransactionBase {
  type: 'lp';
  protocol: 'meteora-dlmm';
  details: GenericDetails;
}

export interface ParsedTransferTransaction extends ParsedTransactionBase {
  type: 'transfer';
  protocol: 'spl-token' | 'associated-token' | 'system';
  details: GenericDetails;
}

export interface ParsedUnknownTransaction extends ParsedTransactionBase {
  type: 'unknown';
  protocol: 'unknown';
  details: GenericDetails;
}

export type ParsedTransaction =
  | ParsedSwapTransaction
  | ParsedLpTransaction
  | ParsedTransferTransaction
  | ParsedUnknownTransaction;

export interface WalletProfile {
  wallet: string;
  transactionCount: number;
  transactions: ParsedTransaction[];
}

export type RawTransactionData = ParsedTransactionWithMeta;
