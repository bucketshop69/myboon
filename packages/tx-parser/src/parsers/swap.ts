import type {
  ParsedTransactionMeta,
  ParsedTransactionWithMeta,
  TokenBalance
} from '@solana/web3.js';

import { VERIFIED_PROGRAM_IDS } from '../constants/programIds.js';
import type { SwapDetails } from '../types/index.js';
import { getTransactionProgramIds } from './base.js';

interface BalanceDelta {
  mint: string;
  owner: string;
  change: number;
}

export function parseSwapTransaction(
  transaction: ParsedTransactionWithMeta,
  protocol: string
): SwapDetails | null {
  if (protocol !== 'jupiter') {
    return null;
  }

  const programIds = getTransactionProgramIds(transaction);
  if (!programIds.has(VERIFIED_PROGRAM_IDS.JUPITER_V6)) {
    return null;
  }

  const meta = transaction.meta;
  if (!meta) {
    return null;
  }

  const deltas = computeBalanceDeltas(meta);
  const input = pickLargestInput(deltas);
  const output = pickLargestOutput(deltas);

  if (!input || !output) {
    return null;
  }

  return {
    kind: 'swap',
    dex: 'jupiter',
    inputMint: input.mint,
    outputMint: output.mint,
    inputAmount: Math.abs(input.change).toString(),
    outputAmount: output.change.toString(),
    feeAmount: (meta.fee ?? 0).toString(),
    feeMint: null
  };
}

// DEPRECATED: Use getTokenTransfers() from utils/tokenTransfers.ts in new parser implementations.
function computeBalanceDeltas(meta: ParsedTransactionMeta): BalanceDelta[] {
  const preMap = buildBalanceMap(meta.preTokenBalances ?? []);
  const postMap = buildBalanceMap(meta.postTokenBalances ?? []);

  const keys = new Set<string>([...preMap.keys(), ...postMap.keys()]);
  const deltas: BalanceDelta[] = [];

  for (const key of keys) {
    const pre = preMap.get(key) ?? 0;
    const post = postMap.get(key) ?? 0;
    const change = post - pre;

    if (change === 0) {
      continue;
    }

    const [owner, mint] = key.split('::');
    deltas.push({ owner, mint, change });
  }

  return deltas;
}

function buildBalanceMap(balances: TokenBalance[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const balance of balances) {
    const owner = balance.owner ?? `account-${balance.accountIndex}`;
    const mint = balance.mint;
    const amount = readUiAmount(balance);

    map.set(`${owner}::${mint}`, amount);
  }

  return map;
}

function readUiAmount(balance: TokenBalance): number {
  const uiAmount = balance.uiTokenAmount.uiAmount;
  if (typeof uiAmount === 'number') {
    return uiAmount;
  }

  const uiAmountString = balance.uiTokenAmount.uiAmountString;
  if (uiAmountString) {
    const parsed = Number(uiAmountString);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function pickLargestInput(deltas: BalanceDelta[]): BalanceDelta | null {
  const inputs = deltas.filter((delta) => delta.change < 0);
  if (inputs.length === 0) {
    return null;
  }

  return inputs.reduce((currentLargest, candidate) =>
    candidate.change < currentLargest.change ? candidate : currentLargest
  );
}

function pickLargestOutput(deltas: BalanceDelta[]): BalanceDelta | null {
  const outputs = deltas.filter((delta) => delta.change > 0);
  if (outputs.length === 0) {
    return null;
  }

  return outputs.reduce((currentLargest, candidate) =>
    candidate.change > currentLargest.change ? candidate : currentLargest
  );
}
