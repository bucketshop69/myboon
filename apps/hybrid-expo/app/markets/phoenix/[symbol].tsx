import { useLocalSearchParams } from 'expo-router';
import { PhoenixMarketDetailScreen } from '@/features/perps/PhoenixMarketDetailScreen';

export default function PhoenixMarketSymbolRoute() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  return <PhoenixMarketDetailScreen symbol={symbol ?? 'BTC-PERP'} />;
}
