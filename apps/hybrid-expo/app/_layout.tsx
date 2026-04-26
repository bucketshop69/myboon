import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PrivyProvider } from '@/providers/PrivyProvider';
import { WalletProvider } from '@/providers/WalletProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DrawerProvider } from '@/components/drawer/DrawerProvider';
import { WalletDrawer } from '@/components/drawer/WalletDrawer';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import 'react-native-reanimated';

export default function RootLayout() {
  return (
    <PrivyProvider>
    <WalletProvider>
    <DrawerProvider>
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
        <WalletDrawer />
      </View>
      <StatusBar style="light" />
    </DrawerProvider>
    </WalletProvider>
    </PrivyProvider>
  );
}
