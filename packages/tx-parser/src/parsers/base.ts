import type {
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction
} from '@solana/web3.js';

import { VERIFIED_PROGRAM_IDS } from '../constants/programIds.js';
import type { SupportedProtocol, TransactionType } from '../types/index.js';

export interface TransactionClassification {
  type: TransactionType;
  protocol: SupportedProtocol;
}

type InstructionLike = ParsedInstruction | PartiallyDecodedInstruction;

export function getProgramIdFromInstruction(instruction: InstructionLike): string {
  return instruction.programId.toString();
}

export function identifyTransactionType(
  transaction: ParsedTransactionWithMeta
): TransactionClassification {
  const programIds = getTransactionProgramIds(transaction);

  if (programIds.has(VERIFIED_PROGRAM_IDS.JUPITER_V6)) {
    return { type: 'swap', protocol: 'jupiter' };
  }

  if (programIds.has(VERIFIED_PROGRAM_IDS.METEORA_DLMM)) {
    return { type: 'lp', protocol: 'meteora-dlmm' };
  }

  if (programIds.has(VERIFIED_PROGRAM_IDS.TOKEN_PROGRAM)) {
    return { type: 'transfer', protocol: 'spl-token' };
  }

  if (programIds.has(VERIFIED_PROGRAM_IDS.ASSOCIATED_TOKEN_PROGRAM)) {
    return { type: 'transfer', protocol: 'associated-token' };
  }

  if (programIds.has(VERIFIED_PROGRAM_IDS.SYSTEM_PROGRAM)) {
    return { type: 'transfer', protocol: 'system' };
  }

  return { type: 'unknown', protocol: 'unknown' };
}

export function getTransactionProgramIds(
  transaction: ParsedTransactionWithMeta
): Set<string> {
  return new Set<string>(
    transaction.transaction.message.instructions.map((instruction) =>
      getProgramIdFromInstruction(instruction)
    )
  );
}
