import {
  Connection,
  PublicKey,
  type Commitment,
  type Logs
} from '@solana/web3.js';

import { parseSingleTransaction } from '../parsers/transaction.js';
import { TransactionBatcher, type BatchCallback, type BatcherConfig } from './batcher.js';
import { isRelevantTransaction } from './filter.js';
import { formatTransactionForLLM } from './formatter.js';

interface PipelineLogger {
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface StreamPipelineConfig {
  rpcUrl: string;
  wallets: string[];
  batchSize?: number;
  flushIntervalMs?: number;
  commitment?: Commitment;
  onBatch: BatchCallback;
  maxTrackedSignatures?: number;
  logger?: PipelineLogger;
}

const DEFAULT_BATCHER_CONFIG: BatcherConfig = {
  batchSize: 10,
  flushIntervalMs: 60_000
};

const DEFAULT_MAX_TRACKED_SIGNATURES = 1000;

export class StreamPipeline {
  private readonly connection: Connection;
  private readonly config: StreamPipelineConfig;
  private readonly batcher: TransactionBatcher;
  private readonly logger: PipelineLogger;
  private readonly seenSignatures = new Set<string>();
  private readonly signatureQueue: string[] = [];
  private readonly maxTrackedSignatures: number;
  private readonly commitment: Commitment;

  private subscriptionIds: number[] = [];
  private isRunning = false;

  constructor(config: StreamPipelineConfig) {
    this.config = config;
    this.commitment = config.commitment ?? 'confirmed';
    this.connection = new Connection(config.rpcUrl, this.commitment);
    this.batcher = new TransactionBatcher(
      {
        batchSize: config.batchSize ?? DEFAULT_BATCHER_CONFIG.batchSize,
        flushIntervalMs: config.flushIntervalMs ?? DEFAULT_BATCHER_CONFIG.flushIntervalMs
      },
      config.onBatch
    );
    this.maxTrackedSignatures = config.maxTrackedSignatures ?? DEFAULT_MAX_TRACKED_SIGNATURES;
    this.logger = config.logger ?? console;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('StreamPipeline already running');
      return;
    }

    this.isRunning = true;

    try {
      for (const walletAddress of this.config.wallets) {
        const publicKey = this.parseWallet(walletAddress);
        const subscriptionId = this.connection.onLogs(
          publicKey,
          (logs) => {
            void this.handleLogs(walletAddress, logs);
          },
          this.commitment
        );

        this.subscriptionIds.push(subscriptionId);
      }
    } catch (error) {
      this.isRunning = false;
      await this.unsubscribeAll();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    await this.unsubscribeAll();
    this.batcher.stop();
    this.seenSignatures.clear();
    this.signatureQueue.length = 0;
  }

  private parseWallet(walletAddress: string): PublicKey {
    try {
      return new PublicKey(walletAddress);
    } catch {
      throw new Error(`Invalid wallet address in stream config: ${walletAddress}`);
    }
  }

  private async unsubscribeAll(): Promise<void> {
    const subscriptionIds = [...this.subscriptionIds];
    this.subscriptionIds = [];

    await Promise.all(
      subscriptionIds.map(async (subscriptionId) => {
        try {
          await this.connection.removeOnLogsListener(subscriptionId);
        } catch (error) {
          this.logger.warn(
            `Failed to remove onLogs listener ${subscriptionId}: ${toErrorMessage(error)}`
          );
        }
      })
    );
  }

  private async handleLogs(walletAddress: string, logs: Logs): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (logs.err) {
      return;
    }

    const signature = logs.signature;
    if (!this.rememberSignature(signature)) {
      return;
    }

    try {
      const transaction = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!transaction) {
        return;
      }

      const parsed = parseSingleTransaction(transaction, signature);
      if (!isRelevantTransaction(parsed)) {
        return;
      }

      const summary = formatTransactionForLLM(parsed, walletAddress);
      this.batcher.add(summary);
    } catch (error) {
      this.logger.warn(
        `Failed processing signature ${signature} for wallet ${walletAddress}: ${toErrorMessage(error)}`
      );
    }
  }

  private rememberSignature(signature: string): boolean {
    if (this.seenSignatures.has(signature)) {
      return false;
    }

    this.seenSignatures.add(signature);
    this.signatureQueue.push(signature);

    if (this.signatureQueue.length > this.maxTrackedSignatures) {
      const oldest = this.signatureQueue.shift();
      if (oldest) {
        this.seenSignatures.delete(oldest);
      }
    }

    return true;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
