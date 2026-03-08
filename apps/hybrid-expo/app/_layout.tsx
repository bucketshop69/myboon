import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export default function RootLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="predict" options={{ headerShown: false }} />
        <Stack.Screen name="predict-market/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="predict-sport/[sport]/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="swap" options={{ headerShown: false }} />
        <Stack.Screen name="trade" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
