import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

import { StreamPipeline } from '@pnldotfun/tx-parser';
import { createEntityMemory, type EntityMemory } from '@pnldotfun/entity-memory';

import { ClassifierBrain } from './classifier.js';
import { ResearchAgent } from './research/agent.js';
import type { Classification, OrchestratorConfig } from './types/index.js';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class TransactionOrchestrator {
  private readonly pipeline: StreamPipeline;
  private readonly classifier: ClassifierBrain;
  private readonly researchAgent: ResearchAgent | null;
  private readonly entityMemory: EntityMemory;
  private readonly config: OrchestratorConfig;
  private isRunning = false;
  private processingQueue: Promise<void> = Promise.resolve();

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.entityMemory = createEntityMemory();
    this.classifier = new ClassifierBrain(config.classifier);
    this.researchAgent = config.research ? new ResearchAgent(config.research, this.entityMemory) : null;
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

      if (this.config.onClassification) {
        await this.config.onClassification(classification);
      }

      if (this.researchAgent && classification.needsResearch.length > 0) {
        const dedupedTargets = this.dedupeResearchTargets(classification.needsResearch);
        const needsResearch = this.filterFreshResearchTargets(dedupedTargets);

        if (needsResearch.length > 0) {
          const research = await this.researchAgent.enrich(needsResearch);
          if (this.config.auditLog) {
            await this.logAudit('research', {
              batchId,
              results: research.results.map((result) => ({
                entityId: result.entityId,
                confidence: result.confidence,
                sentiment: result.sentiment,
                riskScore: result.riskScore,
                dataCompleteness: result.dataCompleteness
              })),
              audit: research.audit
            });
          }
          if (this.config.onResearch) {
            await this.config.onResearch(research);
          }
        }
      }

      if (this.config.auditLog) {
        await this.logAudit('classification', { batchId, classification });
      }
    } catch (error) {
      console.error(`[Orchestrator] Batch ${batchId} failed: ${toErrorMessage(error)}`);
    }
  }

  private dedupeResearchTargets(mints: string[]): string[] {
    return [...new Set(mints)];
  }

  private filterFreshResearchTargets(identifiers: string[]): string[] {
    const filtered: string[] = [];

    for (const identifier of identifiers) {
      const resolved = this.entityMemory.services.entity.resolveIdentifier(identifier);
      if (!resolved.entity) {
        filtered.push(identifier);
        continue;
      }

      const freshness = this.entityMemory.services.research.checkResearchFreshness(
        resolved.entity.id,
        10 * 60 * 1000
      );
      if (!freshness.fresh) {
        filtered.push(identifier);
      }
    }

    return filtered;
  }

  private async logAudit(type: 'batch' | 'classification' | 'research', data: Record<string, unknown>): Promise<void> {
    if (!this.config.auditPath) {
      return;
    }

    await mkdir(this.config.auditPath, { recursive: true });
    const logFile = path.join(this.config.auditPath, `${type}.jsonl`);
    const line = JSON.stringify({ timestamp: Date.now(), ...data }) + '\n';
    await appendFile(logFile, line);
  }
}
