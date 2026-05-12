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
