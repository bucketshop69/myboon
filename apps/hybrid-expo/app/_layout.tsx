import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WalletProvider } from '@/providers/WalletProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import 'react-native-reanimated';

export default function RootLayout() {
  return (
    <WalletProvider>
      <View style={{ flex: 1 }}>
        <ErrorBoundary>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="predict" options={{ headerShown: false }} />
            <Stack.Screen name="predict-market/[slug]" options={{ headerShown: false }} />
            <Stack.Screen name="predict-sport/[sport]/[slug]" options={{ headerShown: false }} />
            <Stack.Screen name="predict-profile" options={{ headerShown: false }} />
            <Stack.Screen name="swap" options={{ headerShown: false }} />
            <Stack.Screen name="trade" options={{ headerShown: false }} />
            <Stack.Screen name="trade/[symbol]" options={{ headerShown: false }} />
          </Stack>
        </ErrorBoundary>
        <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
      </View>
      <StatusBar style="light" />
    </WalletProvider>
  );
}
