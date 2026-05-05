/**
 * useEvmSigner — Derives an EVM signer from Solana wallet signature.
 *
 * The EVM private key is derived deterministically: keccak256(solana_signature).
 * This key lives ONLY in memory on the phone — never persisted to disk.
 *
 * The same derivation runs on the server for deposit-wallet relay operations.
 * Both sides get the same key from the same Solana signature.
 */

import { useCallback, useRef, useState } from 'react';
import { Wallet } from '@ethersproject/wallet';
import { keccak256 } from '@ethersproject/keccak256';

export function useEvmSigner() {
  const walletRef = useRef<Wallet | null>(null);
  const [ready, setReady] = useState(false);
  const [eoaAddr, setEoaAddr] = useState<string | null>(null);

  /**
   * Derive EVM wallet from Solana signature (same derivation as server).
   * Call this after Solana wallet signs the enable message.
   * Key stays in memory only — never persisted.
   */
  const deriveFromSignature = useCallback((solanaSignature: Uint8Array): { eoaAddress: string } => {
    const sigHex = '0x' + Array.from(solanaSignature, (b: number) => b.toString(16).padStart(2, '0')).join('');
    const evmPrivateKey = keccak256(sigHex);
    const wallet = new Wallet(evmPrivateKey);
    walletRef.current = wallet;
    setReady(true);
    setEoaAddr(wallet.address);
    if (__DEV__) console.log('[evm-signer] Derived EOA:', wallet.address);
    return { eoaAddress: wallet.address };
  }, []);

  const clear = useCallback(() => {
    walletRef.current = null;
    setReady(false);
    setEoaAddr(null);
  }, []);

  return {
    deriveFromSignature,
    clear,
    isReady: ready,
    eoaAddress: eoaAddr,
  };
}
