import React from 'react';
import { TurnkeyProvider as TurnkeySDKProvider } from '@turnkey/react-native-wallet-kit';
import type { CreateSubOrgParams } from '@turnkey/react-native-wallet-kit';

// Auto-create an Ethereum (Polygon-compatible) wallet on signup
const SUBORG_PARAMS: CreateSubOrgParams = {
  userName: `myboon-${Date.now()}`,
  customWallet: {
    walletName: 'Polymarket Wallet',
    walletAccounts: [
      {
        curve: 'CURVE_SECP256K1',
        pathFormat: 'PATH_FORMAT_BIP32',
        path: "m/44'/60'/0'/0/0",
        addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
      },
    ],
  },
};

const TURNKEY_CONFIG = {
  organizationId: process.env.EXPO_PUBLIC_TURNKEY_ORG_ID ?? '',
  authProxyConfigId: process.env.EXPO_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ?? '',
  auth: {
    otp: {
      email: true,
      createSuborgParams: SUBORG_PARAMS,
    },
    passkey: false,
    autoRefreshSession: true,
  },
};

/**
 * Turnkey provider — only used for Polymarket's Polygon embedded wallet.
 * MWA (Solana) remains the primary wallet layer and is completely unaffected.
 *
 * Flow:
 * 1. User taps "Enable Predictions" on profile
 * 2. Turnkey email OTP auth → creates sub-org with Ethereum wallet
 * 3. Polygon address is derived from the embedded wallet
 * 4. Used for Polymarket CLOB signing (EIP-712) in future
 */
export function TurnkeyEmbeddedProvider({ children }: { children: React.ReactNode }) {
  return (
    <TurnkeySDKProvider config={TURNKEY_CONFIG}>
      {children}
    </TurnkeySDKProvider>
  );
}
