import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { clusterApiUrl } from '@solana/web3.js';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

const chain = 'solana:mainnet-beta';
const endpoint = clusterApiUrl('mainnet-beta');
const identity = {
  name: 'myboon',
  uri: 'https://myboon.xyz',
  icon: 'favicon.png',
};

export default function RootLayout() {
  return (
    <MobileWalletProvider chain={chain} endpoint={endpoint} identity={identity}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="predict" options={{ headerShown: false }} />
        <Stack.Screen name="predict-market/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="predict-sport/[sport]/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="swap" options={{ headerShown: false }} />
        <Stack.Screen name="trade" options={{ headerShown: false }} />
        <Stack.Screen name="trade/[symbol]" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </MobileWalletProvider>
  );
}
