import { useMobileWallet } from '@wallet-ui/react-native-web3js';

export function useWallet() {
  const { account, connect, disconnect, signMessage, signAndSendTransaction, connection } =
    useMobileWallet();

  // account.address may be a PublicKey or a string depending on SDK version
  const raw = account?.address;
  const addressStr = raw ? (typeof raw === 'string' ? raw : raw.toBase58()) : null;

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
