import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';

export function useWallet() {
  const { publicKey, connected, connect, disconnect, signMessage, sendTransaction } =
    useSolanaWallet();

  const addressStr = publicKey?.toBase58() ?? null;

  return {
    connected,
    address: addressStr,
    shortAddress: addressStr
      ? `${addressStr.slice(0, 4)}···${addressStr.slice(-4)}`
      : null,
    connect: async () => { await connect(); },
    disconnect: async () => { await disconnect(); },
    signMessage: signMessage ?? (async () => { throw new Error('signMessage not supported'); }),
    signAndSendTransaction: sendTransaction,
    connection: null, // web consumers should use useConnection() directly
  };
}
