/**
 * usePolymarketWallet — Derives a Polymarket-compatible Polygon wallet from a Solana signature.
 *
 * Architecture:
 * - The EVM private key is NEVER stored on the device. It lives only on the server, in-memory.
 * - The phone stores public Polygon/deposit-wallet addresses in AsyncStorage so the UI
 *   remembers the user is "enabled" across app restarts.
 * - On enable: Phantom signs a message → signature sent to server → server derives EVM key,
 *   creates CLOB session, returns polygon address.
 * - On app reopen: phone reads stored address from AsyncStorage. If the server session expired,
 *   the next CLOB operation will fail and the user re-signs with Phantom.
 * - On disable: clears both local storage and server session.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWallet } from '@/hooks/useWallet';
import { resolveApiBaseUrl, fetchWithTimeout } from '@/lib/api';

const DERIVE_MESSAGE = 'myboon:polymarket:enable';
const STORAGE_KEY = 'polymarket_polygon_address'; // Public address only, not a secret
const DEPOSIT_WALLET_STORAGE_KEY = 'polymarket_deposit_wallet_address';
const WALLET_MODE_STORAGE_KEY = 'polymarket_wallet_mode';
const WALLET_CHANGED_MESSAGE = 'Wallet changed. Please try again.';

const API_BASE = resolveApiBaseUrl();
const E2E_POLYGON_ADDRESS = process.env.EXPO_PUBLIC_PREDICT_E2E_POLYGON_ADDRESS
  ?? '0xe2e0000000000000000000000000000000000001';
const E2E_DEPOSIT_WALLET_ADDRESS = process.env.EXPO_PUBLIC_PREDICT_E2E_DEPOSIT_WALLET_ADDRESS
  ?? '0xe2e0000000000000000000000000000000000002';

export type PolymarketWalletMode = 'deposit_wallet';

function isWalletChangedError(err: unknown): boolean {
  return err instanceof Error && err.message === WALLET_CHANGED_MESSAGE;
}

export interface PolymarketWallet {
  polygonAddress: string | null;
  /** Legacy field kept for UI compatibility; deposit-wallet mode always returns null. */
  safeAddress: string | null;
  /** Deposit wallet address for new Polymarket API users */
  depositWalletAddress: string | null;
  /** Active trading wallet mode for this user */
  walletMode: PolymarketWalletMode | null;
  /** Address that holds pUSD/CTF and funds CLOB orders */
  tradingAddress: string | null;
  isReady: boolean;
  isLoading: boolean;
  /** Sign with Solana wallet, derive EVM key locally, send sig to server for deposit-wallet setup */
  enable: () => Promise<void>;
  /** Clear session (server + local + EVM key) */
  disable: () => void;
  /** Whether local EVM signer is initialized */
  canSignLocally: boolean;
}

export function usePolymarketWallet(): PolymarketWallet {
  const { connected, address: solanaAddress, signMessage, isPreparing: walletPreparing } = useWallet();
  const [polygonAddress, setPolygonAddress] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [depositWalletAddress, setDepositWalletAddress] = useState<string | null>(null);
  const [walletMode, setWalletMode] = useState<PolymarketWalletMode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canSignLocally, setCanSignLocally] = useState(false);
  const prevSolanaAddress = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const walletSnapshotRef = useRef({ connected, solanaAddress });
  walletSnapshotRef.current = { connected, solanaAddress };

  const removeStoredSessionForAddress = useCallback((address: string) => {
    AsyncStorage.multiRemove([
      `${STORAGE_KEY}:${address}`,
      `${DEPOSIT_WALLET_STORAGE_KEY}:${address}`,
      `${WALLET_MODE_STORAGE_KEY}:${address}`,
    ]).catch(() => {});
  }, []);

  const clearStoredSession = useCallback(() => {
    loadSeqRef.current += 1;
    if (solanaAddress) removeStoredSessionForAddress(solanaAddress);
    setPolygonAddress(null);
    setSafeAddress(null);
    setDepositWalletAddress(null);
    setWalletMode(null);
    setCanSignLocally(false);
  }, [solanaAddress, removeStoredSessionForAddress]);

  // Load stored addresses when Solana wallet connects/changes; clear when disconnected
  useEffect(() => {
    const clearLocalState = () => {
      setPolygonAddress(null);
      setSafeAddress(null);
      setDepositWalletAddress(null);
      setWalletMode(null);
      setCanSignLocally(false);
    };

    if (walletPreparing) {
      loadSeqRef.current += 1;
      clearLocalState();
      setIsLoading(true);
      prevSolanaAddress.current = null;
      return;
    }

    // Wallet disconnected or address changed — clear everything
    if (!connected || !solanaAddress) {
      loadSeqRef.current += 1;
      clearLocalState();
      setIsLoading(false);
      prevSolanaAddress.current = null;
      return;
    }

    // Same wallet, already loaded — skip
    if (prevSolanaAddress.current === solanaAddress) return;
    prevSolanaAddress.current = solanaAddress;

    // New wallet connected — clear old state, load stored addresses (if any)
    const loadSeq = loadSeqRef.current + 1;
    loadSeqRef.current = loadSeq;
    setIsLoading(true);
    clearLocalState();

    Promise.all([
      AsyncStorage.getItem(`${STORAGE_KEY}:${solanaAddress}`),
      AsyncStorage.getItem(`${DEPOSIT_WALLET_STORAGE_KEY}:${solanaAddress}`),
      AsyncStorage.getItem(`${WALLET_MODE_STORAGE_KEY}:${solanaAddress}`),
    ])
      .then(([storedEoa, storedDepositWallet, storedWalletMode]) => {
        if (loadSeqRef.current !== loadSeq || walletSnapshotRef.current.solanaAddress !== solanaAddress) {
          return;
        }

        if (storedEoa && (!storedDepositWallet || storedWalletMode !== 'deposit_wallet')) {
          removeStoredSessionForAddress(solanaAddress);
          return;
        }

        if (storedEoa) setPolygonAddress(storedEoa);
        if (storedDepositWallet) setDepositWalletAddress(storedDepositWallet);
        if (storedWalletMode === 'deposit_wallet') {
          setWalletMode(storedWalletMode);
        } else if (storedDepositWallet) {
          setWalletMode('deposit_wallet');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (loadSeqRef.current === loadSeq && walletSnapshotRef.current.solanaAddress === solanaAddress) {
          setIsLoading(false);
        }
      });
  }, [connected, solanaAddress, walletPreparing, removeStoredSessionForAddress]);

  const enable = useCallback(async () => {
    const startAddress = solanaAddress;
    const startSignMessage = signMessage;

    if (!connected || !startAddress || !startSignMessage) {
      throw new Error('Connect your Solana wallet first');
    }

    const assertWalletUnchanged = () => {
      const current = walletSnapshotRef.current;
      if (!current.connected || current.solanaAddress !== startAddress) {
        throw new Error(WALLET_CHANGED_MESSAGE);
      }
    };

    setIsLoading(true);
    try {
      // Step 1: Sign deterministic message with Solana wallet (MWA prompt)
      const messageBytes = new TextEncoder().encode(DERIVE_MESSAGE);
      const signature = await startSignMessage(messageBytes);
      assertWalletUnchanged();

      // Step 2: Derive EVM key locally (same derivation as server)
      const { deriveEvmSignerFromSignature } = await import('./useEvmSigner');
      await deriveEvmSignerFromSignature(signature);
      assertWalletUnchanged();
      setCanSignLocally(true);

      // Step 3: Send hex-encoded signature to server for deposit wallet setup + CLOB API creds
      const sigHex = Array.from(signature, (b: number) => b.toString(16).padStart(2, '0')).join('');

      const res = await fetchWithTimeout(`${API_BASE}/clob/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: sigHex }),
      });
      assertWalletUnchanged();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        assertWalletUnchanged();
        throw new Error(err.detail || err.error || 'CLOB auth failed');
      }

      const data = await res.json();
      assertWalletUnchanged();
      if (!data.depositWalletAddress) {
        throw new Error('Deposit wallet setup incomplete — please try again');
      }

      // Persist addresses locally (public info only, scoped to Solana wallet)
      await AsyncStorage.multiSet([
        [`${STORAGE_KEY}:${startAddress}`, data.polygonAddress],
        [`${DEPOSIT_WALLET_STORAGE_KEY}:${startAddress}`, data.depositWalletAddress],
        [`${WALLET_MODE_STORAGE_KEY}:${startAddress}`, 'deposit_wallet'],
      ]);
      assertWalletUnchanged();

      setPolygonAddress(data.polygonAddress);
      setSafeAddress(null);
      setDepositWalletAddress(data.depositWalletAddress);
      setWalletMode('deposit_wallet');
    } catch (err) {
      if (isWalletChangedError(err)) {
        removeStoredSessionForAddress(startAddress);
      }
      throw err;
    } finally {
      if (walletSnapshotRef.current.solanaAddress === startAddress) {
        setIsLoading(false);
      }
    }
  }, [
    connected,
    signMessage,
    solanaAddress,
    removeStoredSessionForAddress,
  ]);

  const disable = useCallback(() => {
    // Clear server session
    if (polygonAddress) {
      fetchWithTimeout(`${API_BASE}/clob/session/${polygonAddress}`, { method: 'DELETE' }).catch(() => {});
    }
    clearStoredSession();
  }, [polygonAddress, clearStoredSession]);

  const tradingAddress = depositWalletAddress;
  const isReady = !!polygonAddress && walletMode === 'deposit_wallet' && !!depositWalletAddress;

  if (process.env.EXPO_PUBLIC_PREDICT_E2E === '1') {
    const runtime = globalThis as typeof globalThis & {
      __PREDICT_E2E_POLYGON_ADDRESS?: string;
      __PREDICT_E2E_DEPOSIT_WALLET_ADDRESS?: string;
    };
    const e2ePolygonAddress = runtime.__PREDICT_E2E_POLYGON_ADDRESS ?? E2E_POLYGON_ADDRESS;
    const e2eDepositWalletAddress = runtime.__PREDICT_E2E_DEPOSIT_WALLET_ADDRESS ?? E2E_DEPOSIT_WALLET_ADDRESS;
    return {
      polygonAddress: e2ePolygonAddress,
      safeAddress: null,
      depositWalletAddress: e2eDepositWalletAddress,
      walletMode: 'deposit_wallet',
      tradingAddress: e2eDepositWalletAddress,
      isReady: true,
      isLoading: false,
      enable: async () => {},
      disable: () => {},
      canSignLocally: true,
    };
  }

  return {
    polygonAddress,
    safeAddress,
    depositWalletAddress,
    walletMode,
    tradingAddress,
    isReady,
    isLoading,
    enable,
    disable,
    canSignLocally,
  };
}
