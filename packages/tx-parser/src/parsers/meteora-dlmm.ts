import type {
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction
} from '@solana/web3.js';

import { VERIFIED_PROGRAM_IDS } from '../constants/programIds.js';
import type { DlmmAction, DlmmDetails } from '../types/index.js';
import { isUsedProgram } from '../utils/programCheck.js';
import { getTokenTransfers } from '../utils/tokenTransfers.js';
import type { TokenTransfer } from '../utils/types.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map(Array.from(BASE58_ALPHABET).map((char, idx) => [char, idx]));

const ACTION_BY_DISCRIMINATOR: Record<string, DlmmAction> = {
  '03dd95da6f8d76d5': 'add-liquidity',
  cc02c391359191cd: 'remove-liquidity',
  '70bf65ab1c907fbb': 'remove-liquidity',
  '3b7cd4765b986e9d': 'close-position',
  dbc0ea47bebf6650: 'open-position'
};

interface DlmmTopLevelInstruction {
  index: number;
  accounts: string[];
  discriminator: string;
  action: DlmmAction;
}

function toBase58String(value: string | { toBase58: () => string }): string {
  return typeof value === 'string' ? value : value.toBase58();
}

function decodeBase58(data: string): Uint8Array | null {
  let value = 0n;
  for (const char of data) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) {
      return null;
    }
    value = value * 58n + BigInt(digit);
  }

  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  bytes.reverse();

  let leadingZeroes = 0;
  while (leadingZeroes < data.length && data[leadingZeroes] === '1') {
    leadingZeroes += 1;
  }

  const decoded = new Uint8Array(leadingZeroes + bytes.length);
  for (let i = 0; i < leadingZeroes; i++) {
    decoded[i] = 0;
  }
  for (let i = 0; i < bytes.length; i++) {
    decoded[leadingZeroes + i] = bytes[i];
  }

  if (decoded.length === 0) {
    return null;
  }

  return decoded;
}

function decodeDiscriminator(data: string): string | null {
  const decoded = decodeBase58(data);
  if (!decoded || decoded.length < 8) {
    return null;
  }

  return Buffer.from(decoded.slice(0, 8)).toString('hex');
}

function isPartiallyDecodedInstruction(
  instruction: ParsedInstruction | PartiallyDecodedInstruction
): instruction is PartiallyDecodedInstruction {
  return 'data' in instruction && Array.isArray((instruction as PartiallyDecodedInstruction).accounts);
}

function getDlmmTopLevelInstructions(
  transaction: ParsedTransactionWithMeta
): DlmmTopLevelInstruction[] {
  const dlmmInstructions: DlmmTopLevelInstruction[] = [];

  transaction.transaction.message.instructions.forEach((instruction, index) => {
    if (toBase58String(instruction.programId) !== VERIFIED_PROGRAM_IDS.METEORA_DLMM) {
      return;
    }
    if (!isPartiallyDecodedInstruction(instruction)) {
      return;
    }

    const discriminator = decodeDiscriminator(instruction.data);
    dlmmInstructions.push({
      index,
      accounts: instruction.accounts.map((account: string | { toBase58: () => string }) =>
        toBase58String(account)
      ),
      discriminator: discriminator ?? 'unknown',
      action: discriminator ? (ACTION_BY_DISCRIMINATOR[discriminator] ?? 'unknown') : 'unknown'
    });
  });

  return dlmmInstructions;
}

function resolvePrimaryInstruction(
  instructions: DlmmTopLevelInstruction[]
): DlmmTopLevelInstruction | null {
  const add = instructions.find((instruction) => instruction.action === 'add-liquidity');
  if (add) {
    return add;
  }

  const remove = instructions.find((instruction) => instruction.action === 'remove-liquidity');
  if (remove) {
    return remove;
  }

  return instructions.find((instruction) => instruction.action !== 'unknown') ?? instructions[0] ?? null;
}

function getFeePayer(transaction: ParsedTransactionWithMeta): string | null {
  const feePayer = transaction.transaction.message.accountKeys[0];
  if (!feePayer) {
    return null;
  }

  return feePayer.pubkey.toBase58();
}

function collectCandidateTokenTransfers(
  transaction: ParsedTransactionWithMeta,
  poolAddress: string
): TokenTransfer[] {
  const transfers = getTokenTransfers(transaction);

  const poolTransfers = transfers.filter(
    (transfer) => transfer.from === poolAddress || transfer.to === poolAddress
  );
  if (poolTransfers.length > 0) {
    return poolTransfers;
  }

  const feePayer = getFeePayer(transaction);
  if (!feePayer) {
    return [];
  }

  return transfers.filter((transfer) => transfer.from === feePayer || transfer.to === feePayer);
}

function pickTokenPair(
  transfers: TokenTransfer[]
): Pick<DlmmDetails, 'tokenX' | 'tokenY'> {
  const byMint = new Map<string, TokenTransfer>();
  for (const transfer of transfers) {
    const current = byMint.get(transfer.mint);
    if (!current || Math.abs(transfer.change) > Math.abs(current.change)) {
      byMint.set(transfer.mint, transfer);
    }
  }

  const ranked = [...byMint.values()]
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 2);

  return {
    tokenX: ranked[0]
      ? {
          mint: ranked[0].mint,
          amount: ranked[0].amount,
          decimals: ranked[0].decimals
        }
      : null,
    tokenY: ranked[1]
      ? {
          mint: ranked[1].mint,
          amount: ranked[1].amount,
          decimals: ranked[1].decimals
        }
      : null
  };
}

export function parseMeteoraDlmmTransaction(
  transaction: ParsedTransactionWithMeta
): DlmmDetails | null {
  if (!isUsedProgram(transaction, VERIFIED_PROGRAM_IDS.METEORA_DLMM)) {
    return null;
  }

  const instructions = getDlmmTopLevelInstructions(transaction);
  if (instructions.length === 0) {
    return null;
  }

  const primaryInstruction = resolvePrimaryInstruction(instructions);
  if (!primaryInstruction) {
    return null;
  }

  const poolAddress = primaryInstruction.accounts[1] ?? 'unknown';
  const tokenPair = pickTokenPair(collectCandidateTokenTransfers(transaction, poolAddress));

  return {
    kind: 'dlmm',
    action: primaryInstruction.action,
    poolAddress,
    positionAddress: primaryInstruction.accounts[0] ?? null,
    tokenX: tokenPair.tokenX,
    tokenY: tokenPair.tokenY,
    activeBin: null,
    feesEarned: null
  };
}
