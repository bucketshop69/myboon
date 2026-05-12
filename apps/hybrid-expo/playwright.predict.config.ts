import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { Keypair } from '@solana/web3.js';
import { keccak256 } from '@ethersproject/keccak256';
import { Wallet } from '@ethersproject/wallet';

const DERIVE_MESSAGE = 'myboon:polymarket:enable';

const unsafeAppRootEnv = resolve(process.cwd(), '.env.e2e.local');
if (existsSync(unsafeAppRootEnv)) {
  throw new Error('Move .env.e2e.local out of apps/hybrid-expo. Use repo-root .predict-e2e.local instead.');
}

loadLocalEnv(resolve(process.cwd(), '.predict-e2e.local'));
loadLocalEnv(resolve(process.cwd(), '../../.predict-e2e.local'));
derivePredictE2EEnvFromPrivateKey();

function loadLocalEnv(path: string) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/u, '$2');
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

function parseSolanaPrivateKey(value: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('PREDICT_E2E_POLYMARKET_PRIVATE_KEY is empty');
  if (trimmed.startsWith('[')) {
    return Uint8Array.from(JSON.parse(trimmed) as number[]);
  }
  if (trimmed.includes(',')) {
    return Uint8Array.from(trimmed.split(',').map((part) => Number.parseInt(part.trim(), 10)));
  }
  return bs58.decode(trimmed);
}

function derivePredictE2EEnvFromPrivateKey() {
  const privateKey = process.env.PREDICT_E2E_POLYMARKET_PRIVATE_KEY;
  if (!privateKey) return;

  const secret = parseSolanaPrivateKey(privateKey);
  const keypair = secret.length === 32
    ? Keypair.fromSeed(secret)
    : Keypair.fromSecretKey(secret);
  const messageBytes = new TextEncoder().encode(DERIVE_MESSAGE);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const sigHex = Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const polygonWallet = new Wallet(keccak256(`0x${sigHex}`));

  process.env.EXPO_PUBLIC_PREDICT_E2E_SOLANA_ADDRESS ??= keypair.publicKey.toBase58();
  process.env.EXPO_PUBLIC_PREDICT_E2E_POLYGON_ADDRESS ??= polygonWallet.address;
  process.env.EXPO_PUBLIC_PREDICT_E2E_DEPOSIT_WALLET_ADDRESS ??=
    process.env.PREDICT_E2E_DEPOSIT_WALLET_ADDRESS
    ?? polygonWallet.address;
  process.env.PREDICT_E2E_POLYMARKET_SIGNATURE_HEX ??= sigHex;
}

function publicEnv(name: string, value: string | undefined) {
  return value ? `${name}=${shellQuote(value)}` : null;
}

const webServerEnv = [
  'EXPO_PUBLIC_PREDICT_E2E=1',
  `EXPO_PUBLIC_API_BASE_URL=${shellQuote(process.env.PREDICT_E2E_API_BASE_URL ?? 'http://127.0.0.1:3000')}`,
  publicEnv('EXPO_PUBLIC_PREDICT_E2E_SOLANA_ADDRESS', process.env.EXPO_PUBLIC_PREDICT_E2E_SOLANA_ADDRESS),
  publicEnv('EXPO_PUBLIC_PREDICT_E2E_POLYGON_ADDRESS', process.env.EXPO_PUBLIC_PREDICT_E2E_POLYGON_ADDRESS),
  publicEnv('EXPO_PUBLIC_PREDICT_E2E_DEPOSIT_WALLET_ADDRESS', process.env.EXPO_PUBLIC_PREDICT_E2E_DEPOSIT_WALLET_ADDRESS),
  'EXPO_NO_TELEMETRY=1',
  'CI=1',
].filter((entry): entry is string => !!entry);

const recordArtifacts = process.env.PREDICT_E2E_RECORD === '1' || process.env.PREDICT_E2E_LIVE === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:19006',
    trace: 'retain-on-failure',
    video: recordArtifacts ? 'on' : 'retain-on-failure',
    screenshot: recordArtifacts ? 'on' : 'only-on-failure',
    viewport: { width: 390, height: 844 },
    ...devices['Pixel 5'],
  },
  webServer: {
    command: [
      ...webServerEnv,
      'pnpm exec expo start --web --port 19006',
    ].join(' '),
    url: 'http://127.0.0.1:19006',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
