import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { DepositModal } from '@/components/predict/DepositModal';
import { WithdrawModal } from '@/components/predict/WithdrawModal';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { fetchPortfolio, fetchClobBalance, fetchOpenOrders } from '@/features/predict/predict.api';
import type { PortfolioData, PortfolioPosition, OpenOrder } from '@/features/predict/predict.api';
import { useWallet } from '@/hooks/useWallet';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
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
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}$${value.toFixed(2)}`;
}

export default function PredictProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { connected, address: solanaAddress } = useWallet();
  const poly = usePolymarketWallet();
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

  const isEnabled = poly.isReady && poly.polygonAddress;

  const loadPortfolio = useCallback(async () => {
    if (!poly.polygonAddress) return;
    // Gamma data-api tracks by Safe address (where funds/positions live)
    // CLOB operations use EOA (polygonAddress) for session auth
    const gammaAddr = poly.safeAddress ?? poly.polygonAddress;
    const [portfolioData, balanceData, ordersData] = await Promise.all([
      fetchPortfolio(gammaAddr).catch(() => null),
      fetchClobBalance(poly.polygonAddress),
      fetchOpenOrders(poly.polygonAddress).catch(() => []),
    ]);
    if (portfolioData) setPortfolio(portfolioData);
    setOpenOrders(ordersData);
    if (balanceData) {
      setCashBalance(balanceData.balance);
      setSessionExpired(false);
    } else {
      setCashBalance(null);
      setSessionExpired(true);
    }
  }, [poly.polygonAddress, poly.safeAddress]);

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

  const handleOpenAccount = useCallback(() => {
    if (!connected) {
      Alert.alert('Connect Wallet', 'Connect your Solana wallet first.');
      return;
    }

    Alert.alert(
      'Open Polymarket Account',
      'This will create a Polymarket trading account linked to your Solana wallet.\n\n' +
        '• You\'ll sign a message with Phantom (not a transaction)\n' +
        '• A Polygon trading address is derived from your signature\n' +
        '• No extra seed phrases or wallets to manage\n' +
        '• You can deposit & trade on prediction markets',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Account',
          onPress: async () => {
            setBusy(true);
            try {
              await poly.enable();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to create account';
              Alert.alert('Error', msg);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [connected, poly]);

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

  const handleDisable = useCallback(() => {
    Alert.alert(
      'Disable Predictions?',
      'This will remove your derived Polymarket wallet. Your positions are safe on-chain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => void poly.disable(),
        },
      ],
    );
  }, [poly]);

  const positions = portfolio?.positions ?? [];
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
                <Text style={styles.connectedText}>Connected</Text>
              </View>
            )}
          </View>

          {!isEnabled && !poly.isLoading && (
            <Pressable
              onPress={handleOpenAccount}
              disabled={busy || !connected}
              style={[styles.openAccountBtn, (busy || !connected) && styles.btnDisabled]}
            >
              {busy ? (
                <ActivityIndicator color={tokens.colors.backgroundDark} size="small" />
              ) : (
                <Text style={styles.openAccountBtnText}>Open{'\n'}Account</Text>
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
              </View>
              <View style={[styles.equityRow, { marginTop: 10 }]}>
                <View style={styles.eqItem}>
                  <Text style={styles.eqLabel}>P&L</Text>
                  <Text style={[styles.eqVal, totalPnl >= 0 ? styles.posText : styles.negText]}>
                    {formatPnl(totalPnl)}
                  </Text>
                </View>
                <View style={[styles.eqItem, styles.eqItemCenter]}>
                  <Text style={styles.eqLabel}>Positions</Text>
                  <Text style={styles.eqVal}>{positions.length}</Text>
                </View>
              </View>
            </View>

            {/* Open Orders */}
            {openOrders.length > 0 && (
              <View style={styles.positionsSection}>
                <View style={styles.posHeader}>
                  <Text style={styles.posTitle}>Open Orders</Text>
                  <Text style={styles.posCount}>{openOrders.length} pending</Text>
                </View>
                {openOrders.map((o: OpenOrder) => {
                  const sizeNum = parseFloat(o.original_size) || 0;
                  const matched = parseFloat(o.size_matched) || 0;
                  const priceNum = parseFloat(o.price) || 0;
                  const cost = sizeNum * priceNum;
                  const fillPct = sizeNum > 0 ? Math.round((matched / sizeNum) * 100) : 0;
                  return (
                    <View key={o.id} style={styles.orderCard}>
                      <View style={styles.orderCardTop}>
                        <View style={[styles.sideBadge, o.side === 'BUY' ? styles.sideBadgeYes : styles.sideBadgeNo]}>
                          <Text style={[styles.sideBadgeText, o.side === 'BUY' ? styles.posText : styles.negText]}>
                            {o.side}
                          </Text>
                        </View>
                        <Text style={styles.orderOutcome} numberOfLines={1}>{o.outcome || '--'}</Text>
                        <Text style={styles.orderStatus}>{o.status}</Text>
                      </View>
                      <View style={styles.orderCardStats}>
                        <View>
                          <Text style={styles.orderStatLabel}>Price</Text>
                          <Text style={styles.orderStatVal}>{Math.round(priceNum * 100)}¢</Text>
                        </View>
                        <View>
                          <Text style={styles.orderStatLabel}>Shares</Text>
                          <Text style={styles.orderStatVal}>{sizeNum.toFixed(2)}</Text>
                        </View>
                        <View>
                          <Text style={styles.orderStatLabel}>Cost</Text>
                          <Text style={styles.orderStatVal}>${cost.toFixed(2)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.orderStatLabel}>Filled</Text>
                          <Text style={styles.orderStatVal}>{fillPct}%</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Open positions */}
            <View style={styles.positionsSection}>
              <View style={styles.posHeader}>
                <Text style={styles.posTitle}>Positions</Text>
                <Text style={styles.posCount}>{positions.length} active</Text>
              </View>
              {positions.length === 0 && openOrders.length === 0 && (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="show-chart" size={24} color={semantic.text.faint} />
                  <Text style={styles.emptyText}>No positions or orders</Text>
                </View>
              )}
              {positions.map((p: PortfolioPosition, i: number) => {
                const pnl = p.cashPnl ?? 0;
                const isUp = pnl >= 0;
                return (
                  <View key={`${p.conditionId}-${p.outcomeIndex}-${i}`} style={styles.posRow}>
                    <View
                      style={[
                        styles.sideBadge,
                        p.outcome === 'No' ? styles.sideBadgeNo : styles.sideBadgeYes,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sideBadgeText,
                          p.outcome === 'No' ? styles.negText : styles.posText,
                        ]}
                      >
                        {p.outcome?.toUpperCase() ?? 'YES'}
                      </Text>
                    </View>
                    <Text style={styles.posQuestion} numberOfLines={1}>
                      {p.title || p.slug || '—'}
                    </Text>
                    <View style={styles.posPnlWrap}>
                      <Text style={[styles.posPnl, isUp ? styles.posText : styles.negText]}>
                        {formatPnl(pnl)}
                      </Text>
                      <Text style={styles.posEntry}>
                        {p.avgPrice?.toFixed(2) ?? '--'}→{p.curPrice?.toFixed(2) ?? '--'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Addresses + disable */}
            <View style={styles.addressesSection}>
              <Text style={styles.sectionLabel}>ADDRESSES</Text>
              {solanaAddress && (
                <View style={styles.addressRow}>
                  <Text style={styles.chainLabel}>SOL</Text>
                  <Text style={styles.addressMono}>{truncate(solanaAddress)}</Text>
                </View>
              )}
              {poly.polygonAddress && (
                <View style={styles.addressRow}>
                  <Text style={styles.chainLabel}>EOA</Text>
                  <Text style={styles.addressMono}>{truncate(poly.polygonAddress)}</Text>
                </View>
              )}
              {poly.safeAddress && (
                <View style={styles.addressRow}>
                  <Text style={styles.chainLabel}>SAFE</Text>
                  <Text style={styles.addressMono}>{truncate(poly.safeAddress)}</Text>
                </View>
              )}
              <Pressable onPress={handleDisable} style={styles.disableBtn}>
                <Text style={styles.disableBtnText}>Disable Predictions</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />

      {poly.polygonAddress && (
        <DepositModal
          isOpen={depositOpen}
          onClose={() => setDepositOpen(false)}
          polygonAddress={poly.polygonAddress}
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

  // Open Account button
  openAccountBtn: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openAccountBtnText: {
    color: tokens.colors.backgroundDark,
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 12,
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

  // Addresses section
  addressesSection: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: 16,
    marginBottom: 8,
    gap: tokens.spacing.sm,
  },
  sectionLabel: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  chainLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    color: tokens.colors.primary,
    width: 36,
  },
  addressMono: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
  },
  disableBtn: {
    borderWidth: 1,
    borderColor: semantic.border.muted,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    marginTop: 4,
  },
  disableBtnText: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },

  // Color helpers
  posText: { color: tokens.colors.viridian },
  negText: { color: tokens.colors.vermillion },
});
