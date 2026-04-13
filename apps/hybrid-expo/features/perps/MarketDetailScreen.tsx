import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useWallet } from '@/hooks/useWallet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { WalletHeaderButton } from '@/components/wallet/WalletHeaderButton';
import {
  fetchPerpsMarkets,
  fetchPerpsAccount,
  formatChange,
  formatFunding,
  formatPrice,
  formatUsdCompact,
  placeOrder,
} from '@/features/perps/perps.api';
import type { PerpsMarket } from '@/features/perps/perps.types';
import { usePerpsLivePrice } from '@/features/perps/usePerpsWebSocket';
import { PriceChart } from '@/features/perps/PriceChart';
import { PACIFIC_BUILDER_CODE } from '@/features/perps/pacific.config';
import { semantic, tokens } from '@/theme';

type Side = 'long' | 'short';
type AmountMode = 'usd' | 'native';

interface MarketDetailScreenProps {
  symbol: string;
}

export function MarketDetailScreen({ symbol }: MarketDetailScreenProps) {
  const router = useRouter();
  const { connected, address, signMessage } = useWallet();

  // Market data
  const [market, setMarket] = useState<PerpsMarket | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Account balance
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);

  // UI state
  const [side, setSide] = useState<Side>('long');
  const [amountMode, setAmountMode] = useState<AmountMode>('usd');
  const [amountText, setAmountText] = useState('');
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleScrub = useCallback((price: number | null, _time: number | null) => {
    setScrubPrice(price);
  }, []);

  // ── Order submission ──
  const handleSubmitOrder = useCallback(async () => {
    if (!connected || !address || amountUsdc <= 0) return;
    if (maxNotional !== null && amountUsdc > maxNotional) {
      Alert.alert('Exceeds Max', `Max position: $${maxNotional.toFixed(0)} (${availableBalance?.toFixed(2)} × ${maxLeverage}x)`);
      return;
    }
    setSubmitting(true);
    try {
      const orderId = await placeOrder(
        {
          symbol,
          side: side === 'long' ? 'bid' : 'ask',
          amountUsdc,
          slippage: '1',
          builderCode: PACIFIC_BUILDER_CODE || undefined,
        },
        address,
        signMessage,
      );
      Alert.alert('Order Placed', `Order #${orderId} submitted successfully.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order failed';
      Alert.alert('Order Failed', msg);
    } finally {
      setSubmitting(false);
    }
  }, [connected, address, amountUsdc, availableBalance, symbol, side, signMessage]);

  // Live price via WebSocket
  const livePrice = usePerpsLivePrice(symbol);

  // Displayed price: prefer live WebSocket, fall back to REST snapshot
  const displayPrice = useMemo(() => {
    if (livePrice?.mark) return parseFloat(livePrice.mark);
    return market?.markPrice ?? 0;
  }, [livePrice, market]);

  const displayFunding = useMemo(() => {
    if (livePrice?.funding) return parseFloat(livePrice.funding);
    return market?.fundingRate ?? 0;
  }, [livePrice, market]);

  // Load market info (REST snapshot for initial render)
  async function loadMarket() {
    setLoadingMarket(true);
    setMarketError(null);
    try {
      const all = await fetchPerpsMarkets();
      const found = all.find((m) => m.symbol === symbol) ?? null;
      if (!found) throw new Error(`Market ${symbol} not found`);
      setMarket(found);
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : 'Failed to load market');
    } finally {
      setLoadingMarket(false);
    }
  }

  useEffect(() => {
    void loadMarket();
  }, [symbol]);

  // Fetch available balance
  useEffect(() => {
    if (connected && address) {
      fetchPerpsAccount(address)
        .then((acc) => setAvailableBalance(acc.availableToSpend))
        .catch(() => setAvailableBalance(null));
    } else {
      setAvailableBalance(null);
    }
  }, [connected, address]);

  // Max notional = available margin × max leverage
  const maxLeverage = market?.maxLeverage ?? 1;
  const maxNotional = availableBalance !== null ? availableBalance * maxLeverage : null;

  // Derive USDC amount from input
  const amountUsdc = useMemo(() => {
    const num = parseFloat(amountText);
    if (isNaN(num) || num <= 0) return 0;
    if (amountMode === 'usd') return num;
    // native → convert to USDC
    return num * displayPrice;
  }, [amountText, amountMode, displayPrice]);

  // Native equivalent for display
  const amountNative = useMemo(() => {
    if (displayPrice <= 0) return 0;
    return amountUsdc / displayPrice;
  }, [amountUsdc, displayPrice]);

  const change24h = market?.change24h ?? 0;
  const isUp = change24h >= 0;

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header — back | price centered | wallet */}
      <View style={styles.detailHeader}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => router.back()}>
          <MaterialIcons name="arrow-back-ios" size={14} color={semantic.text.primary} />
          <Text style={styles.detailSym}>{symbol}</Text>
        </Pressable>

        <View style={styles.headerPriceCenter}>
          <Text style={styles.headerPrice}>
            {formatPrice(scrubPrice ?? displayPrice)}
          </Text>
          {scrubPrice === null && (
            <Text style={[styles.headerChange, isUp ? styles.textPos : styles.textNeg]}>
              {isUp ? '+' : ''}{formatChange(change24h)}
            </Text>
          )}
        </View>

        <WalletHeaderButton />
      </View>

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
      ) : (
        <>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* Chart */}
            <PriceChart symbol={symbol} height={180} onScrub={handleScrub} />

            {/* Stats strip */}
            <View style={styles.statsStrip}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Mark</Text>
                <Text style={styles.statVal}>{formatPrice(displayPrice)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Fund/8h</Text>
                <Text style={[styles.statVal, displayFunding >= 0 ? styles.textPos : styles.textNeg]}>
                  {formatFunding(displayFunding)}
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>OI</Text>
                <Text style={styles.statVal}>{formatUsdCompact(market?.openInterest ?? 0)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>24h Vol</Text>
                <Text style={styles.statVal}>{formatUsdCompact(market?.volume24h ?? 0)}</Text>
              </View>
            </View>

            {/* ── Order section ── */}
            <View style={styles.orderSection}>
              {/* Side toggle */}
              <View style={styles.sideToggle}>
                <Pressable
                  style={[styles.sideBtn, side === 'long' && styles.sideBtnLongActive]}
                  onPress={() => setSide('long')}>
                  <Text style={[styles.sideBtnText, side === 'long' && { color: tokens.colors.viridian }]}>Long</Text>
                </Pressable>
                <Pressable
                  style={[styles.sideBtn, side === 'short' && styles.sideBtnShortActive]}
                  onPress={() => setSide('short')}>
                  <Text style={[styles.sideBtnText, side === 'short' && { color: tokens.colors.vermillion }]}>Short</Text>
                </Pressable>
              </View>

              {/* Amount input — tappable label toggles USD / native */}
              <View style={styles.amountSection}>
                <Pressable onPress={() => setAmountMode(amountMode === 'usd' ? 'native' : 'usd')}>
                  <Text style={styles.amountLabel}>
                    {amountMode === 'usd' ? 'Amount (USDC)' : `Amount (${symbol})`}
                    {'  '}
                    <Text style={styles.amountToggleHint}>tap to switch</Text>
                  </Text>
                </Pressable>
                <View style={styles.amountRow}>
                  <Text style={styles.amountDollar}>{amountMode === 'usd' ? '$' : ''}</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={amountText}
                    onChangeText={(t) => {
                      // Allow decimals
                      const clean = t.replace(/[^0-9.]/g, '');
                      setAmountText(clean);
                    }}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    placeholder="0"
                    placeholderTextColor={semantic.text.faint}
                  />
                  {amountMode === 'native' && (
                    <Text style={styles.amountNativeSymbol}>{symbol}</Text>
                  )}
                </View>
                {/* Secondary display — show the other unit */}
                {amountUsdc > 0 && (
                  <Text style={styles.amountSecondary}>
                    {amountMode === 'usd'
                      ? `≈ ${amountNative.toFixed(4)} ${symbol}`
                      : `≈ $${amountUsdc.toFixed(2)}`}
                  </Text>
                )}
                {/* Available balance + Max button */}
                {availableBalance !== null && maxNotional !== null && (
                  <Pressable
                    style={styles.maxRow}
                    onPress={() => {
                      if (amountMode === 'usd') {
                        setAmountText(String(Math.floor(maxNotional)));
                      } else if (displayPrice > 0) {
                        setAmountText((maxNotional / displayPrice).toFixed(4));
                      }
                    }}>
                    <Text style={styles.availText}>
                      ${availableBalance.toFixed(0)} × {maxLeverage}x = ${maxNotional.toFixed(0)}
                    </Text>
                    <Text style={styles.maxBtn}>MAX</Text>
                  </Pressable>
                )}
              </View>

              {/* Order summary */}
              <View style={styles.orderSummary}>
                <View style={styles.sumItem}>
                  <Text style={styles.sumLabel}>Size</Text>
                  <Text style={styles.sumVal}>
                    {amountUsdc > 0 ? `$${amountUsdc.toFixed(0)}` : '--'}
                  </Text>
                  {amountNative > 0 && (
                    <Text style={styles.sumSubVal}>{amountNative.toFixed(4)} {symbol}</Text>
                  )}
                </View>
                <View style={[styles.sumItem, { alignItems: 'center' }]}>
                  <Text style={styles.sumLabel}>Est. Fee</Text>
                  <Text style={styles.sumVal}>
                    {amountUsdc > 0 ? `$${(amountUsdc * 0.0002).toFixed(2)}` : '--'}
                  </Text>
                </View>
                <View style={[styles.sumItem, { alignItems: 'flex-end' }]}>
                  <Text style={styles.sumLabel}>Liq. Price</Text>
                  <Text style={[styles.sumVal, styles.textNeg]}>
                    {amountUsdc > 0 && availableBalance && availableBalance > 0
                      ? `~${formatPrice((() => {
                          const effectiveLev = amountUsdc / availableBalance;
                          return side === 'long'
                            ? displayPrice * (1 - 1 / effectiveLev)
                            : displayPrice * (1 + 1 / effectiveLev);
                        })())}`
                      : '--'}
                  </Text>
                </View>
              </View>

              {/* Submit button */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  side === 'long' ? styles.submitLong : styles.submitShort,
                  (!connected || amountUsdc <= 0 || submitting) && styles.submitDisabled,
                  pressed && { opacity: 0.8 },
                ]}
                disabled={!connected || amountUsdc <= 0 || submitting}
                onPress={handleSubmitOrder}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitText}>
                    {!connected
                      ? 'Connect Wallet'
                      : `Open ${side === 'long' ? 'Long' : 'Short'} — $${amountUsdc.toFixed(0)}`}
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Bottom padding for scroll */}
            <View style={{ height: 24 }} />
          </ScrollView>
        </>
      )}

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },

  // Header
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.8,
    padding: tokens.spacing.xs,
  },
  backBtnPressed: { opacity: 1 },
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

  // Loading / error states
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
    backgroundColor: semantic.text.accent,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
    marginTop: tokens.spacing.xs,
  },
  retryText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: semantic.background.screen,
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  statVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
    color: semantic.text.primary,
  },

  // Order section
  orderSection: {
    padding: tokens.spacing.lg,
    gap: 14,
  },

  // Side toggle
  sideToggle: {
    flexDirection: 'row',
    backgroundColor: semantic.background.surfaceRaised,
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  sideBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  sideBtnLongActive: {
    backgroundColor: 'rgba(74,140,111,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.25)',
  },
  sideBtnShortActive: {
    backgroundColor: 'rgba(217,83,79,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.22)',
  },
  sideBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },

  // Amount input
  amountSection: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  amountLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amountDollar: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
    color: semantic.text.dim,
  },
  amountInput: {
    fontFamily: 'monospace',
    fontSize: 38,
    fontWeight: '700',
    color: semantic.text.primary,
    minWidth: 60,
    textAlign: 'center',
    padding: 0,
  },

  amountToggleHint: {
    fontSize: tokens.fontSize.xxs - 2,
    color: semantic.text.accent,
    letterSpacing: 0.5,
    textTransform: 'none',
  },
  amountNativeSymbol: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
    color: semantic.text.dim,
    marginLeft: 4,
  },
  amountSecondary: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
    letterSpacing: 0.5,
  },
  maxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  availText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    letterSpacing: 0.5,
  },
  maxBtn: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    fontWeight: '700',
    color: semantic.text.accent,
    letterSpacing: 1,
  },

  // Order summary
  orderSummary: {
    flexDirection: 'row',
    backgroundColor: semantic.background.surfaceRaised,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    padding: tokens.spacing.md,
  },
  sumItem: {
    flex: 1,
    gap: 3,
  },
  sumLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  sumVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  sumSubVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    color: semantic.text.dim,
    letterSpacing: 0.3,
  },

  // Submit button
  submitBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
  },
  submitLong: {
    backgroundColor: tokens.colors.viridian,
  },
  submitShort: {
    backgroundColor: tokens.colors.vermillion,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#fff',
  },

  // Colors
  textPos: { color: tokens.colors.viridian },
  textNeg: { color: tokens.colors.vermillion },
});
