import { useCallback, useEffect, useRef } from 'react';
import { useWallet as useSolanaWallet, useConnection } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import type { Transaction, VersionedTransaction } from '@solana/web3.js';

export function useWallet() {
  const {
    publicKey,
    connected,
    wallet,
    wallets,
    connect,
    disconnect,
    select,
    signMessage,
    signTransaction,
    sendTransaction,
  } = useSolanaWallet();

  const { connection } = useConnection();

  // Track whether we initiated a connect so we can finish it after select settles
  const connectingRef = useRef(false);

  // Once a wallet is selected (state updated), fire connect()
  useEffect(() => {
    if (connectingRef.current && wallet && !connected) {
      connectingRef.current = false;
      connect().catch(() => {});
    }
  }, [wallet, connected, connect]);

  const handleConnect = useCallback(async (walletName?: WalletName | string) => {
    const targetName = walletName ?? wallets[0]?.adapter.name;
    if (!targetName) {
      throw new Error('No Solana wallet extension found');
    }

    connectingRef.current = true;

    if (wallet?.adapter.name === targetName) {
      connectingRef.current = false;
      await connect();
      return;
    }

    select(targetName as WalletName);
  }, [wallets, wallet, connect, select]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

  // Wrap sendTransaction so callers don't need to pass connection
  const handleSignAndSendTransaction = useCallback(
    async (tx: Transaction | VersionedTransaction): Promise<string> => {
      return sendTransaction(tx, connection);
    },
    [sendTransaction, connection],
  );

  const addressStr = publicKey?.toBase58() ?? null;

  return {
    connected,
    address: addressStr,
    shortAddress: addressStr
      ? `${addressStr.slice(0, 4)}···${addressStr.slice(-4)}`
      : null,
    connect: handleConnect,
    disconnect: handleDisconnect,
    signMessage: signMessage ?? (async () => { throw new Error('signMessage not supported'); }),
    signTransaction: signTransaction ?? (async () => { throw new Error('signTransaction not supported'); }),
    signAndSendTransaction: handleSignAndSendTransaction,
    connection,
    walletOptions: wallets.map(({ adapter, readyState }) => ({
      name: adapter.name,
      icon: adapter.icon,
      readyState,
    })),
    source: 'mwa' as const,
  };
}
