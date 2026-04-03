import React from 'react';
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { clusterApiUrl } from '@solana/web3.js';

const chain = 'solana:mainnet-beta';
const endpoint = clusterApiUrl('mainnet-beta');
const identity = {
  name: 'myboon',
  uri: 'https://myboon.xyz',
  icon: 'favicon.png',
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <MobileWalletProvider chain={chain} endpoint={endpoint} identity={identity}>
      {children}
    </MobileWalletProvider>
  );
}
