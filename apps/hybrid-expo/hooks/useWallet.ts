import { useMobileWallet } from '@wallet-ui/react-native-web3js';

export function useWallet() {
  const { account, connect, disconnect, signMessage, signAndSendTransaction, connection } =
    useMobileWallet();

  // account.address is a PublicKey — convert to base58 string for consistent API
  const addressStr = account?.address?.toBase58() ?? null;

  return {
    connected: !!account,
    address: addressStr,
    shortAddress: addressStr
      ? `${addressStr.slice(0, 4)}···${addressStr.slice(-4)}`
      : null,
    connect,
    disconnect,
    signMessage,
    signAndSendTransaction,
    connection,
  };
}
