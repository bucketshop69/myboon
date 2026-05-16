import { Buffer } from 'buffer';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
  type Connection,
} from '@solana/web3.js';
import type {
  PerpsExecutionContext,
  PerpsExecutionResult,
  PerpsErrorCode,
  PerpsOrderInput,
  PerpsReadiness,
  PerpsWalletCapabilities,
} from '@/features/perps/perps.contract';
import {
  buildPhoenixLimitOrder,
  buildPhoenixMarketOrder,
  phoenixSideFromUiSide,
  type PhoenixInstructionBuilderResult,
  type PhoenixInstructionDto,
  type PhoenixLimitOrderBuilderInput,
  type PhoenixMarketOrderBuilderInput,
  type PhoenixUiOrderSide,
} from '@/features/perps/phoenix.api';

export interface PhoenixWalletSnapshot {
  connected: boolean;
  address: string | null;
  source?: 'privy' | 'mwa' | 'web' | 'e2e' | 'unknown';
  isPreparing?: boolean;
  signAndSendTransaction?: PhoenixSignAndSendTransactionFn | null;
}

export type PhoenixSignAndSendTransactionFn = (
  transaction: Transaction,
) => Promise<string | { signature?: string | null }>;

export interface PhoenixExecutionContext extends PerpsExecutionContext<Transaction> {
  connection?: Pick<Connection, 'getLatestBlockhash'> | null;
}

export interface PhoenixBuildTransactionInput {
  connection: Pick<Connection, 'getLatestBlockhash'> | null | undefined;
  walletAddress: string | PublicKey;
  builtTransaction?: PhoenixInstructionBuilderResult | readonly PhoenixInstructionDto[] | unknown;
  instructions?: readonly PhoenixInstructionDto[];
}

export interface PhoenixSendBuiltTransactionInput extends PhoenixBuildTransactionInput {
  signAndSendTransaction?: PhoenixSignAndSendTransactionFn | null;
}

export class PhoenixUnsupportedWalletError extends Error {
  readonly code = 'WALLET_TX_UNSUPPORTED';

  constructor() {
    super('This wallet cannot send a Phoenix Solana transaction from the app.');
    this.name = 'PhoenixUnsupportedWalletError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function toPerpsWallet(wallet: PhoenixWalletSnapshot): PerpsWalletCapabilities {
  const canSignAndSendTransaction = typeof wallet.signAndSendTransaction === 'function';

  return {
    connected: wallet.connected,
    address: wallet.address,
    source: wallet.source ?? 'unknown',
    isPreparing: wallet.isPreparing,
    canSignMessage: false,
    canSignTransaction: false,
    canSignAndSendTransaction,
  };
}

export function getPhoenixExecutionReadiness(wallet: PhoenixWalletSnapshot): PerpsReadiness {
  const perpsWallet = toPerpsWallet(wallet);

  if (wallet.isPreparing) {
    return {
      venueId: 'phoenix',
      status: 'wallet_preparing',
      canView: true,
      canDeposit: false,
      canWithdraw: false,
      canTrade: false,
      canCancel: false,
      wallet: perpsWallet,
      message: 'Wallet session is still preparing.',
      requirements: ['connect_wallet'],
    };
  }

  if (!wallet.connected || !wallet.address) {
    return {
      venueId: 'phoenix',
      status: 'disconnected',
      canView: true,
      canDeposit: false,
      canWithdraw: false,
      canTrade: false,
      canCancel: false,
      wallet: perpsWallet,
      message: 'Connect a Solana wallet to prepare Phoenix activation or orders.',
      requirements: ['connect_wallet'],
    };
  }

  if (!perpsWallet.canSignAndSendTransaction) {
    return {
      venueId: 'phoenix',
      status: 'wallet_unsupported',
      canView: true,
      canDeposit: false,
      canWithdraw: false,
      canTrade: false,
      canCancel: false,
      wallet: perpsWallet,
      reasonCode: 'WALLET_TX_UNSUPPORTED',
      message: 'Phoenix execution needs a Solana wallet that can sign and send transactions. Privy embedded wallets cannot execute Phoenix orders yet.',
      requirements: ['sign_transaction'],
    };
  }

  return {
    venueId: 'phoenix',
    status: 'ready',
    canView: true,
    canDeposit: true,
    canWithdraw: true,
    canTrade: true,
    canCancel: true,
    wallet: perpsWallet,
    message: 'Phoenix can build Solana collateral and order transactions for this wallet.',
    requirements: ['sign_transaction'],
  };
}

type PhoenixInstructionAccountDto =
  | string
  | {
      pubkey?: unknown;
      publicKey?: unknown;
      address?: unknown;
      isSigner?: unknown;
      is_signer?: unknown;
      signer?: unknown;
      isWritable?: unknown;
      is_writable?: unknown;
      writable?: unknown;
      writeable?: unknown;
    };

function publicKeyFromUnknown(value: unknown, fieldName: string): PublicKey {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid Phoenix instruction ${fieldName}`);
  }
  return new PublicKey(value);
}

function boolFromUnknown(value: unknown): boolean {
  return value === true;
}

function decodePhoenixAccountMeta(account: PhoenixInstructionAccountDto, index: number): AccountMeta {
  if (typeof account === 'string') {
    return {
      pubkey: publicKeyFromUnknown(account, `accounts[${index}]`),
      isSigner: false,
      isWritable: false,
    };
  }

  return {
    pubkey: publicKeyFromUnknown(account.pubkey ?? account.publicKey ?? account.address, `accounts[${index}].pubkey`),
    isSigner: boolFromUnknown(account.isSigner ?? account.is_signer ?? account.signer),
    isWritable: boolFromUnknown(account.isWritable ?? account.is_writable ?? account.writable ?? account.writeable),
  };
}

function hexToBuffer(hex: string): Buffer {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error('Invalid Phoenix instruction hex data');
  }
  return Buffer.from(normalized, 'hex');
}

function base64ToBuffer(value: string): Buffer {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('Invalid Phoenix instruction base64 data');
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function numberArrayToBuffer(value: readonly number[]): Buffer {
  for (const [index, byte] of value.entries()) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error(`Invalid Phoenix instruction byte at data[${index}]`);
    }
  }
  return Buffer.from(Uint8Array.from(value));
}

export function decodePhoenixInstructionData(data: unknown): Buffer {
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (Array.isArray(data)) return numberArrayToBuffer(data);

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.startsWith('0x') || (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0)) {
      return hexToBuffer(trimmed);
    }
    return base64ToBuffer(trimmed);
  }

  if (isRecord(data)) {
    if (Array.isArray(data.data)) return numberArrayToBuffer(data.data);
    if (Array.isArray(data.bytes)) return numberArrayToBuffer(data.bytes);
    if (typeof data.hex === 'string') return hexToBuffer(data.hex);
    if (typeof data.base64 === 'string') return base64ToBuffer(data.base64);
    if (typeof data.data === 'string') return decodePhoenixInstructionData(data.data);
    if (typeof data.bytes === 'string') return decodePhoenixInstructionData(data.bytes);
  }

  throw new Error('Unsupported Phoenix instruction data shape');
}

export function extractPhoenixInstructionDtos(payload: unknown): readonly PhoenixInstructionDto[] {
  if (Array.isArray(payload)) return payload as PhoenixInstructionDto[];
  if (!isRecord(payload)) throw new Error('Phoenix builder response did not include Solana instructions');

  const candidates = [
    payload.instructions,
    isRecord(payload.data) ? payload.data.instructions : null,
    isRecord(payload.raw) ? payload.raw.instructions : null,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as PhoenixInstructionDto[];
  }

  throw new Error('Phoenix builder response did not include Solana instructions');
}

export function decodePhoenixInstructionDto(dto: unknown): TransactionInstruction {
  if (!isRecord(dto)) throw new Error('Invalid Phoenix instruction DTO');

  const programId = dto.programId ?? dto.program_id;
  const accounts = Array.isArray(dto.keys)
    ? dto.keys
    : Array.isArray(dto.accounts)
      ? dto.accounts
      : null;

  if (!accounts) throw new Error('Phoenix instruction is missing account metas');

  return new TransactionInstruction({
    programId: publicKeyFromUnknown(programId, 'programId'),
    keys: accounts.map((account, index) => decodePhoenixAccountMeta(account as PhoenixInstructionAccountDto, index)),
    data: decodePhoenixInstructionData(dto.data),
  });
}

export function decodePhoenixInstructionDtos(
  instructions: readonly PhoenixInstructionDto[],
): TransactionInstruction[] {
  return instructions.map(decodePhoenixInstructionDto);
}

export async function buildPhoenixTransaction(input: PhoenixBuildTransactionInput): Promise<Transaction> {
  if (!input.connection) throw new Error('Phoenix transaction send requires a Solana connection');

  const feePayer = typeof input.walletAddress === 'string'
    ? new PublicKey(input.walletAddress)
    : input.walletAddress;
  const instructions = input.instructions ?? extractPhoenixInstructionDtos(input.builtTransaction);
  const { blockhash, lastValidBlockHeight } = await input.connection.getLatestBlockhash();

  return new Transaction({
    feePayer,
    blockhash,
    lastValidBlockHeight,
  }).add(...decodePhoenixInstructionDtos(instructions));
}

export async function sendPhoenixBuiltTransaction(input: PhoenixSendBuiltTransactionInput): Promise<string> {
  if (!input.signAndSendTransaction) throw new PhoenixUnsupportedWalletError();

  const tx = await buildPhoenixTransaction(input);
  const result = await input.signAndSendTransaction(tx);
  if (typeof result === 'string') return result;
  if (result?.signature) return result.signature;
  throw new Error('Phoenix wallet did not return a transaction signature');
}

function phoenixBuilderNumber(value: string | undefined): string | number | undefined {
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return value;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}

function perpsOrderToPhoenixBuilderInput(input: PerpsOrderInput): PhoenixMarketOrderBuilderInput | PhoenixLimitOrderBuilderInput {
  if (input.amountMode === 'notional_usdc') {
    throw new Error('Phoenix order execution requires a base quantity. Convert the USDC amount with the latest price before building.');
  }

  const side: PhoenixUiOrderSide = phoenixSideFromUiSide(input.side);
  const base = {
    authority: input.authority,
    symbol: input.symbol,
    side,
    quantity: phoenixBuilderNumber(input.amount),
    isReduceOnly: input.reduceOnly,
    tpSl: input.tpSl,
    clientOrderId: input.clientOrderId,
  };

  if (input.orderType === 'limit') {
    return {
      ...base,
      price: phoenixBuilderNumber(input.limitPrice),
      isPostOnly: input.postOnly,
    };
  }

  return base;
}

function failedPhoenixExecution(message: string, code: PerpsErrorCode): PerpsExecutionResult {
  return {
    venueId: 'phoenix',
    action: 'place_order',
    status: 'failed',
    mode: 'solana_transaction',
    error: {
      code,
      message,
      retryable: false,
      venueId: 'phoenix',
    },
  };
}

export async function placePhoenixOrder(
  input: PerpsOrderInput,
  context?: PhoenixExecutionContext,
): Promise<PerpsExecutionResult> {
  const walletAddress = context?.wallet.address ?? input.authority;
  if (!walletAddress) {
    return failedPhoenixExecution('Connect a Solana wallet before placing a Phoenix order.', 'WALLET_DISCONNECTED');
  }
  if (!context?.connection) {
    return failedPhoenixExecution('Phoenix transaction send requires a Solana connection.', 'TX_SEND_FAILED');
  }
  if (!context.signAndSendTransaction) {
    return failedPhoenixExecution('This wallet cannot send a Phoenix Solana transaction from the app.', 'WALLET_TX_UNSUPPORTED');
  }

  try {
    const builderInput = perpsOrderToPhoenixBuilderInput(input);
    const builtTransaction = input.orderType === 'limit'
      ? await buildPhoenixLimitOrder(builderInput as PhoenixLimitOrderBuilderInput)
      : await buildPhoenixMarketOrder(builderInput as PhoenixMarketOrderBuilderInput);
    const txSignature = await sendPhoenixBuiltTransaction({
      builtTransaction,
      connection: context.connection,
      walletAddress,
      signAndSendTransaction: context.signAndSendTransaction,
    });

    return {
      venueId: 'phoenix',
      action: 'place_order',
      status: 'submitted',
      mode: 'solana_transaction',
      txSignature,
      warnings: builtTransaction.estimatedLiquidationPriceUsd !== null
        && builtTransaction.estimatedLiquidationPriceUsd !== undefined
        ? [`Estimated liquidation price: ${builtTransaction.estimatedLiquidationPriceUsd}`]
        : undefined,
      refreshAfterMs: 1500,
    };
  } catch (err) {
    return failedPhoenixExecution(err instanceof Error ? err.message : 'Phoenix order failed', 'TX_SEND_FAILED');
  }
}
