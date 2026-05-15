import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
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
import { AppTopBar, AppTopBarIconButton, AppTopBarTitle } from '@/components/AppTopBar';
import { useWallet } from '@/hooks/useWallet';
import {
  activatePhoenixInvite,
  fetchPhoenixTraderState,
  formatPhoenixPrice,
  type PhoenixTraderState,
} from '@/features/perps/phoenix.api';
import { semantic, tokens } from '@/theme';

type Tab = 'positions' | 'orders' | 'collateral';

type PhoenixTraderRecord = Record<string, unknown>;

interface PhoenixPositionRow {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number | null;
  liquidationPrice: number | null;
  unrealizedPnl: number | null;
  notionalUsd: number | null;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
}

interface PhoenixOrderRow {
  id: string;
  symbol: string;
  side: 'bid' | 'ask' | string;
  price: number | null;
  sizeRemaining: number | null;
  initialSize: number | null;
  reduceOnly: boolean;
  conditional: boolean;
}

export function PhoenixProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wallet = useWallet();

  const [state, setState] = useState<PhoenixTraderState | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('positions');

  const trader = useMemo(() => primaryTrader(state), [state]);
  const positions = useMemo(() => normalizePositions(trader), [trader]);
  const orders = useMemo(() => normalizeOrders(trader), [trader]);
  const summary = useMemo(() => accountSummary(trader), [trader]);
  const walletUnsupported = wallet.connected && typeof wallet.signAndSendTransaction !== 'function';

  const loadProfile = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!wallet.address) {
      setState(null);
      setErrorMessage(null);
      return;
    }

    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setErrorMessage(null);

    try {
      setState(await fetchPhoenixTraderState(wallet.address));
    } catch (err) {
      setState(null);
      setErrorMessage(err instanceof Error ? err.message : 'Phoenix account unavailable');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    if (wallet.connected && wallet.address) {
      void loadProfile('initial');
      return;
    }

    setState(null);
    setErrorMessage(null);
    setLoading(false);
  }, [wallet.connected, wallet.address, loadProfile]);

  const onRefresh = useCallback(() => {
    void loadProfile('refresh');
  }, [loadProfile]);

  const handleActivate = useCallback(async () => {
    if (!wallet.address || !accessCode.trim()) return;

    setActivationBusy(true);
    setActivationMessage(null);
    try {
      await activatePhoenixInvite({ authority: wallet.address, code: accessCode.trim() });
      setActivationMessage('Phoenix account activated.');
      setAccessCode('');
      await loadProfile('refresh');
    } catch (err) {
      setActivationMessage(err instanceof Error ? err.message : 'Phoenix activation failed.');
    } finally {
      setActivationBusy(false);
    }
  }, [wallet.address, accessCode, loadProfile]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppTopBar
        left={<AppTopBarIconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />}
        center={<AppTopBarTitle align="left">Phoenix Profile</AppTopBarTitle>}
        right={(
          <View style={styles.headerActions}>
            <DisabledHeaderAction icon="arrow-downward" label="Deposit" tone="positive" />
            <DisabledHeaderAction icon="arrow-upward" label="Withdraw" />
          </View>
        )}
      />

      {!wallet.connected ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="account-balance-wallet" size={28} color={semantic.text.faint} />
          <Text style={styles.emptyTitle}>Connect Wallet</Text>
          <Text style={styles.emptyDesc}>Connect a Solana wallet to view your Phoenix account.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => wallet.connect()}>
            <Text style={styles.primaryBtnText}>Connect Wallet</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={semantic.text.accent} />
          <Text style={styles.emptyDesc}>Loading Phoenix account...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.text.accent} />}
        >
          <View style={styles.identity}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <MaterialIcons name="bolt" size={18} color={semantic.text.primary} />
              </View>
            </View>
            <View style={styles.identityInfo}>
              <Text style={styles.handle}>{shortKey(wallet.address)}</Text>
              <View style={styles.connectedChip}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>{wallet.source.toUpperCase()} connected</Text>
              </View>
            </View>
            <View style={styles.accountBadge}>
              <Text style={styles.accountBadgeText}>{trader ? statusText(trader.state) : 'No Account'}</Text>
            </View>
          </View>

          <View style={styles.noticeCard}>
            <MaterialIcons name={walletUnsupported ? 'error-outline' : 'info-outline'} size={16} color={tokens.colors.accent} />
            <Text style={styles.noticeText}>
              {walletUnsupported
                ? 'Phoenix orders need a wallet that can sign and send Solana transactions.'
                : 'Phoenix collateral deposit and withdraw are disabled until a documented builder is available.'}
            </Text>
          </View>

          {!trader ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="vpn-key" size={26} color={semantic.text.faint} />
              <Text style={styles.emptyTitle}>Phoenix Account Needed</Text>
              <Text style={styles.emptyDesc}>{errorMessage ?? 'Activate with an invite code or open Phoenix after your account exists.'}</Text>
              <View style={styles.accessRow}>
                <TextInput
                  style={styles.accessInput}
                  value={accessCode}
                  onChangeText={setAccessCode}
                  placeholder="Invite code"
                  placeholderTextColor={semantic.text.faint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.activateBtn, (!accessCode.trim() || activationBusy) && styles.disabledBtn]}
                  disabled={!accessCode.trim() || activationBusy}
                  onPress={handleActivate}
                >
                  {activationBusy ? (
                    <ActivityIndicator size="small" color={semantic.background.screen} />
                  ) : (
                    <Text style={styles.activateText}>Activate</Text>
                  )}
                </Pressable>
              </View>
              {activationMessage && <Text style={styles.inlineMessage}>{activationMessage}</Text>}
            </View>
          ) : (
            <>
              <View style={styles.equityCard}>
                <Metric label="Portfolio" value={formatUsd(summary.portfolioValue)} />
                <Metric label="Collateral" value={formatUsd(summary.collateralBalance)} align="center" />
                <Metric label="Available" value={formatUsd(summary.withdrawable)} align="right" />
                <View style={styles.equityDivider} />
                <Metric label="Unrealized PnL" value={formatSignedUsd(summary.unrealizedPnl)} tone={summary.unrealizedPnl >= 0 ? 'pos' : 'neg'} />
                <Metric label="Initial Margin" value={formatUsd(summary.initialMargin)} align="center" />
                <Metric label="Risk" value={statusText(trader.riskTier)} align="right" />
              </View>

              <View style={styles.actionRow}>
                <DisabledAction icon="arrow-downward" label="Deposit" />
                <DisabledAction icon="arrow-upward" label="Withdraw" />
              </View>

              <View style={styles.tabBar}>
                <TabButton label="Positions" count={positions.length} active={activeTab === 'positions'} onPress={() => setActiveTab('positions')} />
                <TabButton label="Orders" count={orders.length} active={activeTab === 'orders'} onPress={() => setActiveTab('orders')} />
                <TabButton label="Collateral" active={activeTab === 'collateral'} onPress={() => setActiveTab('collateral')} />
              </View>

              {activeTab === 'positions' && (
                <View style={styles.tabContent}>
                  {positions.length === 0 ? (
                    <EmptyRows icon="inbox" text="No open Phoenix positions" />
                  ) : positions.map((position) => (
                    <Pressable
                      key={position.symbol}
                      style={styles.positionCard}
                      onPress={() => router.push(`/markets/phoenix/${encodeURIComponent(position.symbol)}`)}
                    >
                      <View style={styles.positionLeft}>
                        <Text style={styles.positionSymbol}>{position.symbol}</Text>
                        <Text style={[styles.positionSide, position.side === 'long' ? styles.textPos : styles.textNeg]}>
                          {position.side.toUpperCase()} · {formatBase(position.size)}
                        </Text>
                        {(position.takeProfitPrice || position.stopLossPrice) && (
                          <Text style={styles.positionMeta}>
                            TP {formatPhoenixPrice(position.takeProfitPrice)} · SL {formatPhoenixPrice(position.stopLossPrice)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.positionRight}>
                        <Text style={styles.positionMeta}>Entry {formatPhoenixPrice(position.entryPrice)}</Text>
                        <Text style={[styles.positionPnl, (position.unrealizedPnl ?? 0) >= 0 ? styles.textPos : styles.textNeg]}>
                          {formatSignedUsd(position.unrealizedPnl)}
                        </Text>
                        <Text style={styles.positionMeta}>Liq {formatPhoenixPrice(position.liquidationPrice)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}

              {activeTab === 'orders' && (
                <View style={styles.tabContent}>
                  {orders.length === 0 ? (
                    <EmptyRows icon="receipt-long" text="No open Phoenix orders" />
                  ) : orders.map((order) => (
                    <View key={order.id} style={styles.orderCard}>
                      <View style={styles.orderLeft}>
                        <Text style={styles.positionSymbol}>{order.symbol}</Text>
                        <Text style={styles.orderMeta}>
                          {order.side.toUpperCase()} · {formatBase(order.sizeRemaining ?? 0)} remaining
                        </Text>
                        {(order.reduceOnly || order.conditional) && (
                          <Text style={styles.orderFlags}>
                            {order.reduceOnly ? 'Reduce only' : ''}{order.reduceOnly && order.conditional ? ' · ' : ''}{order.conditional ? 'Conditional' : ''}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.orderPrice}>{formatPhoenixPrice(order.price)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {activeTab === 'collateral' && (
                <View style={styles.tabContent}>
                  <InfoRow label="Effective collateral" value={formatUsd(summary.effectiveCollateral)} />
                  <InfoRow label="Withdrawal collateral" value={formatUsd(summary.withdrawable)} />
                  <InfoRow label="Maintenance margin" value={formatUsd(summary.maintenanceMargin)} />
                  <InfoRow label="Risk state" value={statusText(trader.riskState)} />
                  <InfoRow label="Trader key" value={shortKey(asString(trader.traderKey))} />
                </View>
              )}
            </>
          )}

          <View style={{ height: 28 }} />
        </ScrollView>
      )}
    </View>
  );
}

function DisabledHeaderAction({ icon, label, tone }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; tone?: 'positive' }) {
  return (
    <View style={styles.headerActionBtn}>
      <MaterialIcons name={icon} size={12} color={tone === 'positive' ? tokens.colors.viridian : tokens.colors.primary} />
      <Text style={[styles.headerActionText, tone === 'positive' && { color: tokens.colors.viridian }]}>{label}</Text>
    </View>
  );
}

function DisabledAction({ icon, label }: { icon: keyof typeof MaterialIcons.glyphMap; label: string }) {
  return (
    <View style={styles.disabledAction}>
      <MaterialIcons name={icon} size={14} color={semantic.text.faint} />
      <Text style={styles.disabledActionText}>{label}</Text>
      <Text style={styles.disabledActionSub}>Not wired</Text>
    </View>
  );
}

function Metric({
  label,
  value,
  align = 'left',
  tone,
}: {
  label: string;
  value: string;
  align?: 'left' | 'center' | 'right';
  tone?: 'pos' | 'neg';
}) {
  return (
    <View style={[styles.metric, align === 'center' && styles.metricCenter, align === 'right' && styles.metricRight]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'pos' && styles.textPos, tone === 'neg' && styles.textNeg]}>{value}</Text>
    </View>
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {typeof count === 'number' && count > 0 && (
        <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

function EmptyRows({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  return (
    <View style={styles.rowsEmpty}>
      <MaterialIcons name={icon} size={22} color={semantic.text.faint} />
      <Text style={styles.rowsEmptyText}>{text}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function primaryTrader(state: PhoenixTraderState | null): PhoenixTraderRecord | null {
  const first = state?.traders?.[0];
  return first && typeof first === 'object' ? first as PhoenixTraderRecord : null;
}

function normalizePositions(trader: PhoenixTraderRecord | null): PhoenixPositionRow[] {
  const rawPositions = Array.isArray(trader?.positions) ? trader.positions : [];
  return rawPositions
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const symbol = asString(record.symbol);
      const size = toNumber(record.positionSize) ?? 0;
      if (!symbol || size === 0) return null;

      return {
        symbol,
        side: size >= 0 ? 'long' : 'short',
        size: Math.abs(size),
        entryPrice: toUsd(record.entryPrice),
        liquidationPrice: toUsd(record.liquidationPrice),
        unrealizedPnl: toUsd(record.unrealizedPnl),
        notionalUsd: toUsd(record.positionValue),
        takeProfitPrice: toUsd(record.takeProfitPrice),
        stopLossPrice: toUsd(record.stopLossPrice),
      };
    })
    .filter((item): item is PhoenixPositionRow => item !== null);
}

function normalizeOrders(trader: PhoenixTraderRecord | null): PhoenixOrderRow[] {
  const limitOrders = asRecord(trader?.limitOrders);
  if (!limitOrders) return [];

  const rows: PhoenixOrderRow[] = [];
  for (const [symbol, rawOrders] of Object.entries(limitOrders)) {
    if (!Array.isArray(rawOrders)) continue;
    rawOrders.forEach((rawOrder, index) => {
      const order = asRecord(rawOrder);
      if (!order) return;
      const id = asString(order.orderSequenceNumber) ?? `${symbol}-${index}`;
      rows.push({
        id: `${symbol}-${id}`,
        symbol,
        side: asString(order.side) ?? 'bid',
        price: toUsd(order.price),
        sizeRemaining: toNumber(order.tradeSizeRemaining),
        initialSize: toNumber(order.initialTradeSize),
        reduceOnly: order.isReduceOnly === true,
        conditional: order.isConditionalOrder === true,
      });
    });
  }

  return rows;
}

function accountSummary(trader: PhoenixTraderRecord | null) {
  return {
    portfolioValue: toUsd(trader?.portfolioValue),
    collateralBalance: toUsd(trader?.collateralBalance),
    effectiveCollateral: toUsd(trader?.effectiveCollateral),
    withdrawable: toUsd(trader?.effectiveCollateralForWithdrawals),
    unrealizedPnl: toUsd(trader?.unrealizedPnl) ?? 0,
    initialMargin: toUsd(trader?.initialMargin),
    maintenanceMargin: toUsd(trader?.maintenanceMargin),
  };
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' ? input as Record<string, unknown> : null;
}

function asString(input: unknown): string | null {
  return typeof input === 'string' && input.trim().length > 0 ? input : null;
}

function toNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string' || input.trim() === '') return null;
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function toUsd(input: unknown): number | null {
  const value = toNumber(input);
  if (value === null) return null;
  if (typeof input === 'string' && !input.includes('.') && Math.abs(value) >= 1_000_000) {
    return value / 1_000_000;
  }
  return value;
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${value.toFixed(2)}`;
}

function formatSignedUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatUsd(value)}`;
}

function formatBase(value: number): string {
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return value.toFixed(4).replace(/\.?0+$/, '');
}

function shortKey(value: string | null): string {
  if (!value) return '--';
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}···${value.slice(-4)}`;
}

function statusText(value: unknown): string {
  const text = asString(value);
  if (!text) return '--';
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s-]+/)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },
  scroll: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  headerActionBtn: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
    backgroundColor: semantic.background.surface,
    opacity: 0.58,
  },
  headerActionText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '800',
    color: tokens.colors.primary,
    textTransform: 'uppercase',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xl,
  },
  emptyCard: {
    margin: tokens.spacing.lg,
    padding: tokens.spacing.lg,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
  },
  emptyTitle: {
    fontSize: tokens.fontSize.md,
    fontWeight: '800',
    color: semantic.text.primary,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: tokens.fontSize.sm,
    lineHeight: 18,
    color: semantic.text.dim,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: tokens.spacing.xs,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: tokens.spacing.lg,
  },
  primaryBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '900',
    color: semantic.background.screen,
    textTransform: 'uppercase',
  },
  identity: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  avatarRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245,250,252,0.12)',
    backgroundColor: 'rgba(6,51,67,0.82)',
  },
  avatarInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.background.surfaceRaised,
  },
  identityInfo: {
    flex: 1,
  },
  handle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  connectedChip: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  accountBadge: {
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245,250,252,0.12)',
    paddingHorizontal: tokens.spacing.sm,
    backgroundColor: semantic.background.surface,
  },
  accountBadgeText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '800',
    color: semantic.text.dim,
    textTransform: 'uppercase',
  },
  noticeCard: {
    marginHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.18)',
    backgroundColor: 'rgba(255,209,102,0.08)',
  },
  noticeText: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    lineHeight: 17,
    color: semantic.text.dim,
  },
  accessRow: {
    width: '100%',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.md,
  },
  accessInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.screen,
    paddingHorizontal: tokens.spacing.md,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    color: semantic.text.primary,
  },
  activateBtn: {
    minWidth: 88,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: tokens.spacing.md,
  },
  activateText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '900',
    color: semantic.background.screen,
    textTransform: 'uppercase',
  },
  disabledBtn: {
    opacity: 0.45,
  },
  inlineMessage: {
    marginTop: tokens.spacing.sm,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
    textAlign: 'center',
  },
  equityCard: {
    marginHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: tokens.spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: 'rgba(6,51,67,0.72)',
  },
  metric: {
    width: '33.33%',
  },
  metricCenter: {
    alignItems: 'center',
  },
  metricRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  metricValue: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  equityDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(24,90,112,0.54)',
    marginVertical: tokens.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.md,
  },
  disabledAction: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,250,252,0.10)',
    backgroundColor: semantic.background.surface,
    opacity: 0.62,
  },
  disabledActionText: {
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '800',
    color: semantic.text.dim,
    textTransform: 'uppercase',
  },
  disabledActionSub: {
    marginTop: 2,
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.sm,
    padding: 3,
    borderRadius: 8,
    backgroundColor: semantic.background.surface,
  },
  tab: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: semantic.background.surfaceRaised,
  },
  tabText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '800',
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: semantic.text.primary,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: semantic.background.screen,
  },
  tabBadgeActive: {
    backgroundColor: tokens.colors.accent,
  },
  tabBadgeText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '900',
    color: semantic.text.faint,
  },
  tabBadgeTextActive: {
    color: semantic.background.screen,
  },
  tabContent: {
    marginHorizontal: tokens.spacing.lg,
  },
  rowsEmpty: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
  },
  rowsEmptyText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.faint,
  },
  positionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
  },
  positionLeft: {
    flex: 1,
    minWidth: 0,
  },
  positionRight: {
    alignItems: 'flex-end',
  },
  positionSymbol: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '900',
    color: semantic.text.primary,
  },
  positionSide: {
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '800',
  },
  positionMeta: {
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
  },
  positionPnl: {
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '900',
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
  },
  orderLeft: {
    flex: 1,
    minWidth: 0,
  },
  orderMeta: {
    marginTop: 5,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
  },
  orderFlags: {
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  orderPrice: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '900',
    color: semantic.text.primary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(24,90,112,0.54)',
  },
  infoLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.faint,
  },
  infoValue: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '800',
    color: semantic.text.primary,
    textAlign: 'right',
  },
  textPos: {
    color: tokens.colors.viridian,
  },
  textNeg: {
    color: tokens.colors.vermillion,
  },
});
