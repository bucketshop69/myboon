/**
 * usePrivyWallet — Adapter hook that wraps Privy's embedded Solana wallet
 * to expose the same interface as useWallet (MWA).
 *
 * Passkey auth → Privy creates embedded Solana wallet → this hook
 * exposes { connected, address, signMessage } so usePolymarketWallet
 * works identically for both Privy and MWA users.
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePrivy, useEmbeddedSolanaWallet, useLoginWithEmail, isConnected } from '@privy-io/expo';
import { useLoginWithPasskey, useSignupWithPasskey } from '@privy-io/expo/passkey';

export interface PrivyWalletState {
  /** Whether the user is authenticated via Privy AND has an embedded wallet */
  connected: boolean;
  /** Whether the user is authenticated via Privy (may not have wallet yet) */
  isPrivyUser: boolean;
  /** Whether Privy auth is complete but the embedded wallet is still hydrating/creating */
  isPreparing: boolean;
  /** Solana address from embedded wallet */
  address: string | null;
  /** Shortened address for display */
  shortAddress: string | null;
  /** Trigger passkey login (existing account) */
  loginWithPasskey: () => Promise<void>;
  /** Trigger passkey signup (new account) */
  signupWithPasskey: () => Promise<void>;
  /** Send email OTP code */
  sendEmailOTP: (email: string) => Promise<void>;
  /** Login with email OTP code */
  loginWithEmailOTP: (code: string) => Promise<void>;
  /** Log out of Privy */
  disconnect: () => Promise<void>;
  /** Wait until the embedded Solana wallet is hydrated after auth */
  waitForWallet: () => Promise<void>;
  /** Sign a message with the embedded Solana wallet */
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  /** Auth method the user used (email, passkey, wallet, or null) */
  authMethod: 'email' | 'passkey' | 'wallet' | null;
}

const RELYING_PARTY = 'https://myboon.tech';

export function usePrivyWallet(): PrivyWalletState {
  const { user, isReady, logout } = usePrivy();
  const solanaWallet = useEmbeddedSolanaWallet();
  const { loginWithPasskey } = useLoginWithPasskey();
  const { signupWithPasskey } = useSignupWithPasskey();
  const { sendCode: sendEmailCode, loginWithCode: loginWithEmailCode } = useLoginWithEmail();

  const authenticated = isReady && !!user;
  const walletConnected = isConnected(solanaWallet);
  const wallet = walletConnected ? solanaWallet.wallets?.[0] ?? null : null;
  const address = wallet?.address ?? null;
  const isPreparing = authenticated && !wallet;
  const solanaWalletStatus = solanaWallet.status;
  const createSolanaWallet = solanaWallet.create;

  // Auto-create embedded wallet if authenticated but wallet not yet created.
  const creatingRef = useRef(false);
  const walletWaitersRef = useRef<{ resolve: () => void; reject: (err: Error) => void }[]>([]);

  useEffect(() => {
    if (!authenticated) {
      creatingRef.current = false;
      walletWaitersRef.current.splice(0).forEach(({ reject }) => {
        reject(new Error('Privy user is not authenticated'));
      });
    }
  }, [authenticated]);

  useEffect(() => {
    if (!address) return;
    walletWaitersRef.current.splice(0).forEach(({ resolve }) => resolve());
  }, [address]);

  useEffect(() => {
    if (authenticated && solanaWalletStatus === 'not-created' && createSolanaWallet && !creatingRef.current) {
      creatingRef.current = true;
      console.log('[PrivyWallet] Auto-creating embedded Solana wallet...');
      createSolanaWallet()
        .catch((err: unknown) => {
          creatingRef.current = false;
          console.error('[PrivyWallet] Failed to create wallet:', err);
          walletWaitersRef.current.splice(0).forEach(({ reject }) => {
            reject(err instanceof Error ? err : new Error('Failed to create Privy wallet'));
          });
        });
    }
  }, [authenticated, solanaWalletStatus, createSolanaWallet]);

  const waitForEmbeddedWallet = useCallback(async () => {
    if (address) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        walletWaitersRef.current = walletWaitersRef.current.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error('Privy wallet is still preparing. Please try again in a moment.'));
      }, 15000);

      walletWaitersRef.current.push({
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });
  }, [address]);

  const signMessage = wallet
    ? async (message: Uint8Array): Promise<Uint8Array> => {
        const provider = await wallet.getProvider();
        const { signature } = await provider.request({
          method: 'signMessage',
          params: { message: Buffer.from(message).toString('base64') },
        });
        return new Uint8Array(Buffer.from(signature, 'base64'));
      }
    : null;

  // Determine auth method from linked accounts
  const authMethod: 'email' | 'passkey' | 'wallet' | null = (() => {
    if (!user) return null;
    const linked = user.linked_accounts ?? [];
    if (linked.some((a: { type: string }) => a.type === 'passkey')) return 'passkey';
    if (linked.some((a: { type: string }) => a.type === 'email')) return 'email';
    return 'wallet';
  })();

  return {
    connected: authenticated && !!wallet,
    isPrivyUser: authenticated,
    isPreparing,
    address,
    shortAddress: address ? `${address.slice(0, 4)}···${address.slice(-4)}` : null,
    loginWithPasskey: async () => {
      await loginWithPasskey({ relyingParty: RELYING_PARTY });
    },
    signupWithPasskey: async () => {
      await signupWithPasskey({ relyingParty: RELYING_PARTY });
    },
    sendEmailOTP: async (email: string) => {
      await sendEmailCode({ email });
    },
    loginWithEmailOTP: async (code: string) => {
      await loginWithEmailCode({ code });
    },
    disconnect: async () => {
      await logout();
    },
    waitForWallet: waitForEmbeddedWallet,
    signMessage,
    authMethod,
  };
}
