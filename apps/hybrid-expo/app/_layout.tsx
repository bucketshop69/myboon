import React, { Suspense, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PrivyProvider } from '@/providers/PrivyProvider';
import { WalletProvider } from '@/providers/WalletProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DrawerProvider, useDrawer } from '@/components/drawer/DrawerProvider';
import 'react-native-reanimated';

const LazyWalletDrawer = React.lazy(() =>
  import('@/components/drawer/WalletDrawer').then((module) => ({
    default: module.WalletDrawer,
  })),
);

function WalletDrawerMount() {
  const { isOpen } = useDrawer();
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  if (!hasOpened) return null;

  return (
    <Suspense fallback={null}>
      <LazyWalletDrawer />
    </Suspense>
  );
}

export default function RootLayout() {
  return (
    <PrivyProvider>
    <WalletProvider>
    <DrawerProvider>
      <View style={{ flex: 1 }}>
        <ErrorBoundary>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="feed" options={{ headerShown: false }} />
            <Stack.Screen name="predict" options={{ headerShown: false }} />
            <Stack.Screen name="predict-market/[slug]" options={{ headerShown: false }} />
            <Stack.Screen name="predict-sport/[sport]/[slug]" options={{ headerShown: false }} />
            <Stack.Screen name="predict-profile" options={{ headerShown: false }} />
            <Stack.Screen name="predict-position/[conditionId]" options={{ headerShown: false }} />
            <Stack.Screen name="swap" options={{ headerShown: false }} />
            <Stack.Screen name="trade" options={{ headerShown: false }} />
            <Stack.Screen name="trade/[symbol]" options={{ headerShown: false }} />
            <Stack.Screen name="markets/phoenix" options={{ headerShown: false }} />
            <Stack.Screen name="markets/phoenix/[symbol]" options={{ headerShown: false }} />
          </Stack>
        </ErrorBoundary>
        <WalletDrawerMount />
      </View>
      <StatusBar style="light" />
    </DrawerProvider>
    </WalletProvider>
    </PrivyProvider>
  );
}
