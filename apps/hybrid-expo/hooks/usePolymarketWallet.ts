/**
 * usePolymarketWallet — Derives a Polymarket-compatible Polygon wallet from a Solana signature.
 *
 * Architecture:
 * - The EVM private key is derived and kept only in-memory on the phone.
 * - The phone stores public Polygon/deposit-wallet addresses in AsyncStorage so the UI
 *   remembers the user is "enabled" across app restarts.
 * - On enable: Phantom signs a message -> phone derives EVM key, creates CLOB creds,
 *   then sends only public address + CLOB creds to the server.
 * - On app reopen: phone reads stored address from AsyncStorage. If the server session expired,
 *   the next CLOB operation will fail and the user re-signs with Phantom.
 * - On disable: clears both local storage and server session.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWallet } from '@/hooks/useWallet';
import { PREDICT_DERIVE_MESSAGE } from '@/hooks/useEvmSigner';
import { resolveApiBaseUrl, fetchWithTimeout } from '@/lib/api';

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
  /** Sign with Solana wallet, derive EVM key locally, and set up deposit-wallet trading */
  enable: () => Promise<void>;
  /** Clear session (server + local + EVM key) */
  disable: () => void;
  /** Whether local EVM signer is initialized */
  canSignLocally: boolean;
}

export function usePolymarketWallet(): PolymarketWallet {
  const {
    connected,
    address: solanaAddress,
    signMessage,
    isPreparing: walletPreparing,
    sessionKey,
  } = useWallet();
  const [polygonAddress, setPolygonAddress] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [depositWalletAddress, setDepositWalletAddress] = useState<string | null>(null);
  const [walletMode, setWalletMode] = useState<PolymarketWalletMode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canSignLocally, setCanSignLocally] = useState(false);
  const prevWalletSessionKey = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const activePolygonAddressRef = useRef<string | null>(null);
  const walletSnapshotRef = useRef({ connected, solanaAddress, sessionKey, walletPreparing });
  walletSnapshotRef.current = { connected, solanaAddress, sessionKey, walletPreparing };

  useEffect(() => {
    activePolygonAddressRef.current = polygonAddress;
  }, [polygonAddress]);

  const removeStoredSessionForAddress = useCallback((address: string) => {
    AsyncStorage.multiRemove([
      `${STORAGE_KEY}:${address}`,
      `${DEPOSIT_WALLET_STORAGE_KEY}:${address}`,
      `${WALLET_MODE_STORAGE_KEY}:${address}`,
    ]).catch(() => {});
  }, []);

  const clearWalletSessionState = useCallback(() => {
    import('./useEvmSigner').then(({ clearActiveEvmWallet }) => clearActiveEvmWallet()).catch(() => {});
    setPolygonAddress(null);
    setSafeAddress(null);
    setDepositWalletAddress(null);
    setWalletMode(null);
    setCanSignLocally(false);
  }, []);

  const clearStoredSession = useCallback(() => {
    loadGenerationRef.current += 1;
    if (solanaAddress) removeStoredSessionForAddress(solanaAddress);
    clearWalletSessionState();
  }, [solanaAddress, removeStoredSessionForAddress, clearWalletSessionState]);

  const clearServerSession = useCallback((address: string | null) => {
    if (address) {
      fetchWithTimeout(`${API_BASE}/clob/session/${address}`, { method: 'DELETE' }).catch(() => {});
    }
  }, []);

  // Load stored addresses when wallet/provider connects or changes; clear when disconnected.
  useEffect(() => {
    if (walletPreparing) {
      loadGenerationRef.current += 1;
      clearWalletSessionState();
      setIsLoading(true);
      prevWalletSessionKey.current = null;
      return;
    }

    const nextWalletSessionKey = connected && solanaAddress ? sessionKey : null;
    const previousWalletSessionKey = prevWalletSessionKey.current;

    if (previousWalletSessionKey && previousWalletSessionKey !== nextWalletSessionKey) {
      clearServerSession(activePolygonAddressRef.current);
    }

    // Wallet disconnected or provider/address changed - immediately clear UI-visible state.
    if (!connected || !solanaAddress || !nextWalletSessionKey) {
      loadGenerationRef.current += 1;
      clearWalletSessionState();
      setIsLoading(false);
      prevWalletSessionKey.current = null;
      return;
    }

    // Same wallet session, already loaded - skip.
    if (previousWalletSessionKey === nextWalletSessionKey) return;
    prevWalletSessionKey.current = nextWalletSessionKey;

    // New wallet connected - clear old state before loading stored addresses for the new wallet.
    const loadGeneration = ++loadGenerationRef.current;
    setIsLoading(true);
    clearWalletSessionState();

    Promise.all([
      AsyncStorage.getItem(`${STORAGE_KEY}:${solanaAddress}`),
      AsyncStorage.getItem(`${DEPOSIT_WALLET_STORAGE_KEY}:${solanaAddress}`),
      AsyncStorage.getItem(`${WALLET_MODE_STORAGE_KEY}:${solanaAddress}`),
    ])
      .then(([storedEoa, storedDepositWallet, storedWalletMode]) => {
        const current = walletSnapshotRef.current;
        if (
          loadGenerationRef.current !== loadGeneration
          || current.solanaAddress !== solanaAddress
          || current.sessionKey !== nextWalletSessionKey
        ) {
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
        const current = walletSnapshotRef.current;
        if (
          loadGenerationRef.current === loadGeneration
          && current.solanaAddress === solanaAddress
          && current.sessionKey === nextWalletSessionKey
        ) {
          setIsLoading(false);
        }
      });
  }, [
    connected,
    solanaAddress,
    sessionKey,
    walletPreparing,
    clearWalletSessionState,
    clearServerSession,
    removeStoredSessionForAddress,
  ]);

  const enable = useCallback(async () => {
    const startAddress = solanaAddress;
    const startSessionKey = connected && startAddress ? sessionKey : null;
    const startSignMessage = signMessage;

    if (!startSessionKey || !startAddress || !startSignMessage) {
      throw new Error('Connect your Solana wallet first');
    }

    const assertWalletUnchanged = () => {
      const current = walletSnapshotRef.current;
      if (
        !current.connected
        || current.walletPreparing
        || current.solanaAddress !== startAddress
        || current.sessionKey !== startSessionKey
      ) {
        throw new Error(WALLET_CHANGED_MESSAGE);
      }
    };

    const enableGeneration = ++loadGenerationRef.current;
    setIsLoading(true);
    try {
      // Step 1: Sign deterministic message with Solana wallet (MWA prompt)
      const messageBytes = new TextEncoder().encode(PREDICT_DERIVE_MESSAGE);
      const signature = await startSignMessage(messageBytes);
      assertWalletUnchanged();

      // Step 2: Derive EVM key locally. The signature never leaves the device.
      const { deriveEvmSignerFromSignature } = await import('./useEvmSigner');
      const { eoaAddress } = deriveEvmSignerFromSignature(signature);
      assertWalletUnchanged();
      setCanSignLocally(true);

      // Step 3: Create/derive CLOB credentials locally, then send only public
      // address + CLOB L2 credentials to the server. The server cannot recreate
      // the EVM private key from this payload.
      const { createPolymarketApiCreds, createPredictSessionProof, signAndSubmitDepositWalletBatch } = await import('@/features/predict/predict.signing');
      const creds = await createPolymarketApiCreds();
      const authProof = await createPredictSessionProof(eoaAddress);

      const res = await fetchWithTimeout(`${API_BASE}/clob/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygonAddress: eoaAddress, creds, ...authProof }),
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
        throw new Error('Deposit wallet setup incomplete - please try again');
      }
      if (data.signatureRequest) {
        await signAndSubmitDepositWalletBatch(eoaAddress, data.signatureRequest, { operation: 'predict_setup' });
      }
      if (loadGenerationRef.current !== enableGeneration) {
        throw new Error(WALLET_CHANGED_MESSAGE);
      }

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
        clearWalletSessionState();
      }
      throw err;
    } finally {
      const current = walletSnapshotRef.current;
      if (current.solanaAddress === startAddress && current.sessionKey === startSessionKey) {
        setIsLoading(false);
      }
    }
  }, [
    connected,
    solanaAddress,
    sessionKey,
    signMessage,
    removeStoredSessionForAddress,
    clearWalletSessionState,
  ]);

  const disable = useCallback(() => {
    clearServerSession(polygonAddress);
    clearStoredSession();
  }, [polygonAddress, clearStoredSession, clearServerSession]);

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
