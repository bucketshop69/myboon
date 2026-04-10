import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTurnkey } from '@turnkey/react-native-wallet-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'polymarket_wallet';

interface StoredWallet {
  polygonAddress: string;
}

export interface PolymarketWallet {
  /** Polygon address derived from Turnkey embedded wallet */
  polygonAddress: string | null;
  /** Whether the user is authenticated with Turnkey and wallet is ready */
  isReady: boolean;
  /** Whether wallet loading is in progress */
  isLoading: boolean;
  /** Turnkey auth state */
  authState: string | undefined;
  /** Start email OTP flow to create embedded Polygon wallet */
  loginWithOtp: (params: { email: string }) => Promise<void>;
  /** Verify the OTP code sent to email */
  verifyOtp: (params: { otpCode: string }) => Promise<void>;
  /** Clear local wallet link and log out of Turnkey */
  disable: () => Promise<void>;
  /** Sign a message using the embedded Polygon key */
  signMessage: (message: string) => Promise<unknown>;
  /** Sign a transaction using the embedded Polygon key */
  signTransaction: (unsignedTx: string) => Promise<unknown>;
}

/**
 * Manages the embedded Polygon wallet for Polymarket integration.
 * Completely separate from the MWA Solana wallet.
 *
 * Flow:
 * 1. User taps "Enable Predictions" → enters email
 * 2. Turnkey sends OTP to email
 * 3. User enters OTP → Turnkey creates sub-org + Ethereum wallet
 * 4. We read the Polygon (EVM) address from the wallet
 * 5. Address is cached in AsyncStorage
 */
export function usePolymarketWallet(): PolymarketWallet {
  const turnkey = useTurnkey();

  const [stored, setStored] = useState<StoredWallet | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load cached address on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setStored(JSON.parse(raw) as StoredWallet);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // When Turnkey wallets load after auth, pick up the Ethereum address
  useEffect(() => {
    const wallets = turnkey.wallets ?? [];
    if (stored || wallets.length === 0) return;

    for (const w of wallets) {
      const ethAccount = (w.accounts ?? []).find(
        (a: { address: string }) => a.address.startsWith('0x'),
      );
      if (ethAccount) {
        const data: StoredWallet = { polygonAddress: ethAccount.address };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
        setStored(data);
        return;
      }
    }
  }, [turnkey.wallets, stored]);

  // Find the matching wallet account for signing
  const walletAccount = useMemo(() => {
    if (!stored) return null;
    for (const w of turnkey.wallets ?? []) {
      const account = (w.accounts ?? []).find(
        (a: { address: string }) =>
          a.address.toLowerCase() === stored.polygonAddress.toLowerCase(),
      );
      if (account) return account;
    }
    return null;
  }, [turnkey.wallets, stored]);

  const isReady = !!walletAccount;

  const loginWithOtp = useCallback(
    async (params: { email: string }) => {
      setIsLoading(true);
      try {
        await turnkey.loginWithOtp?.({ email: params.email });
      } finally {
        setIsLoading(false);
      }
    },
    [turnkey.loginWithOtp],
  );

  const verifyOtp = useCallback(
    async (params: { otpCode: string }) => {
      setIsLoading(true);
      try {
        await turnkey.verifyOtp?.({ otpCode: params.otpCode });
        // After successful OTP, Turnkey auto-creates sub-org + wallet
        // The useEffect above will pick up the address from turnkey.wallets
      } finally {
        setIsLoading(false);
      }
    },
    [turnkey.verifyOtp],
  );

  const disable = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setStored(null);
    turnkey.logout?.();
  }, [turnkey.logout]);

  const signMessage = useCallback(
    async (message: string): Promise<unknown> => {
      if (!walletAccount) return null;
      return turnkey.signMessage?.({ walletAccount, message });
    },
    [walletAccount, turnkey.signMessage],
  );

  const signTransaction = useCallback(
    async (unsignedTx: string): Promise<unknown> => {
      if (!walletAccount) return null;
      return turnkey.signTransaction?.({
        walletAccount,
        unsignedTransaction: unsignedTx,
        transactionType: 'TRANSACTION_TYPE_ETHEREUM',
      });
    },
    [walletAccount, turnkey.signTransaction],
  );

  return {
    polygonAddress: stored?.polygonAddress ?? null,
    isReady,
    isLoading,
    authState: turnkey.authState,
    loginWithOtp,
    verifyOtp,
    disable,
    signMessage,
    signTransaction,
  };
}
