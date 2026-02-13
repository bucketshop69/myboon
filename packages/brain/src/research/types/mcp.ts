import type { ResearchResult } from '@pnldotfun/entity-memory';

export type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

type ToolExecute<TArgs extends Record<string, unknown>> = {
  // Bivariant parameter keeps per-tool arg typing while allowing heterogeneous tool arrays.
  bivarianceHack: (args: TArgs) => Promise<unknown>;
}['bivarianceHack'];

export interface ResearchTool<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute: ToolExecute<TArgs>;
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolUseId: string;
  content: unknown;
  isError?: boolean;
}

export interface ResearchLlmStep {
  identifier: string;
  iteration: number;
  assistantText: string;
  toolCalls: string[];
}

export interface ResearchAgentConfig {
  model: string;
  apiKey?: string;
  jupiterApiKey?: string;
  maxIterations?: number;
  concurrency?: number;
  freshnessWindowMs?: number;
  onLlmStep?: (step: ResearchLlmStep) => void;
}

export interface ResearchAuditSummary {
  identifier: string;
  entityId?: string;
  toolsUsed: string[];
  toolsSucceeded: string[];
  toolsFailed: string[];
  confidence: number;
  sentiment: string;
  dataCompleteness: number;
  timestamp: number;
}

export interface ResearchRunResult {
  results: ResearchResult[];
  audit: ResearchAuditSummary[];
}
