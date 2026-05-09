import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';

export type WalletSource = 'privy' | 'mwa';

export function useWallet() {
  const privy = usePrivyWallet();
  const { account, connect, disconnect, signMessage, signAndSendTransaction, connection } =
    useMobileWallet();

  // MWA wallet state
  const raw = account?.address;
  const mwaAddress = raw ? (typeof raw === 'string' ? raw : raw.toBase58()) : null;

  // Privy user takes priority — they authenticated via passkey (in-app, no app switch)
  if (privy.isPrivyUser && privy.connected) {
    return {
      connected: true as const,
      address: privy.address,
      shortAddress: privy.shortAddress,
      connect: async (_walletName?: string) => privy.loginWithPasskey(),
      disconnect: privy.disconnect,
      signMessage: privy.signMessage,
      // Privy embedded wallets don't support signAndSendTransaction directly —
      // Polymarket orders are signed locally (EIP-712) and proxied via VPS
      signAndSendTransaction: null,
      connection: null,
      walletOptions: [],
      source: 'privy' as WalletSource,
    };
  }

  // Fall back to MWA (Phantom / Solflare)
  return {
    connected: !!account,
    address: mwaAddress,
    shortAddress: mwaAddress
      ? `${mwaAddress.slice(0, 4)}···${mwaAddress.slice(-4)}`
      : null,
    connect: async (_walletName?: string) => connect(),
    disconnect,
    signMessage,
    signAndSendTransaction,
    connection,
    walletOptions: [],
    source: 'mwa' as WalletSource,
  };
}
