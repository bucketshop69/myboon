import { getFundingSymbol } from '../constants/knownTokens.js';
import { getWalletLabel } from '../constants/walletRegistry.js';
import type { ParsedBuyTransaction, ParsedSellTransaction, ParsedTransaction } from '../types/index.js';

function getTimestamp(timestamp: number | null): string {
  if (timestamp == null) {
    return 'unknown-time';
  }

  return new Date(timestamp * 1000).toISOString();
}

function formatBuySellSummary(
  transaction: ParsedBuyTransaction | ParsedSellTransaction,
  walletDisplay: string,
  sigShort: string
): string {
  const details = transaction.details;
  const action = details.direction === 'buy' ? 'bought' : 'sold';
  const targetMint = details.targetToken.mint;
  const targetShort = `${targetMint.slice(0, 3)}...${targetMint.slice(-3)}`;
  const targetFormatted = `${targetShort}(mint:${targetMint})`;
  const researchFlag = details.targetToken.needsResearch ? '(needsResearch)' : '';
  const fundingSymbol = getFundingSymbol(details.fundingToken.mint);
  const timestamp = getTimestamp(transaction.timestamp);

  return `[${timestamp}] Wallet:${walletDisplay} ${action} ${details.targetAmount} of ${targetFormatted}${researchFlag} for ${details.fundingAmount} ${fundingSymbol} via Jupiter | sig:${sigShort}`;
}

export function formatTransactionForLLM(
  transaction: ParsedTransaction,
  walletAddress: string
): string {
  const timestamp = getTimestamp(transaction.timestamp);
  const walletLabel = getWalletLabel(walletAddress);
  const walletDisplay = `${walletLabel}(${walletAddress})`;
  const sigShort = transaction.signature.slice(0, 8);

  if (transaction.type === 'buy' || transaction.type === 'sell') {
    return formatBuySellSummary(transaction, walletDisplay, sigShort);
  }

  if (transaction.type === 'lp') {
    return `[${timestamp}] Wallet:${walletDisplay} lp on ${transaction.protocol} | sig:${sigShort}`;
  }

  return `[${timestamp}] Wallet:${walletDisplay} ${transaction.type} on ${transaction.protocol} | sig:${sigShort}`;
}
