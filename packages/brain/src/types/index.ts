import type { StreamPipelineConfig } from '@pnldotfun/tx-parser';
import type { ResearchResult } from '@pnldotfun/entity-memory';

import type { ResearchAgentConfig, ResearchAuditSummary } from '../research/types/mcp.js';

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
  onLlmResponse?: (payload: {
    rawText: string;
    normalizedText: string;
    summariesCount: number;
  }) => void;
}

export interface OrchestratorConfig {
  stream: Omit<StreamPipelineConfig, 'onBatch'>;
  classifier: ClassifierConfig;
  research?: ResearchAgentConfig;
  auditLog?: boolean;
  auditPath?: string;
  onClassification?: (classification: Classification) => void | Promise<void>;
  onResearch?: (payload: { results: ResearchResult[]; audit: ResearchAuditSummary[] }) => void | Promise<void>;
}
