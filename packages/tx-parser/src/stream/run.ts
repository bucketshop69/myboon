import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { loadAppConfig } from '../config.js';
import { StreamPipeline } from './pipeline.js';

const DEFAULT_FLUSH_INTERVAL_MS = 60_000;

function loadEnvFromFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function bootstrapEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env')
  ];

  for (const candidate of candidates) {
    loadEnvFromFile(candidate);
  }
}

function readNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${key}: ${raw}. Expected a positive number.`);
  }

  return Math.floor(value);
}

async function main(): Promise<void> {
  bootstrapEnv();

  const config = loadAppConfig();
  const batchSize = config.streamSummaryBatchSize;
  const flushIntervalMs = readNumberEnv('STREAM_FLUSH_INTERVAL_MS', DEFAULT_FLUSH_INTERVAL_MS);

  const pipeline = new StreamPipeline({
    rpcUrl: config.heliusRpcUrl,
    wallets: config.watchedWallets,
    commitment: config.defaultCommitment,
    batchSize,
    flushIntervalMs,
    onBatch: (summaries) => {
      console.log(`\n=== STREAM BATCH (${summaries.length}) ===`);
      for (const summary of summaries) {
        console.log(summary);
      }
    }
  });

  await pipeline.start();

  console.log(`Stream running for ${config.watchedWallets.length} wallets.`);
  console.log(`Batch size: ${batchSize}, flush interval: ${flushIntervalMs}ms`);
  console.log('Press Ctrl+C to stop.');

  const shutdown = async (): Promise<void> => {
    await pipeline.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start stream: ${message}`);
  process.exit(1);
});
