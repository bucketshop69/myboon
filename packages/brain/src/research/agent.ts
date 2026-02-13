import type { EntityMemory, ResearchResult } from '@pnldotfun/entity-memory';

import { MiniMaxToolClient, toAnthropicToolResultMessage, type AnthropicMessage } from './llm/minimax.js';
import { RESEARCH_SYSTEM_PROMPT } from './prompts/research.js';
import { createResearchToolRegistry } from './tools/registry.js';
import type { TokenMetadata } from './data-sources/jupiter-tokens.client.js';
import type {
  ResearchAgentConfig,
  ResearchAuditSummary,
  ResearchRunResult,
  ToolResult
} from './types/mcp.js';

const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_FRESHNESS_WINDOW_MS = 10 * 60 * 1000;
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type SynthesizedFindings = {
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  confidence: number;
  risks: string[];
  opportunities: string[];
  metadata: Record<string, unknown>;
};

interface InternalResearchAgentConfig {
  model: string;
  apiKey: string;
  jupiterApiKey?: string;
  maxIterations: number;
  concurrency: number;
  freshnessWindowMs: number;
  onLlmStep?: ResearchAgentConfig['onLlmStep'];
}

export class ResearchAgent {
  private readonly config: InternalResearchAgentConfig;
  private readonly client: MiniMaxToolClient;
  private readonly toolRegistry: ReturnType<typeof createResearchToolRegistry>;
  private readonly memory: EntityMemory;

  constructor(config: ResearchAgentConfig, memory: EntityMemory) {
    const apiKey = config.apiKey ?? process.env.MINIMAX_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing MINIMAX_API_KEY or ANTHROPIC_API_KEY for ResearchAgent');
    }

    this.config = {
      model: config.model,
      apiKey,
      jupiterApiKey: config.jupiterApiKey ?? process.env.JUPITER_API_KEY,
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      concurrency: config.concurrency ?? DEFAULT_CONCURRENCY,
      freshnessWindowMs: config.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS,
      onLlmStep: config.onLlmStep
    };
    this.client = new MiniMaxToolClient(apiKey, config.model);
    this.memory = memory;
    this.toolRegistry = createResearchToolRegistry(memory, {
      jupiterApiKey: this.config.jupiterApiKey
    });
  }

  async enrich(identifiers: string[]): Promise<ResearchRunResult> {
    const uniqueIdentifiers = [...new Set(identifiers.map((identifier) => identifier.trim()).filter(Boolean))];
    if (uniqueIdentifiers.length === 0) {
      return { results: [], audit: [] };
    }

    const allResults: ResearchResult[] = [];
    const allAudit: ResearchAuditSummary[] = [];

    const batches = chunk(uniqueIdentifiers, this.config.concurrency);
    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map((identifier) => this.researchIdentifier(identifier)));
      for (const item of batchResults) {
        if (item.result) {
          allResults.push(item.result);
        }
        allAudit.push(item.audit);
      }
    }

    return { results: allResults, audit: allAudit };
  }

  private async researchIdentifier(identifier: string): Promise<{
    result: ResearchResult | null;
    audit: ResearchAuditSummary;
  }> {
    const toolsUsed: string[] = [];
    const toolsSucceeded: string[] = [];
    const toolsFailed: string[] = [];
    const sourceAudit = new Map<string, { success: boolean; error?: string }>();

    try {
      const resolveResult = await this.executeTool('resolve_entity', { identifier }, {
        toolsUsed,
        toolsSucceeded,
        toolsFailed,
        sourceAudit
      });

      let entityId = this.getEntityIdFromResolveResult(resolveResult);
      let prefetchedTokenMetadata: TokenMetadata | null = null;
      if (!entityId) {
        prefetchedTokenMetadata = await this.prefetchTokenMetadata(identifier, {
          toolsUsed,
          toolsSucceeded,
          toolsFailed,
          sourceAudit
        });
        entityId = await this.createUnverifiedEntity(identifier, {
          toolsUsed,
          toolsSucceeded,
          toolsFailed,
          sourceAudit
        }, prefetchedTokenMetadata);
      }

      if (!entityId) {
        const audit = this.buildAudit(
          identifier,
          undefined,
          toolsUsed,
          toolsSucceeded,
          toolsFailed,
          0,
          'unknown',
          0
        );
        return { result: null, audit };
      }

      const freshness = await this.executeTool(
        'check_research_freshness',
        { entityId, maxAgeMs: this.config.freshnessWindowMs },
        { toolsUsed, toolsSucceeded, toolsFailed, sourceAudit }
      );

      if (this.isFresh(freshness)) {
        await this.executeTool('get_cached_research', { entityId }, {
          toolsUsed,
          toolsSucceeded,
          toolsFailed,
          sourceAudit
        });
        const result = this.memory.services.research.toResearchResult(entityId);
        const audit = this.buildAudit(
          identifier,
          entityId,
          toolsUsed,
          toolsSucceeded,
          toolsFailed,
          result?.confidence ?? 0,
          result?.sentiment ?? 'unknown',
          result?.dataCompleteness ?? 0
        );
        return { result, audit };
      }

      if (!prefetchedTokenMetadata) {
        prefetchedTokenMetadata = await this.prefetchTokenMetadata(identifier, {
          toolsUsed,
          toolsSucceeded,
          toolsFailed,
          sourceAudit
        });
      }

      const llmOutput = await this.runResearchLoop(entityId, identifier, {
        toolsUsed,
        toolsSucceeded,
        toolsFailed,
        sourceAudit
      }, prefetchedTokenMetadata);

      const sourceList = [...sourceAudit.entries()].map(([tool, value]) => ({
        tool,
        success: value.success,
        error: value.error,
        timestamp: Date.now()
      }));

      if (!llmOutput.storeCalled) {
        const findingsMetadata = prefetchedTokenMetadata
          ? { ...llmOutput.findings.metadata, tokenMetadata: prefetchedTokenMetadata }
          : llmOutput.findings.metadata;

        await this.executeTool(
          'store_research_results',
          {
            entityId,
            findings: {
              summary: llmOutput.findings.summary,
              sentiment: llmOutput.findings.sentiment,
              confidence: llmOutput.findings.confidence,
              risks: llmOutput.findings.risks,
              opportunities: llmOutput.findings.opportunities,
              metadata: findingsMetadata
            },
            sources: sourceList
          },
          { toolsUsed, toolsSucceeded, toolsFailed, sourceAudit }
        );
      }

      const result = this.memory.services.research.toResearchResult(entityId);
      const audit = this.buildAudit(
        identifier,
        entityId,
        toolsUsed,
        toolsSucceeded,
        toolsFailed,
        result?.confidence ?? 0,
        result?.sentiment ?? 'unknown',
        result?.dataCompleteness ?? 0
      );

      return { result, audit };
    } catch (error) {
      const message = toErrorMessage(error);
      toolsUsed.push('research_agent');
      toolsFailed.push('research_agent');
      sourceAudit.set('research_agent', { success: false, error: message });
      const audit = this.buildAudit(
        identifier,
        undefined,
        toolsUsed,
        toolsSucceeded,
        toolsFailed,
        0,
        'unknown',
        0
      );
      return { result: null, audit };
    }
  }

  private async runResearchLoop(
    entityId: string,
    identifier: string,
    tracking: ToolTracking,
    prefetchedTokenMetadata: TokenMetadata | null
  ): Promise<{
    storeCalled: boolean;
    findings: SynthesizedFindings;
  }> {
    const metadataPromptSection = prefetchedTokenMetadata
      ? `\nPrefetched token metadata:\n${JSON.stringify(prefetchedTokenMetadata)}`
      : '';

    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: `Research identifier "${identifier}" for entityId "${entityId}" using available tools.${metadataPromptSection}`
      }
    ];

    let storeCalled = false;
    let parsedFindings: SynthesizedFindings = this.defaultFindings(identifier, prefetchedTokenMetadata);

    for (let iteration = 0; iteration < this.config.maxIterations; iteration += 1) {
      tracking.toolsUsed.push('research_llm');
      let response: Awaited<ReturnType<MiniMaxToolClient['createMessage']>>;
      try {
        response = await this.client.createMessage({
          system: RESEARCH_SYSTEM_PROMPT,
          messages,
          tools: this.toolRegistry.toAnthropicDefinitions(),
          temperature: 0.2
        });
        tracking.toolsSucceeded.push('research_llm');
        tracking.sourceAudit.set('research_llm', { success: true });
        this.config.onLlmStep?.({
          identifier,
          iteration: iteration + 1,
          assistantText: response.text,
          toolCalls: response.toolCalls.map((call) => call.name)
        });
      } catch (error) {
        const message = toErrorMessage(error);
        tracking.toolsFailed.push('research_llm');
        tracking.sourceAudit.set('research_llm', { success: false, error: message });
        this.config.onLlmStep?.({
          identifier,
          iteration: iteration + 1,
          assistantText: `[error] ${message}`,
          toolCalls: []
        });
        parsedFindings = this.defaultFindings(identifier, prefetchedTokenMetadata);
        break;
      }

      if (response.assistantContent.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.assistantContent
        });
      }

      if (response.toolCalls.length === 0) {
        parsedFindings = this.parseFindings(response.text, identifier, prefetchedTokenMetadata);
        break;
      }

      for (const toolCall of response.toolCalls) {
        const result = await this.executeTool(toolCall.name, toolCall.input, tracking, toolCall.id);
        if (toolCall.name === 'store_research_results' && !result.isError) {
          storeCalled = true;
        }
        messages.push(toAnthropicToolResultMessage(result));
      }
    }

    return {
      storeCalled,
      findings: parsedFindings
    };
  }

  private async prefetchTokenMetadata(
    identifier: string,
    tracking: ToolTracking
  ): Promise<TokenMetadata | null> {
    if (!MINT_PATTERN.test(identifier)) {
      return null;
    }

    const result = await this.executeTool('get_token_metadata', { mint: identifier }, tracking);
    return this.extractTokenMetadata(result);
  }

  private async createUnverifiedEntity(
    identifier: string,
    tracking: ToolTracking,
    prefetchedTokenMetadata: TokenMetadata | null
  ): Promise<string | null> {
    const name = prefetchedTokenMetadata?.name ?? (
      MINT_PATTERN.test(identifier)
        ? `Token ${identifier.slice(0, 6)}`
        : identifier
    );

    const created = await this.executeTool(
      'create_entity',
      {
        name,
        symbol: prefetchedTokenMetadata?.symbol,
        type: 'crypto-token',
        metadata: {
          category: ['unverified'],
          tags: ['pending-verification'],
          tokenMetadata: prefetchedTokenMetadata ?? undefined
        }
      },
      tracking
    );

    const entityId = this.getEntityIdFromCreateResult(created);
    if (!entityId) {
      return null;
    }

    if (MINT_PATTERN.test(identifier)) {
      await this.executeTool(
        'add_representation',
        {
          entityId,
          type: 'spot-token',
          protocol: 'unknown',
          chain: 'solana',
          context: {
            mint: identifier
          }
        },
        tracking
      );
    }

    return entityId;
  }

  private defaultFindings(
    identifier: string,
    prefetchedTokenMetadata: TokenMetadata | null = null
  ): SynthesizedFindings {
    return {
      summary: `Baseline research completed for ${identifier}. Metadata coverage is limited to Jupiter token data in current milestone.`,
      sentiment: 'unknown' as const,
      confidence: 40,
      risks: ['Incomplete source coverage (market/news/sentiment tools deferred)'],
      opportunities: ['Entity captured for iterative enrichment'],
      metadata: prefetchedTokenMetadata ? { tokenMetadata: prefetchedTokenMetadata } : {}
    };
  }

  private parseFindings(
    text: string,
    identifier: string,
    prefetchedTokenMetadata: TokenMetadata | null = null
  ): SynthesizedFindings {
    try {
      const parsed = JSON.parse(text) as {
        summary?: string;
        sentiment?: 'bullish' | 'bearish' | 'neutral' | 'unknown';
        confidence?: number;
        risks?: string[];
        opportunities?: string[];
        metadata?: Record<string, unknown>;
      };

      return {
        summary: parsed.summary ?? this.defaultFindings(identifier, prefetchedTokenMetadata).summary,
        sentiment: parsed.sentiment ?? 'unknown',
        confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 40))),
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
        opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
        metadata: parsed.metadata ?? (
          prefetchedTokenMetadata ? { tokenMetadata: prefetchedTokenMetadata } : {}
        )
      };
    } catch {
      return this.defaultFindings(identifier, prefetchedTokenMetadata);
    }
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    tracking: ToolTracking,
    explicitToolUseId?: string
  ): Promise<ToolResult> {
    tracking.toolsUsed.push(name);
    const tool = this.toolRegistry.byName.get(name);
    const toolUseId = explicitToolUseId ?? `tool_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    if (!tool) {
      tracking.toolsFailed.push(name);
      tracking.sourceAudit.set(name, { success: false, error: `Unknown tool: ${name}` });
      return {
        toolUseId,
        content: { error: `Unknown tool: ${name}` },
        isError: true
      };
    }

    try {
      const output = await tool.execute(input);
      tracking.toolsSucceeded.push(name);
      tracking.sourceAudit.set(name, { success: true });
      return {
        toolUseId,
        content: output
      };
    } catch (error) {
      const message = toErrorMessage(error);
      tracking.toolsFailed.push(name);
      tracking.sourceAudit.set(name, { success: false, error: message });
      return {
        toolUseId,
        content: { error: message },
        isError: true
      };
    }
  }

  private getEntityIdFromResolveResult(output: unknown): string | null {
    const payload = this.unwrapToolOutput(output);
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const entity = (payload as { entity?: { id?: unknown } }).entity;
    return entity && typeof entity.id === 'string' ? entity.id : null;
  }

  private getEntityIdFromCreateResult(output: unknown): string | null {
    const payload = this.unwrapToolOutput(output);
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const entity = (payload as { entity?: { id?: unknown } }).entity;
    return entity && typeof entity.id === 'string' ? entity.id : null;
  }

  private isFresh(output: unknown): boolean {
    const payload = this.unwrapToolOutput(output);
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const fresh = (payload as { fresh?: unknown }).fresh;
    return fresh === true;
  }

  private unwrapToolOutput(output: unknown): unknown {
    if (!output || typeof output !== 'object') {
      return output;
    }

    if ('content' in output) {
      return (output as { content: unknown }).content;
    }

    return output;
  }

  private extractTokenMetadata(output: unknown): TokenMetadata | null {
    const payload = this.unwrapToolOutput(output);
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const found = (payload as { found?: unknown }).found;
    if (found !== true) {
      return null;
    }

    const token = (payload as { token?: unknown }).token;
    if (!token || typeof token !== 'object') {
      return null;
    }

    return token as TokenMetadata;
  }

  private buildAudit(
    identifier: string,
    entityId: string | undefined,
    toolsUsed: string[],
    toolsSucceeded: string[],
    toolsFailed: string[],
    confidence: number,
    sentiment: string,
    dataCompleteness: number
  ): ResearchAuditSummary {
    return {
      identifier,
      entityId,
      toolsUsed: [...toolsUsed],
      toolsSucceeded: [...toolsSucceeded],
      toolsFailed: [...toolsFailed],
      confidence,
      sentiment,
      dataCompleteness,
      timestamp: Date.now()
    };
  }
}

interface ToolTracking {
  toolsUsed: string[];
  toolsSucceeded: string[];
  toolsFailed: string[];
  sourceAudit: Map<string, { success: boolean; error?: string }>;
}
