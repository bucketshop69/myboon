import { CLASSIFIER_SYSTEM_PROMPT } from './prompts/classifier.js';
import type { Classification, ClassifierConfig } from './types/index.js';

const MINT_PATTERN = /\(mint:([1-9A-HJ-NP-Za-km-z]{32,44})\)/;
const BASE58_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MINIMAX_MESSAGES_URL = 'https://api.minimax.io/anthropic/v1/messages';

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicUnknownBlock {
  type: string;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicUnknownBlock;

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ClassifierBrain {
  private readonly apiKey: string;
  private readonly config: ClassifierConfig;
  private readonly systemPrompt: string;

  constructor(config: ClassifierConfig) {
    this.config = config;
    this.systemPrompt = config.systemPrompt ?? CLASSIFIER_SYSTEM_PROMPT;
    this.apiKey = this.resolveApiKey(config);
  }

  async classify(summaries: string[]): Promise<Classification> {
    if (summaries.length === 0) {
      return { interesting: [], needsResearch: [] };
    }

    try {
      const response = await fetch(MINIMAX_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 2000,
          system: this.systemPrompt,
          messages: [{ role: 'user', content: this.buildUserPrompt(summaries) }],
          temperature: this.config.temperature ?? 0.1
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MiniMax API ${response.status}: ${errorText}`);
      }

      const json = (await response.json()) as AnthropicMessageResponse;
      const textBlock = json.content?.find(
        (block): block is AnthropicTextBlock => block.type === 'text'
      );
      const contentText = textBlock?.text ?? '';
      if (!contentText) {
        throw new Error('Empty response from classifier LLM');
      }

      return this.parseClassification(contentText, summaries);
    } catch (error) {
      console.error(`[Classifier] classify failed, defaulting to pass-through: ${toErrorMessage(error)}`);
      return this.buildFallbackClassification(summaries, 'LLM failure - defaulted to all interesting');
    }
  }

  private resolveApiKey(config: ClassifierConfig): string {
    if (config.apiKey && config.apiKey.trim().length > 0) {
      return config.apiKey;
    }

    const envApiKey =
      process.env.MINIMAX_API_KEY ??
      process.env.ANTHROPIC_API_KEY ??
      process.env.OPENAI_API_KEY ??
      process.env.CLASSIFIER_API_KEY;
    if (envApiKey && envApiKey.trim().length > 0) {
      return envApiKey;
    }

    throw new Error('Missing MINIMAX_API_KEY or ANTHROPIC_API_KEY');
  }

  private buildUserPrompt(summaries: string[]): string {
    const numberedSummaries = summaries.map((summary, index) => `${index + 1}. ${summary}`).join('\n');
    return `Analyze these ${summaries.length} transactions:\n\n${numberedSummaries}\n\nWhich are interesting? Which tokens need research?`;
  }

  private parseClassification(content: string, summaries: string[]): Classification {
    try {
      const parsed = JSON.parse(content) as Partial<Classification>;
      if (!Array.isArray(parsed.interesting) || !Array.isArray(parsed.needsResearch)) {
        throw new Error('Invalid classification structure');
      }

      const interesting = parsed.interesting
        .filter((summary): summary is string => typeof summary === 'string')
        .filter((summary) => summaries.includes(summary));

      const researchSignals = parsed.needsResearch.filter(
        (item): item is string => typeof item === 'string'
      );

      return {
        interesting,
        needsResearch: this.extractMints(researchSignals, summaries),
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined
      };
    } catch (error) {
      console.error('[Classifier] Parse failed, defaulting to pass-through:', error);
      console.error('[Classifier] Raw LLM response:', content);
      return this.buildFallbackClassification(summaries, 'Parse error - defaulted to all interesting');
    }
  }

  private extractMints(needsResearch: string[], summaries: string[]): string[] {
    const mints = new Set<string>();

    for (const signal of needsResearch) {
      if (this.isValidMint(signal)) {
        mints.add(signal);
      }

      for (const summary of summaries) {
        if (!summary.includes(signal)) {
          continue;
        }

        const mint = this.extractMintFromSummary(summary);
        if (mint) {
          mints.add(mint);
        }
      }
    }

    for (const summary of summaries) {
      if (!summary.includes('(needsResearch)')) {
        continue;
      }

      const mint = this.extractMintFromSummary(summary);
      if (mint) {
        mints.add(mint);
      }
    }

    return [...mints];
  }

  private isValidMint(address: string): boolean {
    return BASE58_MINT_PATTERN.test(address);
  }

  private extractMintFromSummary(summary: string): string | null {
    const match = summary.match(MINT_PATTERN);
    return match ? match[1] : null;
  }

  private buildFallbackClassification(summaries: string[], reasoning: string): Classification {
    return {
      interesting: summaries,
      needsResearch: [],
      reasoning
    };
  }
}
