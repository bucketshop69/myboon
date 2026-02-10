export type CommitmentLevel = 'confirmed' | 'finalized' | 'processed';

export interface AppConfig {
  heliusRpcUrl: string;
  exampleWallet: string;
  defaultCommitment: CommitmentLevel;
  defaultTxCount: number;
}

interface LoadAppConfigOptions {
  env?: Record<string, string | undefined>;
}

const DEFAULT_COMMITMENT: CommitmentLevel = 'confirmed';
const DEFAULT_TX_COUNT = 50;

export function loadAppConfig(options: LoadAppConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const heliusRpcUrl = readRequiredEnv('HELIUS_RPC_URL', env);
  const exampleWallet = readOptionalEnv('EXAMPLE_WALLET', env) ?? '';

  return {
    heliusRpcUrl,
    exampleWallet,
    defaultCommitment: DEFAULT_COMMITMENT,
    defaultTxCount: DEFAULT_TX_COUNT
  };
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
