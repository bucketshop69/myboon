import type { MeteoraRangePresetDefinition } from '@myboon/shared/meteora';

export const METEORA_RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL?.trim()
  || 'https://api.mainnet-beta.solana.com';

/**
 * Keep multi-step Zap submission gated until a process restart can reconstruct
 * only the remaining safe steps without replaying a confirmed swap.
 */
export const METEORA_ZAP_EXECUTION_ENABLED = false;

/**
 * Meteora does not currently publish Focused/Balanced/Wide bin deltas through
 * the SDK. Keep the product labels visible but unavailable until an exact
 * Meteora-sourced value is configured; myBoon must not invent widths.
 */
export const METEORA_RANGE_PRESETS: readonly MeteoraRangePresetDefinition[] = [
  { id: 'focused', label: 'Focused', source: 'meteora', binDelta: null },
  { id: 'balanced', label: 'Balanced', source: 'meteora', binDelta: null },
  { id: 'wide', label: 'Wide', source: 'meteora', binDelta: null },
];
