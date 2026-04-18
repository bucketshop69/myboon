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
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWallet } from '@/hooks/useWallet';
import { useEvmSigner, type SignedOrderV2, type OrderParams } from '@/hooks/useEvmSigner';

const DERIVE_MESSAGE = 'myboon:polymarket:enable';
const STORAGE_KEY = 'polymarket_polygon_address'; // Public address only, not a secret
const SAFE_STORAGE_KEY = 'polymarket_safe_address'; // Safe wallet address (where USDC lives)

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

const API_BASE = resolveApiBaseUrl();

export interface PolymarketWallet {
  polygonAddress: string | null;
  /** Safe wallet address — where pUSD lives, used for deposits */
  safeAddress: string | null;
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
  const { connected, signMessage } = useWallet();
  const [polygonAddress, setPolygonAddress] = useState<string | null>(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const evmSigner = useEvmSigner();

  // Load stored addresses on mount (public info only)
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(SAFE_STORAGE_KEY),
    ])
      .then(([storedEoa, storedSafe]) => {
        console.log('[polymarket] Loaded from storage — EOA:', storedEoa ?? 'none', '| Safe:', storedSafe ?? 'none');
        if (storedEoa) setPolygonAddress(storedEoa);
        if (storedSafe) setSafeAddress(storedSafe);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const enable = useCallback(async () => {
    if (!connected || !signMessage) {
      throw new Error('Connect your Solana wallet first');
    }

    setIsLoading(true);
    try {
      // Step 1: Sign deterministic message with Solana wallet (MWA prompt)
      console.log('[polymarket] Requesting wallet signature...');
      const messageBytes = new TextEncoder().encode(DERIVE_MESSAGE);
      const signature = await signMessage(messageBytes);
      console.log('[polymarket] Signature received, sending to server...');

      // Step 2: Derive EVM key locally (same derivation as server)
      evmSigner.deriveFromSignature(signature);
      console.log('[polymarket] EVM key derived locally');

      // Step 3: Send hex-encoded signature to server for Safe setup + CLOB API creds
      const sigHex = Array.from(signature, (b: number) => b.toString(16).padStart(2, '0')).join('');

      const res = await fetch(`${API_BASE}/clob/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: sigHex }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[polymarket] Auth failed:', res.status, err);
        throw new Error(err.detail || err.error || 'CLOB auth failed');
      }

      const data = await res.json();
      console.log('[polymarket] Auth success — EOA:', data.polygonAddress, '| Safe:', data.safeAddress ?? 'none');
      setPolygonAddress(data.polygonAddress);
      setSafeAddress(data.safeAddress ?? null);

      // Persist addresses locally (public info only, not the private key)
      await AsyncStorage.setItem(STORAGE_KEY, data.polygonAddress);
      if (data.safeAddress) {
        await AsyncStorage.setItem(SAFE_STORAGE_KEY, data.safeAddress);
      }
    } catch (err) {
      console.error('[polymarket] Enable failed:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [connected, signMessage]);

  const disable = useCallback(() => {
    // Clear server session
    if (polygonAddress) {
      fetch(`${API_BASE}/clob/session/${polygonAddress}`, { method: 'DELETE' }).catch(() => {});
    }
    // Clear local storage
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    AsyncStorage.removeItem(SAFE_STORAGE_KEY).catch(() => {});
    setPolygonAddress(null);
    setSafeAddress(null);
    // EVM key in useEvmSigner ref will be GC'd when component unmounts
  }, [polygonAddress]);

  /** Sign order locally — phone holds the key, VPS just proxies the signed order */
  const signOrder = useCallback(async (params: OrderParams): Promise<SignedOrderV2> => {
    if (!safeAddress) throw new Error('No Safe address — enable wallet first');
    return evmSigner.signOrder(params, safeAddress);
  }, [evmSigner, safeAddress]);

  return {
    polygonAddress,
    safeAddress,
    isReady: !!polygonAddress,
    isLoading,
    enable,
    disable,
    signOrder,
    canSignLocally: evmSigner.isReady,
  };
}
