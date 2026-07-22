import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchMeteoraValueUsd,
  fetchPacificaValueUsd,
  fetchPhoenixValueUsd,
  fetchSpotValueUsd,
  type WalletFetchResult,
} from '@/features/wallet/wallet.sources';
import {
  WALLET_PROTOCOL_IDS,
  type WalletProtocolId,
  type WalletSourceState,
  type WalletSourcesState,
  type WalletTotals,
} from '@/features/wallet/wallet.types';

const VIEWPORT_DEBOUNCE_MS = 400;

const FETCHERS: Record<WalletProtocolId, (walletAddress: string) => Promise<WalletFetchResult>> = {
  spot: fetchSpotValueUsd,
  meteora: fetchMeteoraValueUsd,
  phoenix: fetchPhoenixValueUsd,
  pacifica: fetchPacificaValueUsd,
};

function idleSource(): WalletSourceState {
  return { status: 'idle', valueUsd: null, resolvedAt: null, error: null, detail: null };
}

function initialSources(): WalletSourcesState {
  return {
    spot: idleSource(),
    meteora: idleSource(),
    phoenix: idleSource(),
    pacifica: idleSource(),
  };
}

export interface UseProtocolAccountsResult {
  sources: WalletSourcesState;
  totals: WalletTotals;
  /** Call when the Wallet section's viewport visibility changes (debounced internally). */
  notifyVisibility: (isVisible: boolean) => void;
  /** Manual refresh — re-fetches all four sources (explicit refresh affordance, no pull-to-refresh at scroll bottom). */
  refreshAll: () => void;
  /** Retry a single failed/pending source without touching the others. */
  retrySource: (id: WalletProtocolId) => void;
}

/**
 * Orchestrates independent fetches for Spot, Meteora, Phoenix, and Pacifica
 * for Home's Wallet section (issue #237).
 *
 * - Each source has its own try/catch, loading/resolved/failed state, and
 *   retry — one source failing or being slow never blocks another.
 * - Nothing fetches until the Wallet section scrolls into view
 *   (`notifyVisibility`), debounced so scroll wobble near the boundary
 *   doesn't refetch repeatedly.
 * - Each deliberate re-entry into view (leave, then return) re-triggers a
 *   fresh fetch of all four sources — the primary refresh mechanism.
 * - `refreshAll` backs the explicit manual-refresh affordance (no
 *   pull-to-refresh at the bottom of Home's scroll, no polling timer).
 */
export function useProtocolAccounts(walletAddress: string | null): UseProtocolAccountsResult {
  const [sources, setSources] = useState<WalletSourcesState>(initialSources);
  const visibilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVisible = useRef(false);
  const requestSeq = useRef<Record<WalletProtocolId, number>>({
    spot: 0,
    meteora: 0,
    phoenix: 0,
    pacifica: 0,
  });

  const fetchSource = useCallback((id: WalletProtocolId, address: string) => {
    const seq = ++requestSeq.current[id];
    setSources((prev) => ({
      ...prev,
      [id]: { ...prev[id], status: 'loading', error: null },
    }));

    FETCHERS[id](address)
      .then(({ valueUsd, detail }) => {
        if (requestSeq.current[id] !== seq) return; // superseded by a newer request
        setSources((prev) => ({
          ...prev,
          [id]: { status: 'resolved', valueUsd, resolvedAt: Date.now(), error: null, detail },
        }));
      })
      .catch((error: unknown) => {
        if (requestSeq.current[id] !== seq) return;
        setSources((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unable to sync',
          },
        }));
      });
  }, []);

  const fetchAll = useCallback((address: string) => {
    WALLET_PROTOCOL_IDS.forEach((id) => fetchSource(id, address));
  }, [fetchSource]);

  const notifyVisibility = useCallback((isVisible: boolean) => {
    if (visibilityTimer.current) {
      clearTimeout(visibilityTimer.current);
      visibilityTimer.current = null;
    }

    visibilityTimer.current = setTimeout(() => {
      visibilityTimer.current = null;
      const enteredView = isVisible && !wasVisible.current;
      wasVisible.current = isVisible;
      if (enteredView && walletAddress) {
        fetchAll(walletAddress);
      }
    }, VIEWPORT_DEBOUNCE_MS);
  }, [fetchAll, walletAddress]);

  const refreshAll = useCallback(() => {
    if (walletAddress) fetchAll(walletAddress);
  }, [fetchAll, walletAddress]);

  const retrySource = useCallback((id: WalletProtocolId) => {
    if (walletAddress) fetchSource(id, walletAddress);
  }, [fetchSource, walletAddress]);

  // Reset to idle and re-arm the "has entered view" gate whenever the
  // connected wallet changes (including disconnect), so stale balances from
  // a previous wallet never linger.
  useEffect(() => {
    setSources(initialSources());
    wasVisible.current = false;
  }, [walletAddress]);

  useEffect(() => () => {
    if (visibilityTimer.current) clearTimeout(visibilityTimer.current);
  }, []);

  const totals = useMemo<WalletTotals>(() => {
    const resolved = WALLET_PROTOCOL_IDS.filter((id) => sources[id].status === 'resolved');
    if (resolved.length === 0) {
      return { totalUsd: null, mix: {}, lastResolvedAt: null };
    }

    const totalUsd = resolved.reduce((sum, id) => sum + (sources[id].valueUsd ?? 0), 0);
    const mix: Partial<Record<WalletProtocolId, number>> = {};
    resolved.forEach((id) => {
      mix[id] = totalUsd > 0 ? (sources[id].valueUsd ?? 0) / totalUsd : 0;
    });
    const lastResolvedAt = resolved.reduce<number | null>((latest, id) => {
      const at = sources[id].resolvedAt;
      if (at === null) return latest;
      return latest === null ? at : Math.max(latest, at);
    }, null);

    return { totalUsd, mix, lastResolvedAt };
  }, [sources]);

  return { sources, totals, notifyVisibility, refreshAll, retrySource };
}
