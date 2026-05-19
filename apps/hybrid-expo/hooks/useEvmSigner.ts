/**
 * useEvmSigner — Derives an EVM signer from Solana wallet signature.
 *
 * The EVM private key is derived deterministically: keccak256(solana_signature).
 * This key lives ONLY in memory on the phone — never persisted to disk.
 *
 * The derived key is exposed to other client modules through an in-memory module variable
 * so Predict actions can sign orders and deposit-wallet batches locally.
 */

import { useCallback, useRef, useState } from 'react';
import { Wallet } from '@ethersproject/wallet';
import { keccak256 } from '@ethersproject/keccak256';

let activeEvmWallet: Wallet | null = null;
export const PREDICT_DERIVE_MESSAGE = 'myboon:polymarket:enable';

function walletFromSolanaSignature(solanaSignature: Uint8Array): Wallet {
  const sigHex = '0x' + Array.from(solanaSignature, (b: number) => b.toString(16).padStart(2, '0')).join('');
  const evmPrivateKey = keccak256(sigHex);
  return new Wallet(evmPrivateKey);
}

export function deriveReadonlyEvmSignerFromSignature(
  solanaSignature: Uint8Array,
): { eoaAddress: string; wallet: Wallet } {
  const wallet = walletFromSolanaSignature(solanaSignature);
  return { eoaAddress: wallet.address, wallet };
}

export function deriveEvmSignerFromSignature(
  solanaSignature: Uint8Array,
): { eoaAddress: string; wallet: Wallet } {
  const signer = deriveReadonlyEvmSignerFromSignature(solanaSignature);
  activeEvmWallet = signer.wallet;
  if (__DEV__) console.log('[evm-signer] Derived EOA:', signer.eoaAddress);
  return signer;
}

export function getActiveEvmWallet(): Wallet | null {
  return activeEvmWallet;
}

export function requireActiveEvmWallet(): Wallet {
  if (!activeEvmWallet) {
    throw new Error('Predict wallet needs a fresh signature. Reconnect Predict and try again.');
  }
  return activeEvmWallet;
}

export function clearActiveEvmWallet() {
  activeEvmWallet = null;
}

export function useEvmSigner() {
  const walletRef = useRef<Wallet | null>(null);
  const [ready, setReady] = useState(false);
  const [eoaAddr, setEoaAddr] = useState<string | null>(null);

  /**
   * Derive EVM wallet from Solana signature.
   * Call this after Solana wallet signs the enable message.
   * Key stays in memory only — never persisted.
   */
  const deriveFromSignature = useCallback((solanaSignature: Uint8Array): { eoaAddress: string } => {
    const signer = deriveEvmSignerFromSignature(solanaSignature);
    walletRef.current = signer.wallet;
    setReady(true);
    setEoaAddr(signer.eoaAddress);
    return { eoaAddress: signer.eoaAddress };
  }, []);

  const clear = useCallback(() => {
    clearActiveEvmWallet();
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
