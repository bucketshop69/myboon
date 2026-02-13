import type {
  AnthropicToolDefinition,
  ToolCall,
  ToolResult
} from '../types/mcp.js';

const MINIMAX_MESSAGES_URL = 'https://api.minimax.io/anthropic/v1/messages';

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AssistantContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string };

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

interface AnthropicResponse {
  content?: AssistantContentBlock[];
}

export interface MiniMaxToolResponse {
  text: string;
  toolCalls: ToolCall[];
  assistantContent: Array<Record<string, unknown>>;
}

export class MiniMaxToolClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async createMessage(params: {
    system: string;
    messages: AnthropicMessage[];
    tools: AnthropicToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<MiniMaxToolResponse> {
    const response = await fetch(MINIMAX_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: params.maxTokens ?? 2000,
        system: params.system,
        messages: params.messages,
        tools: params.tools,
        temperature: params.temperature ?? 0.1
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`MiniMax API ${response.status}: ${body}`);
    }

    const parsed = (await response.json()) as AnthropicResponse;
    const contentBlocks = parsed.content ?? [];

    const text = contentBlocks
      .filter((block): block is AnthropicTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const toolCalls = contentBlocks
      .filter((block): block is AnthropicToolUseBlock => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input ?? {}
      }));

    return {
      text,
      toolCalls,
      assistantContent: contentBlocks as Array<Record<string, unknown>>
    };
  }
}

export function toAnthropicToolResultMessage(result: ToolResult): AnthropicMessage {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: JSON.stringify(result.content),
        is_error: result.isError ?? false
      }
    ]
  };
}
