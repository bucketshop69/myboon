/**
 * Shared types for Home's Wallet section orchestration (combined total + mix
 * bar shell — see docs/modules/wallet/PRDs/2026_07_21_beta_readiness_wallet_PRD.md,
 * decisions #1-4, #11-13).
 */

export type WalletProtocolId = 'spot' | 'meteora' | 'phoenix' | 'pacifica';

export const WALLET_PROTOCOL_IDS: readonly WalletProtocolId[] = [
  'spot',
  'meteora',
  'phoenix',
  'pacifica',
];

/**
 * Per-source fetch state. Each protocol is fully independent — one source's
 * failure or latency never blocks or delays another (issue #237 fetch
 * orchestration requirement).
 */
export type WalletSourceStatus = 'idle' | 'loading' | 'resolved' | 'failed';

export interface WalletSourceState {
  status: WalletSourceStatus;
  /** USD value for this protocol once resolved; null until then. */
  valueUsd: number | null;
  /** Timestamp (ms epoch) of the last successful fetch, for "as of" labels. */
  resolvedAt: number | null;
  error: string | null;
}

export type WalletSourcesState = Record<WalletProtocolId, WalletSourceState>;

export interface WalletTotals {
  /** Sum of every currently-resolved source's valueUsd. Null if none resolved yet. */
  totalUsd: number | null;
  /** Per-protocol share of totalUsd (0-1), only for resolved sources. Empty if totalUsd is null. */
  mix: Partial<Record<WalletProtocolId, number>>;
  /** Most recent resolvedAt across all sources, for the total's "as of" label. */
  lastResolvedAt: number | null;
}
