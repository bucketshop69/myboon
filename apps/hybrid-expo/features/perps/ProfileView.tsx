import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useWallet } from '@/hooks/useWallet';
import {
  fetchPerpsAccount,
  fetchPerpsPositions,
  fetchOpenOrders,
  formatPrice,
  closePosition,
  setTPSL,
  cancelOrder,
  cancelStopOrder,
} from '@/features/perps/perps.api';
import type { PerpsAccount, PerpsPosition, PerpsOrder } from '@/features/perps/perps.types';
import { DepositModal } from '@/features/perps/DepositModal';
import { WithdrawModal } from '@/features/perps/WithdrawModal';
import { semantic, tokens } from '@/theme';

function truncate(addr: string, start = 6, end = 4): string {
  return `${addr.slice(0, start)}···${addr.slice(-end)}`;
}

type Tab = 'positions' | 'orders';

function orderTypeLabel(type: string): string {
  if (type === 'take_profit_limit') return 'Take Profit';
  if (type === 'stop_loss_limit') return 'Stop Loss';
  if (type.includes('limit')) return 'Limit';
  if (type.includes('market')) return 'Market';
  return type;
}

interface ProfileViewProps {
  onBack: () => void;
}

export function ProfileView({ onBack }: ProfileViewProps) {
  const { connected, address, shortAddress, connect, disconnect, signMessage } = useWallet();
  const [account, setAccount] = useState<PerpsAccount | null>(null);
  const [positions, setPositions] = useState<PerpsPosition[]>([]);
  const [orders, setOrders] = useState<PerpsOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [accountChecked, setAccountChecked] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>('positions');

  // Position action menu
  const [menuPosition, setMenuPosition] = useState<PerpsPosition | null>(null);
  // TP/SL modal
  const [tpslPosition, setTpslPosition] = useState<PerpsPosition | null>(null);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const hasPacificAccount = accountChecked && account !== null;
  const noPacificAccount = accountChecked && account === null;

  // Build a map: symbol → { tp, sl } from orders
  const tpslBySymbol = useMemo(() => {
    const map: Record<string, { tp?: PerpsOrder; sl?: PerpsOrder }> = {};
    for (const o of orders) {
      if (!map[o.symbol]) map[o.symbol] = {};
      if (o.orderType === 'take_profit_limit') map[o.symbol].tp = o;
      if (o.orderType === 'stop_loss_limit') map[o.symbol].sl = o;
    }
    return map;
  }, [orders]);

  const fetchAll = useCallback((addr: string) => {
    setLoading(true);
    setAccountChecked(false);
    Promise.all([
      fetchPerpsPositions(addr),
      fetchPerpsAccount(addr),
      fetchOpenOrders(addr),
    ])
      .then(([pos, acc, ord]) => {
        setPositions(pos);
        setAccount(acc);
        setOrders(ord);
      })
      .catch(() => {
        setAccount(null);
        setPositions([]);
        setOrders([]);
      })
      .finally(() => {
        setLoading(false);
        setAccountChecked(true);
      });
  }, []);

  useEffect(() => {
    if (connected && address) {
      fetchAll(address);
    } else {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setAccountChecked(false);
    }
  }, [connected, address, fetchAll]);

  const refresh = useCallback(() => {
    if (!connected || !address) return;
    fetchAll(address);
  }, [connected, address, fetchAll]);

  const handleClosePosition = useCallback(async (pos: PerpsPosition) => {
    if (!address) return;
    setMenuPosition(null);
    setActionLoading(true);
    try {
      const closeSide = pos.side === 'long' ? 'ask' : 'bid';
      await closePosition(pos.symbol, closeSide, pos.size, address, signMessage);
      Alert.alert('Position Closed', `${pos.symbol} ${pos.side.toUpperCase()} closed`);
      refresh();
    } catch (err: any) {
      Alert.alert('Close Failed', err.message ?? 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  }, [address, signMessage, refresh]);

  const handleCancelOrder = useCallback(async (order: PerpsOrder) => {
    if (!address) return;
    setActionLoading(true);
    try {
      const isStop = order.orderType === 'take_profit_limit' || order.orderType === 'stop_loss_limit';
      if (isStop) {
        await cancelStopOrder(order.orderId, order.symbol, address, signMessage);
      } else {
        await cancelOrder(order.orderId, order.symbol, address, signMessage);
      }
      Alert.alert('Order Cancelled', `${orderTypeLabel(order.orderType)} for ${order.symbol} cancelled`);
      refresh();
    } catch (err: any) {
      Alert.alert('Cancel Failed', err.message ?? 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  }, [address, signMessage, refresh]);

  const handleSetTPSL = useCallback(async () => {
    if (!address || !tpslPosition) return;
    setActionLoading(true);
    try {
      const side = tpslPosition.side === 'long' ? 'ask' : 'bid';
      const tpNum = parseFloat(tpPrice.trim());
      const slNum = parseFloat(slPrice.trim());
      const mark = tpslPosition.markPrice;
      const isLong = tpslPosition.side === 'long';

      if (!tpPrice.trim() && !slPrice.trim()) {
        Alert.alert('Enter a Price', 'Set at least a take profit or stop loss price.');
        setActionLoading(false);
        return;
      }
      if (tpPrice.trim() && isLong && tpNum <= mark) {
        Alert.alert('Invalid TP', `Take profit must be above mark price ($${mark.toFixed(2)}) for a long.`);
        setActionLoading(false);
        return;
      }
      if (tpPrice.trim() && !isLong && tpNum >= mark) {
        Alert.alert('Invalid TP', `Take profit must be below mark price ($${mark.toFixed(2)}) for a short.`);
        setActionLoading(false);
        return;
      }
      if (slPrice.trim() && isLong && slNum >= mark) {
        Alert.alert('Invalid SL', `Stop loss must be below mark price ($${mark.toFixed(2)}) for a long.`);
        setActionLoading(false);
        return;
      }
      if (slPrice.trim() && !isLong && slNum <= mark) {
        Alert.alert('Invalid SL', `Stop loss must be above mark price ($${mark.toFixed(2)}) for a short.`);
        setActionLoading(false);
        return;
      }

      const tp = tpPrice.trim() ? { stopPrice: tpPrice.trim(), limitPrice: tpPrice.trim() } : undefined;
      const sl = slPrice.trim() ? { stopPrice: slPrice.trim(), limitPrice: slPrice.trim() } : undefined;
      await setTPSL({ symbol: tpslPosition.symbol, side, takeProfit: tp, stopLoss: sl }, address, signMessage);
      Alert.alert('TP/SL Set', `${tpslPosition.symbol} TP/SL updated`);
      setTpslPosition(null);
      setTpPrice('');
      setSlPrice('');
      refresh();
    } catch (err: any) {
      Alert.alert('TP/SL Failed', err.message ?? 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  }, [address, signMessage, tpslPosition, tpPrice, slPrice, refresh]);

  const openTPSLModal = useCallback((pos: PerpsPosition) => {
    setMenuPosition(null);
    setTpPrice('');
    setSlPrice('');
    setTpslPosition(pos);
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerBtn}>
          <MaterialIcons name="arrow-back" size={14} color={semantic.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        {hasPacificAccount && (
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* ── Identity section ── */}
        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <MaterialIcons name="person" size={18} color={semantic.text.primary} />
            </View>
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.handle}>
              {address ? truncate(address) : 'Not Connected'}
            </Text>
            {connected && (
              <View style={styles.connectedChip}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>Connected</Text>
              </View>
            )}
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={semantic.text.accent} />
          ) : hasPacificAccount ? (
            <View style={styles.accountActiveBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.accountActiveText}>Pacifica</Text>
            </View>
          ) : noPacificAccount && connected ? (
            <View style={styles.noAccountBadge}>
              <MaterialIcons name="info-outline" size={12} color={tokens.colors.primary} />
              <Text style={styles.noAccountText}>No Account</Text>
            </View>
          ) : null}
        </View>

        {/* Switch / Disconnect wallet */}
        {connected && (
          <View style={styles.walletActions}>
            <Pressable
              style={styles.walletActionBtn}
              onPress={async () => {
                await disconnect();
                await connect();
              }}>
              <MaterialIcons name="swap-horiz" size={14} color={semantic.text.primary} />
              <Text style={styles.walletActionText}>Switch Wallet</Text>
            </Pressable>
            <Pressable style={styles.walletActionBtn} onPress={disconnect}>
              <MaterialIcons name="logout" size={14} color={tokens.colors.vermillion} />
              <Text style={[styles.walletActionText, { color: tokens.colors.vermillion }]}>Disconnect</Text>
            </Pressable>
          </View>
        )}

        {/* ── Not connected ── */}
        {!connected && (
          <View style={styles.emptyState}>
            <MaterialIcons name="account-balance-wallet" size={28} color={semantic.text.faint} />
            <Text style={styles.emptyTitle}>Connect Your Wallet</Text>
            <Text style={styles.emptyDesc}>
              Connect a Solana wallet to view your Pacifica trading account.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={connect}>
              <Text style={styles.primaryBtnText}>Connect Wallet</Text>
            </Pressable>
          </View>
        )}

        {/* ── Connected but no Pacifica account ── */}
        {noPacificAccount && connected && (
          <View style={styles.emptyState}>
            <MaterialIcons name="rocket-launch" size={28} color={semantic.text.faint} />
            <Text style={styles.emptyTitle}>No Pacifica Account</Text>
            <Text style={styles.emptyDesc}>
              Deposit USDC to create your Pacifica trading account and start trading perpetuals.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => setDepositOpen(true)}>
              <Text style={styles.primaryBtnText}>Deposit to Start</Text>
            </Pressable>
          </View>
        )}

        {/* ── Has account: equity + tabs ── */}
        {hasPacificAccount && (
          <>
            {/* Equity card */}
            <View style={styles.equityCard}>
              <View style={styles.equityRow}>
                <View style={styles.eqItem}>
                  <Text style={styles.eqLabel}>Equity</Text>
                  <Text style={styles.eqVal}>${account.equity.toFixed(2)}</Text>
                </View>
                <View style={[styles.eqItem, styles.eqItemCenter]}>
                  <Text style={styles.eqLabel}>Margin Used</Text>
                  <Text style={styles.eqVal}>${account.totalMarginUsed.toFixed(2)}</Text>
                </View>
                <View style={[styles.eqItem, styles.eqItemRight]}>
                  <Text style={styles.eqLabel}>Available</Text>
                  <Text style={styles.eqVal}>${account.availableToSpend.toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* ── Tabs: Positions | Orders ── */}
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tab, activeTab === 'positions' && styles.tabActive]}
                onPress={() => setActiveTab('positions')}
              >
                <Text style={[styles.tabText, activeTab === 'positions' && styles.tabTextActive]}>
                  Positions
                </Text>
                {positions.length > 0 && (
                  <View style={[styles.tabBadge, activeTab === 'positions' && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === 'positions' && styles.tabBadgeTextActive]}>
                      {positions.length}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                style={[styles.tab, activeTab === 'orders' && styles.tabActive]}
                onPress={() => setActiveTab('orders')}
              >
                <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>
                  Orders
                </Text>
                {orders.length > 0 && (
                  <View style={[styles.tabBadge, activeTab === 'orders' && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === 'orders' && styles.tabBadgeTextActive]}>
                      {orders.length}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* ── Positions tab ── */}
            {activeTab === 'positions' && (
              <View style={styles.tabContent}>
                {positions.length === 0 ? (
                  <View style={styles.posEmpty}>
                    <MaterialIcons name="inbox" size={22} color={semantic.text.faint} />
                    <Text style={styles.posEmptyText}>No open positions</Text>
                  </View>
                ) : (
                  positions.map((pos) => {
                    const isUp = pos.unrealizedPnl >= 0;
                    const isMenuOpen = menuPosition?.symbol === pos.symbol;
                    const tpsl = tpslBySymbol[pos.symbol];
                    return (
                      <View key={pos.symbol} style={styles.posCard}>
                        <View style={styles.posRow}>
                          <View style={styles.posLeft}>
                            <Text style={styles.posSym}>{pos.symbol}</Text>
                            <Text style={[styles.posSide, pos.side === 'long' ? styles.textPos : styles.textNeg]}>
                              {pos.side.toUpperCase()} · {pos.size}
                            </Text>
                            {/* TP/SL stacked */}
                            {(tpsl?.tp || tpsl?.sl) && (
                              <View style={styles.tpslStack}>
                                {tpsl.tp && (
                                  <View style={styles.tpslRow}>
                                    <Text style={styles.tpslLabelTP}>TP</Text>
                                    <Text style={styles.tpslValueTP}>{formatPrice(tpsl.tp.stopPrice!)}</Text>
                                  </View>
                                )}
                                {tpsl.sl && (
                                  <View style={styles.tpslRow}>
                                    <Text style={styles.tpslLabelSL}>SL</Text>
                                    <Text style={styles.tpslValueSL}>{formatPrice(tpsl.sl.stopPrice!)}</Text>
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                          <View style={styles.posRight}>
                            <Text style={styles.posEntry}>Entry {formatPrice(pos.entryPrice)}</Text>
                            <Text style={[styles.posPnl, isUp ? styles.textPos : styles.textNeg]}>
                              {isUp ? '+' : ''}{pos.unrealizedPnl.toFixed(2)} ({pos.unrealizedPnlPct.toFixed(1)}%)
                            </Text>
                          </View>
                          <Pressable
                            style={styles.menuDots}
                            onPress={() => setMenuPosition(isMenuOpen ? null : pos)}
                            hitSlop={8}
                          >
                            <MaterialIcons name="more-vert" size={18} color={semantic.text.dim} />
                          </Pressable>
                        </View>

                        {/* Inline action menu */}
                        {isMenuOpen && (
                          <View style={styles.actionMenu}>
                            <Pressable
                              style={styles.actionMenuItem}
                              onPress={() => openTPSLModal(pos)}
                            >
                              <MaterialIcons name="flag" size={14} color={tokens.colors.primary} />
                              <Text style={styles.actionMenuText}>Set TP / SL</Text>
                            </Pressable>
                            <View style={styles.actionMenuDivider} />
                            <Pressable
                              style={styles.actionMenuItem}
                              onPress={() => handleClosePosition(pos)}
                              disabled={actionLoading}
                            >
                              <MaterialIcons name="close" size={14} color={tokens.colors.vermillion} />
                              <Text style={[styles.actionMenuText, { color: tokens.colors.vermillion }]}>
                                {actionLoading ? 'Closing…' : 'Close Position'}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* ── Orders tab ── */}
            {activeTab === 'orders' && (
              <View style={styles.tabContent}>
                {orders.length === 0 ? (
                  <View style={styles.posEmpty}>
                    <MaterialIcons name="receipt-long" size={22} color={semantic.text.faint} />
                    <Text style={styles.posEmptyText}>No open orders</Text>
                  </View>
                ) : (
                  orders.map((order) => {
                    const isTP = order.orderType === 'take_profit_limit';
                    const isSL = order.orderType === 'stop_loss_limit';
                    return (
                      <View key={order.orderId} style={styles.orderCard}>
                        <View style={styles.orderRow}>
                          <View style={styles.orderLeft}>
                            <View style={styles.orderTopRow}>
                              <Text style={styles.posSym}>{order.symbol}</Text>
                              <View style={[styles.orderTypeBadge, isTP ? styles.orderTypeBadgeTP : isSL ? styles.orderTypeBadgeSL : styles.orderTypeBadgeOther]}>
                                <Text style={[styles.orderTypeText, isTP ? styles.textPos : isSL ? styles.textNeg : { color: semantic.text.dim }]}>
                                  {orderTypeLabel(order.orderType)}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.orderDetail}>
                              {order.side === 'bid' ? 'Buy' : 'Sell'} · Trigger {formatPrice(order.stopPrice ?? order.price)}
                            </Text>
                            {order.reduceOnly && (
                              <Text style={styles.orderReduceOnly}>Reduce Only</Text>
                            )}
                          </View>
                          <Pressable
                            style={styles.cancelBtn}
                            onPress={() => handleCancelOrder(order)}
                            disabled={actionLoading}
                            hitSlop={6}
                          >
                            <MaterialIcons name="close" size={14} color={tokens.colors.vermillion} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <DepositModal visible={depositOpen} onClose={() => setDepositOpen(false)} />
      <WithdrawModal visible={withdrawOpen} onClose={() => setWithdrawOpen(false)} />

      {/* TP/SL Modal */}
      <Modal
        visible={tpslPosition !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTpslPosition(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTpslPosition(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              TP / SL — {tpslPosition?.symbol} {tpslPosition?.side.toUpperCase()}
            </Text>
            <Text style={styles.modalSubtitle}>
              Entry {tpslPosition ? formatPrice(tpslPosition.entryPrice) : ''} · Mark {tpslPosition ? formatPrice(tpslPosition.markPrice) : ''}
            </Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>
                Take Profit {tpslPosition?.side === 'long' ? '(above mark)' : '(below mark)'}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={tpPrice}
                onChangeText={setTpPrice}
                placeholder={tpslPosition?.side === 'long' ? `above ${tpslPosition.markPrice.toFixed(2)}` : `below ${tpslPosition?.markPrice.toFixed(2)}`}
                placeholderTextColor={semantic.text.faint}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>
                Stop Loss {tpslPosition?.side === 'long' ? '(below mark)' : '(above mark)'}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={slPrice}
                onChangeText={setSlPrice}
                placeholder={tpslPosition?.side === 'long' ? `below ${tpslPosition.markPrice.toFixed(2)}` : `above ${tpslPosition?.markPrice.toFixed(2)}`}
                placeholderTextColor={semantic.text.faint}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setTpslPosition(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, actionLoading && { opacity: 0.5 }]}
                onPress={handleSetTPSL}
                disabled={actionLoading}
              >
                <Text style={styles.modalConfirmText}>
                  {actionLoading ? 'Setting…' : 'Confirm'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    gap: 8,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnGhost: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 2.5,
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
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerActionText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: tokens.colors.viridian,
  },

  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },

  // Identity
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: semantic.text.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: semantic.background.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityInfo: {
    flex: 1,
    gap: 3,
  },
  handle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.5,
  },
  connectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.viridian,
  },
  connectedText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: tokens.colors.viridian,
    letterSpacing: 0.5,
  },
  accountActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(74,140,111,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.25)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  accountActiveText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    color: tokens.colors.viridian,
    letterSpacing: 0.8,
  },
  noAccountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(199,183,112,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(199,183,112,0.18)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  noAccountText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    color: tokens.colors.primary,
    letterSpacing: 0.8,
  },

  // Wallet actions
  walletActions: {
    flexDirection: 'row',
    gap: 8,
  },
  walletActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    paddingVertical: 10,
  },
  walletActionText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: semantic.text.primary,
  },

  // Empty states
  emptyState: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.lg,
  },
  emptyTitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.5,
  },
  emptyDesc: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
    textAlign: 'center',
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: tokens.colors.viridian,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.sm + 2,
    paddingHorizontal: tokens.spacing.xl,
    marginTop: tokens.spacing.xs,
  },
  primaryBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },

  // Equity card
  equityCard: {
    backgroundColor: semantic.background.lift,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    padding: tokens.spacing.md,
  },
  equityRow: {
    flexDirection: 'row',
  },
  eqItem: {
    flex: 1,
    gap: 3,
  },
  eqItemCenter: {
    alignItems: 'center',
  },
  eqItemRight: {
    alignItems: 'flex-end',
  },
  eqLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
    letterSpacing: 0.8,
  },
  eqVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: semantic.text.primary,
  },
  tabText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 1,
    color: semantic.text.dim,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: semantic.text.primary,
  },
  tabBadge: {
    backgroundColor: semantic.background.surfaceRaised,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tabBadgeActive: {
    backgroundColor: semantic.text.primary,
  },
  tabBadgeText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 2,
    fontWeight: '700',
    color: semantic.text.dim,
  },
  tabBadgeTextActive: {
    color: semantic.background.lift,
  },
  tabContent: {
    gap: tokens.spacing.xs,
  },

  // Positions
  posEmpty: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingVertical: tokens.spacing.lg,
  },
  posEmptyText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.faint,
  },
  posCard: {
    backgroundColor: semantic.background.lift,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    overflow: 'hidden',
  },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.md,
  },
  posLeft: {
    gap: 2,
  },
  posSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  posSide: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 0.8,
  },
  tpslStack: {
    gap: 3,
    marginTop: 4,
  },
  tpslRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tpslLabelTP: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    fontWeight: '700',
    color: tokens.colors.viridian,
    letterSpacing: 0.8,
    width: 18,
  },
  tpslValueTP: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '600',
    color: tokens.colors.viridian,
  },
  tpslLabelSL: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    fontWeight: '700',
    color: tokens.colors.vermillion,
    letterSpacing: 0.8,
    width: 18,
  },
  tpslValueSL: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '600',
    color: tokens.colors.vermillion,
  },
  posRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  posEntry: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
  },
  posPnl: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
  },

  // Three-dot menu
  menuDots: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  actionMenu: {
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    paddingVertical: 2,
    paddingHorizontal: tokens.spacing.md,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  actionMenuText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: semantic.text.primary,
  },
  actionMenuDivider: {
    height: 1,
    backgroundColor: semantic.border.muted,
  },

  // Orders tab
  orderCard: {
    backgroundColor: semantic.background.lift,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.md,
  },
  orderLeft: {
    flex: 1,
    gap: 3,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderTypeBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  orderTypeBadgeTP: {
    backgroundColor: 'rgba(74,140,111,0.12)',
  },
  orderTypeBadgeSL: {
    backgroundColor: 'rgba(217,83,79,0.12)',
  },
  orderTypeBadgeOther: {
    backgroundColor: semantic.background.surfaceRaised,
  },
  orderTypeText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  orderDetail: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
    letterSpacing: 0.5,
  },
  orderReduceOnly: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    color: semantic.text.faint,
    letterSpacing: 0.5,
  },
  cancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(217,83,79,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.2)',
  },

  // TP/SL Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: semantic.background.lift,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  modalTitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
    marginTop: -8,
  },
  modalField: {
    gap: 4,
  },
  modalLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    color: semantic.text.dim,
    letterSpacing: 0.8,
  },
  modalInput: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    color: semantic.text.primary,
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    borderColor: semantic.border.muted,
  },
  modalCancelText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    color: semantic.text.dim,
  },
  modalConfirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: tokens.radius.xs,
    backgroundColor: tokens.colors.viridian,
  },
  modalConfirmText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    color: '#fff',
  },

  textPos: { color: tokens.colors.viridian },
  textNeg: { color: tokens.colors.vermillion },
});
