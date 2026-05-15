import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTopBar, AppTopBarLogo } from '@/components/AppTopBar';
import { AvatarTrigger } from '@/components/drawer/AvatarTrigger';
import {
  fetchPhoenixMarkets,
  type PhoenixMarket,
} from '@/features/perps/phoenix.api';
import { semantic, tokens } from '@/theme';

const MarketRow = memo(function MarketRow({
  market,
  onPress,
}: {
  market: PhoenixMarket;
  onPress: (symbol: string) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tableRow, pressed && styles.tableRowPressed]}
      onPress={() => onPress(market.symbol)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${market.symbol}`}
    >
      <View style={styles.tokenFallback}>
        <Text style={styles.tokenFallbackText}>{market.baseSymbol[0] ?? 'P'}</Text>
      </View>
      <View style={styles.symCol}>
        <Text style={styles.rowSym}>{market.symbol}</Text>
        <View style={styles.rowMetaLine}>
          <Text style={styles.rowSub} numberOfLines={1}>
            {market.baseSymbol}/{market.quoteSymbol}
          </Text>
          <Text style={styles.rowDot}>·</Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {formatFeePair(market)}
          </Text>
        </View>
      </View>
      <View style={styles.configCol}>
        <View style={[styles.statusPill, market.tradeable ? styles.statusPillActive : styles.statusPillMuted]}>
          <Text style={[styles.statusText, market.tradeable ? styles.statusTextActive : styles.statusTextMuted]}>
            {market.tradeable ? 'Active' : statusLabel(market.status)}
          </Text>
        </View>
        <Text style={styles.leverageText}>
          {market.maxLeverage ? `${market.maxLeverage}x max` : 'Max --'}
        </Text>
      </View>
    </Pressable>
  );
});

export function PhoenixMarketListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [markets, setMarkets] = useState<PhoenixMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const filteredMarkets = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return markets;
    return markets.filter((market) => (
      market.symbol.toLowerCase().includes(query)
      || market.baseSymbol.toLowerCase().includes(query)
    ));
  }, [markets, searchText]);

  const loadMarkets = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setErrorMessage(null);

    try {
      setMarkets(await fetchPhoenixMarkets());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Phoenix markets unavailable');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMarkets(false);
    setRefreshing(false);
  }, [loadMarkets]);

  const goToMarket = useCallback((symbol: string) => {
    router.push(`/markets/phoenix/${encodeURIComponent(symbol)}`);
  }, [router]);

  const renderMarket = useCallback(
    ({ item }: { item: PhoenixMarket }) => <MarketRow market={item} onPress={goToMarket} />,
    [goToMarket],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppTopBar
        left={<AppTopBarLogo />}
        right={<AvatarTrigger />}
      />

      {loading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={semantic.text.accent} />
          <Text style={styles.stateText}>Loading Phoenix markets...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorTitle}>Phoenix unavailable</Text>
          <Text style={styles.stateText}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadMarkets()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thLeft]}>Market</Text>
            <Text style={[styles.th, styles.thRight]}>Setup</Text>
          </View>

          <FlatList
            data={filteredMarkets}
            keyExtractor={(market) => market.symbol}
            renderItem={renderMarket}
            style={styles.tableList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.tableBody}
            ListEmptyComponent={<EmptyMarketSearch searchText={searchText} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.text.accent} />}
          />

          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={16} color={semantic.text.dim} />
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search Phoenix..."
              placeholderTextColor={semantic.text.faint}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <Pressable
                onPress={() => setSearchText('')}
                hitSlop={8}
                style={styles.searchClear}
                accessibilityRole="button"
                accessibilityLabel="Clear Phoenix search"
              >
                <MaterialIcons name="close" size={14} color={semantic.text.dim} />
              </Pressable>
            )}
            {searchText.length > 0 && (
              <Text style={styles.marketCount}>
                {filteredMarkets.length}/{markets.length}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function EmptyMarketSearch({ searchText }: { searchText: string }) {
  return (
    <View style={styles.emptySearch}>
      <Text style={styles.stateText}>
        {searchText.trim() ? 'No Phoenix markets match that search.' : 'No Phoenix markets returned.'}
      </Text>
    </View>
  );
}

function statusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatFeePair(market: PhoenixMarket): string {
  const maker = formatFee(market.fees?.makerFee);
  const taker = formatFee(market.fees?.takerFee);
  if (!maker && !taker) return 'Fees --';
  return `M/T ${maker ?? '--'} / ${taker ?? '--'}`;
}

function formatFee(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const percentage = value * 100;
  const fixed = percentage >= 0.1 ? percentage.toFixed(2) : percentage.toFixed(3);
  return `${fixed.replace(/\.?0+$/, '')}%`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xl,
  },
  stateText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    lineHeight: 17,
    color: semantic.text.dim,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  retryButton: {
    marginTop: tokens.spacing.xs,
    backgroundColor: semantic.text.accent,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
  },
  retryText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: semantic.background.screen,
  },
  tableContainer: {
    flex: 1,
  },
  tableList: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    backgroundColor: semantic.background.screen,
  },
  th: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  thLeft: {
    flex: 1,
  },
  thRight: {
    textAlign: 'right',
  },
  thActive: {
    color: tokens.colors.primaryDim,
  },
  tableBody: {
    paddingTop: 0,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(48,47,32,0.5)',
  },
  tableRowPressed: {
    backgroundColor: 'rgba(199,183,112,0.04)',
  },
  tokenFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: tokens.spacing.sm,
    backgroundColor: semantic.background.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenFallbackText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    color: semantic.text.dim,
  },
  symCol: {
    flex: 1,
    minWidth: 0,
  },
  rowSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  rowSub: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
  },
  rowDot: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
  },
  configCol: {
    alignItems: 'flex-end',
    gap: 5,
    marginLeft: tokens.spacing.sm,
  },
  statusPill: {
    minWidth: 64,
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillActive: {
    borderColor: 'rgba(0,218,175,0.48)',
    backgroundColor: 'rgba(0,218,175,0.09)',
  },
  statusPillMuted: {
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surfaceRaised,
  },
  statusText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusTextActive: {
    color: tokens.colors.viridian,
  },
  statusTextMuted: {
    color: semantic.text.faint,
  },
  leverageText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    color: semantic.text.faint,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    color: semantic.text.primary,
    padding: 0,
  },
  searchClear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: semantic.background.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketCount: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
    letterSpacing: 0.5,
  },
  emptySearch: {
    padding: tokens.spacing.xl,
  },
});
