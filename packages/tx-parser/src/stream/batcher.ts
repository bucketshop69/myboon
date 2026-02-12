export interface BatcherConfig {
  batchSize: number;
  flushIntervalMs: number;
}

export type BatchCallback = (summaries: string[]) => void;

export class TransactionBatcher {
  private buffer: string[] = [];
  private readonly config: BatcherConfig;
  private readonly onBatch: BatchCallback;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: BatcherConfig, onBatch: BatchCallback) {
    this.config = config;
    this.onBatch = onBatch;
  }

  add(summary: string): void {
    this.buffer.push(summary);

    if (this.buffer.length >= this.config.batchSize) {
      this.flush();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.config.flushIntervalMs);
    }
  }

  flush(): void {
    if (this.buffer.length === 0) {
      return;
    }

    const batch = [...this.buffer];
    this.buffer = [];
    this.clearTimer();
    this.onBatch(batch);
  }

  stop(): void {
    this.flush();
    this.clearTimer();
  }

  private clearTimer(): void {
    if (!this.flushTimer) {
      return;
    }

    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
