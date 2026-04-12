import { useCallback, useEffect, useRef } from 'react';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';

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

  // Track whether we initiated a connect so we can finish it after select settles
  const connectingRef = useRef(false);

  // Once a wallet is selected (state updated), fire connect()
  useEffect(() => {
    if (connectingRef.current && wallet && !connected) {
      connectingRef.current = false;
      connect().catch(() => {});
    }
  }, [wallet, connected, connect]);

  const handleConnect = useCallback(async () => {
    // If only one wallet available (e.g. Phantom via Wallet Standard), select it
    if (wallets.length > 0) {
      connectingRef.current = true;
      select(wallets[0].adapter.name);
    }
  }, [wallets, select]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

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
    signAndSendTransaction: sendTransaction,
    connection: null,
  };
}
