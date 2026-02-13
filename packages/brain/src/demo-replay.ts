import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createEntityMemory } from '@pnldotfun/entity-memory';
import {
  fetchWalletTransactions,
  formatTransactionForLLM,
  isRelevantTransaction,
  loadAppConfig,
  parseSingleTransaction
} from '@pnldotfun/tx-parser';

import { ClassifierBrain } from './classifier.js';
import { ResearchAgent } from './research/agent.js';

const DEFAULT_TX_COUNT = 4;
const DEFAULT_DELAY_MS = 3000;
const DEFAULT_BATCH_SIZE = 2;
const MINT_IN_SUMMARY_PATTERN = /\(mint:([1-9A-HJ-NP-Za-km-z]{32,44})\)/g;

function loadDotEnvFromWorkspace(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env')
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) {
      continue;
    }

    const content = readFileSync(envPath, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const eqIndex = line.indexOf('=');
      if (eqIndex <= 0) {
        continue;
      }

      const key = line.slice(0, eqIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = line.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }

    return;
  }
}

interface DemoOptions {
  wallet: string;
  count: number;
  batchSize: number;
  delayMs: number;
  preloadCache: boolean;
}

interface ReplayItem {
  signature: string;
  summary: string;
  type: string;
  protocol: string;
}

interface ResearchStepSummary {
  storedCount: number;
  cacheHitCount: number;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${value}. Expected a positive integer.`);
  }

  return parsed;
}

function parseArgs(): DemoOptions {
  const config = loadAppConfig();
  const argv = process.argv.slice(2).filter((arg) => arg !== '--');

  let wallet = config.exampleWallet;
  let count = DEFAULT_TX_COUNT;
  let batchSize = config.streamSummaryBatchSize || DEFAULT_BATCH_SIZE;
  let delayMs = DEFAULT_DELAY_MS;
  let preloadCache = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--wallet' && next) {
      wallet = next;
      i += 1;
      continue;
    }
    if (arg === '--count' && next) {
      count = parseInteger(next, count, '--count');
      i += 1;
      continue;
    }
    if (arg === '--batchSize' && next) {
      batchSize = parseInteger(next, batchSize, '--batchSize');
      i += 1;
      continue;
    }
    if (arg === '--delayMs' && next) {
      delayMs = parseInteger(next, delayMs, '--delayMs');
      i += 1;
      continue;
    }
    if (arg === '--preloadCache') {
      preloadCache = true;
      continue;
    }
  }

  if (!wallet) {
    throw new Error(
      'Missing wallet. Provide EXAMPLE_WALLET in env or pass --wallet <base58-address>.'
    );
  }

  return { wallet, count, batchSize, delayMs, preloadCache };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatDurationMs(startMs: number, endMs: number): string {
  return `${((endMs - startMs) / 1000).toFixed(1)}s`;
}

function shortenForConsole(value: string, maxLength = 800): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function extractMints(summary: string): string[] {
  const mints: string[] = [];
  let match: RegExpExecArray | null = null;
  MINT_IN_SUMMARY_PATTERN.lastIndex = 0;

  while (true) {
    match = MINT_IN_SUMMARY_PATTERN.exec(summary);
    if (!match) {
      break;
    }
    mints.push(match[1]);
  }

  return mints;
}

function extractNeedsResearchMints(summaries: string[]): string[] {
  const deduped = new Set<string>();
  for (const summary of summaries) {
    if (!summary.includes('(needsResearch)')) {
      continue;
    }
    for (const mint of extractMints(summary)) {
      deduped.add(mint);
    }
  }
  return [...deduped];
}

async function main(): Promise<void> {
  loadDotEnvFromWorkspace();
  const config = loadAppConfig();
  const options = parseArgs();
  const pipelineStartMs = Date.now();

  const classifier = new ClassifierBrain({
    model: process.env.CLASSIFIER_MODEL ?? 'MiniMax-M2.5-lightning',
    onLlmResponse: ({ normalizedText, summariesCount }) => {
      console.log(`[Classifier][LLM] response for ${summariesCount} tx:`);
      console.log(`  ${shortenForConsole(normalizedText)}`);
    }
  });

  const memory = createEntityMemory();
  const researchAgent = new ResearchAgent(
    {
      model: process.env.RESEARCHER_MODEL ?? 'MiniMax-M2.5',
      apiKey: process.env.MINIMAX_API_KEY ?? process.env.ANTHROPIC_API_KEY,
      jupiterApiKey: process.env.JUPITER_API_KEY,
      maxIterations: 8,
      concurrency: 2,
      freshnessWindowMs: 10 * 60 * 1000,
      onLlmStep: ({ identifier, iteration, assistantText, toolCalls }) => {
        const tools = toolCalls.length > 0 ? toolCalls.join(', ') : 'none';
        console.log(`[Research][LLM] ${identifier} iter=${iteration} toolCalls=${tools}`);
        if (assistantText.trim().length > 0) {
          console.log(`  ${shortenForConsole(assistantText)}`);
        }
      }
    },
    memory
  );

  const fetchCount = Math.max(options.count * 3, options.count);
  console.log(`[Stream] Fetching transactions from wallet ${options.wallet}`);
  const rawTransactions = await fetchWalletTransactions(options.wallet, {
    count: fetchCount,
    rpcUrl: config.heliusRpcUrl
  });
  console.log(`[Stream] Found ${rawTransactions.length} transactions in recent history`);

  const relevant: ReplayItem[] = [];
  for (const tx of rawTransactions) {
    const parsed = parseSingleTransaction(tx, tx.transaction.signatures[0]);
    if (!isRelevantTransaction(parsed)) {
      continue;
    }

    relevant.push({
      signature: parsed.signature,
      summary: formatTransactionForLLM(parsed, options.wallet),
      type: parsed.type,
      protocol: parsed.protocol
    });

    if (relevant.length >= options.count) {
      break;
    }
  }

  if (relevant.length === 0) {
    console.log('[Demo] No relevant transactions found in recent history.');
    return;
  }

  const chronological = [...relevant].reverse();
  const preloadedMint = extractNeedsResearchMints(chronological.map((tx) => tx.summary))[0];

  if (options.preloadCache && preloadedMint) {
    const entity = memory.services.entity.createEntity({
      name: `Preloaded ${preloadedMint.slice(0, 6)}`,
      symbol: undefined,
      type: 'crypto-token',
      metadata: {
        category: ['demo'],
        tags: ['preloaded-cache']
      }
    });
    memory.services.entity.addRepresentation({
      entityId: entity.id,
      type: 'spot-token',
      protocol: 'demo-preload',
      chain: 'solana',
      context: { mint: preloadedMint }
    });
    memory.services.research.completeResearch({
      entityId: entity.id,
      findings: {
        summary: `Preloaded cached research for ${preloadedMint}`,
        sentiment: 'neutral',
        confidence: 70,
        risks: ['Demo preloaded cache'],
        opportunities: ['Immediate cache hit verification'],
        metadata: { source: 'demo-preload' }
      },
      sources: [
        { tool: 'demo-seed-1', success: true, timestamp: Date.now() },
        { tool: 'demo-seed-2', success: true, timestamp: Date.now() }
      ],
      ttl: 3600
    });
    console.log(`[Research] Preloaded cache for ${preloadedMint} (demo mode).`);
  } else if (options.preloadCache) {
    console.log('[Research] Preload requested, but no needsResearch mint found.');
  } else {
    console.log('[Research] Preload disabled. First target will use fresh path if cache is empty.');
  }

  const batches = chunk(chronological, options.batchSize);
  console.log(`[Stream] Filtered to ${chronological.length} relevant transactions (buy/sell/lp/perp)`);
  console.log(`[Stream] Batched into ${batches.length} batches (batchSize=${options.batchSize})`);

  let totalStored = 0;
  let totalCacheHits = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batchStartMs = Date.now();
    const batchNumber = batchIndex + 1;
    const batch = batches[batchIndex];

    console.log(`\n[Batch ${batchNumber}/${batches.length}] Processing ${batch.length} transactions`);
    for (const item of batch) {
      console.log(`  [Tx] ${item.signature.slice(0, 10)}... ${item.type} on ${item.protocol}`);
    }

    const summaries = batch.map((item) => item.summary);
    console.log(`[Classifier] Analyzing batch of ${summaries.length} transactions...`);
    const classification = await classifier.classify(summaries);
    const summaryMints = extractNeedsResearchMints(summaries);
    const needsResearch = [...new Set([...classification.needsResearch, ...summaryMints])];

    console.log(
      `[Classifier] Interesting=${classification.interesting.length}, NeedsResearch=${needsResearch.length}`
    );
    if (summaryMints.length > 0 && classification.needsResearch.length < summaryMints.length) {
      console.log(
        `[Classifier] Supplemented research targets from (needsResearch) flags: ${summaryMints.join(', ')}`
      );
    }

    if (needsResearch.length > 0) {
      console.log('[Classifier] Handoff -> Research Agent');
      console.log(`[Research] Targets: ${needsResearch.join(', ')}`);
      const run = await researchAgent.enrich(needsResearch);
      const researchSummary: ResearchStepSummary = { storedCount: 0, cacheHitCount: 0 };
      for (const audit of run.audit) {
        const usedCache = audit.toolsSucceeded.includes('get_cached_research');
        const stored = audit.toolsSucceeded.includes('store_research_results');
        const resolvedAttempt = audit.toolsSucceeded.includes('resolve_entity');
        const created = audit.toolsSucceeded.includes('create_entity');
        const addedRepresentation = audit.toolsSucceeded.includes('add_representation');
        const checkedFreshness = audit.toolsSucceeded.includes('check_research_freshness');
        const fetchedMetadata = audit.toolsSucceeded.includes('get_token_metadata');
        const llmAttempted = audit.toolsUsed.includes('research_llm');
        const llmSucceeded = audit.toolsSucceeded.includes('research_llm');

        console.log(`[Research] Enriching ${audit.identifier}`);
        if (created) {
          console.log('[Research] -> resolve_entity: Not found');
          console.log('[Research] -> create_entity: Created unverified entity');
          if (addedRepresentation) {
            console.log('[Research] -> add_representation: Added mint representation');
          }
        } else if (resolvedAttempt) {
          console.log('[Research] -> resolve_entity: Found existing');
        }

        if (checkedFreshness && usedCache) {
          console.log('[Research] -> check_research_freshness: Fresh (cache hit)');
          console.log('[Research] -> Skipping full research (using cached)');
          researchSummary.cacheHitCount += 1;
        } else if (checkedFreshness) {
          console.log('[Research] -> check_research_freshness: Stale or missing');
          if (fetchedMetadata) {
            console.log('[Research] -> get_token_metadata: Success (Jupiter Tokens V2)');
          }
          if (llmAttempted) {
            console.log(`[Research] -> MiniMax tool-calling loop: ${llmSucceeded ? 'Executed' : 'Failed'}`);
          }
          if (stored) {
            console.log('[Research] -> store_research_results: Stored');
            researchSummary.storedCount += 1;
          }
        }

        if (audit.toolsFailed.length > 0) {
          console.log(`[Research] -> Warning: failed tools = ${audit.toolsFailed.join(', ')}`);
        }
        console.log(`[Research] -> Result confidence: ${audit.confidence}`);
      }
      totalStored += researchSummary.storedCount;
      totalCacheHits += researchSummary.cacheHitCount;
      console.log(
        `[Memory] Batch update: stored=${researchSummary.storedCount}, cacheHits=${researchSummary.cacheHitCount}`
      );
    } else {
      console.log('[Research] No targets in this batch');
      console.log('[Memory] Batch update: stored=0, cacheHits=0');
    }
    console.log(`[Batch ${batchNumber}] Completed in ${formatDurationMs(batchStartMs, Date.now())}`);

    if (batchIndex < batches.length - 1) {
      console.log(`[Stream] Waiting ${options.delayMs}ms before next batch...`);
      await sleep(options.delayMs);
    }
  }

  console.log(
    `\n[Memory] Total updates: stored=${totalStored}, cacheHits=${totalCacheHits}`
  );
  console.log(`[Demo] Pipeline complete (${formatDurationMs(pipelineStartMs, Date.now())} total)`);
}

main().catch((error) => {
  console.error(`[Demo] replay failed: ${toErrorMessage(error)}`);
  process.exit(1);
});
