// MobileWalletProvider is now in app/_layout.tsx.
// This file is kept as a thin re-export shim so any existing imports
// of WalletProvider from this path continue to resolve.
export { MobileWalletProvider as WalletProvider } from '@wallet-ui/react-native-web3js';
