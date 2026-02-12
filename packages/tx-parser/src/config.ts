import { getWalletsByCategory, type WalletCategory } from './constants/walletRegistry.js';

export type CommitmentLevel = 'confirmed' | 'finalized' | 'processed';
export type WalletFilterCategory = WalletCategory | 'all';

export interface AppConfig {
  heliusRpcUrl: string;
  exampleWallet: string;
  defaultCommitment: CommitmentLevel;
  defaultTxCount: number;
  watchedWallets: string[];
  streamSummaryBatchSize: number;
}

interface LoadAppConfigOptions {
  env?: Record<string, string | undefined>;
}

const DEFAULT_COMMITMENT: CommitmentLevel = 'confirmed';
const DEFAULT_TX_COUNT = 50;
const DEFAULT_STREAM_SUMMARY_BATCH_SIZE = 2;
const DEFAULT_WALLET_FILTER: WalletFilterCategory = 'all';
const VALID_WALLET_FILTER_CATEGORIES = new Set<WalletFilterCategory>([
  'all',
  'kol',
  'whale',
  'trader',
  'meme',
  'dlmm',
  'other'
]);

export function loadAppConfig(options: LoadAppConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const heliusRpcUrl = readRequiredEnv('HELIUS_RPC_URL', env);
  const exampleWallet = readOptionalEnv('EXAMPLE_WALLET', env) ?? '';
  const watchedWalletFilter = readOptionalEnv('WATCHED_WALLETS', env) ?? DEFAULT_WALLET_FILTER;
  const watchedWallets = parseWalletFilter(watchedWalletFilter);
  const streamSummaryBatchSize = readPositiveIntegerEnv(
    ['STREAM_SUMMARY_BATCH_SIZE', 'STREAM_BATCH_SIZE'],
    env,
    DEFAULT_STREAM_SUMMARY_BATCH_SIZE
  );

  return {
    heliusRpcUrl,
    exampleWallet,
    defaultCommitment: DEFAULT_COMMITMENT,
    defaultTxCount: DEFAULT_TX_COUNT,
    watchedWallets,
    streamSummaryBatchSize
  };
}

export function parseWalletFilter(filter: string): string[] {
  const normalizedFilter = filter.trim();
  if (normalizedFilter.length === 0) {
    return getWalletsByCategory(DEFAULT_WALLET_FILTER);
  }

  if (VALID_WALLET_FILTER_CATEGORIES.has(normalizedFilter as WalletFilterCategory)) {
    return getWalletsByCategory(normalizedFilter as WalletFilterCategory);
  }

  if (/^[a-z-]+$/.test(normalizedFilter)) {
    const validCategories = [...VALID_WALLET_FILTER_CATEGORIES].join(', ');
    throw new Error(
      `Invalid WATCHED_WALLETS category: "${normalizedFilter}". Valid: ${validCategories}`
    );
  }

  return normalizedFilter
    .split(',')
    .map((wallet) => wallet.trim())
    .filter((wallet) => wallet.length > 0);
}

function readRequiredEnv(
  key: string,
  env: Record<string, string | undefined>
): string {
  const value = readOptionalEnv(key, env);
  if (!value) {
    throw new Error(`Missing ${key}. Define it in the root .env or process environment.`);
  }

  return value;
}

function readOptionalEnv(
  key: string,
  env: Record<string, string | undefined>
): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readPositiveIntegerEnv(
  keys: string[],
  env: Record<string, string | undefined>,
  fallback: number
): number {
  for (const key of keys) {
    const value = readOptionalEnv(key, env);
    if (!value) {
      continue;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid ${key}: ${value}. Expected a positive integer.`);
    }

    return parsed;
  }

  return fallback;
}
