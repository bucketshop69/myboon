import type {
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  PublicKey
} from '@solana/web3.js';

import { getAllAccountKeys } from './accountKeys.js';
import type { InnerInstruction } from './types.js';

type InstructionLike = ParsedInstruction | PartiallyDecodedInstruction;
type CompiledInstructionLike = {
  programIdIndex: number;
  accounts: number[];
  data: string;
};
type InnerInstructionLike = InstructionLike | CompiledInstructionLike;
type InnerInstructionSetLike = {
  index: number;
  instructions: InnerInstructionLike[];
};

function toBase58(value: PublicKey | { toBase58: () => string } | { toString: () => string }): string {
  if ('toBase58' in value && typeof value.toBase58 === 'function') {
    return value.toBase58();
  }

  return value.toString();
}

function getInstructionData(instruction: InnerInstructionLike): string {
  if ('data' in instruction && typeof instruction.data === 'string') {
    return instruction.data;
  }

  return '';
}

function getInstructionAccounts(
  instruction: InnerInstructionLike,
  accountKeys: string[]
): number[] {
  if ('programIdIndex' in instruction) {
    return instruction.accounts;
  }

  if (!('accounts' in instruction) || !Array.isArray(instruction.accounts)) {
    return [];
  }

  return instruction.accounts
    .map((account) => accountKeys.indexOf(toBase58(account)))
    .filter((index) => index >= 0);
}

function getInstructionProgramId(
  instruction: InnerInstructionLike,
  accountKeys: string[]
): string {
  if ('programIdIndex' in instruction) {
    return accountKeys[instruction.programIdIndex] ?? 'unknown-program';
  }

  return toBase58(instruction.programId);
}

export function getInnerInstructions(
  transaction: ParsedTransactionWithMeta
): InnerInstruction[] {
  const meta = transaction.meta;
  if (!meta) {
    return [];
  }

  const accountKeys = getAllAccountKeys(transaction);
  const innerInstructions = (meta.innerInstructions ?? []) as InnerInstructionSetLike[];
  const result: InnerInstruction[] = [];

  for (const innerSet of innerInstructions) {
    const parentIndex = innerSet.index;

    for (const instruction of innerSet.instructions) {
      result.push({
        programId: getInstructionProgramId(instruction, accountKeys),
        accounts: getInstructionAccounts(instruction, accountKeys),
        data: getInstructionData(instruction),
        parentIndex
      });
    }
  }

  return result;
}
