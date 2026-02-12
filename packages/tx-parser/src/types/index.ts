import type { ParsedTransactionWithMeta } from '@solana/web3.js';

export type TransactionType =
  | 'buy'
  | 'sell'
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

export interface TokenInfo {
  mint: string;
  isKnown: boolean;
  needsResearch?: boolean;
}

export interface BuySellDetails {
  kind: 'buy' | 'sell';
  dex: 'jupiter';
  fundingToken: TokenInfo;
  targetToken: TokenInfo;
  fundingAmount: string;
  targetAmount: string;
  direction: 'buy' | 'sell';
  feeAmount: string;
}

export interface LegacySwapDetails {
  kind: 'swap';
  dex: 'jupiter';
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  feeAmount: string;
  feeMint: string | null;
}

export type SwapDetails = BuySellDetails | LegacySwapDetails;

export type ParsedDetails = GenericDetails | SwapDetails;

interface ParsedTransactionBase {
  timestamp: number | null;
  signature: string;
}

export interface ParsedSwapTransaction extends ParsedTransactionBase {
  type: 'swap';
  protocol: 'jupiter';
  details: LegacySwapDetails;
}

export interface ParsedBuyTransaction extends ParsedTransactionBase {
  type: 'buy';
  protocol: 'jupiter';
  details: BuySellDetails;
}

export interface ParsedSellTransaction extends ParsedTransactionBase {
  type: 'sell';
  protocol: 'jupiter';
  details: BuySellDetails;
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
  | ParsedBuyTransaction
  | ParsedSellTransaction
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
