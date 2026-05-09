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
import { useFocusEffect, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppTopBar, AppTopBarIconButton, AppTopBarTitle } from '@/components/AppTopBar';
import { DepositModal } from '@/components/predict/DepositModal';
import { WithdrawModal } from '@/components/predict/WithdrawModal';
import { fetchPortfolio, fetchClobBalance, fetchOpenOrders, cancelOrder, placeBet } from '@/features/predict/predict.api';
import type { OpenOrder, PortfolioData, PortfolioPosition } from '@/features/predict/predict.api';
import { useWallet } from '@/hooks/useWallet';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { useDrawer } from '@/components/drawer/DrawerProvider';
import { EmptyPortfolio } from '@/features/predict/profile/EmptyPortfolio';
import { YourPicksSection } from '@/features/predict/profile/YourPicksSection';
import { CashOutConfirmModal } from '@/features/predict/components/CashOutConfirmModal';
import type { PredictDataFreshness } from '@/features/predict/predictActivityState';
import { useFocusedAppStateInterval } from '@/hooks/useFocusedAppStateInterval';
import { semantic, tokens } from '@/theme';

function truncate(addr: string, start = 6, end = 4): string {
  return `${addr.slice(0, start)}···${addr.slice(-end)}`;
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  const prefix = value < 0 ? '-' : '';
  if (abs >= 1000) return `${prefix}$${(abs / 1000).toFixed(1)}K`;
  return `${prefix}$${abs.toFixed(2)}`;
}

function getOrderCost(order: OpenOrder): number {
  const size = Number.parseFloat(order.original_size) || 0;
  const price = Number.parseFloat(order.price) || 0;
  return size * price;
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
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [activityFreshness, setActivityFreshness] = useState<PredictDataFreshness>({
    lastUpdatedAt: null,
    loading: false,
    stale: false,
    error: null,
  });
  const [cashOutPosition, setCashOutPosition] = useState<PortfolioPosition | null>(null);
  const [cashOutSubmitting, setCashOutSubmitting] = useState(false);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const portfolioRefreshInFlight = useRef(false);
  const ordersRefreshInFlight = useRef(false);

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
    setActivityFreshness((prev) => ({ ...prev, loading: true, error: null }));
    const gammaAddr = poly.tradingAddress ?? poly.polygonAddress;
    const [portfolioResult, balanceResult, ordersResult] = await Promise.allSettled([
      fetchPortfolio(gammaAddr),
      fetchClobBalance(poly.polygonAddress),
      fetchOpenOrders(poly.polygonAddress),
    ]);
    const portfolioData = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;
    const balanceData = balanceResult.status === 'fulfilled' ? balanceResult.value : null;
    const ordersData = ordersResult.status === 'fulfilled' ? ordersResult.value : null;
    if (portfolioData) setPortfolio(portfolioData);
    if (ordersData) setOpenOrders(ordersData);
    if (balanceData) {
      setCashBalance(balanceData.balance);
      setSessionExpired(false);
    } else {
      setCashBalance(null);
      setSessionExpired(true);
    }
    const failed = portfolioResult.status === 'rejected' || balanceResult.status === 'rejected' || ordersResult.status === 'rejected';
    setActivityFreshness({
      lastUpdatedAt: Date.now(),
      loading: false,
      stale: failed,
      error: failed ? 'Could not refresh' : null,
    });
  }, [poly.polygonAddress, poly.tradingAddress]);

  const refreshPortfolioQuietly = useCallback(async () => {
    if (!poly.polygonAddress) return;
    if (portfolioRefreshInFlight.current) return;
    portfolioRefreshInFlight.current = true;
    try {
      const gammaAddr = poly.tradingAddress ?? poly.polygonAddress;
      const [portfolioResult, balanceResult] = await Promise.allSettled([
        fetchPortfolio(gammaAddr),
        fetchClobBalance(poly.polygonAddress),
      ]);
      const portfolioData = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;
      const balanceData = balanceResult.status === 'fulfilled' ? balanceResult.value : null;

      if (portfolioData) setPortfolio(portfolioData);
      if (balanceData) {
        setCashBalance(balanceData.balance);
        setSessionExpired(false);
      }

      const failed = portfolioResult.status === 'rejected' || balanceResult.status === 'rejected';
      setActivityFreshness((prev) => ({
        lastUpdatedAt: failed ? prev.lastUpdatedAt : Date.now(),
        loading: false,
        stale: failed,
        error: failed ? 'Could not refresh' : null,
      }));
    } finally {
      portfolioRefreshInFlight.current = false;
    }
  }, [poly.polygonAddress, poly.tradingAddress]);

  const refreshOpenOrdersQuietly = useCallback(async () => {
    if (!poly.polygonAddress) return;
    if (ordersRefreshInFlight.current) return;
    ordersRefreshInFlight.current = true;
    try {
      setOpenOrders(await fetchOpenOrders(poly.polygonAddress));
    } catch {
      setActivityFreshness((prev) => ({ ...prev, stale: true, error: 'Could not refresh' }));
    } finally {
      ordersRefreshInFlight.current = false;
    }
  }, [poly.polygonAddress]);

  const handleConfirmCashOut = useCallback(async (size: number) => {
    const position = cashOutPosition;
    if (!position || cashOutSubmitting) return;

    if (!position.asset) {
      Alert.alert('Cash out failed', 'Missing token ID for this position.');
      return;
    }

    if (!poly.canSignLocally) {
      try {
        await poly.enable();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to enable Predict account';
        Alert.alert('Wallet', msg);
        return;
      }
    }

    if (!poly.polygonAddress) {
      Alert.alert('Cash out failed', 'Wallet session not ready.');
      return;
    }

    setCashOutSubmitting(true);
    try {
      const price = Math.max(0.01, Math.round((position.curPrice * 0.9) * 100) / 100);
      const result = await placeBet({
        polygonAddress: poly.polygonAddress,
        tokenID: position.asset,
        price,
        size,
        side: 'SELL',
        negRisk: !!position.negativeRisk,
        orderType: 'FOK',
      });
      if (!result.success) throw new Error(result.error || 'Cash out failed');

      setCashOutPosition(null);
      await loadPortfolio();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Cash out failed', msg);
    } finally {
      setCashOutSubmitting(false);
    }
  }, [cashOutPosition, cashOutSubmitting, loadPortfolio, poly]);

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
  const hasMounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasMounted.current && isEnabled && poly.polygonAddress) {
        void loadPortfolio();
      }
      hasMounted.current = true;
    }, [isEnabled, loadPortfolio, poly.polygonAddress]),
  );

  useFocusedAppStateInterval(() => void refreshPortfolioQuietly(), 15_000, {
    enabled: Boolean(isEnabled && poly.polygonAddress),
    resetKey: `${poly.polygonAddress ?? ''}:${poly.tradingAddress ?? ''}`,
  });

  useFocusedAppStateInterval(() => void refreshOpenOrdersQuietly(), 7_000, {
    enabled: Boolean(isEnabled && poly.polygonAddress),
    resetKey: poly.polygonAddress,
  });

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
        '• No extra seed phrases or wallets to manage\n' +
        '• Deposit and make picks without gas',
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

  const handleCashOut = useCallback((position: PortfolioPosition) => {
    setCashOutPosition(position);
  }, []);

  const positions = portfolio?.positions ?? [];
  const redeemablePositions = portfolio?.redeemablePositions ?? [];
  const closedPositions = portfolio?.closedPositions ?? [];
  const portfolioValue = portfolio?.portfolioValue ?? null;
  const cashOutNow = portfolio?.summary.cashOutNow ?? positions.reduce((sum, p) => sum + (p.currentValue ?? 0), 0);
  const readyToCollect = portfolio?.summary.readyToCollect ?? redeemablePositions.reduce((sum, p) => sum + (p.currentValue ?? 0), 0);
  const waitingPickValue = openOrders.reduce((sum, order) => sum + getOrderCost(order), 0);
  const activePickCount = positions.length + openOrders.length;
  const hasAnyPicks = activePickCount + redeemablePositions.length + closedPositions.length > 0;
  const hasActiveOrReadyPicks = activePickCount + redeemablePositions.length > 0;
  const activePicksValue = cashOutNow + waitingPickValue;
  const collectedValue = portfolio?.summary.totalCollected ?? 0;
  const collectedDisplay = hasAnyPicks || (cashBalance ?? 0) > 0 ? formatUsd(collectedValue) : '--';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppTopBar
        left={<AppTopBarIconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />}
        center={<AppTopBarTitle align="left">Profile</AppTopBarTitle>}
        right={(
          <View style={styles.headerActions}>
            {isEnabled && (
              <>
                <Pressable onPress={() => setDepositOpen(true)} style={styles.headerActionBtn}>
                  <MaterialIcons name="arrow-downward" size={12} color={tokens.colors.viridian} />
                  <Text style={styles.headerActionText}>Deposit</Text>
                </Pressable>
                <Pressable onPress={() => setWithdrawOpen(true)} style={styles.headerActionBtn}>
                  <MaterialIcons name="arrow-upward" size={12} color={tokens.colors.primary} />
                  <Text style={[styles.headerActionText, { color: tokens.colors.primary }]}>Withdraw</Text>
                </Pressable>
              </>
            )}
            <AppTopBarIconButton
              icon="settings"
              onPress={openDrawer}
              accessibilityLabel="Open wallet settings"
              color={semantic.text.dim}
            />
          </View>
        )}
      />

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
              {portfolio?.profile?.name ?? (solanaAddress ? truncate(solanaAddress) : poly.polygonAddress ? truncate(poly.polygonAddress) : '—')}
            </Text>
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

        {!isEnabled && !poly.isLoading && (
          <View style={styles.positionsSection}>
            <EmptyPortfolio
              mode="no-account"
              onPrimaryAction={!connected ? openDrawer : handleConnectPredictAccount}
              primaryLabel={!connected ? 'Sign In' : 'Open Prediction Account'}
            />
          </View>
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
                  <Text style={styles.eqLabel}>Predict value</Text>
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
                  <Text style={styles.eqLabel}>
                    {!hasActiveOrReadyPicks ? 'Collected' : readyToCollect > 0 ? 'Ready' : 'Active picks'}
                  </Text>
                  <Text style={[styles.eqVal, readyToCollect > 0 && styles.posText]}>
                    {!hasActiveOrReadyPicks
                      ? collectedDisplay
                      : readyToCollect > 0
                        ? formatUsd(readyToCollect)
                        : formatUsd(activePicksValue)}
                  </Text>
                </View>
              </View>
              {hasActiveOrReadyPicks && (
                <View style={[styles.equityRow, styles.equityRowSecond]}>
                  <View style={styles.eqItem}>
                    <Text style={styles.eqLabel}>Cash out now</Text>
                    <Text style={styles.eqVal}>{formatUsd(cashOutNow)}</Text>
                  </View>
                  <View style={[styles.eqItem, styles.eqItemCenter]}>
                    <Text style={styles.eqLabel}>Active picks</Text>
                    <Text style={styles.eqVal}>{activePickCount}</Text>
                  </View>
                  <View style={[styles.eqItem, styles.eqItemRight]}>
                    <Text style={styles.eqLabel}>Collected</Text>
                    <Text style={styles.eqVal}>{collectedDisplay}</Text>
                  </View>
                </View>
              )}
            </View>

            <YourPicksSection
              positions={positions}
              openOrders={openOrders}
              redeemablePositions={redeemablePositions}
              closedPositions={closedPositions}
              polygonAddress={poly.polygonAddress}
              cancellingOrderId={cancellingId}
              freshness={{ ...activityFreshness, loading: portfolioLoading || refreshing }}
              onCashOutPress={handleCashOut}
              onMarketPress={handleOpenMarket}
              onCancelOrder={(orderId) => void handleCancel(orderId)}
              onRedeemed={() => void loadPortfolio()}
            />

            {positions.length === 0 && openOrders.length === 0 && redeemablePositions.length === 0 && closedPositions.length === 0 && (
              <View style={styles.positionsSection}>
                <EmptyPortfolio
                  mode={(cashBalance ?? 0) > 0 ? 'no-picks' : 'no-balance'}
                  onPrimaryAction={(cashBalance ?? 0) > 0 ? () => router.push('/predict') : () => setDepositOpen(true)}
                  primaryLabel={(cashBalance ?? 0) > 0 ? 'Browse Markets' : 'Deposit'}
                />
              </View>
            )}

          </>
        )}
      </ScrollView>

      {poly.polygonAddress && (
        <DepositModal
          isOpen={depositOpen}
          onClose={() => setDepositOpen(false)}
          polygonAddress={poly.polygonAddress}
          depositWalletAddress={poly.tradingAddress ?? poly.polygonAddress}
          onFundsAvailable={loadPortfolio}
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

      <CashOutConfirmModal
        visible={cashOutPosition !== null}
        position={cashOutPosition}
        submitting={cashOutSubmitting}
        onClose={() => setCashOutPosition(null)}
        onConfirm={handleConfirmCashOut}
      />
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: semantic.background.lift,
    borderRadius: 12,
    paddingHorizontal: 8,
    minHeight: 26,
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
  equityRowSecond: {
    marginTop: 14,
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
