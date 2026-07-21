import { useLocalSearchParams } from 'expo-router';
import { MeteoraPoolPhaseTwoScreen } from '@/features/meteora/MeteoraPoolPhaseTwoScreen';
import { meteoraE2eClient } from '@/features/meteora/meteora.e2e-client';

export default function MeteoraPoolRoute() {
  const { poolAddress, positionAddress, e2e } = useLocalSearchParams<{
    poolAddress: string;
    positionAddress?: string;
    e2e?: string;
  }>();
  return (
    <MeteoraPoolPhaseTwoScreen
      poolAddress={poolAddress ?? ''}
      positionAddress={positionAddress || undefined}
      client={__DEV__ && e2e === '1' ? meteoraE2eClient : undefined}
    />
  );
}
