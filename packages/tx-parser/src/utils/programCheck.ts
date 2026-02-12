import type { ParsedInstruction, ParsedTransactionWithMeta, PartiallyDecodedInstruction } from '@solana/web3.js';

import { getAllAccountKeys } from './accountKeys.js';

type CompiledInstructionLike = {
  programIdIndex: number;
};

type InstructionLike = ParsedInstruction | PartiallyDecodedInstruction | CompiledInstructionLike;

function getTopLevelInstructions(
  transaction: ParsedTransactionWithMeta
): InstructionLike[] {
  const message = transaction.transaction.message as ParsedTransactionWithMeta['transaction']['message'] & {
    compiledInstructions?: CompiledInstructionLike[];
  };

  if (Array.isArray(message.compiledInstructions) && message.compiledInstructions.length > 0) {
    return message.compiledInstructions;
  }

  return message.instructions;
}

function getProgramIdFromInstruction(
  instruction: InstructionLike,
  accountKeys: string[]
): string | null {
  if ('programIdIndex' in instruction) {
    return accountKeys[instruction.programIdIndex] ?? null;
  }

  return instruction.programId.toBase58();
}

export function isUsedProgram(
  transaction: ParsedTransactionWithMeta,
  programId: string
): boolean {
  const calledPrograms = getCalledPrograms(transaction);
  return calledPrograms.includes(programId);
}

export function getCalledPrograms(
  transaction: ParsedTransactionWithMeta
): string[] {
  const accountKeys = getAllAccountKeys(transaction);
  const instructions = getTopLevelInstructions(transaction);
  const programIds = new Set<string>();

  for (const instruction of instructions) {
    const programId = getProgramIdFromInstruction(instruction, accountKeys);
    if (programId) {
      programIds.add(programId);
    }
  }

  return [...programIds];
}
