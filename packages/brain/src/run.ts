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
