import { loadAppConfig } from '@pnldotfun/tx-parser';

import { TransactionOrchestrator } from './orchestrator.js';

async function main(): Promise<void> {
  console.log('[Brain] Starting pnl.fun classifier brain...');

  const txConfig = loadAppConfig();
  const apiKey = process.env.MINIMAX_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing MINIMAX_API_KEY or ANTHROPIC_API_KEY');
  }

  const orchestrator = new TransactionOrchestrator({
    stream: {
      rpcUrl: txConfig.heliusRpcUrl,
      wallets: txConfig.watchedWallets,
      batchSize: txConfig.streamSummaryBatchSize,
      commitment: txConfig.defaultCommitment
    },
    classifier: {
      model: process.env.CLASSIFIER_MODEL ?? 'MiniMax-M2.5-lightning',
      apiKey
    },
    research: {
      model: process.env.RESEARCHER_MODEL ?? 'MiniMax-M2.5',
      apiKey,
      jupiterApiKey: process.env.JUPITER_API_KEY,
      maxIterations: 8,
      concurrency: 3,
      freshnessWindowMs: 10 * 60 * 1000
    },
    auditLog: true,
    auditPath: './data/audit',
    onClassification: async (classification) => {
      console.log('\n=== CLASSIFICATION RESULT ===');
      console.log(`Batch processed at: ${new Date().toISOString()}`);
      console.log(`Interesting: ${classification.interesting.length}`);
      console.log(`Need Research: ${classification.needsResearch.length}`);

      if (classification.interesting.length > 0) {
        console.log('\nInteresting transactions:');
        for (const [index, summary] of classification.interesting.entries()) {
          const preview = summary.length > 120 ? `${summary.slice(0, 120)}...` : summary;
          console.log(`  ${index + 1}. ${preview}`);
        }
      }

      if (classification.needsResearch.length > 0) {
        console.log('\nTokens needing research:');
        for (const mint of classification.needsResearch) {
          console.log(`  - ${mint}`);
        }
      }

      if (classification.reasoning) {
        console.log(`\nReasoning: ${classification.reasoning}`);
      }
      console.log('============================\n');
    },
    onResearch: async ({ results, audit }) => {
      console.log('\n=== RESEARCH RESULT ===');
      console.log(`Research completed at: ${new Date().toISOString()}`);
      console.log(`Entities enriched: ${results.length}`);

      for (const result of results) {
        console.log(
          `  - ${result.slug} (${result.entityId}) | sentiment=${result.sentiment} confidence=${result.confidence} risk=${result.riskScore}`
        );
      }

      if (audit.length > 0) {
        console.log('Audit summary:');
        for (const entry of audit) {
          console.log(
            `  - ${entry.identifier} tools=${entry.toolsSucceeded.length}/${entry.toolsUsed.length} completeness=${entry.dataCompleteness}%`
          );
        }
      }

      console.log('=======================\n');
    }
  });

  let shuttingDown = false;
  const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`\n[Brain] Received ${signal}, shutting down gracefully...`);

    try {
      await orchestrator.stop();
      console.log('[Brain] Shutdown complete.');
      process.exit(0);
    } catch (error) {
      console.error('[Brain] Shutdown failed:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await orchestrator.start();
  console.log('[Brain] Classifier brain running. Press Ctrl+C to stop.');
  console.log(`[Brain] Monitoring ${txConfig.watchedWallets.length} wallets for transactions...\n`);
}

main().catch((error) => {
  console.error('[Brain] Fatal error:', error);
  process.exit(1);
});
