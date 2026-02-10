import {
  Connection,
  type Commitment,
  PublicKey,
  type ParsedTransactionWithMeta,
  type ConfirmedSignatureInfo
} from '@solana/web3.js';

import { type CommitmentLevel, loadAppConfig } from './config.js';

export interface FetchTransactionsOptions {
  count?: number;
  commitment?: CommitmentLevel;
  rpcUrl?: string;
}

export interface FetchTransactionBySignatureOptions {
  commitment?: CommitmentLevel;
  rpcUrl?: string;
}

export type RawTransaction = ParsedTransactionWithMeta;

export async function fetchWalletTransactions(
  walletAddress: string,
  options: FetchTransactionsOptions = {}
): Promise<RawTransaction[]> {
  const config = loadAppConfig();
  const commitment = options.commitment ?? config.defaultCommitment;
  const count = normalizeCount(options.count, config.defaultTxCount);
  const rpcUrl = options.rpcUrl?.trim() || config.heliusRpcUrl;

  const publicKey = parseWalletAddress(walletAddress);
  const connection = new Connection(rpcUrl, commitment as Commitment);

  const signatures = await fetchSignatures(connection, publicKey, count, walletAddress);
  const transactions = await fetchParsedTransactions(connection, signatures);

  return transactions.filter((tx): tx is RawTransaction => tx !== null);
}

export async function fetchTransactionBySignature(
  signature: string,
  options: FetchTransactionBySignatureOptions = {}
): Promise<RawTransaction | null> {
  const config = loadAppConfig();
  const commitment = options.commitment ?? config.defaultCommitment;
  const rpcUrl = options.rpcUrl?.trim() || config.heliusRpcUrl;

  const normalizedSignature = normalizeSignature(signature);
  const connection = new Connection(rpcUrl, commitment as Commitment);

  try {
    return await connection.getParsedTransaction(normalizedSignature, {
      maxSupportedTransactionVersion: 0
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch transaction for signature ${normalizedSignature}: ${toErrorMessage(error)}`
    );
  }
}

async function fetchSignatures(
  connection: Connection,
  publicKey: PublicKey,
  count: number,
  walletAddress: string
): Promise<ConfirmedSignatureInfo[]> {
  try {
    return await connection.getSignaturesForAddress(publicKey, { limit: count });
  } catch (error) {
    throw new Error(
      `Failed to fetch signatures for wallet ${walletAddress}: ${toErrorMessage(error)}`
    );
  }
}

async function fetchParsedTransactions(
  connection: Connection,
  signatures: ConfirmedSignatureInfo[]
): Promise<Array<RawTransaction | null>> {
  return Promise.all(
    signatures.map(async ({ signature }) => {
      try {
        return await connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0
        });
      } catch {
        return null;
      }
    })
  );
}

function normalizeCount(count: number | undefined, fallback: number): number {
  if (count === undefined) {
    return fallback;
  }

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Invalid transaction count: ${count}. Count must be a positive integer.`);
  }

  return count;
}

function normalizeSignature(signature: string): string {
  const value = signature.trim();
  if (value.length === 0) {
    throw new Error('Invalid signature: value cannot be empty.');
  }

  return value;
}

function parseWalletAddress(walletAddress: string): PublicKey {
  try {
    return new PublicKey(walletAddress);
  } catch {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
