import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { WalletHeaderButton } from '@/components/wallet/WalletHeaderButton';
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

export function TradeListScreen() {
  const router = useRouter();
  const [markets, setMarkets] = useState<PerpsMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [view, setView] = useState<TradeView>('markets');
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
            <Pressable onPress={() => setView('profile')} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <MaterialIcons name="person" size={12} color={semantic.text.primary} />
              </View>
            </Pressable>
            <Text style={styles.tradeTitle}>Trade</Text>
            <WalletHeaderButton />
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
                contentContainerStyle={styles.tableBody}>
                {markets.map((market) => {
                  const isUp = market.change24h >= 0;
                  return (
                    <Pressable
                      key={market.symbol}
                      style={({ pressed }) => [styles.tableRow, pressed && styles.tableRowPressed]}
                      onPress={() => goToMarket(market.symbol)}>
                      <View style={styles.symCol}>
                        <Text style={styles.rowSym}>{market.symbol}</Text>
                        <Text style={styles.rowSubText}>PERP · {market.maxLeverage}×</Text>
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
            </View>
          )}
        </>
      )}

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
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
  avatarRing: {
    width: 28, height: 28,
    borderRadius: 14,
    padding: 2,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: semantic.text.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: semantic.background.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
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
