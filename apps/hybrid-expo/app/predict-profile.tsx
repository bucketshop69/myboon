import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { DepositModal } from '@/components/predict/DepositModal';
import { WithdrawModal } from '@/components/predict/WithdrawModal';
import { fetchPortfolio, fetchClobBalance, fetchOpenOrders, fetchActivity, cancelOrder } from '@/features/predict/predict.api';
import type { ActivityItem, PortfolioData } from '@/features/predict/predict.api';
import { useWallet } from '@/hooks/useWallet';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { useDrawer } from '@/components/drawer/DrawerProvider';
import { EmptyPortfolio } from '@/features/predict/profile/EmptyPortfolio';
import { YourPicksSection } from '@/features/predict/profile/YourPicksSection';
import { semantic, tokens } from '@/theme';

function truncate(addr: string, start = 6, end = 4): string {
  return `${addr.slice(0, start)}···${addr.slice(-end)}`;
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  const prefix = value < 0 ? '-' : value > 0 ? '+' : '';
  if (abs >= 1000) return `${prefix}$${(abs / 1000).toFixed(1)}K`;
  return `${prefix}$${abs.toFixed(2)}`;
}

function formatPnl(value: number): string {
  const prefix = value >= 0 ? '+$' : '-$';
  return `${prefix}${Math.abs(value).toFixed(2)}`;
}

export default function PredictProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { connected, address: solanaAddress, source } = useWallet();
  const poly = usePolymarketWallet();
  const { open: openDrawer } = useDrawer();
  const [busy, setBusy] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // Portfolio data
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [tradeHistory, setTradeHistory] = useState<ActivityItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const isEnabled = poly.isReady && poly.polygonAddress;

  const handleCancel = useCallback(async (orderId: string) => {
    if (!poly.polygonAddress) return;
    setCancellingId(orderId);
    try {
      const result = await cancelOrder(poly.polygonAddress, orderId);
      if (result.ok) {
        setOpenOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        Alert.alert('Cancel failed', result.error ?? 'Unknown error');
      }
    } catch {
      Alert.alert('Cancel failed', 'Network error');
    } finally {
      setCancellingId(null);
    }
  }, [poly.polygonAddress]);

  const loadPortfolio = useCallback(async () => {
    if (!poly.polygonAddress) return;
    // Gamma data-api tracks by trading wallet address (where funds/positions live)
    // CLOB operations use EOA (polygonAddress) for session auth
    const gammaAddr = poly.tradingAddress ?? poly.polygonAddress;
    const [portfolioData, balanceData, ordersData, activityData] = await Promise.all([
      fetchPortfolio(gammaAddr).catch(() => null),
      fetchClobBalance(poly.polygonAddress),
      fetchOpenOrders(poly.polygonAddress).catch(() => []),
      fetchActivity(gammaAddr).catch(() => []),
    ]);
    if (portfolioData) setPortfolio(portfolioData);
    setOpenOrders(ordersData);
    setTradeHistory(activityData);
    if (balanceData) {
      setCashBalance(balanceData.balance);
      setSessionExpired(false);
    } else {
      setCashBalance(null);
      setSessionExpired(true);
    }
  }, [poly.polygonAddress, poly.tradingAddress]);

  // Fetch portfolio when enabled
  useEffect(() => {
    if (!isEnabled || !poly.polygonAddress) {
      setPortfolio(null);
      return;
    }
    setPortfolioLoading(true);
    loadPortfolio().finally(() => setPortfolioLoading(false));
  }, [isEnabled, poly.polygonAddress, loadPortfolio]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPortfolio();
    setRefreshing(false);
  }, [loadPortfolio]);

  // Refresh when screen regains focus (e.g. returning from position detail after sell)
  const navigation = useNavigation();
  const hasMounted = useRef(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (hasMounted.current && isEnabled && poly.polygonAddress) {
        void loadPortfolio();
      }
      hasMounted.current = true;
    });
    return unsubscribe;
  }, [navigation, isEnabled, poly.polygonAddress, loadPortfolio]);

  const connectPredictAccount = useCallback(async () => {
    setBusy(true);
    try {
      await poly.enable();
      setSessionExpired(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect Predict account';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }, [poly]);

  const handleConnectPredictAccount = useCallback(() => {
    if (!connected) {
      Alert.alert('Connect Wallet', 'Connect your Solana wallet first.');
      return;
    }

    if (Platform.OS === 'web') {
      void connectPredictAccount();
      return;
    }

    Alert.alert(
      'Connect Predict Account',
      'Sign once to restore or set up the prediction account linked to this wallet.\n\n' +
        '• Sign a message to verify ownership (no transaction)\n' +
        '• Your trading address is derived deterministically\n' +
        '• No extra seed phrases or wallets to manage\n' +
        '• Deposit & trade on prediction markets — gasless',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => void connectPredictAccount(),
        },
      ],
    );
  }, [connectPredictAccount, connected]);

  const handleReconnect = useCallback(async () => {
    if (!connected) return;
    setBusy(true);
    try {
      await poly.enable();
      setSessionExpired(false);
      // Re-fetch after re-auth
      await loadPortfolio();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reconnect failed';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }, [connected, poly, loadPortfolio]);

  const handleOpenMarket = useCallback((slug: string) => {
    const sportMatch = slug.match(/^cric(epl|ucl|ipl)-/);
    if (sportMatch) {
      router.push({
        pathname: '/predict-sport/[sport]/[slug]',
        params: { sport: sportMatch[1], slug },
      });
    } else {
      router.push(`/predict-market/${encodeURIComponent(slug)}`);
    }
  }, [router]);

  const positions = portfolio?.positions ?? [];
  const redeemablePositions = portfolio?.redeemablePositions ?? [];
  const portfolioValue = portfolio?.portfolioValue;
  const totalPnl = portfolio?.summary.totalPnl ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialIcons name="arrow-back" size={14} color={semantic.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        {isEnabled && (
          <View style={styles.headerActions}>
            <Pressable onPress={() => setDepositOpen(true)} style={styles.headerActionBtn}>
              <MaterialIcons name="arrow-downward" size={12} color={tokens.colors.viridian} />
              <Text style={styles.headerActionText}>Deposit</Text>
            </Pressable>
            <Pressable onPress={() => setWithdrawOpen(true)} style={styles.headerActionBtn}>
              <MaterialIcons name="arrow-upward" size={12} color={tokens.colors.primary} />
              <Text style={[styles.headerActionText, { color: tokens.colors.primary }]}>Withdraw</Text>
            </Pressable>
          </View>
        )}
        <Pressable style={[styles.headerBtn, styles.headerBtnGhost]}>
          <MaterialIcons name="settings" size={16} color={semantic.text.dim} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: tokens.spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isEnabled ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tokens.colors.primary}
              colors={[tokens.colors.primary]}
            />
          ) : undefined
        }
      >
        {/* ── Identity ── */}
        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>
                {(portfolio?.profile?.name ?? 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.handle}>
              {portfolio?.profile?.name ?? (poly.polygonAddress ? truncate(poly.polygonAddress) : '—')}
            </Text>
            <View style={styles.addrRow}>
              <Text style={styles.addrText}>
                {solanaAddress ? truncate(solanaAddress) : '—'}
              </Text>
              <MaterialIcons name="content-copy" size={10} color={semantic.text.faint} />
            </View>
            {connected && (
              <View style={styles.connectedChip}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>
                  {source === 'privy' ? 'Passkey' : 'Connected'}
                </Text>
              </View>
            )}
          </View>

          {!isEnabled && !poly.isLoading && !connected && (
            <Pressable
              onPress={openDrawer}
              style={styles.passkeyCta}
            >
              <MaterialIcons name="login" size={14} color={tokens.colors.backgroundDark} />
              <Text style={styles.passkeyCtaText}>Sign In</Text>
            </Pressable>
          )}
          {!isEnabled && !poly.isLoading && connected && (
            <Pressable
              onPress={handleConnectPredictAccount}
              disabled={busy}
              style={[styles.passkeyCta, busy && styles.btnDisabled]}
            >
              {busy ? (
                <ActivityIndicator color={tokens.colors.backgroundDark} size="small" />
              ) : (
                <Text style={styles.passkeyCtaText}>Connect Predict</Text>
              )}
            </Pressable>
          )}
          {isEnabled && (
            <View style={styles.accountActiveBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.accountActiveText}>Active</Text>
            </View>
          )}
        </View>

        {(poly.isLoading || portfolioLoading) && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={tokens.colors.primary} size="small" />
          </View>
        )}

        {sessionExpired && isEnabled && !portfolioLoading && (
          <Pressable onPress={handleReconnect} disabled={busy} style={styles.reconnectBanner}>
            <MaterialIcons name="refresh" size={14} color={tokens.colors.primary} />
            <Text style={styles.reconnectText}>
              {busy ? 'Reconnecting…' : 'Session expired — tap to reconnect'}
            </Text>
          </Pressable>
        )}

        {/* ── Enabled: real portfolio ── */}
        {isEnabled && !portfolioLoading && (
          <>
            {/* Performance strip */}
            {/* <PerfStrip positions={positions} /> */}

            {/* Equity card */}
            <View style={styles.equityCard}>
              <View style={styles.equityRow}>
                <View style={styles.eqItem}>
                  <Text style={styles.eqLabel}>Portfolio</Text>
                  <Text style={styles.eqVal}>
                    {portfolioValue !== null ? formatUsd(portfolioValue) : '--'}
                  </Text>
                </View>
                <View style={[styles.eqItem, styles.eqItemCenter]}>
                  <Text style={styles.eqLabel}>Cash</Text>
                  <Text style={styles.eqVal}>
                    {cashBalance !== null ? `$${cashBalance.toFixed(2)}` : '--'}
                  </Text>
                </View>
                <View style={[styles.eqItem, styles.eqItemRight]}>
                  <Text style={styles.eqLabel}>P&L</Text>
                  <Text style={[styles.eqVal, totalPnl >= 0 ? styles.posText : styles.negText]}>
                    {formatPnl(totalPnl)}
                  </Text>
                </View>
              </View>
            </View>

            <YourPicksSection
              positions={positions}
              openOrders={openOrders}
              redeemablePositions={redeemablePositions}
              polygonAddress={poly.polygonAddress}
              cancellingOrderId={cancellingId}
              onPositionPress={(p) =>
                router.push({
                  pathname: '/predict-position/[conditionId]',
                  params: {
                    conditionId: p.conditionId,
                    slug: p.slug,
                    outcomeIndex: String(p.outcomeIndex),
                  },
                })
              }
              onMarketPress={handleOpenMarket}
              onCancelOrder={(orderId) => void handleCancel(orderId)}
              onRedeemed={() => void loadPortfolio()}
            />

            {positions.length === 0 && openOrders.length === 0 && redeemablePositions.length === 0 && (
              <View style={styles.positionsSection}>
                <EmptyPortfolio
                  hasBalance={(cashBalance ?? 0) > 0}
                  onDeposit={() => setDepositOpen(true)}
                />
              </View>
            )}

            {/* Trade History */}
            {tradeHistory.length > 0 && (
              <View style={styles.positionsSection}>
                <View style={styles.posHeader}>
                  <Text style={styles.posTitle}>Trade History</Text>
                  <Text style={styles.posCount}>{tradeHistory.length} trades</Text>
                </View>
                {tradeHistory.slice(0, 20).map((t, i) => {
                  const isBuy = t.side === 'BUY';
                  const date = new Date(t.timestamp * 1000);
                  const timeStr = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
                  return (
                    <View key={`${t.timestamp}-${i}`} style={styles.posRow}>
                      <View style={[styles.sideBadge, isBuy ? styles.sideBadgeYes : styles.sideBadgeNo]}>
                        <Text style={[styles.sideBadgeText, isBuy ? styles.posText : styles.negText]}>
                          {t.side}
                        </Text>
                      </View>
                      <View style={styles.tradeInfoWrap}>
                        <Text style={styles.posQuestion} numberOfLines={1}>{t.title || t.slug}</Text>
                        <Text style={styles.tradeTime}>{timeStr}</Text>
                      </View>
                      <Text style={[styles.posPnl, isBuy ? styles.posText : styles.negText]}>
                        ${t.usdcSize.toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

          </>
        )}
      </ScrollView>

      {poly.polygonAddress && (
        <DepositModal
          isOpen={depositOpen}
          onClose={() => setDepositOpen(false)}
          polygonAddress={poly.tradingAddress ?? poly.polygonAddress}
        />
      )}

      {poly.polygonAddress && solanaAddress && (
        <WithdrawModal
          isOpen={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          polygonAddress={poly.polygonAddress}
          solanaAddress={solanaAddress}
          cashBalance={cashBalance}
          onSuccess={loadPortfolio}
        />
      )}
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },

  // Header
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnGhost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colors.viridian,
  },

  scroll: { flex: 1 },

  // Identity
  identity: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.primary,
  },
  identityInfo: { flex: 1 },
  handle: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
    marginBottom: 3,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addrText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
    letterSpacing: 0.3,
  },
  connectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52,199,123,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,123,0.22)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 5,
    alignSelf: 'flex-start',
  },
  connectedDot: {
    width: 4,
    height: 4,
    backgroundColor: tokens.colors.viridian,
    borderRadius: 2,
  },
  connectedText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 1,
    color: tokens.colors.viridian,
  },

  // Auth CTA
  passkeyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  passkeyCtaText: {
    color: tokens.colors.backgroundDark,
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  accountActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52,199,123,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,123,0.22)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  accountActiveText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colors.viridian,
    textTransform: 'uppercase',
  },
  btnDisabled: { opacity: 0.5 },

  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: tokens.spacing.lg,
    marginTop: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,194,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,194,255,0.20)',
    borderRadius: 8,
  },
  reconnectText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: tokens.colors.primary,
    letterSpacing: 0.3,
  },

  // Equity card
  equityCard: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: 12,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 10,
    padding: 14,
  },
  equityRow: {
    flexDirection: 'row',
  },
  eqItem: { flex: 1, gap: 3 },
  eqItemCenter: { alignItems: 'center' },
  eqItemRight: { alignItems: 'flex-end' },
  eqLabel: {
    fontFamily: 'monospace',
    fontSize: 6.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  eqVal: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
  },

  // Positions
  positionsSection: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: 12,
  },
  posHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  posTitle: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  posCount: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
  },
  posRow: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  sideBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  sideBadgeYes: { backgroundColor: 'rgba(52,199,123,0.12)' },
  sideBadgeNo: { backgroundColor: 'rgba(244,88,78,0.12)' },
  sideBadgeText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    fontWeight: '700',
  },
  posQuestion: {
    flex: 1,
    fontSize: 9.5,
    color: semantic.text.primary,
    lineHeight: 13,
  },
  posPnlWrap: {
    alignItems: 'flex-end',
    gap: 1,
  },
  posPnl: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '700',
  },
  posEntry: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
  },
  tradeTime: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
    marginTop: 1,
  },
  tradeInfoWrap: {
    flex: 1,
    marginLeft: 8,
  },

  // Order cards
  orderCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 10,
    marginBottom: 5,
    gap: 8,
  },
  orderCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderOutcome: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 10,
    color: semantic.text.primary,
  },
  orderStatus: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  orderCardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderStatLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    color: semantic.text.faint,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  orderStatVal: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: semantic.text.primary,
    fontWeight: '600',
  },

  cancelBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.25)',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    color: semantic.sentiment.negative,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emptyCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.faint,
    letterSpacing: 0.5,
  },


  // Color helpers
  posText: { color: tokens.colors.viridian },
  negText: { color: tokens.colors.vermillion },
});
