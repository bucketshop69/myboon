import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
  buildPhoenixDeposit,
  buildPhoenixWithdraw,
  fetchPhoenixCollateralHistory,
  fetchPhoenixOrderHistory,
  fetchPhoenixTraderState,
  fetchPhoenixTradeHistory,
  formatPhoenixPrice,
  type PhoenixCollateralHistoryItem,
  type PhoenixOrderHistoryItem,
  type PhoenixTradeHistoryItem,
  type PhoenixTraderState,
} from '@/features/perps/phoenix.api';
import { sendPhoenixBuiltTransaction, type PhoenixSignAndSendTransactionFn } from '@/features/perps/phoenix.execution';
import { semantic, tokens } from '@/theme';

type Tab = 'positions' | 'orders' | 'history';
type TransferAction = 'deposit' | 'withdraw';
type TransferMessageTone = 'info' | 'success' | 'error';

type PhoenixTraderRecord = Record<string, unknown>;

interface PhoenixPositionRow {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number | null;
  liquidationPrice: number | null;
  unrealizedPnl: number | null;
  notionalUsd: number | null;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  accountLabel: string;
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
  accountLabel: string;
}

interface PhoenixHistoryRow {
  id: string;
  kind: 'trade' | 'order' | 'collateral';
  symbol: string;
  title: string;
  detail: string;
  value: string;
  tone?: 'pos' | 'neg';
  timestamp: number;
}

interface PhoenixAccountSummary {
  portfolioValue: number | null;
  collateralBalance: number | null;
  effectiveCollateral: number | null;
  withdrawable: number | null;
  unrealizedPnl: number;
  initialMargin: number | null;
  maintenanceMargin: number | null;
  accountLeverage: number | null;
  riskLabel: string;
}

export function PhoenixProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wallet = useWallet();

  const [state, setState] = useState<PhoenixTraderState | null>(null);
  const [tradeHistory, setTradeHistory] = useState<PhoenixTradeHistoryItem[]>([]);
  const [orderHistory, setOrderHistory] = useState<PhoenixOrderHistoryItem[]>([]);
  const [collateralHistory, setCollateralHistory] = useState<PhoenixCollateralHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [accountChecked, setAccountChecked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('positions');
  const [transferAction, setTransferAction] = useState<TransferAction | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferMessageTone, setTransferMessageTone] = useState<TransferMessageTone>('info');

  const traders = useMemo(() => normalizeTraders(state), [state]);
  const positions = useMemo(() => normalizePositions(traders), [traders]);
  const orders = useMemo(() => normalizeOrders(traders), [traders]);
  const historyRows = useMemo(
    () => normalizeHistoryRows(tradeHistory, orderHistory, collateralHistory),
    [tradeHistory, orderHistory, collateralHistory],
  );
  const summary = useMemo(() => accountSummary(traders), [traders]);

  const hasPhoenixProfile = accountChecked && (traders.length > 0 || historyRows.length > 0);
  const noPhoenixProfile = accountChecked && !hasPhoenixProfile;
  const walletUnsupported = wallet.connected && typeof wallet.signAndSendTransaction !== 'function';
  const transferAmountValid = useMemo(() => isValidPhoenixTransferAmount(transferAmount), [transferAmount]);
  const transferCanSubmit = Boolean(
    transferAction
      && wallet.address
      && wallet.connection
      && typeof wallet.signAndSendTransaction === 'function'
      && transferAmountValid
      && !transferBusy,
  );

  const loadProfile = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!wallet.address) {
      setState(null);
      setTradeHistory([]);
      setOrderHistory([]);
      setCollateralHistory([]);
      setErrorMessage(null);
      setAccountChecked(false);
      return;
    }

    if (mode === 'initial') {
      setLoading(true);
      setAccountChecked(false);
    } else {
      setRefreshing(true);
    }
    setErrorMessage(null);

    const [stateResult, tradesResult, ordersResult, collateralResult] = await Promise.allSettled([
      fetchPhoenixTraderState(wallet.address),
      fetchPhoenixTradeHistory(wallet.address, { limit: 50 }),
      fetchPhoenixOrderHistory(wallet.address, { limit: 50 }),
      fetchPhoenixCollateralHistory(wallet.address, { limit: 50 }),
    ]);

    if (stateResult.status === 'fulfilled') {
      setState(stateResult.value);
    } else {
      setState(null);
      setErrorMessage(stateResult.reason instanceof Error ? stateResult.reason.message : 'Phoenix account unavailable');
    }

    setTradeHistory(tradesResult.status === 'fulfilled' ? tradesResult.value.data : []);
    setOrderHistory(ordersResult.status === 'fulfilled' ? ordersResult.value.data : []);
    setCollateralHistory(collateralResult.status === 'fulfilled' ? collateralResult.value.data : []);
    setLoading(false);
    setRefreshing(false);
    setAccountChecked(true);
  }, [wallet.address]);

  useEffect(() => {
    if (wallet.connected && wallet.address) {
      void loadProfile('initial');
      return;
    }

    setState(null);
    setTradeHistory([]);
    setOrderHistory([]);
    setCollateralHistory([]);
    setErrorMessage(null);
    setLoading(false);
    setRefreshing(false);
    setAccountChecked(false);
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

  const openTransfer = useCallback((action: TransferAction) => {
    if (walletUnsupported) {
      setTransferMessage('This wallet cannot send Phoenix transactions from the app.');
      setTransferMessageTone('error');
      return;
    }
    setTransferAction(action);
    setTransferAmount('');
    setTransferMessage(null);
    setTransferMessageTone('info');
  }, [walletUnsupported]);

  const closeTransfer = useCallback(() => {
    if (transferBusy) return;
    setTransferAction(null);
    setTransferAmount('');
    setTransferMessage(null);
    setTransferMessageTone('info');
  }, [transferBusy]);

  const handleTransferSubmit = useCallback(async () => {
    const signAndSendTransaction: PhoenixSignAndSendTransactionFn | null = typeof wallet.signAndSendTransaction === 'function'
      ? async (transaction) => {
        const send = wallet.signAndSendTransaction as PhoenixSignAndSendTransactionFn;
        return send(transaction);
      }
      : null;

    if (!transferAction || !wallet.address || !isValidPhoenixTransferAmount(transferAmount)) {
      setTransferMessage('Enter a valid USDC amount.');
      setTransferMessageTone('error');
      return;
    }
    if (!wallet.connection) {
      setTransferMessage('Phoenix transaction send requires a Solana connection.');
      setTransferMessageTone('error');
      return;
    }
    if (!signAndSendTransaction) {
      setTransferMessage('This wallet cannot send Phoenix transactions from the app.');
      setTransferMessageTone('error');
      return;
    }

    setTransferBusy(true);
    setTransferMessage(null);
    setTransferMessageTone('info');
    try {
      const builtTransaction = transferAction === 'deposit'
        ? await buildPhoenixDeposit({ authority: wallet.address, amount: transferAmount.trim() })
        : await buildPhoenixWithdraw({ authority: wallet.address, amount: transferAmount.trim() });

      const signature = await sendPhoenixBuiltTransaction({
        builtTransaction,
        connection: wallet.connection,
        walletAddress: wallet.address,
        signAndSendTransaction,
      });

      setTransferMessage(`${transferAction === 'deposit' ? 'Deposit' : 'Withdraw'} submitted: ${shortKey(signature)}`);
      setTransferMessageTone('success');
      setTransferAmount('');
      await loadProfile('refresh');
    } catch (err) {
      setTransferMessage(err instanceof Error ? err.message : 'Phoenix transfer failed.');
      setTransferMessageTone('error');
    } finally {
      setTransferBusy(false);
    }
  }, [transferAction, transferAmount, wallet.address, wallet.connection, wallet.signAndSendTransaction, loadProfile]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppTopBar
        left={<AppTopBarIconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />}
        center={<AppTopBarTitle align="left">Phoenix Profile</AppTopBarTitle>}
        right={(
          <View style={styles.headerActions}>
            <HeaderAction
              icon="arrow-downward"
              label="Deposit"
              tone="positive"
              disabled={walletUnsupported}
              onPress={() => openTransfer('deposit')}
            />
            <HeaderAction
              icon="arrow-upward"
              label="Withdraw"
              disabled={walletUnsupported}
              onPress={() => openTransfer('withdraw')}
            />
          </View>
        )}
      />

      {!wallet.connected ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="account-balance-wallet" size={28} color={semantic.text.faint} />
          <Text style={styles.emptyTitle}>Connect Wallet</Text>
          <Text style={styles.emptyDesc}>Connect a Solana wallet to view your Phoenix trading account.</Text>
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
                <MaterialIcons name="person" size={18} color={semantic.text.primary} />
              </View>
            </View>
            <View style={styles.identityInfo}>
              <Text style={styles.handle}>{shortKey(wallet.address)}</Text>
              <View style={styles.connectedChip}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>{wallet.source.toUpperCase()} connected</Text>
              </View>
            </View>
            {hasPhoenixProfile ? (
              <View style={styles.accountActiveBadge}>
                <View style={styles.connectedDot} />
                <Text style={styles.accountActiveText}>Phoenix</Text>
              </View>
            ) : noPhoenixProfile ? (
              <View style={styles.noAccountBadge}>
                <MaterialIcons name="info-outline" size={12} color={tokens.colors.primary} />
                <Text style={styles.noAccountText}>No Account</Text>
              </View>
            ) : null}
          </View>

          {walletUnsupported && (
            <View style={styles.noticeCard}>
              <MaterialIcons name="error-outline" size={16} color={tokens.colors.accent} />
              <Text style={styles.noticeText}>Phoenix order execution needs a Solana wallet that can sign and send transactions.</Text>
            </View>
          )}

          {noPhoenixProfile ? (
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
          ) : hasPhoenixProfile ? (
            <>
              <View style={styles.equityCard}>
                <Metric label="Equity" value={formatUsd(summary.portfolioValue)} />
                <Metric label="Margin Used" value={formatUsd(summary.initialMargin)} align="center" />
                <Metric label="Available" value={formatUsd(summary.withdrawable)} align="right" />
                <View style={styles.equityDivider} />
                <Metric
                  label="Unrealized PnL"
                  value={formatSignedUsd(summary.unrealizedPnl)}
                  tone={summary.unrealizedPnl >= 0 ? 'pos' : 'neg'}
                />
                <Metric label="Acct Leverage" value={summary.accountLeverage === null ? '--' : `${summary.accountLeverage.toFixed(2)}x`} align="center" />
                <Metric label="Risk" value={summary.riskLabel} align="right" />
              </View>

              <View style={styles.actionRow}>
                <TransferActionButton
                  icon="arrow-downward"
                  label="Deposit"
                  disabled={walletUnsupported}
                  onPress={() => openTransfer('deposit')}
                />
                <TransferActionButton
                  icon="arrow-upward"
                  label="Withdraw"
                  disabled={walletUnsupported}
                  onPress={() => openTransfer('withdraw')}
                />
              </View>

              <View style={styles.tabBar}>
                <TabButton label="Positions" count={positions.length} active={activeTab === 'positions'} onPress={() => setActiveTab('positions')} />
                <TabButton label="Orders" count={orders.length} active={activeTab === 'orders'} onPress={() => setActiveTab('orders')} />
                <TabButton label="History" count={historyRows.length} active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
              </View>

              {activeTab === 'positions' && (
                <View style={styles.tabContent}>
                  {positions.length === 0 ? (
                    <EmptyRows icon="inbox" text="No open Phoenix positions" />
                  ) : positions.map((position) => (
                    <Pressable
                      key={position.id}
                      style={styles.positionCard}
                      onPress={() => router.push(`/markets/phoenix/${encodeURIComponent(position.symbol)}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${position.symbol} market details`}
                    >
                      <View style={styles.positionLeft}>
                        <Text style={styles.positionSymbol}>{position.symbol}</Text>
                        <Text style={[styles.positionSide, position.side === 'long' ? styles.textPos : styles.textNeg]}>
                          {position.side.toUpperCase()} - {formatBase(position.size)}
                        </Text>
                        <Text style={styles.positionMeta}>{position.accountLabel}</Text>
                        {(position.takeProfitPrice || position.stopLossPrice) && (
                          <Text style={styles.positionMeta}>
                            TP {formatPhoenixPrice(position.takeProfitPrice)} - SL {formatPhoenixPrice(position.stopLossPrice)}
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
                          {sideLabel(order.side)} - {formatBase(order.sizeRemaining ?? 0)} remaining
                        </Text>
                        <Text style={styles.orderFlags}>
                          {[
                            order.accountLabel,
                            order.reduceOnly ? 'Reduce only' : null,
                            order.conditional ? 'Conditional' : null,
                          ].filter(Boolean).join(' - ')}
                        </Text>
                      </View>
                      <Text style={styles.orderPrice}>{formatPhoenixPrice(order.price)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {activeTab === 'history' && (
                <View style={styles.tabContent}>
                  {historyRows.length === 0 ? (
                    <EmptyRows icon="history" text="No Phoenix history yet" />
                  ) : historyRows.map((row) => (
                    <View key={row.id} style={styles.orderCard}>
                      <View style={styles.orderLeft}>
                        <View style={styles.historyTitleRow}>
                          <Text style={styles.positionSymbol}>{row.title}</Text>
                          <View style={styles.historyBadge}>
                            <Text style={styles.historyBadgeText}>{row.kind}</Text>
                          </View>
                        </View>
                        <Text style={styles.orderMeta}>{row.detail}</Text>
                        <Text style={styles.orderFlags}>{formatHistoryTime(row.timestamp)}</Text>
                      </View>
                      <Text style={[styles.orderPrice, row.tone === 'pos' && styles.textPos, row.tone === 'neg' && styles.textNeg]}>
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : null}

          <View style={{ height: 28 }} />
        </ScrollView>
      )}

      <PhoenixTransferModal
        action={transferAction}
        amount={transferAmount}
        busy={transferBusy}
        canSubmit={transferCanSubmit}
        message={transferMessage}
        messageTone={transferMessageTone}
        onAmountChange={setTransferAmount}
        onClose={closeTransfer}
        onSubmit={handleTransferSubmit}
      />
    </View>
  );
}

function HeaderAction({
  icon,
  label,
  tone,
  disabled,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  tone?: 'positive';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.headerActionBtn, disabled && styles.actionDisabled]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} Phoenix collateral`}
    >
      <MaterialIcons name={icon} size={12} color={tone === 'positive' ? tokens.colors.viridian : tokens.colors.primary} />
      <Text style={[styles.headerActionText, tone === 'positive' && { color: tokens.colors.viridian }]}>{label}</Text>
    </Pressable>
  );
}

function TransferActionButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.disabledAction, !disabled && styles.transferActionEnabled, disabled && styles.actionDisabled]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} Phoenix collateral`}
    >
      <MaterialIcons name={icon} size={14} color={semantic.text.faint} />
      <Text style={styles.disabledActionText}>{label}</Text>
      <Text style={styles.disabledActionSub}>{disabled ? 'Unavailable' : 'USDC'}</Text>
    </Pressable>
  );
}

function PhoenixTransferModal({
  action,
  amount,
  busy,
  canSubmit,
  message,
  messageTone,
  onAmountChange,
  onClose,
  onSubmit,
}: {
  action: TransferAction | null;
  amount: string;
  busy: boolean;
  canSubmit: boolean;
  message: string | null;
  messageTone: TransferMessageTone;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const title = action === 'withdraw' ? 'Withdraw Phoenix USDC' : 'Deposit Phoenix USDC';
  return (
    <Modal visible={action !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} disabled={busy}>
              <MaterialIcons name="close" size={18} color={semantic.text.dim} />
            </Pressable>
          </View>
          <Text style={styles.modalDesc}>
            Phoenix uses Solana USDC through Ember collateral instructions.
          </Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={onAmountChange}
            placeholder="0.00"
            placeholderTextColor={semantic.text.faint}
            keyboardType="decimal-pad"
            editable={!busy}
            autoFocus
          />
          {message && (
            <Text
              style={[
                styles.transferMessage,
                messageTone === 'success' && styles.transferMessageSuccess,
                messageTone === 'error' && styles.transferMessageError,
              ]}
            >
              {message}
            </Text>
          )}
          <Pressable
            style={[styles.submitTransferBtn, (!canSubmit || busy) && styles.actionDisabled]}
            disabled={!canSubmit || busy}
            onPress={onSubmit}
          >
            {busy ? (
              <ActivityIndicator size="small" color={semantic.background.screen} />
            ) : (
              <Text style={styles.submitTransferText}>{action === 'withdraw' ? 'Withdraw' : 'Deposit'}</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {count > 0 && (
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

function normalizeTraders(state: PhoenixTraderState | null): PhoenixTraderRecord[] {
  return (state?.traders ?? [])
    .map(asRecord)
    .filter((trader): trader is PhoenixTraderRecord => trader !== null);
}

function isValidPhoenixTransferAmount(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return false;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0;
}

function normalizePositions(traders: PhoenixTraderRecord[]): PhoenixPositionRow[] {
  const rows: PhoenixPositionRow[] = [];

  traders.forEach((trader, traderIndex) => {
    const rawPositions = Array.isArray(trader.positions) ? trader.positions : [];
    rawPositions.forEach((item, positionIndex) => {
      const record = asRecord(item);
      if (!record) return;

      const symbol = asString(record.symbol);
      const size = toNumber(record.positionSize) ?? 0;
      if (!symbol || size === 0) return;

      const accountLabel = traderLabel(trader, traderIndex);
      rows.push({
        id: `${accountLabel}-${symbol}-${positionIndex}`,
        symbol,
        side: size >= 0 ? 'long' : 'short',
        size: Math.abs(size),
        entryPrice: toUsd(record.entryPrice),
        liquidationPrice: toUsd(record.liquidationPrice),
        unrealizedPnl: toUsd(record.unrealizedPnl),
        notionalUsd: toUsd(record.positionValue),
        takeProfitPrice: toUsd(record.takeProfitPrice),
        stopLossPrice: toUsd(record.stopLossPrice),
        accountLabel,
      });
    });
  });

  return rows.sort((a, b) => Math.abs(b.notionalUsd ?? 0) - Math.abs(a.notionalUsd ?? 0));
}

function normalizeOrders(traders: PhoenixTraderRecord[]): PhoenixOrderRow[] {
  const rows: PhoenixOrderRow[] = [];

  traders.forEach((trader, traderIndex) => {
    const limitOrders = asRecord(trader.limitOrders);
    if (!limitOrders) return;

    for (const [symbol, rawOrders] of Object.entries(limitOrders)) {
      if (!Array.isArray(rawOrders)) continue;
      rawOrders.forEach((rawOrder, orderIndex) => {
        const order = asRecord(rawOrder);
        if (!order) return;

        const accountLabel = traderLabel(trader, traderIndex);
        const sequence = asString(order.orderSequenceNumber) ?? String(orderIndex);
        rows.push({
          id: `${accountLabel}-${symbol}-${sequence}`,
          symbol,
          side: asString(order.side) ?? 'bid',
          price: toUsd(order.price),
          sizeRemaining: toNumber(order.tradeSizeRemaining),
          initialSize: toNumber(order.initialTradeSize),
          reduceOnly: order.isReduceOnly === true,
          conditional: order.isConditionalOrder === true,
          accountLabel,
        });
      });
    }
  });

  return rows;
}

function normalizeHistoryRows(
  trades: PhoenixTradeHistoryItem[],
  orders: PhoenixOrderHistoryItem[],
  collateral: PhoenixCollateralHistoryItem[],
): PhoenixHistoryRow[] {
  const tradeRows = trades.map((item, index): PhoenixHistoryRow | null => {
    const record = asRecord(item);
    if (!record) return null;

    const symbol = asString(record.marketSymbol) ?? 'Phoenix';
    const delta = toNumber(record.baseLotsDelta);
    const pnl = toUsd(record.realizedPnl);
    const fees = toUsd(record.fees);
    const timestamp = timestampMs(record.timestamp);

    return {
      id: `trade-${asString(record.fillId) ?? asString(record.signature) ?? `${timestamp}-${index}`}`,
      kind: 'trade',
      symbol,
      title: symbol,
      detail: [
        delta === null ? null : `${delta >= 0 ? 'Buy' : 'Sell'} ${formatBase(Math.abs(delta))}`,
        `Price ${formatPhoenixPrice(toUsd(record.price))}`,
        fees === null ? null : `Fee ${formatUsd(fees)}`,
      ].filter(Boolean).join(' - '),
      value: formatSignedUsd(pnl),
      tone: pnl === null ? undefined : pnl >= 0 ? 'pos' : 'neg',
      timestamp,
    };
  }).filter((row): row is PhoenixHistoryRow => row !== null);

  const orderRows = orders.map((item, index): PhoenixHistoryRow | null => {
    const record = asRecord(item);
    if (!record) return null;

    const symbol = asString(record.marketSymbol) ?? 'Phoenix';
    const status = statusText(record.status);
    const timestamp = timestampMs(record.completedAt ?? record.placedAt);

    return {
      id: `order-${asString(record.orderSequenceNumber) ?? `${timestamp}-${index}`}`,
      kind: 'order',
      symbol,
      title: `${symbol} ${status}`,
      detail: [
        sideLabel(asString(record.side)),
        `${formatBase(toNumber(record.filledBaseQty) ?? 0)} / ${formatBase(toNumber(record.baseQty) ?? 0)}`,
        `Price ${formatPhoenixPrice(toUsd(record.price))}`,
      ].filter(Boolean).join(' - '),
      value: status,
      timestamp,
    };
  }).filter((row): row is PhoenixHistoryRow => row !== null);

  const collateralRows = collateral.map((item, index): PhoenixHistoryRow | null => {
    const record = asRecord(item);
    if (!record) return null;

    const eventType = asString(record.eventType) ?? 'collateral';
    const amount = quoteLotsToUsd(record.amount);
    const timestamp = timestampMs(record.timestamp);
    const isDeposit = eventType.toLowerCase().includes('deposit');

    return {
      id: `collateral-${asString(record.slot) ?? timestamp}-${asString(record.eventIndex) ?? index}`,
      kind: 'collateral',
      symbol: 'USDC',
      title: statusText(eventType),
      detail: `Collateral after ${formatUsd(quoteLotsToUsd(record.collateralAfter))}`,
      value: formatSignedUsd(isDeposit ? amount : amount === null ? null : -Math.abs(amount)),
      tone: isDeposit ? 'pos' : 'neg',
      timestamp,
    };
  }).filter((row): row is PhoenixHistoryRow => row !== null);

  return [...tradeRows, ...orderRows, ...collateralRows]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 80);
}

function accountSummary(traders: PhoenixTraderRecord[]): PhoenixAccountSummary {
  const portfolioValue = sumUsd(traders, 'portfolioValue');
  const effectiveCollateral = sumUsd(traders, 'effectiveCollateral');
  const initialMargin = sumUsd(traders, 'initialMargin');

  return {
    portfolioValue,
    collateralBalance: sumUsd(traders, 'collateralBalance'),
    effectiveCollateral,
    withdrawable: sumUsd(traders, 'effectiveCollateralForWithdrawals'),
    unrealizedPnl: sumUsd(traders, 'unrealizedPnl') ?? 0,
    initialMargin,
    maintenanceMargin: sumUsd(traders, 'maintenanceMargin'),
    accountLeverage: effectiveCollateral && effectiveCollateral > 0 && initialMargin !== null
      ? initialMargin / effectiveCollateral
      : null,
    riskLabel: worstRiskLabel(traders),
  };
}

function sumUsd(records: PhoenixTraderRecord[], key: string): number | null {
  const values = records
    .map((record) => toUsd(record[key]))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function worstRiskLabel(traders: PhoenixTraderRecord[]): string {
  const order = ['Safe', 'At Risk', 'Cancellable', 'Liquidatable', 'Backstop Liquidatable', 'High Risk'];
  let worst = 'Safe';
  for (const trader of traders) {
    const label = statusText(trader.riskTier ?? trader.riskState);
    if (!label || label === '--') continue;
    if (order.indexOf(label) > order.indexOf(worst)) worst = label;
  }
  return traders.length > 0 ? worst : '--';
}

function traderLabel(trader: PhoenixTraderRecord, fallbackIndex: number): string {
  const pda = toNumber(trader.traderPdaIndex) ?? fallbackIndex;
  const subaccount = toNumber(trader.traderSubaccountIndex) ?? 0;
  return subaccount === 0 ? `Cross ${pda}` : `Iso ${pda}.${subaccount}`;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' ? input as Record<string, unknown> : null;
}

function asString(input: unknown): string | null {
  if (typeof input === 'number' && Number.isFinite(input)) return String(input);
  return typeof input === 'string' && input.trim().length > 0 ? input : null;
}

function toNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const record = asRecord(input);
  if (record) {
    const ui = toNumber(record.ui);
    if (ui !== null) return ui;

    const rawValue = toNumber(record.value);
    const decimals = toNumber(record.decimals);
    if (rawValue !== null && decimals !== null) {
      const scaled = rawValue / (10 ** decimals);
      return Number.isFinite(scaled) ? scaled : null;
    }
  }
  if (typeof input !== 'string' || input.trim() === '') return null;
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function toUsd(input: unknown): number | null {
  const value = toNumber(input);
  if (value === null) return null;
  if (
    ((typeof input === 'string' && !input.includes('.')) || typeof input === 'number')
    && Math.abs(value) >= 1_000_000
  ) {
    return value / 1_000_000;
  }
  return value;
}

function quoteLotsToUsd(input: unknown): number | null {
  const value = toNumber(input);
  if (value === null) return null;
  return asRecord(input) ? value : value / 1_000_000;
}

function timestampMs(input: unknown): number {
  const text = asString(input);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
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
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function statusText(value: unknown): string {
  const text = asString(value);
  if (!text) return '--';
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function sideLabel(value: unknown): string {
  const text = asString(value)?.toLowerCase();
  if (!text) return '--';
  if (text === 'bid' || text === 'buy') return 'Buy';
  if (text === 'ask' || text === 'sell') return 'Sell';
  return statusText(text);
}

function formatHistoryTime(value: number): string {
  if (!value) return '--';
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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
  actionDisabled: {
    opacity: 0.42,
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
  accountActiveBadge: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.44)',
    paddingHorizontal: tokens.spacing.sm,
    backgroundColor: 'rgba(0,212,170,0.10)',
  },
  accountActiveText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '800',
    color: tokens.colors.viridian,
    textTransform: 'uppercase',
  },
  noAccountBadge: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245,250,252,0.12)',
    paddingHorizontal: tokens.spacing.sm,
    backgroundColor: semantic.background.surface,
  },
  noAccountText: {
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
  transferActionEnabled: {
    opacity: 1,
    borderColor: 'rgba(0,212,170,0.18)',
    backgroundColor: 'rgba(6,51,67,0.76)',
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
    textAlign: 'right',
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  historyBadge: {
    borderRadius: 4,
    backgroundColor: semantic.background.screen,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  historyBadgeText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '900',
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.54)',
    padding: tokens.spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
    padding: tokens.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  modalTitle: {
    flex: 1,
    fontSize: tokens.fontSize.md,
    fontWeight: '900',
    color: semantic.text.primary,
  },
  modalDesc: {
    marginTop: tokens.spacing.sm,
    fontSize: tokens.fontSize.sm,
    lineHeight: 18,
    color: semantic.text.dim,
  },
  amountInput: {
    marginTop: tokens.spacing.md,
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.screen,
    paddingHorizontal: tokens.spacing.md,
    fontFamily: 'monospace',
    fontSize: 24,
    fontWeight: '900',
    color: semantic.text.primary,
  },
  transferMessage: {
    marginTop: tokens.spacing.sm,
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
  },
  transferMessageSuccess: {
    color: tokens.colors.viridian,
  },
  transferMessageError: {
    color: tokens.colors.vermillion,
  },
  submitTransferBtn: {
    marginTop: tokens.spacing.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: tokens.colors.accent,
  },
  submitTransferText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '900',
    color: semantic.background.screen,
    textTransform: 'uppercase',
  },
  textPos: {
    color: tokens.colors.viridian,
  },
  textNeg: {
    color: tokens.colors.vermillion,
  },
});
