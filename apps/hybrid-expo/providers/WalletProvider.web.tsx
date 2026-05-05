import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { useStandardWalletAdapters } from '@solana/wallet-standard-wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import { PACIFIC_ENV } from '@/features/perps/pacific.config';

const endpoint = clusterApiUrl(PACIFIC_ENV === 'testnet' ? 'devnet' : 'mainnet-beta');

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const fallbackWallets = useMemo(() => [new PhantomWalletAdapter()], []);
  const wallets = useStandardWalletAdapters(fallbackWallets);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        {children}
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
