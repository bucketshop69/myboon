import { CLASSIFIER_SYSTEM_PROMPT } from './prompts/classifier.js';
import type { Classification, ClassifierConfig } from './types/index.js';

const MINT_PATTERN = /\(mint:([1-9A-HJ-NP-Za-km-z]{32,44})\)/;
const BASE58_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

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
      const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: this.buildUserPrompt(summaries) }
          ],
          response_format: { type: 'json_object' },
          temperature: this.config.temperature ?? 0.1
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API ${response.status}: ${errorText}`);
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };

      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from classifier LLM');
      }

      return this.parseClassification(content, summaries);
    } catch (error) {
      console.error(`[Classifier] classify failed, defaulting to pass-through: ${toErrorMessage(error)}`);
      return this.buildFallbackClassification(summaries, 'LLM failure - defaulted to all interesting');
    }
  }

  private resolveApiKey(config: ClassifierConfig): string {
    if (config.apiKey && config.apiKey.trim().length > 0) {
      return config.apiKey;
    }

    const envApiKey = process.env.OPENAI_API_KEY ?? process.env.CLASSIFIER_API_KEY;
    if (envApiKey && envApiKey.trim().length > 0) {
      return envApiKey;
    }

    throw new Error('Missing OPENAI_API_KEY or CLASSIFIER_API_KEY');
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
