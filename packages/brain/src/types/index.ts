import type { StreamPipelineConfig } from '@pnldotfun/tx-parser';

export interface Classification {
  interesting: string[];
  needsResearch: string[];
  reasoning?: string;
}

export interface ClassifierConfig {
  model: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface OrchestratorConfig {
  stream: Omit<StreamPipelineConfig, 'onBatch'>;
  classifier: ClassifierConfig;
  auditLog?: boolean;
  auditPath?: string;
  onClassification?: (classification: Classification) => void | Promise<void>;
}
