import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

import { StreamPipeline } from '@pnldotfun/tx-parser';

import { ClassifierBrain } from './classifier.js';
import type { Classification, OrchestratorConfig } from './types/index.js';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class TransactionOrchestrator {
  private readonly pipeline: StreamPipeline;
  private readonly classifier: ClassifierBrain;
  private readonly config: OrchestratorConfig;
  private isRunning = false;
  private processingQueue: Promise<void> = Promise.resolve();

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.classifier = new ClassifierBrain(config.classifier);
    this.pipeline = new StreamPipeline({
      ...config.stream,
      onBatch: (summaries) => {
        this.handleBatch(summaries);
      }
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[Orchestrator] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[Orchestrator] Starting transaction stream...');

    try {
      await this.pipeline.start();
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('[Orchestrator] Stopping transaction stream...');
    await this.pipeline.stop();
    await this.processingQueue;
  }

  private handleBatch(summaries: string[]): void {
    this.processingQueue = this.processingQueue
      .then(async () => {
        await this.processBatchInternal(summaries);
      })
      .catch((error) => {
        console.error('[Orchestrator] Batch processing failed:', error);
      });
  }

  private async processBatchInternal(summaries: string[]): Promise<void> {
    const batchId = Date.now();

    try {
      if (this.config.auditLog) {
        await this.logAudit('batch', { batchId, summaries });
      }

      const classification = await this.classifier.classify(summaries);
      console.log(
        `[Orchestrator] Batch ${batchId}: ${classification.interesting.length} interesting, ${classification.needsResearch.length} need research`
      );

      if (this.config.auditLog) {
        await this.logAudit('classification', { batchId, classification });
      }

      if (this.config.onClassification) {
        await this.config.onClassification(classification);
      }
    } catch (error) {
      console.error(`[Orchestrator] Batch ${batchId} failed: ${toErrorMessage(error)}`);
    }
  }

  private async logAudit(type: 'batch' | 'classification', data: Record<string, unknown>): Promise<void> {
    if (!this.config.auditPath) {
      return;
    }

    await mkdir(this.config.auditPath, { recursive: true });
    const logFile = path.join(this.config.auditPath, `${type}.jsonl`);
    const line = JSON.stringify({ timestamp: Date.now(), ...data }) + '\n';
    await appendFile(logFile, line);
  }
}
