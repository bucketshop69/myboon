import type { ParsedMessageAccount, ParsedTransactionWithMeta } from '@solana/web3.js';

import { isKnownFundingToken } from '../constants/knownTokens.js';
import { VERIFIED_PROGRAM_IDS } from '../constants/programIds.js';
import type { BuySellDetails, LegacySwapDetails, TokenInfo } from '../types/index.js';
import { isUsedProgram } from '../utils/programCheck.js';
import { getTokenTransfers } from '../utils/tokenTransfers.js';
import type { TokenTransfer } from '../utils/types.js';

function toPubkeyString(account: ParsedMessageAccount): string {
  return account.pubkey.toBase58();
}

function getFeePayer(transaction: ParsedTransactionWithMeta): string | null {
  const firstAccount = transaction.transaction.message.accountKeys[0];
  if (!firstAccount) {
    return null;
  }

  return toPubkeyString(firstAccount);
}

function pickLargestByAbsoluteChange(transfers: TokenTransfer[]): TokenTransfer | null {
  if (transfers.length === 0) {
    return null;
  }

  return transfers.reduce((largest, candidate) =>
    Math.abs(candidate.change) > Math.abs(largest.change) ? candidate : largest
  );
}

function buildTokenInfo(mint: string, isKnown: boolean): TokenInfo {
  if (isKnown) {
    return { mint, isKnown: true };
  }

  return {
    mint,
    isKnown: false,
    needsResearch: true
  };
}

function isWalletTransfer(transfer: TokenTransfer, walletAddress: string): boolean {
  return transfer.from === walletAddress || transfer.to === walletAddress;
}

function classifyBuySell(
  input: TokenTransfer,
  output: TokenTransfer,
  feeAmount: string
): BuySellDetails | LegacySwapDetails {
  const inputIsKnown = isKnownFundingToken(input.mint);
  const outputIsKnown = isKnownFundingToken(output.mint);

  if (inputIsKnown && !outputIsKnown) {
    return {
      kind: 'buy',
      dex: 'jupiter',
      fundingToken: buildTokenInfo(input.mint, true),
      targetToken: buildTokenInfo(output.mint, false),
      fundingAmount: input.amount,
      targetAmount: output.amount,
      direction: 'buy',
      feeAmount
    };
  }

  if (!inputIsKnown && outputIsKnown) {
    return {
      kind: 'sell',
      dex: 'jupiter',
      fundingToken: buildTokenInfo(output.mint, true),
      targetToken: buildTokenInfo(input.mint, false),
      fundingAmount: output.amount,
      targetAmount: input.amount,
      direction: 'sell',
      feeAmount
    };
  }

  return {
    kind: 'swap',
    dex: 'jupiter',
    inputMint: input.mint,
    outputMint: output.mint,
    inputAmount: input.amount,
    outputAmount: output.amount,
    feeAmount,
    feeMint: null
  };
}

export function parseJupiterTransaction(
  transaction: ParsedTransactionWithMeta
): BuySellDetails | LegacySwapDetails | null {
  if (!isUsedProgram(transaction, VERIFIED_PROGRAM_IDS.JUPITER_V6)) {
    return null;
  }

  const walletAddress = getFeePayer(transaction);
  if (!walletAddress) {
    return null;
  }

  const transfers = getTokenTransfers(transaction);
  const walletTransfers = transfers.filter((transfer) => isWalletTransfer(transfer, walletAddress));
  if (walletTransfers.length < 2) {
    return null;
  }

  const input = pickLargestByAbsoluteChange(walletTransfers.filter((transfer) => transfer.change < 0));
  const output = pickLargestByAbsoluteChange(walletTransfers.filter((transfer) => transfer.change > 0));
  if (!input || !output) {
    return null;
  }

  const feeAmount = (transaction.meta?.fee ?? 0).toString();
  return classifyBuySell(input, output, feeAmount);
}
