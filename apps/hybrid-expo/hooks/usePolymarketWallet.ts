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

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWallet } from '@/hooks/useWallet';

const DERIVE_MESSAGE = 'myboon:polymarket:enable';
const STORAGE_KEY = 'polymarket_polygon_address'; // Public address only, not a secret

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

const API_BASE = resolveApiBaseUrl();

export interface PolymarketWallet {
  polygonAddress: string | null;
  isReady: boolean;
  isLoading: boolean;
  /** Sign with Solana wallet, send signature to server for CLOB auth */
  enable: () => Promise<void>;
  /** Clear session (server + local) */
  disable: () => void;
}

export function usePolymarketWallet(): PolymarketWallet {
  const { connected, signMessage } = useWallet();
  const [polygonAddress, setPolygonAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load stored polygon address on mount (public address only, not the key)
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) setPolygonAddress(stored);
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
      const messageBytes = new TextEncoder().encode(DERIVE_MESSAGE);
      const signature = await signMessage(messageBytes);

      // Step 2: Send hex-encoded signature to server for CLOB auth
      const sigHex = Array.from(signature, (b: number) => b.toString(16).padStart(2, '0')).join('');

      const res = await fetch(`${API_BASE}/clob/auth`, {
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

      // Persist polygon address locally (public info only, not the private key)
      await AsyncStorage.setItem(STORAGE_KEY, data.polygonAddress);
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
    setPolygonAddress(null);
  }, [polygonAddress]);

  return {
    polygonAddress,
    isReady: !!polygonAddress,
    isLoading,
    enable,
    disable,
  };
}
