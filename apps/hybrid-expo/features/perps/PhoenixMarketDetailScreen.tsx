import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTopBar } from '@/components/AppTopBar';
import { useWallet } from '@/hooks/useWallet';
import { formatUsdCompact } from '@/lib/format';
import {
  fetchPhoenixMarket,
  activatePhoenixInvite,
  formatPhoenixPercent,
  formatPhoenixPrice,
  formatPhoenixRate,
  type PhoenixMarket,
} from '@/features/perps/phoenix.api';
import {
  getPhoenixExecutionReadiness,
  placePhoenixOrder,
  type PhoenixExecutionContext,
} from '@/features/perps/phoenix.execution';
import { PhoenixPriceChart } from '@/features/perps/PhoenixPriceChart';
import { semantic, tokens } from '@/theme';

type Side = 'long' | 'short';
type OrderType = 'market' | 'limit';
type AmountMode = 'usd' | 'base';

interface PhoenixMarketDetailScreenProps {
  symbol: string;
}

export function PhoenixMarketDetailScreen({ symbol }: PhoenixMarketDetailScreenProps) {
  const router = useRouter();
  const wallet = useWallet();
  const insets = useSafeAreaInsets();

  const [market, setMarket] = useState<PhoenixMarket | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [side, setSide] = useState<Side>('long');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [amountMode, setAmountMode] = useState<AmountMode>('usd');
  const [amountText, setAmountText] = useState('');
  const [limitPriceText, setLimitPriceText] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [ticketMessage, setTicketMessage] = useState<string | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);

  const phoenixSignAndSendTransaction = useMemo<NonNullable<PhoenixExecutionContext['signAndSendTransaction']> | null>(() => {
    if (typeof wallet.signAndSendTransaction !== 'function') return null;

    return async (transaction) => {
      const result = await (wallet.signAndSendTransaction as (
        tx: unknown,
        minContextSlot?: number,
      ) => Promise<unknown>)(transaction, 0);

      if (typeof result === 'string') return result;
      if (result !== null && typeof result === 'object') {
        const signature = (result as { signature?: unknown }).signature;
        if (typeof signature === 'string') return signature;
      }
      throw new Error('Phoenix wallet did not return a transaction signature');
    };
  }, [wallet.signAndSendTransaction]);

  const readiness = useMemo(() => getPhoenixExecutionReadiness({
    connected: wallet.connected,
    address: wallet.address,
    source: wallet.source,
    isPreparing: wallet.isPreparing,
    signAndSendTransaction: phoenixSignAndSendTransaction,
  }), [
    wallet.connected,
    wallet.address,
    wallet.source,
    wallet.isPreparing,
    phoenixSignAndSendTransaction,
  ]);

  const displayedPrice = scrubPrice ?? latestPrice ?? market?.markPrice ?? null;
  const change24h = market?.change24h ?? null;
  const isUp = (change24h ?? 0) >= 0;

  const loadMarket = useCallback(async () => {
    setLoadingMarket(true);
    setMarketError(null);
    try {
      setMarket(await fetchPhoenixMarket(symbol));
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : 'Phoenix market unavailable');
    } finally {
      setLoadingMarket(false);
    }
  }, [symbol]);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  const amountValue = useMemo(() => {
    const value = Number.parseFloat(amountText);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [amountText]);

  const amountUsdc = useMemo(() => {
    if (amountMode === 'usd') return amountValue;
    return displayedPrice && displayedPrice > 0 ? amountValue * displayedPrice : 0;
  }, [amountMode, amountValue, displayedPrice]);

  const amountBase = useMemo(() => {
    if (amountMode === 'base') return amountValue;
    return displayedPrice && displayedPrice > 0 ? amountValue / displayedPrice : 0;
  }, [amountMode, amountValue, displayedPrice]);

  const estimatedFee = amountUsdc > 0 ? amountUsdc * (market?.fees.takerFee ?? 0) : 0;

  const handleScrub = useCallback((price: number | null, _time: number | null) => {
    setScrubPrice(price);
  }, []);

  const handleLatestPrice = useCallback((price: number | null) => {
    setLatestPrice(price);
  }, []);

  const handleActivate = useCallback(async () => {
    if (!wallet.address || !accessCode.trim()) return;
    setTicketBusy(true);
    setTicketMessage(null);
    try {
      await activatePhoenixInvite({
        authority: wallet.address,
        code: accessCode.trim(),
      });
      setTicketMessage('Phoenix invite activation submitted.');
    } catch (err) {
      setTicketMessage(err instanceof Error ? err.message : 'Phoenix invite activation failed.');
    } finally {
      setTicketBusy(false);
    }
  }, [wallet.address, accessCode]);

  const handleSubmit = useCallback(async () => {
    if (!wallet.address || !market || amountUsdc <= 0 || amountBase <= 0) return;
    setTicketBusy(true);
    setTicketMessage(null);
    try {
      const context: PhoenixExecutionContext = {
        wallet: readiness.wallet,
        connection: wallet.connection as PhoenixExecutionContext['connection'],
        signAndSendTransaction: phoenixSignAndSendTransaction,
      };

      const result = await placePhoenixOrder({
        venueId: 'phoenix',
        authority: wallet.address,
        symbol: market.venueSymbol,
        side,
        orderType,
        amountMode: 'base',
        amount: formatBaseQuantity(amountBase),
        limitPrice: orderType === 'limit' ? limitPriceText : undefined,
        slippageBps: 50,
      }, context);

      setTicketMessage(result.error?.message ?? (result.txSignature ? `Submitted: ${shortKey(result.txSignature)}` : 'Phoenix order submitted.'));
    } catch (err) {
      setTicketMessage(err instanceof Error ? err.message : 'Phoenix order failed.');
    } finally {
      setTicketBusy(false);
    }
  }, [
    wallet.address,
    wallet.connection,
    market,
    amountUsdc,
    amountBase,
    side,
    orderType,
    limitPriceText,
    readiness.wallet,
    phoenixSignAndSendTransaction,
  ]);

  const primaryButton = useMemo(() => {
    if (!wallet.connected) {
      return {
        label: 'Connect Wallet',
        disabled: false,
        onPress: () => wallet.connect(),
      };
    }
    if (!readiness.wallet.canSignAndSendTransaction) {
      return {
        label: 'Solana TX Wallet Required',
        disabled: true,
        onPress: undefined,
      };
    }
    if (!market?.tradeable) {
      return {
        label: 'Market Not Active',
        disabled: true,
        onPress: undefined,
      };
    }
    if (amountUsdc <= 0) {
      return {
        label: 'Enter Amount',
        disabled: true,
        onPress: undefined,
      };
    }
    if (amountBase <= 0) {
      return {
        label: 'Price Required',
        disabled: true,
        onPress: undefined,
      };
    }
    if (orderType === 'limit' && !limitPriceText.trim()) {
      return {
        label: 'Enter Limit Price',
        disabled: true,
        onPress: undefined,
      };
    }
    return {
      label: 'Submit Phoenix Order',
      disabled: false,
      onPress: handleSubmit,
    };
  }, [
    wallet,
    readiness.wallet.canSignAndSendTransaction,
    market?.tradeable,
    amountUsdc,
    amountBase,
    orderType,
    limitPriceText,
    handleSubmit,
  ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppTopBar
        left={(
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <MaterialIcons name="arrow-back-ios" size={14} color={semantic.text.primary} />
            <Text style={styles.detailSym}>{market?.symbol ?? symbol}</Text>
          </Pressable>
        )}
        center={(
          <View style={styles.headerPriceCenter}>
            <Text style={styles.headerPrice}>{formatPhoenixPrice(displayedPrice)}</Text>
            {scrubPrice === null && (
              <Text style={[styles.headerChange, isUp ? styles.textPos : styles.textNeg]}>
                {formatPhoenixPercent(change24h)}
              </Text>
            )}
          </View>
        )}
        right={<StatusPill status={market?.status ?? 'loading'} tradeable={market?.tradeable ?? false} />}
      />

      {loadingMarket ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="small" color={semantic.text.accent} />
          <Text style={styles.stateText}>Loading {symbol}...</Text>
        </View>
      ) : marketError ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorTitle}>Market unavailable</Text>
          <Text style={styles.stateText}>{marketError}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadMarket()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : market ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <PhoenixPriceChart
            symbol={market.symbol}
            height={142}
            onScrub={handleScrub}
            onLatestPrice={handleLatestPrice}
          />

          <View style={styles.statsStrip}>
            <StatBox label="Mark" value={formatPhoenixPrice(displayedPrice)} />
            <StatBox label="Funding" value={formatPhoenixRate(market.fundingRate)} tone={(market.fundingRate ?? 0) >= 0 ? 'pos' : 'neg'} />
            <StatBox label="OI" value={formatUsdCompact(market.openInterest)} />
            <StatBox label="24h Vol" value={formatUsdCompact(market.volume24h)} />
          </View>

          <View style={styles.infoPanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Market Setup</Text>
              <Text style={styles.panelMeta}>{market.dataFreshness.toUpperCase()}</Text>
            </View>
            <InfoRow label="Max leverage" value={market.maxLeverage ? `${market.maxLeverage}x` : '--'} />
            <InfoRow label="Tick size" value={market.tickSize ?? market.precision.tickSize ?? '--'} />
            <InfoRow label="Fees" value={`${formatFee(market.fees.makerFee)} maker / ${formatFee(market.fees.takerFee)} taker`} />
            <InfoRow label="Funding interval" value={formatSeconds(market.funding.fundingIntervalSeconds)} />
            <InfoRow label="Market key" value={shortKey(market.metadata.marketPubkey)} />
          </View>

          <View style={styles.orderSection}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Order Ticket</Text>
              <Text style={styles.panelMeta}>Phoenix</Text>
            </View>

            <TicketNotice readinessMessage={readiness.message ?? null} status={readiness.status} />

            <View style={styles.sideToggle}>
              <Pressable
                style={[styles.sideBtn, side === 'long' && styles.sideBtnLongActive]}
                onPress={() => setSide('long')}
              >
                <Text style={[styles.sideBtnText, side === 'long' && styles.textPos]}>Long</Text>
              </Pressable>
              <Pressable
                style={[styles.sideBtn, side === 'short' && styles.sideBtnShortActive]}
                onPress={() => setSide('short')}
              >
                <Text style={[styles.sideBtnText, side === 'short' && styles.textNeg]}>Short</Text>
              </Pressable>
            </View>

            <View style={styles.orderTypeRow}>
              <SegmentButton label="Market" active={orderType === 'market'} onPress={() => setOrderType('market')} />
              <SegmentButton
                label="Limit"
                active={orderType === 'limit'}
                onPress={() => {
                  setOrderType('limit');
                  if (!limitPriceText && displayedPrice) setLimitPriceText(displayedPrice.toFixed(2));
                }}
              />
            </View>

            {orderType === 'limit' && (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Limit Price</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.inputPrefix}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={limitPriceText}
                    onChangeText={(value) => setLimitPriceText(value.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder={displayedPrice ? displayedPrice.toFixed(2) : '0'}
                    placeholderTextColor={semantic.text.faint}
                  />
                </View>
              </View>
            )}

            <View style={styles.fieldBlock}>
              <Pressable onPress={() => setAmountMode(amountMode === 'usd' ? 'base' : 'usd')}>
                <Text style={styles.fieldLabel}>
                  {amountMode === 'usd' ? 'Amount (USDC)' : `Amount (${market.baseSymbol})`}
                  {'  '}
                  <Text style={styles.fieldHint}>tap to switch</Text>
                </Text>
              </Pressable>
              <View style={styles.inputRow}>
                {amountMode === 'usd' && <Text style={styles.inputPrefix}>$</Text>}
                <TextInput
                  style={styles.amountInput}
                  value={amountText}
                  onChangeText={(value) => setAmountText(value.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={semantic.text.faint}
                />
                {amountMode === 'base' && <Text style={styles.inputSuffix}>{market.baseSymbol}</Text>}
              </View>
              {amountUsdc > 0 && (
                <Text style={styles.amountSecondary}>
                  {amountMode === 'usd'
                    ? `~ ${amountBase.toFixed(4)} ${market.baseSymbol}`
                    : `~ $${amountUsdc.toFixed(2)}`}
                </Text>
              )}
            </View>

            <View style={styles.activationPanel}>
              <View style={styles.activationCopy}>
                <MaterialIcons name="vpn-key" size={15} color={tokens.colors.accent} />
                <Text style={styles.activationText}>Access code may be required before a Phoenix trader account exists.</Text>
              </View>
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
                  style={[styles.activateBtn, (!wallet.connected || !wallet.address || !accessCode.trim() || ticketBusy) && styles.disabledBtn]}
                  disabled={!wallet.connected || !wallet.address || !accessCode.trim() || ticketBusy}
                  onPress={handleActivate}
                >
                  <Text style={styles.activateText}>Activate</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.statusGrid}>
              <StatusRow label="Wallet" value={wallet.connected ? `${wallet.source.toUpperCase()} connected` : 'Not connected'} />
              <StatusRow label="Transactions" value={readiness.wallet.canSignAndSendTransaction ? 'Can sign and send' : 'Unavailable'} />
              <StatusRow label="Collateral" value="Deposit not wired in app" />
            </View>

            <View style={styles.orderSummary}>
              <SummaryItem label="Size" value={amountUsdc > 0 ? `$${amountUsdc.toFixed(0)}` : '--'} sub={amountBase > 0 ? `${amountBase.toFixed(4)} ${market.baseSymbol}` : undefined} />
              <SummaryItem label="Est. Fee" value={estimatedFee > 0 ? `$${estimatedFee.toFixed(3)}` : '--'} />
              <SummaryItem label="Mode" value={orderType === 'market' ? 'Market' : 'Limit'} align="right" />
            </View>

            <Pressable
              style={[
                styles.submitBtn,
                side === 'long' ? styles.submitLong : styles.submitShort,
                primaryButton.disabled && styles.submitDisabled,
              ]}
              disabled={primaryButton.disabled || ticketBusy}
              onPress={primaryButton.onPress}
            >
              {ticketBusy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText} numberOfLines={1}>{primaryButton.label}</Text>
              )}
            </Pressable>

            {ticketMessage && (
              <Text style={styles.ticketMessage}>{ticketMessage}</Text>
            )}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      ) : null}
    </View>
  );
}

function StatusPill({ status, tradeable }: { status: string; tradeable: boolean }) {
  return (
    <View style={[styles.statusPill, tradeable ? styles.statusPillActive : styles.statusPillMuted]}>
      <Text style={[styles.statusPillText, tradeable ? styles.textPos : styles.statusPillTextMuted]} numberOfLines={1}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statVal, tone === 'pos' && styles.textPos, tone === 'neg' && styles.textNeg]}>
        {value}
      </Text>
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

function TicketNotice({ readinessMessage, status }: { readinessMessage: string | null; status: string }) {
  return (
    <View style={styles.ticketNotice}>
      <MaterialIcons name={status === 'wallet_unsupported' ? 'error-outline' : 'info-outline'} size={16} color={tokens.colors.accent} />
      <Text style={styles.ticketNoticeText}>{readinessMessage ?? 'Phoenix execution status unavailable.'}</Text>
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.orderTypePill, active && styles.orderTypePillActive]}
      onPress={onPress}
    >
      <Text style={[styles.orderTypePillText, active && styles.orderTypePillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function SummaryItem({
  label,
  value,
  sub,
  align = 'left',
}: {
  label: string;
  value: string;
  sub?: string;
  align?: 'left' | 'right';
}) {
  return (
    <View style={[styles.summaryItem, align === 'right' && { alignItems: 'flex-end' }]}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumVal}>{value}</Text>
      {sub && <Text style={styles.sumSubVal}>{sub}</Text>}
    </View>
  );
}

function statusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function shortKey(value: string | null): string {
  if (!value) return '--';
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatFee(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(3)}%`;
}

function formatSeconds(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '--';
  if (value % 3600 === 0) return `${value / 3600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  return `${value}s`;
}

function formatBaseQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value.toFixed(8).replace(/\.?0+$/, '');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },
  scroll: {
    flex: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.8,
    padding: tokens.spacing.xs,
  },
  backBtnPressed: {
    opacity: 1,
  },
  detailSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.5,
  },
  headerPriceCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerPrice: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.lg - 2,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  headerChange: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '600',
    marginTop: 1,
  },
  statusPill: {
    minWidth: 72,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.sm,
  },
  statusPillActive: {
    backgroundColor: 'rgba(6,214,160,0.10)',
    borderColor: 'rgba(6,214,160,0.32)',
  },
  statusPillMuted: {
    backgroundColor: 'rgba(245,250,252,0.05)',
    borderColor: 'rgba(245,250,252,0.12)',
  },
  statusPillText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusPillTextMuted: {
    color: semantic.text.faint,
  },
  centeredState: {
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
  statsStrip: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  infoPanel: {
    margin: tokens.spacing.lg,
    marginBottom: tokens.spacing.sm,
    padding: tokens.spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: 'rgba(6,51,67,0.72)',
  },
  orderSection: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.sm,
    padding: tokens.spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  panelTitle: {
    fontSize: tokens.fontSize.md,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  panelMeta: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(24,90,112,0.54)',
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
    fontWeight: '700',
    color: semantic.text.primary,
    textAlign: 'right',
  },
  ticketNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    borderRadius: 8,
    backgroundColor: 'rgba(255,209,102,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.18)',
    marginBottom: tokens.spacing.md,
  },
  ticketNoticeText: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    lineHeight: 17,
    color: semantic.text.dim,
  },
  sideToggle: {
    flexDirection: 'row',
    backgroundColor: semantic.background.screen,
    borderRadius: 8,
    padding: 3,
    marginBottom: tokens.spacing.sm,
  },
  sideBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  sideBtnLongActive: {
    backgroundColor: 'rgba(6,214,160,0.13)',
  },
  sideBtnShortActive: {
    backgroundColor: 'rgba(239,71,111,0.13)',
  },
  sideBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '800',
    color: semantic.text.dim,
    textTransform: 'uppercase',
  },
  orderTypeRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  orderTypePill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: semantic.background.screen,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  orderTypePillActive: {
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surfaceRaised,
  },
  orderTypePillText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  orderTypePillTextActive: {
    color: semantic.text.primary,
  },
  fieldBlock: {
    marginBottom: tokens.spacing.md,
  },
  fieldLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.faint,
    marginBottom: tokens.spacing.xs,
  },
  fieldHint: {
    color: semantic.text.accent,
  },
  inputRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.screen,
    paddingHorizontal: tokens.spacing.md,
  },
  inputPrefix: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.lg,
    color: semantic.text.faint,
    marginRight: tokens.spacing.xs,
  },
  inputSuffix: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    color: semantic.text.faint,
    marginLeft: tokens.spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
    color: semantic.text.primary,
    padding: 0,
  },
  amountSecondary: {
    marginTop: tokens.spacing.xs,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.faint,
  },
  activationPanel: {
    padding: tokens.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,250,252,0.10)',
    backgroundColor: 'rgba(7,59,76,0.45)',
    marginBottom: tokens.spacing.md,
  },
  activationCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  activationText: {
    flex: 1,
    fontSize: tokens.fontSize.xs,
    lineHeight: 16,
    color: semantic.text.dim,
  },
  accessRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  accessInput: {
    flex: 1,
    minHeight: 40,
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
    minWidth: 86,
    minHeight: 40,
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
    opacity: 0.48,
  },
  statusGrid: {
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(24,90,112,0.42)',
  },
  statusLabel: {
    width: 92,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  statusValue: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
    textAlign: 'right',
  },
  orderSummary: {
    flexDirection: 'row',
    paddingVertical: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
  },
  summaryItem: {
    flex: 1,
  },
  sumLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sumVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  sumSubVal: {
    marginTop: 3,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
  },
  submitBtn: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  submitLong: {
    backgroundColor: tokens.colors.viridian,
  },
  submitShort: {
    backgroundColor: tokens.colors.vermillion,
  },
  submitDisabled: {
    opacity: 0.48,
  },
  submitText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  ticketMessage: {
    marginTop: tokens.spacing.sm,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    lineHeight: 16,
    color: semantic.text.dim,
    textAlign: 'center',
  },
  textPos: {
    color: tokens.colors.viridian,
  },
  textNeg: {
    color: tokens.colors.vermillion,
  },
});
