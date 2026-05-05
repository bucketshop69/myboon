/**
 * usePolymarketWallet — Derives a Polymarket-compatible Polygon wallet from a Solana signature.
 *
 * Architecture:
 * - The EVM private key is NEVER stored on the device. It lives only on the server, in-memory.
 * - The phone stores ONLY the polygon address (public info) in AsyncStorage so the UI
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
import { useEvmSigner, type SignedOrderV2, type OrderParams } from '@/hooks/useEvmSigner';
import { resolveApiBaseUrl, fetchWithTimeout } from '@/lib/api';

const DERIVE_MESSAGE = 'myboon:polymarket:enable';
const STORAGE_KEY = 'polymarket_polygon_address'; // Public address only, not a secret
const SAFE_STORAGE_KEY = 'polymarket_safe_address'; // Safe wallet address (where USDC lives)
const DEPOSIT_WALLET_STORAGE_KEY = 'polymarket_deposit_wallet_address';
const WALLET_MODE_STORAGE_KEY = 'polymarket_wallet_mode';

const API_BASE = resolveApiBaseUrl();

export type PolymarketWalletMode = 'safe' | 'deposit_wallet';

export interface PolymarketWallet {
  polygonAddress: string | null;
  /** Safe wallet address — where pUSD lives, used for deposits */
  safeAddress: string | null;
  /** Deposit wallet address for new Polymarket API users */
  depositWalletAddress: string | null;
  /** Active trading wallet mode for this user */
  walletMode: PolymarketWalletMode | null;
  /** Address that holds pUSD/CTF and funds CLOB orders */
  tradingAddress: string | null;
  isReady: boolean;
  isLoading: boolean;
  /** Sign with Solana wallet, derive EVM key locally, send sig to server for Safe setup */
  enable: () => Promise<void>;
  /** Clear session (server + local + EVM key) */
  disable: () => void;
  /** Sign a V2 order locally (EIP-712). Returns pre-signed order for VPS proxy. */
  signOrder: (params: OrderParams) => Promise<SignedOrderV2>;
  /** Whether local EVM signer is initialized */
  canSignLocally: boolean;
}

export function usePolymarketWallet(): PolymarketWallet {
  const { connected, address: solanaAddress, signMessage } = useWallet();
  const [polygonAddress, setPolygonAddress] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [depositWalletAddress, setDepositWalletAddress] = useState<string | null>(null);
  const [walletMode, setWalletMode] = useState<PolymarketWalletMode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const evmSigner = useEvmSigner();
  const prevSolanaAddress = useRef<string | null>(null);

  // Storage keys scoped to the current Solana wallet
  const scopedKey = solanaAddress ? `${STORAGE_KEY}:${solanaAddress}` : null;
  const scopedSafeKey = solanaAddress ? `${SAFE_STORAGE_KEY}:${solanaAddress}` : null;
  const scopedDepositWalletKey = solanaAddress ? `${DEPOSIT_WALLET_STORAGE_KEY}:${solanaAddress}` : null;
  const scopedWalletModeKey = solanaAddress ? `${WALLET_MODE_STORAGE_KEY}:${solanaAddress}` : null;

  // Load stored addresses when Solana wallet connects/changes; clear when disconnected
  useEffect(() => {
    // Wallet disconnected or address changed — clear everything
    if (!connected || !solanaAddress) {
      setPolygonAddress(null);
      setSafeAddress(null);
      setDepositWalletAddress(null);
      setWalletMode(null);
      evmSigner.clear();
      setIsLoading(false);
      prevSolanaAddress.current = null;
      return;
    }

    // Same wallet, already loaded — skip
    if (prevSolanaAddress.current === solanaAddress) return;
    prevSolanaAddress.current = solanaAddress;

    // New wallet connected — clear old state, load stored addresses (if any)
    setIsLoading(true);
    setPolygonAddress(null);
    setSafeAddress(null);
    setDepositWalletAddress(null);
    setWalletMode(null);
    evmSigner.clear();

    Promise.all([
      AsyncStorage.getItem(`${STORAGE_KEY}:${solanaAddress}`),
      AsyncStorage.getItem(`${SAFE_STORAGE_KEY}:${solanaAddress}`),
      AsyncStorage.getItem(`${DEPOSIT_WALLET_STORAGE_KEY}:${solanaAddress}`),
      AsyncStorage.getItem(`${WALLET_MODE_STORAGE_KEY}:${solanaAddress}`),
    ])
      .then(([storedEoa, storedSafe, storedDepositWallet, storedWalletMode]) => {
        if (storedEoa) setPolygonAddress(storedEoa);
        if (storedSafe) setSafeAddress(storedSafe);
        if (storedDepositWallet) setDepositWalletAddress(storedDepositWallet);
        if (storedWalletMode === 'safe' || storedWalletMode === 'deposit_wallet') {
          setWalletMode(storedWalletMode);
        } else if (storedSafe) {
          setWalletMode('safe');
        } else if (storedDepositWallet) {
          setWalletMode('deposit_wallet');
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [connected, solanaAddress]);

  const enable = useCallback(async () => {
    if (!connected || !signMessage) {
      throw new Error('Connect your Solana wallet first');
    }

    setIsLoading(true);
    try {
      // Step 1: Sign deterministic message with Solana wallet (MWA prompt)
      const messageBytes = new TextEncoder().encode(DERIVE_MESSAGE);
      const signature = await signMessage(messageBytes);

      // Step 2: Derive EVM key locally (same derivation as server)
      evmSigner.deriveFromSignature(signature);

      // Step 3: Send hex-encoded signature to server for Safe setup + CLOB API creds
      const sigHex = Array.from(signature, (b: number) => b.toString(16).padStart(2, '0')).join('');

      const res = await fetchWithTimeout(`${API_BASE}/clob/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: sigHex }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'CLOB auth failed');
      }

      const data = await res.json();
      setPolygonAddress(data.polygonAddress);
      setSafeAddress(data.safeAddress ?? null);
      setDepositWalletAddress(data.depositWalletAddress ?? null);
      setWalletMode(data.walletMode ?? null);

      // Persist addresses locally (public info only, scoped to Solana wallet)
      if (scopedKey) await AsyncStorage.setItem(scopedKey, data.polygonAddress);
      if (data.safeAddress && scopedSafeKey) {
        await AsyncStorage.setItem(scopedSafeKey, data.safeAddress);
      }
      if (data.depositWalletAddress && scopedDepositWalletKey) {
        await AsyncStorage.setItem(scopedDepositWalletKey, data.depositWalletAddress);
      }
      if (data.walletMode && scopedWalletModeKey) {
        await AsyncStorage.setItem(scopedWalletModeKey, data.walletMode);
      }
    } catch (err) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [
    connected,
    signMessage,
    scopedKey,
    scopedSafeKey,
    scopedDepositWalletKey,
    scopedWalletModeKey,
  ]);

  const disable = useCallback(() => {
    // Clear server session
    if (polygonAddress) {
      fetchWithTimeout(`${API_BASE}/clob/session/${polygonAddress}`, { method: 'DELETE' }).catch(() => {});
    }
    // Clear local storage (scoped to current Solana wallet)
    if (scopedKey) AsyncStorage.removeItem(scopedKey).catch(() => {});
    if (scopedSafeKey) AsyncStorage.removeItem(scopedSafeKey).catch(() => {});
    if (scopedDepositWalletKey) AsyncStorage.removeItem(scopedDepositWalletKey).catch(() => {});
    if (scopedWalletModeKey) AsyncStorage.removeItem(scopedWalletModeKey).catch(() => {});
    setPolygonAddress(null);
    setSafeAddress(null);
    setDepositWalletAddress(null);
    setWalletMode(null);
    // Wipe EVM key from memory
    evmSigner.clear();
  }, [polygonAddress, scopedKey, scopedSafeKey, scopedDepositWalletKey, scopedWalletModeKey, evmSigner]);

  /** Sign order locally — phone holds the key, VPS just proxies the signed order */
  const signOrder = useCallback(async (params: OrderParams): Promise<SignedOrderV2> => {
    if (walletMode === 'deposit_wallet') {
      throw new Error('Deposit wallet orders are signed by the API');
    }
    if (!safeAddress) throw new Error('No Safe address — enable wallet first');
    return evmSigner.signOrder(params, safeAddress);
  }, [evmSigner, safeAddress, walletMode]);

  const tradingAddress =
    walletMode === 'deposit_wallet'
      ? depositWalletAddress
      : safeAddress;

  return {
    polygonAddress,
    safeAddress,
    depositWalletAddress,
    walletMode,
    tradingAddress,
    isReady: !!polygonAddress,
    isLoading,
    enable,
    disable,
    signOrder,
    canSignLocally: evmSigner.isReady,
  };
}
