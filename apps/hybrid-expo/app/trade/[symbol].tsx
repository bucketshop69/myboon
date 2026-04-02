import { useLocalSearchParams } from 'expo-router';
import { MarketDetailScreen } from '@/features/perps/MarketDetailScreen';

export default function TradeSymbolRoute() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  return <MarketDetailScreen symbol={symbol ?? 'BTC'} />;
}
