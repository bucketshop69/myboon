/**
 * usePrivyWallet — Adapter hook that wraps Privy's embedded Solana wallet
 * to expose the same interface as useWallet (MWA).
 *
 * Passkey auth → Privy creates embedded Solana wallet → this hook
 * exposes { connected, address, signMessage } so usePolymarketWallet
 * works identically for both Privy and MWA users.
 */

import { useEffect, useRef } from 'react';
import { usePrivy, useEmbeddedSolanaWallet, useLoginWithEmail, isConnected } from '@privy-io/expo';
import { useLoginWithPasskey, useSignupWithPasskey } from '@privy-io/expo/passkey';

export interface PrivyWalletState {
  /** Whether the user is authenticated via Privy AND has an embedded wallet */
  connected: boolean;
  /** Whether the user is authenticated via Privy (may not have wallet yet) */
  isPrivyUser: boolean;
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

  console.log('[PrivyWallet] status:', solanaWallet.status, 'authenticated:', authenticated, 'address:', address);

  // Auto-create embedded wallet if authenticated but wallet not yet created.
  // creatingRef stays true after attempt (success or fail) to prevent retry loops.
  const creatingRef = useRef(false);
  useEffect(() => {
    if (authenticated && solanaWallet.status === 'not-created' && solanaWallet.create && !creatingRef.current) {
      creatingRef.current = true;
      console.log('[PrivyWallet] Auto-creating embedded Solana wallet...');
      solanaWallet.create().catch((err: unknown) => {
        console.error('[PrivyWallet] Failed to create wallet:', err);
      });
    }
  }, [authenticated, solanaWallet.status]);

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
    signMessage,
    authMethod,
  };
}
