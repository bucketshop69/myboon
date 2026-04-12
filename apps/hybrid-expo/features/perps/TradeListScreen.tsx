import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { FeedHeader } from '@/features/feed/components/FeedHeader';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import {
  fetchPerpsMarkets,
  formatChange,
  formatPrice,
  formatUsdCompact,
} from '@/features/perps/perps.api';
import type { PerpsMarket } from '@/features/perps/perps.types';
import { semantic, tokens } from '@/theme';

export function TradeListScreen() {
  const router = useRouter();
  const [markets, setMarkets] = useState<PerpsMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // Top 6 by absolute 24h change for the trending strip
  const trendingMarkets = useMemo(
    () =>
      [...markets]
        .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
        .slice(0, 6),
    [markets],
  );

  function goToMarket(symbol: string) {
    router.push(`/trade/${encodeURIComponent(symbol)}`);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FeedHeader />

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Trade</Text>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>Pacific · Solana</Text>
        </View>
      </View>

      {/* Narrative hint — bridge from Feed */}
      <Pressable
        style={({ pressed }) => [styles.narrativeHint, pressed && styles.narrativeHintPressed]}
        onPress={() => goToMarket('BTC')}>
        <View style={styles.hintDot} />
        <Text style={styles.hintText}>
          FROM FEED · <Text style={styles.hintAccent}>BTC halving supply shock</Text> — tap to trade
        </Text>
        <MaterialIcons name="chevron-right" size={12} color={tokens.colors.primaryDim} />
      </Pressable>

      {/* Asset Strip — trending markets */}
      {markets.length > 0 ? (
        <View style={styles.stripSection}>
          <Text style={styles.stripLabel}>Trending</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stripContent}>
            {trendingMarkets.map((market) => {
              const isUp = market.change24h >= 0;
              return (
                <Pressable
                  key={market.symbol}
                  style={({ pressed }) => [styles.stripCard, pressed && styles.stripCardPressed]}
                  onPress={() => goToMarket(market.symbol)}>
                  <Text style={styles.stripSym}>{market.symbol}</Text>
                  <Text style={[styles.stripChange, isUp ? styles.textPos : styles.textNeg]}>
                    {formatChange(market.change24h)}
                  </Text>
                  <Text style={styles.stripPrice}>{formatPrice(market.markPrice)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

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
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thLeft]}>Market</Text>
            <Text style={[styles.th, styles.thRight]}>Price</Text>
            <Text style={[styles.th, styles.thRight, styles.thActive]}>24h ▾</Text>
            <Text style={[styles.th, styles.thRight]}>OI</Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.tableBody}>
            {markets.map((market) => {
              const isUp = market.change24h >= 0;
              return (
                <Pressable
                  key={market.symbol}
                  style={({ pressed }) => [styles.tableRow, pressed && styles.tableRowPressed]}
                  onPress={() => goToMarket(market.symbol)}>
                  {/* Symbol col */}
                  <View style={styles.symCol}>
                    <Text style={styles.rowSym}>{market.symbol}</Text>
                    <Text style={styles.rowSubText}>PERP · {market.maxLeverage}×</Text>
                  </View>
                  {/* Price col */}
                  <Text style={[styles.rowCell, styles.rowPrice]}>
                    {formatPrice(market.markPrice)}
                  </Text>
                  {/* 24h change col */}
                  <Text
                    style={[styles.rowCell, styles.rowChange, isUp ? styles.textPos : styles.textNeg]}>
                    {formatChange(market.change24h)}
                  </Text>
                  {/* OI col */}
                  <Text style={[styles.rowCell, styles.rowOi]}>
                    {formatUsdCompact(market.openInterest)}
                  </Text>
                </Pressable>
              );
            })}
            {/* Bottom padding so last row clears the nav */}
            <View style={styles.tableFooterPad} />
          </ScrollView>
        </View>
      )}

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </SafeAreaView>
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

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  sectionTitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  sectionBadge: {
    backgroundColor: 'rgba(74,140,111,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.20)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sectionBadgeText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: tokens.colors.viridian,
  },

  // Narrative hint
  narrativeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  narrativeHintPressed: {
    backgroundColor: 'rgba(199,183,112,0.04)',
  },
  hintDot: {
    width: 5,
    height: 5,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.primary,
  },
  hintText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1,
    color: tokens.colors.primaryDim,
  },
  hintAccent: {
    color: tokens.colors.primary,
  },

  // Asset strip
  stripSection: {
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    paddingBottom: tokens.spacing.sm,
    paddingTop: tokens.spacing.xs,
  },
  stripLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.faint,
    paddingHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.xs,
  },
  stripContent: {
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  stripCard: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs + 2,
    minWidth: 72,
    gap: 2,
  },
  stripCardPressed: {
    borderColor: tokens.colors.primaryDim,
    backgroundColor: 'rgba(199,183,112,0.06)',
  },
  stripSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.3,
  },
  stripChange: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '600',
  },
  stripPrice: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
    marginTop: 1,
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
  tableFooterPad: {
    height: 120,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(48,47,32,0.5)',
  },
  tableRowPressed: {
    backgroundColor: 'rgba(199,183,112,0.04)',
  },
  symCol: {
    flex: 1,
    gap: 2,
  },
  rowSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.2,
  },
  rowSubText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    letterSpacing: 0.8,
  },
  rowCell: {
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  rowPrice: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
    color: semantic.text.primary,
    width: COL_PRICE,
  },
  rowChange: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
    width: COL_CHANGE,
  },
  rowOi: {
    fontSize: tokens.fontSize.xxs,
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
});
