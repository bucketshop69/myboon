import type { ParsedTransactionWithMeta, TokenBalance } from '@solana/web3.js';

import type { TokenTransfer } from './types.js';

function getBalanceKey(balance: TokenBalance): string {
  return `${balance.accountIndex}:${balance.mint}`;
}

function formatAmount(rawAmount: bigint, decimals: number): string {
  if (decimals <= 0) {
    return rawAmount.toString();
  }

  const base = 10n ** BigInt(decimals);
  const whole = rawAmount / base;
  const fraction = rawAmount % base;
  const trimmedFraction = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');

  if (trimmedFraction.length === 0) {
    return whole.toString();
  }

  return `${whole.toString()}.${trimmedFraction}`;
}

export function getTokenTransfers(
  transaction: ParsedTransactionWithMeta
): TokenTransfer[] {
  const meta = transaction.meta;
  if (!meta) {
    return [];
  }

  const preTokenBalances = meta.preTokenBalances ?? [];
  const postTokenBalances = meta.postTokenBalances ?? [];

  const preBalanceMap = new Map(preTokenBalances.map((balance) => [getBalanceKey(balance), balance]));
  const postBalanceMap = new Map(postTokenBalances.map((balance) => [getBalanceKey(balance), balance]));
  const balanceKeys = new Set([...preBalanceMap.keys(), ...postBalanceMap.keys()]);

  const transfers: TokenTransfer[] = [];

  for (const key of balanceKeys) {
    const preBalance = preBalanceMap.get(key);
    const postBalance = postBalanceMap.get(key);
    const balance = postBalance ?? preBalance;

    if (!balance) {
      continue;
    }

    const preAmount = BigInt(preBalance?.uiTokenAmount.amount ?? '0');
    const postAmount = BigInt(postBalance?.uiTokenAmount.amount ?? '0');
    const rawChange = postAmount - preAmount;

    if (rawChange === 0n) {
      continue;
    }

    const owner = postBalance?.owner ?? preBalance?.owner;
    const decimals = postBalance?.uiTokenAmount.decimals ?? preBalance?.uiTokenAmount.decimals ?? 0;
    const absoluteChange = rawChange < 0n ? -rawChange : rawChange;

    transfers.push({
      mint: balance.mint,
      from: rawChange < 0n ? owner : undefined,
      to: rawChange > 0n ? owner : undefined,
      amount: formatAmount(absoluteChange, decimals),
      decimals,
      change: Number(rawChange)
    });
  }

  return transfers;
}
