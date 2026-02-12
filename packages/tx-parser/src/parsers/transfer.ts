import type {
  ParsedTransactionWithMeta,
  ParsedTransactionMeta,
} from '@solana/web3.js';

import { VERIFIED_PROGRAM_IDS } from '../constants/programIds.js';
import type { GenericDetails } from '../types/index.js';
import { getTransactionProgramIds } from './base.js';

interface SolDelta {
  account: string;
  change: number;
}

export interface SolTransferDetails {
  kind: 'sol-transfer';
  direction: 'send' | 'receive' | 'self';
  amount: number;
  from: string;
  to: string;
}

export function parseTransferTransaction(
  transaction: ParsedTransactionWithMeta,
  protocol: string
): GenericDetails | null {
  // Handle both SPL token transfers and SOL transfers
  if (protocol !== 'spl-token' && protocol !== 'associated-token' && protocol !== 'system') {
    return null;
  }

  const programIds = getTransactionProgramIds(transaction);
  const meta = transaction.meta;
  if (!meta) {
    return null;
  }

  // For system program (SOL transfers), calculate SOL balance changes
  if (programIds.has(VERIFIED_PROGRAM_IDS.SYSTEM_PROGRAM) && protocol === 'system') {
    return parseSolTransfer(transaction);
  }

  // For SPL token transfers, use existing generic details
  return {
    kind: 'generic',
    instructionCount: transaction.transaction.message.instructions.length,
    fee: meta.fee ?? 0,
    hasError: meta.err !== null,
    preTokenBalanceCount: meta.preTokenBalances?.length ?? 0,
    postTokenBalanceCount: meta.postTokenBalances?.length ?? 0,
  };
}

function parseSolTransfer(transaction: ParsedTransactionWithMeta): GenericDetails | null {
  const meta = transaction.meta;
  if (!meta) {
    return null;
  }

  const solDeltas = computeSolBalanceDeltas(meta, transaction.transaction.message.accountKeys);

  // Filter out fee payer account changes (usually negative due to fees)
  const nonFeeChanges = solDeltas.filter(delta =>
    Math.abs(delta.change) > (meta.fee ?? 0) || Math.abs(delta.change) > 0.01 // Small threshold to exclude dust
  );

  // For now, return generic details - we can enhance this later with more specific SOL transfer details
  return {
    kind: 'generic',
    instructionCount: transaction.transaction.message.instructions.length,
    fee: meta.fee ?? 0,
    hasError: meta.err !== null,
    preTokenBalanceCount: meta.preTokenBalances?.length ?? 0,
    postTokenBalanceCount: meta.postTokenBalances?.length ?? 0,
  };
}

function computeSolBalanceDeltas(meta: ParsedTransactionMeta, accountKeys: Array<{ pubkey: { toString: () => string } }>): SolDelta[] {
  const preBalances = meta.preBalances ?? [];
  const postBalances = meta.postBalances ?? [];

  // Only process accounts that had balance changes tracked
  const deltas: SolDelta[] = [];

  for (let i = 0; i < Math.min(preBalances.length, postBalances.length, accountKeys.length); i++) {
    const account = accountKeys[i].pubkey.toString();
    const preBalance = preBalances[i];
    const postBalance = postBalances[i];

    // Convert lamports to SOL (1 SOL = 1_000_000_000 lamports)
    const preSol = preBalance / 1_000_000_000;
    const postSol = postBalance / 1_000_000_000;
    const change = postSol - preSol;

    deltas.push({
      account,
      change
    });
  }

  return deltas;
}