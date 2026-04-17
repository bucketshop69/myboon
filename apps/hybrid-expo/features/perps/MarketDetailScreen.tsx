import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useWallet } from '@/hooks/useWallet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
  fetchPerpsPositions,
  formatChange,
  formatFunding,
  formatPrice,
  formatUsdCompact,
  placeOrder,
  closePosition,
  setTPSL,
} from '@/features/perps/perps.api';
import type { PerpsPosition } from '@/features/perps/perps.types';
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
  const { connected, address, signMessage, connect } = useWallet();

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

  // Quick-amount pill active state
  const [activePillPct, setActivePillPct] = useState<number | null>(null);

  // TP/SL inline fields
  const [tpslExpanded, setTpslExpanded] = useState(false);
  const [tpPriceText, setTpPriceText] = useState('');
  const [slPriceText, setSlPriceText] = useState('');

  // My Positions
  const [positions, setPositions] = useState<PerpsPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);

  // Live dot pulse animation
  const dotOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [dotOpacity]);

  const handleScrub = useCallback((price: number | null, _time: number | null) => {
    setScrubPrice(price);
  }, []);

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

  // Fetch positions
  const loadPositions = useCallback(() => {
    if (!connected || !address) {
      setPositions([]);
      return;
    }
    setPositionsLoading(true);
    fetchPerpsPositions(address)
      .then(setPositions)
      .catch(() => setPositions([]))
      .finally(() => setPositionsLoading(false));
  }, [connected, address]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  // Close a position from My Positions section
  const handleClosePositionCard = useCallback(async (pos: PerpsPosition) => {
    if (!address) return;
    setClosingSymbol(pos.symbol);
    try {
      const closeSide = pos.side === 'long' ? 'ask' : 'bid';
      await closePosition(pos.symbol, closeSide, pos.size, address, signMessage, PACIFIC_BUILDER_CODE || undefined);
      Alert.alert('Position Closed', `${pos.symbol} ${pos.side.toUpperCase()} closed`);
      loadPositions();
    } catch (err: any) {
      Alert.alert('Close Failed', err.message ?? 'Unknown error');
    } finally {
      setClosingSymbol(null);
    }
  }, [address, signMessage, loadPositions]);

  // Open TP/SL modal for a position (reuse ProfileView pattern — shows existing modal via state)
  const [tpslModalPos, setTpslModalPos] = useState<PerpsPosition | null>(null);
  const [tpslModalTp, setTpslModalTp] = useState('');
  const [tpslModalSl, setTpslModalSl] = useState('');
  const [tpslModalLoading, setTpslModalLoading] = useState(false);

  const handleSetTPSLCard = useCallback(async () => {
    if (!address || !tpslModalPos) return;
    setTpslModalLoading(true);
    try {
      const side = tpslModalPos.side === 'long' ? 'ask' : 'bid';
      const tp = tpslModalTp.trim() ? { stopPrice: tpslModalTp.trim(), limitPrice: tpslModalTp.trim() } : undefined;
      const sl = tpslModalSl.trim() ? { stopPrice: tpslModalSl.trim(), limitPrice: tpslModalSl.trim() } : undefined;
      if (!tp && !sl) {
        Alert.alert('Enter a Price', 'Set at least a TP or SL price.');
        return;
      }
      await setTPSL({ symbol: tpslModalPos.symbol, side, takeProfit: tp, stopLoss: sl, builderCode: PACIFIC_BUILDER_CODE || undefined }, address, signMessage);
      Alert.alert('TP/SL Set', `${tpslModalPos.symbol} TP/SL updated`);
      setTpslModalPos(null);
      setTpslModalTp('');
      setTpslModalSl('');
      loadPositions();
    } catch (err: any) {
      Alert.alert('TP/SL Failed', err.message ?? 'Unknown error');
    } finally {
      setTpslModalLoading(false);
    }
  }, [address, signMessage, tpslModalPos, tpslModalTp, tpslModalSl, loadPositions]);

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
  }, [connected, address, amountUsdc, availableBalance, maxNotional, symbol, side, signMessage, maxLeverage]);

  const change24h = market?.change24h ?? 0;
  const isUp = change24h >= 0;

  // Submit button sub-line text (liq price + fee + optional TP/SL)
  const submitSubLine = useMemo(() => {
    if (amountUsdc <= 0 || !availableBalance || availableBalance <= 0) return '';
    const effectiveLev = amountUsdc / availableBalance;
    const liq = side === 'long'
      ? displayPrice * (1 - 1 / effectiveLev)
      : displayPrice * (1 + 1 / effectiveLev);
    let line = `Liq. ~${formatPrice(liq)} · Fee $${(amountUsdc * 0.0002).toFixed(2)}`;
    if (tpPriceText || slPriceText) {
      const tpPart = tpPriceText ? `TP $${tpPriceText}` : '';
      const slPart = slPriceText ? `SL $${slPriceText}` : '';
      const tpslPart = [tpPart, slPart].filter(Boolean).join(' / ');
      line += ` · ${tpslPart}`;
    }
    return line;
  }, [amountUsdc, availableBalance, displayPrice, side, tpPriceText, slPriceText]);

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
          <View style={styles.headerPriceRow}>
            {livePrice !== null && (
              <Animated.View style={[styles.liveDot, { opacity: dotOpacity }]} />
            )}
            <Text style={styles.headerPrice}>
              {formatPrice(scrubPrice ?? displayPrice)}
            </Text>
          </View>
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
            <PriceChart symbol={symbol} height={140} onScrub={handleScrub} />

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
            {!connected ? (
              /* Disconnected wallet CTA */
              <View style={styles.disconnectedCta}>
                <MaterialIcons name="lock" size={32} color={semantic.text.dim} />
                <Text style={styles.disconnectedText}>
                  Connect your wallet to trade {symbol} perpetuals
                </Text>
                <Pressable style={styles.connectWalletBtn} onPress={connect}>
                  <Text style={styles.connectWalletText}>Connect Wallet</Text>
                </Pressable>
              </View>
            ) : (
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
                        const clean = t.replace(/[^0-9.]/g, '');
                        setAmountText(clean);
                        setActivePillPct(null);
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
                  {/* Secondary display */}
                  {amountUsdc > 0 && (
                    <Text style={styles.amountSecondary}>
                      {amountMode === 'usd'
                        ? `≈ ${amountNative.toFixed(4)} ${symbol}`
                        : `≈ $${amountUsdc.toFixed(2)}`}
                    </Text>
                  )}
                </View>

                {/* Quick-amount pills */}
                {maxNotional !== null && (
                  <View style={styles.quickPillsRow}>
                    {([25, 50, 75, 100] as const).map((pct) => (
                      <Pressable
                        key={pct}
                        style={[styles.quickPill, activePillPct === pct && styles.quickPillActive]}
                        onPress={() => {
                          const amount = (maxNotional * pct) / 100;
                          if (amountMode === 'usd') {
                            setAmountText(Math.floor(amount).toString());
                          } else if (displayPrice > 0) {
                            setAmountText((amount / displayPrice).toFixed(4));
                          }
                          setActivePillPct(pct);
                        }}>
                        <Text style={[styles.quickPillText, activePillPct === pct && styles.quickPillTextActive]}>
                          {pct === 100 ? 'MAX' : `${pct}%`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Available balance row */}
                {availableBalance !== null && maxNotional !== null && (
                  <View style={styles.maxRow}>
                    <Text style={styles.availText}>
                      ${availableBalance.toFixed(0)} × {maxLeverage}x = ${maxNotional.toFixed(0)}
                    </Text>
                  </View>
                )}

                {/* TP/SL collapsible */}
                <View style={styles.tpslSection}>
                  <Pressable style={styles.tpslHeader} onPress={() => setTpslExpanded(!tpslExpanded)}>
                    <Text style={styles.tpslHeaderText}>Take Profit / Stop Loss</Text>
                    <MaterialIcons
                      name={tpslExpanded ? 'expand-less' : 'expand-more'}
                      size={18}
                      color={semantic.text.dim}
                    />
                  </Pressable>
                  {tpslExpanded && (
                    <View style={styles.tpslInputRow}>
                      <View style={styles.tpslField}>
                        <Text style={styles.tpslFieldLabel}>TP Price</Text>
                        <TextInput
                          style={styles.tpslInput}
                          value={tpPriceText}
                          onChangeText={setTpPriceText}
                          placeholder="--"
                          placeholderTextColor={semantic.text.faint}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.tpslField}>
                        <Text style={[styles.tpslFieldLabel, { color: tokens.colors.vermillion }]}>SL Price</Text>
                        <TextInput
                          style={[styles.tpslInput, styles.tpslInputSl]}
                          value={slPriceText}
                          onChangeText={setSlPriceText}
                          placeholder="--"
                          placeholderTextColor={semantic.text.faint}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
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
                    (amountUsdc <= 0 || submitting) && styles.submitDisabled,
                    pressed && { opacity: 0.8 },
                  ]}
                  disabled={amountUsdc <= 0 || submitting}
                  onPress={handleSubmitOrder}>
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.submitText}>
                        {`Open ${side === 'long' ? 'Long' : 'Short'} — $${amountUsdc.toFixed(0)}`}
                      </Text>
                      {amountUsdc > 0 && availableBalance && availableBalance > 0 && (
                        <Text style={styles.submitSubText}>
                          {submitSubLine}
                        </Text>
                      )}
                    </>
                  )}
                </Pressable>

                {/* My Positions */}
                <View style={styles.myPositionsSection}>
                  <Text style={styles.myPositionsTitle}>My Positions</Text>
                  {positionsLoading ? (
                    <ActivityIndicator size="small" color={semantic.text.accent} style={{ marginTop: 8 }} />
                  ) : positions.length === 0 ? (
                    <Text style={styles.myPositionsEmpty}>No open positions</Text>
                  ) : (
                    positions.map((pos) => {
                      const isUp = pos.unrealizedPnl >= 0;
                      const isClosing = closingSymbol === pos.symbol;
                      return (
                        <View key={pos.symbol} style={styles.posCard}>
                          <View style={styles.posCardTop}>
                            <View style={[styles.posSideBadge, pos.side === 'long' ? styles.posSideLong : styles.posSideShort]}>
                              <Text style={[styles.posSideText, pos.side === 'long' ? styles.textPos : styles.textNeg]}>
                                {pos.side === 'long' ? 'LONG' : 'SHORT'}
                              </Text>
                            </View>
                            <Text style={styles.posSymbol}>{pos.symbol}</Text>
                            <Text style={styles.posSize}>
                              {pos.size} {pos.symbol.replace('USDC', '').replace('-PERP', '')}
                            </Text>
                            <Text style={[styles.posPnl, isUp ? styles.textPos : styles.textNeg]}>
                              {isUp ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                            </Text>
                          </View>
                          <View style={styles.posCardMeta}>
                            <Text style={styles.posMetaText}>Entry {formatPrice(pos.entryPrice)}</Text>
                            <Text style={styles.posMetaText}>Liq {formatPrice(
                              (() => {
                                const effectiveLev = pos.entryPrice > 0 ? (pos.size * pos.entryPrice) / (pos.size * pos.entryPrice * 0.1) : 10;
                                return pos.side === 'long'
                                  ? pos.markPrice * (1 - 1 / effectiveLev)
                                  : pos.markPrice * (1 + 1 / effectiveLev);
                              })()
                            )}</Text>
                          </View>
                          <View style={styles.posCardActions}>
                            <Pressable
                              style={styles.posActionBtn}
                              onPress={() => {
                                setTpslModalPos(pos);
                                setTpslModalTp('');
                                setTpslModalSl('');
                              }}>
                              <Text style={styles.posActionBtnText}>TP/SL</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.posActionBtn, styles.posActionBtnClose]}
                              onPress={() => handleClosePositionCard(pos)}
                              disabled={isClosing}>
                              <Text style={[styles.posActionBtnText, { color: tokens.colors.vermillion }]}>
                                {isClosing ? 'Closing…' : 'Close'}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            )}

            {/* Bottom padding for scroll */}
            <View style={{ height: 24 }} />
          </ScrollView>
        </>
      )}

      {/* TP/SL Modal for position cards */}
      {tpslModalPos !== null && (
        <Pressable style={styles.modalOverlay} onPress={() => setTpslModalPos(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              TP / SL — {tpslModalPos.symbol} {tpslModalPos.side.toUpperCase()}
            </Text>
            <View style={styles.tpslInputRow}>
              <View style={styles.tpslField}>
                <Text style={styles.tpslFieldLabel}>TP Price</Text>
                <TextInput
                  style={styles.tpslInput}
                  value={tpslModalTp}
                  onChangeText={setTpslModalTp}
                  placeholder={tpslModalPos.side === 'long' ? `above ${tpslModalPos.markPrice.toFixed(2)}` : `below ${tpslModalPos.markPrice.toFixed(2)}`}
                  placeholderTextColor={semantic.text.faint}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.tpslField}>
                <Text style={[styles.tpslFieldLabel, { color: tokens.colors.vermillion }]}>SL Price</Text>
                <TextInput
                  style={[styles.tpslInput, styles.tpslInputSl]}
                  value={tpslModalSl}
                  onChangeText={setTpslModalSl}
                  placeholder={tpslModalPos.side === 'long' ? `below ${tpslModalPos.markPrice.toFixed(2)}` : `above ${tpslModalPos.markPrice.toFixed(2)}`}
                  placeholderTextColor={semantic.text.faint}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setTpslModalPos(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, tpslModalLoading && { opacity: 0.5 }]}
                onPress={handleSetTPSLCard}
                disabled={tpslModalLoading}>
                <Text style={styles.modalConfirmText}>
                  {tpslModalLoading ? 'Setting…' : 'Confirm'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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

  // Live dot in header
  headerPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.viridian,
  },

  // Quick-amount pills
  quickPillsRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  quickPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: 'transparent',
  },
  quickPillActive: {
    backgroundColor: 'rgba(199,183,112,0.12)',
    borderColor: 'rgba(199,183,112,0.35)',
  },
  quickPillText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: semantic.text.dim,
  },
  quickPillTextActive: {
    color: tokens.colors.primary,
  },

  // TP/SL collapsible section
  tpslSection: {
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
  },
  tpslHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs + 2,
    backgroundColor: semantic.background.surfaceRaised,
  },
  tpslHeaderText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 1,
    color: semantic.text.dim,
    textTransform: 'uppercase',
  },
  tpslInputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: tokens.spacing.sm,
  },
  tpslField: {
    flex: 1,
    gap: 3,
  },
  tpslFieldLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: tokens.colors.viridian,
  },
  tpslInput: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    color: semantic.text.primary,
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.3)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tpslInputSl: {
    borderColor: 'rgba(217,83,79,0.3)',
  },

  // Submit button second line
  submitSubText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.3,
    marginTop: 2,
  },

  // Disconnected wallet CTA
  disconnectedCta: {
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
    margin: tokens.spacing.lg,
    backgroundColor: semantic.background.surfaceRaised,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
  },
  disconnectedText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
    textAlign: 'center',
    lineHeight: 20,
  },
  connectWalletBtn: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.sm + 2,
    paddingHorizontal: tokens.spacing.xl,
    marginTop: tokens.spacing.xs,
  },
  connectWalletText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.background.screen,
    letterSpacing: 1,
  },

  // My Positions section
  myPositionsSection: {
    gap: 8,
    marginTop: 4,
  },
  myPositionsTitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  myPositionsEmpty: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.faint,
    textAlign: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  posCard: {
    backgroundColor: semantic.background.surfaceRaised,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    gap: 6,
    padding: tokens.spacing.sm,
  },
  posCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  posSideBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.xs,
  },
  posSideLong: {
    backgroundColor: 'rgba(74,140,111,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.25)',
  },
  posSideShort: {
    backgroundColor: 'rgba(217,83,79,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.22)',
  },
  posSideText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  posSymbol: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    color: semantic.text.primary,
    flex: 1,
  },
  posSize: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
  },
  posPnl: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
  },
  posCardMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  posMetaText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
  },
  posCardActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  posActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.lift,
  },
  posActionBtnClose: {
    borderColor: 'rgba(217,83,79,0.25)',
    backgroundColor: 'rgba(217,83,79,0.08)',
  },
  posActionBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: tokens.colors.primary,
  },

  // TP/SL modal (for position cards)
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.lg,
    zIndex: 100,
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
});
