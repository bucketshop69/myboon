import React from 'react';
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { clusterApiUrl } from '@solana/web3.js';
import { PACIFIC_ENV } from '@/features/perps/pacific.config';

const cluster = PACIFIC_ENV === 'testnet' ? 'devnet' : 'mainnet-beta';
const chain = `solana:${cluster === 'devnet' ? 'devnet' : 'mainnet-beta'}` as const;
const endpoint = clusterApiUrl(cluster);

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
