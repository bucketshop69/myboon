import { getFundingSymbol } from '../constants/knownTokens.js';
import type { ParsedBuyTransaction, ParsedSellTransaction, ParsedTransaction } from '../types/index.js';

function getTimestamp(timestamp: number | null): string {
  if (timestamp == null) {
    return 'unknown-time';
  }

  return new Date(timestamp * 1000).toISOString();
}

function formatBuySellSummary(
  transaction: ParsedBuyTransaction | ParsedSellTransaction,
  walletAddress: string,
  sigShort: string
): string {
  const details = transaction.details;
  const action = details.direction === 'buy' ? 'bought' : 'sold';
  const targetMint = details.targetToken.mint.slice(0, 8);
  const researchFlag = details.targetToken.needsResearch ? '(needsResearch)' : '';
  const fundingSymbol = getFundingSymbol(details.fundingToken.mint);
  const timestamp = getTimestamp(transaction.timestamp);

  return `[${timestamp}] Wallet:${walletAddress} ${action} ${details.targetAmount} ${targetMint}${researchFlag} for ${details.fundingAmount} ${fundingSymbol} via Jupiter | sig:${sigShort}`;
}

export function formatTransactionForLLM(
  transaction: ParsedTransaction,
  walletAddress: string
): string {
  const timestamp = getTimestamp(transaction.timestamp);
  const sigShort = transaction.signature.slice(0, 8);

  if (transaction.type === 'buy' || transaction.type === 'sell') {
    return formatBuySellSummary(transaction, walletAddress, sigShort);
  }

  if (transaction.type === 'lp') {
    return `[${timestamp}] Wallet:${walletAddress} lp on ${transaction.protocol} | sig:${sigShort}`;
  }

  return `[${timestamp}] Wallet:${walletAddress} ${transaction.type} on ${transaction.protocol} | sig:${sigShort}`;
}
