import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo, useEffect, useMemo, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { fetchWithTimeout, resolveApiBaseUrl } from '@/lib/api';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { AvatarTrigger } from '@/components/drawer/AvatarTrigger';
import {
  fetchPerpsMarkets,
  formatChange,
  formatPrice,
  formatUsdCompact,
} from '@/features/perps/perps.api';
import type { PerpsMarket } from '@/features/perps/perps.types';
import { ProfileView } from '@/features/perps/ProfileView';
import { semantic, tokens } from '@/theme';

type TradeView = 'markets' | 'profile';

// In-memory SVG cache — persists for the app session
const svgCache = new Map<string, string | null>();

const TokenIcon = memo(function TokenIcon({ symbol, iconPath }: { symbol: string; iconPath: string }) {
  const base = symbol.split('-')[0];
  const cacheKey = iconPath || base;
  const uri = `${resolveApiBaseUrl()}${iconPath}`;
  const [xml, setXml] = useState<string | null>(svgCache.get(cacheKey) ?? null);
  const [failed, setFailed] = useState(svgCache.get(cacheKey) === null && svgCache.has(cacheKey));

  useEffect(() => {
    if (svgCache.has(cacheKey)) return;
    fetchWithTimeout(uri)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((text) => { svgCache.set(cacheKey, text); setXml(text); })
      .catch(() => { svgCache.set(cacheKey, null); setFailed(true); });
  }, [cacheKey, uri]);

  if (failed || !xml) {
    return (
      <View style={[styles.tokenIcon, styles.tokenFallback]}>
        <Text style={styles.tokenFallbackText}>{base[0]}</Text>
      </View>
    );
  }
  return (
    <View style={styles.tokenIcon}>
      <SvgXml xml={xml} width={28} height={28} />
    </View>
  );
});


export function TradeListScreen() {
  const router = useRouter();
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>();
  const [markets, setMarkets] = useState<PerpsMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [view, setView] = useState<TradeView>(viewParam === 'profile' ? 'profile' : 'markets');
  const [searchText, setSearchText] = useState('');

  const filteredMarkets = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return markets;
    return markets.filter((m) => m.symbol.toLowerCase().includes(query));
  }, [markets, searchText]);
  async function loadMarkets() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchPerpsMarkets();
      setMarkets(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load markets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMarkets();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      const data = await fetchPerpsMarkets();
      setMarkets(data);
    } catch { /* silent */ }
    setRefreshing(false);
  }

  function goToMarket(symbol: string) {
    router.push(`/trade/${encodeURIComponent(symbol)}`);
  }

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {view === 'profile' ? (
        <ProfileView onBack={() => setView('markets')} />
      ) : (
        <>
          {/* Header — matches Predict pattern */}
          <View style={styles.tradeHeader}>
            <AvatarTrigger />
            <Text style={styles.tradeTitle}>Trade</Text>
            <View style={{ width: 30 }} />
          </View>

          {/* Markets table */}
          {loading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="small" color={semantic.text.accent} />
              <Text style={styles.stateText}>Loading markets...</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.stateContainer}>
              <Text style={styles.errorTitle}>Markets unavailable</Text>
              <Text style={styles.stateText}>{errorMessage}</Text>
              <Pressable style={styles.retryButton} onPress={() => void loadMarkets()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.tableContainer}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.thLeft]}>Market</Text>
                <Text style={[styles.th, styles.thRight]}>Price</Text>
                <Text style={[styles.th, styles.thRight, styles.thActive]}>24h ▾</Text>
                <Text style={[styles.th, styles.thRight]}>OI</Text>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.tableBody}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.text.accent} />}>
                {filteredMarkets.map((market) => {
                  const isUp = market.change24h >= 0;
                  return (
                    <Pressable
                      key={market.symbol}
                      style={({ pressed }) => [styles.tableRow, pressed && styles.tableRowPressed]}
                      onPress={() => goToMarket(market.symbol)}>
                      <TokenIcon symbol={market.symbol} iconPath={market.iconPath} />
                      <View style={styles.symCol}>
                        <Text style={styles.rowSym}>{market.symbol} <Text style={styles.rowLev}>{market.maxLeverage}×</Text></Text>
                      </View>
                      <Text style={[styles.rowCell, styles.rowPrice]}>
                        {formatPrice(market.markPrice)}
                      </Text>
                      <Text
                        style={[styles.rowCell, styles.rowChange, isUp ? styles.textPos : styles.textNeg]}>
                        {formatChange(market.change24h)}
                      </Text>
                      <Text style={[styles.rowCell, styles.rowOi]}>
                        {formatUsdCompact(market.openInterest)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Bottom search bar */}
              <View style={styles.searchBar}>
                <MaterialIcons name="search" size={16} color={semantic.text.dim} />
                <TextInput
                  style={styles.searchInput}
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search markets..."
                  placeholderTextColor={semantic.text.faint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {searchText.length > 0 && (
                  <Pressable
                    onPress={() => setSearchText('')}
                    hitSlop={8}
                    style={styles.searchClear}>
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
        </>
      )}

    </View>
  );
}

const COL_PRICE = 80;
const COL_CHANGE = 58;
const COL_OI = 60;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },

  // Header — Predict pattern
  tradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  tradeTitle: {
    flex: 1,
    textAlign: 'center',
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xs,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },

  // State (loading / error)
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

  // Table
  tableContainer: {
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
    width: COL_CHANGE,
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
  tokenIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: tokens.spacing.sm,
  },
  tokenFallback: {
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.2,
  },
  rowLev: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '400',
    color: semantic.text.faint,
  },
  rowCell: {
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  rowPrice: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    color: semantic.text.primary,
    width: COL_PRICE,
  },
  rowChange: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    width: COL_CHANGE,
  },
  rowOi: {
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
    width: COL_OI,
  },

  // Color helpers
  textPos: {
    color: tokens.colors.viridian,
  },
  textNeg: {
    color: tokens.colors.vermillion,
  },

  // Bottom search bar
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
});
