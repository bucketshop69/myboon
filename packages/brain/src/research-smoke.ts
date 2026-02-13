import { createEntityMemory } from '@pnldotfun/entity-memory';

import { ResearchAgent } from './research/agent.js';

async function main(): Promise<void> {
  const identifiers = process.argv.slice(2).filter((arg) => arg !== '--');
  if (identifiers.length === 0) {
    throw new Error('Usage: pnpm --filter @pnldotfun/brain research:smoke -- <identifier> [identifier...]');
  }

  const apiKey = process.env.MINIMAX_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing MINIMAX_API_KEY or ANTHROPIC_API_KEY');
  }

  const memory = createEntityMemory();
  const agent = new ResearchAgent(
    {
      model: process.env.RESEARCHER_MODEL ?? 'MiniMax-M2.5',
      apiKey
    },
    memory
  );

  const output = await agent.enrich(identifiers);

  console.log('=== RESEARCH SMOKE RESULT ===');
  console.log(`Identifiers: ${identifiers.join(', ')}`);
  console.log(`Results: ${output.results.length}`);
  for (const result of output.results) {
    console.log(
      `- ${result.slug} (${result.entityId}) sentiment=${result.sentiment} confidence=${result.confidence} completeness=${result.dataCompleteness}%`
    );
  }
  console.log(`Audit entries: ${output.audit.length}`);
}

main().catch((error) => {
  console.error('[research:smoke] failed:', error);
  process.exit(1);
});
