import { useEffect, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTopBar, AppTopBarCashPill, AppTopBarIconButton, AppTopBarTitle } from '@/components/AppTopBar';
import { cancelOrder, fetchClobBalance, fetchCuratedMarketDetail, fetchLivePrices, fetchMarketPositions, fetchOpenOrders, fetchOrderbook, fetchPortfolio, fetchPriceHistory, placeBet } from '@/features/predict/predict.api';
import type { ActivityItem, ClosedPortfolioPosition, OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import type { GeopoliticsMarketDetail, Orderbook, PricePoint } from '@/features/predict/predict.types';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { semantic, tokens } from '@/theme';
import { formatUsdCompact } from '@/lib/format';
import { useOddsFormat } from '@/hooks/useOddsFormat';
import { OddsFormatToggle } from '@/features/predict/components/OddsFormatToggle';
import { MultiLineChart } from '@/features/predict/components/MultiLineChart';
import { OrderbookView } from '@/features/predict/components/OrderbookView';
import { InlineNumpad } from '@/features/predict/components/InlineNumpad';
import { DetailPicksPanel } from '@/features/predict/components/DetailPicksPanel';
import { CashOutConfirmModal } from '@/features/predict/components/CashOutConfirmModal';
import { truncateUsd } from '@/features/predict/formatPredictMoney';
import { makePendingOpenOrder, mergeOpenOrders, prunePendingOpenOrders } from '@/features/predict/pendingOpenOrders';
import { getPredictOrderGuardrail, type PredictDataFreshness } from '@/features/predict/predictActivityState';

interface PredictMarketDetailScreenProps {
  slug: string;
}

type Interval = '5m' | '1h' | '1d';
type ActiveView = 'picks' | 'stats' | 'chart' | 'orderbook';

const SOFT_COLLAPSED = 230; // handle + stats + odds
const SOFT_EXPANDED = 680;  // + numpad

function formatDeadline(endDate: string | null, active: boolean | null): string {
  if (!endDate) return active === false ? 'Closed' : 'Open';
  const time = Date.parse(endDate);
  if (Number.isNaN(time)) return active === false ? 'Closed' : 'Open';
  const date = new Date(time);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${active === false ? 'Ended' : 'Ends'} ${month} ${day}`;
}

function DisplayTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.displayTab, active && styles.displayTabActive]} onPress={onPress}>
      <Text style={[styles.displayTabText, active && styles.displayTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function marketHrefForSlug(rowSlug: string): Href {
  const sportMatch = rowSlug.match(/^cric(epl|ucl|ipl)-/);
  if (sportMatch) {
    return {
      pathname: '/predict-sport/[sport]/[slug]',
      params: { sport: sportMatch[1], slug: rowSlug },
    };
  }
  return {
    pathname: '/predict-market/[slug]',
    params: { slug: rowSlug },
  };
}

export function PredictMarketDetailScreen({ slug }: PredictMarketDetailScreenProps) {
  const router = useRouter();
  const poly = usePolymarketWallet();
  const privy = usePrivyWallet();
  const { format, setFormat, formatOdds } = useOddsFormat();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Market data
  const [detail, setDetail] = useState<GeopoliticsMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveTokenPrices, setLiveTokenPrices] = useState<Record<string, number | null>>({});

  // Chart data
  const [interval, setInterval] = useState<Interval>('1h');
  const [yesHistory, setYesHistory] = useState<PricePoint[]>([]);
  const [noHistory, setNoHistory] = useState<PricePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('chart');
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [orderbookLoading, setOrderbookLoading] = useState(false);

  // Numpad state
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no' | null>(null);
  const [selectedQuotePrice, setSelectedQuotePrice] = useState<number | null>(null);
  const [numpadAmount, setNumpadAmount] = useState('50');
  const [submitting, setSubmitting] = useState(false);
  const [pickScope, setPickScope] = useState<'market' | 'all'>('market');
  const [marketPositions, setMarketPositions] = useState<PortfolioPosition[]>([]);
  const [allPositions, setAllPositions] = useState<PortfolioPosition[]>([]);
  const [redeemablePositions, setRedeemablePositions] = useState<PortfolioPosition[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPortfolioPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [pendingOpenOrders, setPendingOpenOrders] = useState<OpenOrder[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [picksFreshness, setPicksFreshness] = useState<PredictDataFreshness>({
    lastUpdatedAt: null,
    loading: false,
    stale: false,
    error: null,
  });
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [cashOutPosition, setCashOutPosition] = useState<PortfolioPosition | null>(null);

  // Soft zone animation
  const softZoneAnim = useRef(new Animated.Value(SOFT_COLLAPSED)).current;

  // Drag gesture — swipe down to collapse numpad
  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 40) collapseNumpad();
      },
    })
  ).current;

  // Live price polling
  const refreshTimer = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);

  async function loadMarket() {
    setLoading(true);
    setErrorMessage(null);
    try {
      setDetail(await fetchCuratedMarketDetail(slug));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load market');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(iv: Interval) {
    if (!detail) return;
    const yesId = detail.clobTokenIds[0];
    const noId = detail.clobTokenIds[1];
    if (!yesId) return;
    setHistoryLoading(true);
    try {
      const results = await Promise.all([
        fetchPriceHistory(yesId, iv),
        noId ? fetchPriceHistory(noId, iv) : Promise.resolve({ history: [] }),
      ]);
      setYesHistory(results[0].history);
      setNoHistory(results[1].history);
    } catch {
      setYesHistory([]);
      setNoHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadOrderbook() {
    if (!detail) return;
    const tokenId = detail.clobTokenIds[0];
    if (!tokenId) return;
    setOrderbookLoading(true);
    try {
      setOrderbook(await fetchOrderbook(tokenId));
    } catch {
      setOrderbook(null);
    } finally {
      setOrderbookLoading(false);
    }
  }

  async function loadPicks() {
    const gammaAddr = poly.tradingAddress ?? poly.polygonAddress;
    if (!gammaAddr) {
      setMarketPositions([]);
      setAllPositions([]);
      setRedeemablePositions([]);
      setClosedPositions([]);
      setOpenOrders([]);
      setActivityItems([]);
      setPendingOpenOrders([]);
      setPicksFreshness({ lastUpdatedAt: null, loading: false, stale: false, error: null });
      return;
    }
    setPicksLoading(true);
    setPicksFreshness((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [marketResult, portfolioResult, ordersResult] = await Promise.allSettled([
        fetchMarketPositions(gammaAddr, slug),
        fetchPortfolio(gammaAddr),
        poly.polygonAddress ? fetchOpenOrders(poly.polygonAddress) : Promise.resolve([]),
      ]);
      const now = Date.now();
      const market = marketResult.status === 'fulfilled' ? marketResult.value : null;
      const portfolio = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;
      const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : null;

      if (market) setMarketPositions(market);
      if (portfolio) {
        setAllPositions(portfolio.positions ?? []);
        setRedeemablePositions(portfolio.redeemablePositions ?? []);
        setClosedPositions(portfolio.closedPositions ?? []);
        setActivityItems(portfolio.activity ?? []);
      }
      if (orders) setOpenOrders(orders);
      setPendingOpenOrders((pending) =>
        prunePendingOpenOrders(pending, orders ?? [], [
          ...(market ?? marketPositions),
          ...(portfolio?.positions ?? allPositions),
          ...(portfolio?.redeemablePositions ?? redeemablePositions),
        ])
      );
      const failed = marketResult.status === 'rejected' || portfolioResult.status === 'rejected' || ordersResult.status === 'rejected';
      setPicksFreshness({
        lastUpdatedAt: now,
        loading: false,
        stale: failed,
        error: failed ? 'Could not refresh' : null,
      });
    } catch {
      setPicksFreshness((prev) => ({ ...prev, loading: false, stale: true, error: 'Could not refresh' }));
    } finally {
      setPicksLoading(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    if (!poly.polygonAddress || cancellingOrderId) return;
    setCancellingOrderId(orderId);
    try {
      const result = await cancelOrder(poly.polygonAddress, orderId);
      if (result.ok) {
        setOpenOrders((prev) => prev.filter((order) => order.id !== orderId));
      } else {
        Alert.alert('Cancel failed', result.error ?? 'Try again in a moment.');
      }
    } catch {
      Alert.alert('Cancel failed', 'Network error');
    } finally {
      setCancellingOrderId(null);
    }
  }

  const liveTokenKey = detail?.clobTokenIds.filter(Boolean).join(',') ?? '';

  useEffect(() => { void loadMarket(); }, [slug]);

  useEffect(() => {
    if (detail) void loadHistory(interval);
  }, [detail, interval]);

  useEffect(() => {
    const tokenIds = liveTokenKey.split(',').filter(Boolean);
    if (tokenIds.length === 0) return;
    let cancelled = false;

    async function refreshPrices() {
      try {
        const prices = await fetchLivePrices(tokenIds);
        if (!cancelled) setLiveTokenPrices((prev) => ({ ...prev, ...prices }));
      } catch { /* silent */ }
    }

    void refreshPrices();
    refreshTimer.current = globalThis.setInterval(() => { void refreshPrices(); }, 5_000);
    return () => {
      cancelled = true;
      if (refreshTimer.current) globalThis.clearInterval(refreshTimer.current);
    };
  }, [liveTokenKey]);

  // Load orderbook when switching to orderbook view
  useEffect(() => {
    if (activeView === 'orderbook' && detail) void loadOrderbook();
  }, [activeView, detail]);

  useEffect(() => {
    if (activeView === 'picks') void loadPicks();
  }, [activeView, slug, poly.polygonAddress, poly.tradingAddress]);

  useEffect(() => {
    let cancelled = false;
    async function loadCashBalance() {
      if (!poly.polygonAddress) {
        setCashBalance(null);
        return;
      }
      const balance = await fetchClobBalance(poly.polygonAddress).catch(() => null);
      if (!cancelled) setCashBalance(balance?.balance ?? null);
    }
    void loadCashBalance();
    return () => { cancelled = true; };
  }, [poly.polygonAddress]);

  // Animate soft zone
  useEffect(() => {
    Animated.timing(softZoneAnim, {
      toValue: numpadOpen ? SOFT_EXPANDED : SOFT_COLLAPSED,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [numpadOpen, softZoneAnim]);

  const yesTokenId = detail?.clobTokenIds[0];
  const noTokenId = detail?.clobTokenIds[1];
  const yesPrice = (yesTokenId ? liveTokenPrices[yesTokenId] : null) ?? (detail?.outcomePrices[0] ?? null);
  const noPrice = (noTokenId ? liveTokenPrices[noTokenId] : null) ?? (detail?.outcomePrices[1] ?? null);
  const visibleOpenOrders = mergeOpenOrders(pendingOpenOrders, openOrders);

  function tapOdd(side: 'yes' | 'no') {
    if (numpadOpen && selectedSide === side) {
      // same tap — collapse
      setNumpadOpen(false);
      setSelectedSide(null);
      return;
    }
    setSelectedSide(side);
    setSelectedQuotePrice(side === 'yes' ? (yesPrice ?? detail?.outcomePrices[0] ?? null) : (noPrice ?? detail?.outcomePrices[1] ?? null));
    setNumpadAmount('50');
    setNumpadOpen(true);
  }

  function collapseNumpad() {
    setNumpadOpen(false);
    setSelectedSide(null);
    setSelectedQuotePrice(null);
  }

  async function submitOrder() {
    if (!detail || !selectedSide || submitting) return;
    const amount = parseFloat(numpadAmount);
    if (!amount || amount <= 0) return;

    // Resolve token ID: yes = clobTokenIds[0], no = clobTokenIds[1]
    const tokenID = selectedSide === 'yes' ? detail.clobTokenIds[0] : detail.clobTokenIds[1];
    if (!tokenID) {
      Alert.alert('Error', 'No token ID for this outcome');
      return;
    }

    // Price: what the user is buying at
    const price = selectedSide === 'yes'
      ? (yesPrice ?? detail.outcomePrices[0])
      : (noPrice ?? detail.outcomePrices[1]);
    if (!price || price <= 0 || price >= 1) {
      Alert.alert('Error', 'Invalid price');
      return;
    }
    const guardrail = getPredictOrderGuardrail({
      amount,
      availableCash: cashBalance,
      selectedPrice: selectedQuotePrice,
      latestPrice: price,
      marketActive: detail.active,
      submitting,
    });
    if (guardrail?.blocking) {
      Alert.alert(guardrail.title, guardrail.message);
      return;
    }

    // Ensure wallet is enabled and EVM signer is derived
    if (!poly.canSignLocally) {
      try {
        await poly.enable();
      } catch (err: any) {
        Alert.alert('Wallet', err.message || 'Failed to enable wallet');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!poly.polygonAddress) throw new Error('Wallet session not ready');

      const size = Math.floor((amount / price) * 100) / 100;
      const polygonAddress = poly.polygonAddress;

      const result = await placeBet({
        polygonAddress,
        tokenID,
        price,
        size,
        side: 'BUY',
        negRisk: !!detail.negRisk,
      });
      if (!result.success) throw new Error(result.error || 'Order failed');

      const pendingOrder = makePendingOpenOrder({
        id: result.orderID,
        slug,
        tokenID,
        price,
        size,
        outcome: selectedSide === 'no' ? 'No' : 'Yes',
      });
      setPendingOpenOrders((prev) => [pendingOrder, ...prev.filter((order) => order.id !== pendingOrder.id)]);
      setCashBalance((prev) => prev === null ? prev : Math.max(prev - amount, 0));
      collapseNumpad();
      setActiveView('picks');
      setPickScope('market');
      void loadPicks();
      void fetchClobBalance(polygonAddress).then((balance) => setCashBalance(balance?.balance ?? null)).catch(() => undefined);
    } catch (err: any) {
      Alert.alert('Order failed', err.message || 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCashOut(position: PortfolioPosition) {
    setCashOutPosition(position);
  }

  async function confirmCashOut(size: number) {
    const position = cashOutPosition;
    if (!position || submitting) return;
    if (!position.asset) {
      Alert.alert('Cash out failed', 'Missing token ID for this position');
      return;
    }

    if (!poly.canSignLocally) {
      try {
        await poly.enable();
      } catch (err: any) {
        Alert.alert('Wallet', err.message || 'Failed to enable wallet');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!poly.polygonAddress) throw new Error('Wallet session not ready');
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
      setActiveView('picks');
      void loadPicks();
      void fetchClobBalance(poly.polygonAddress).then((balance) => setCashBalance(balance?.balance ?? null)).catch(() => undefined);
    } catch (err: any) {
      Alert.alert('Cash out failed', err.message || 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  const chartWidth = screenWidth - 40;
  const chartHeight = 180;
  const amountNum = parseFloat(numpadAmount) || 0;
  const latestSelectedPrice = selectedSide === 'no' ? noPrice : yesPrice;
  const orderGuardrail = selectedSide
    ? getPredictOrderGuardrail({
        amount: amountNum,
        availableCash: cashBalance,
        selectedPrice: selectedQuotePrice,
        latestPrice: latestSelectedPrice,
        marketActive: detail?.active ?? null,
        submitting,
      })
    : null;
  const marketClosed = detail?.active === false;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppTopBar
        left={<AppTopBarIconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />}
        center={(
          <AppTopBarTitle align="left" numberOfLines={2} tone="primary" uppercase={false}>
            {detail?.question ?? 'Loading...'}
          </AppTopBarTitle>
        )}
        right={<AppTopBarCashPill value={truncateUsd(cashBalance)} />}
      />

      {/* ── LOADING / ERROR ── */}
      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={semantic.text.accent} />
          <Text style={styles.stateText}>Loading market...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Market unavailable</Text>
          <Text style={styles.stateText}>{errorMessage}</Text>
          <Pressable onPress={() => void loadMarket()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : detail ? (
        <View style={styles.body}>
          {/* ══ DARK ZONE ══ */}
          <View style={[styles.darkZone, { paddingBottom: SOFT_COLLAPSED }]}>
            <View style={styles.displayRow}>
              <View style={styles.displayTabGroup}>
                <DisplayTab label="Your Picks" active={activeView === 'picks'} onPress={() => setActiveView('picks')} />
                <DisplayTab label="Stats" active={activeView === 'stats'} onPress={() => setActiveView('stats')} />
              </View>
              <View style={styles.displayTabGroup}>
              {activeView === 'chart' && (['5m', '1h', '1d'] as Interval[]).map((iv) => (
                <Pressable
                  key={iv}
                  style={[styles.rangeChip, interval === iv && styles.rangeChipActive]}
                  onPress={() => setInterval(iv)}>
                  <Text style={[styles.rangeChipText, interval === iv && styles.rangeChipTextActive]}>
                    {iv === '5m' ? '5M' : iv === '1h' ? '1H' : '1D'}
                  </Text>
                </Pressable>
              ))}
                <DisplayTab label="Chart" active={activeView === 'chart'} onPress={() => setActiveView('chart')} />
                <DisplayTab label="Book" active={activeView === 'orderbook'} onPress={() => setActiveView('orderbook')} />
              </View>
            </View>

            {/* Chart or Orderbook */}
            <View style={styles.viewContainer}>
              {activeView === 'picks' ? (
                <DetailPicksPanel
                  scope={pickScope}
                  marketSlug={slug}
                  marketTokenIds={detail.clobTokenIds}
                  marketConditionIds={marketPositions.map((position) => position.conditionId)}
                  loading={picksLoading}
                  freshness={{ ...picksFreshness, loading: picksLoading, syncing: pendingOpenOrders.length > 0 }}
                  marketPositions={marketPositions}
                  allPositions={allPositions}
                  redeemablePositions={redeemablePositions}
                  closedPositions={closedPositions}
                  openOrders={visibleOpenOrders}
                  activityItems={activityItems}
                  cancellingOrderId={cancellingOrderId}
                  polygonAddress={poly.polygonAddress}
                  onScopeChange={setPickScope}
                  onCashOut={handleCashOut}
                  onBackMore={(position) => {
                    if (position.slug && position.slug !== slug) {
                      router.push(marketHrefForSlug(position.slug));
                      return;
                    }
                    tapOdd(position.outcome === 'No' ? 'no' : 'yes');
                  }}
                  onCancelOrder={(orderId) => void handleCancelOrder(orderId)}
                  onRedeemed={() => void loadPicks()}
                  onRetry={() => void loadPicks()}
                />
              ) : activeView === 'stats' ? (
                <View style={styles.statsView}>
                  <View style={styles.picksHeading}>
                    <Text style={styles.picksTitle}>Stats</Text>
                    <Text style={styles.picksSubtitle}>Market health</Text>
                  </View>
                  <View style={styles.statsGrid}>
                    <View style={styles.statsCard}><Text style={styles.statsLabel}>Volume</Text><Text style={styles.statsValue}>{formatUsdCompact(detail.volume24h)}</Text></View>
                    <View style={styles.statsCard}><Text style={styles.statsLabel}>Liquidity</Text><Text style={styles.statsValue}>{formatUsdCompact(detail.liquidity)}</Text></View>
                    <View style={styles.statsCard}><Text style={styles.statsLabel}>No chance</Text><Text style={styles.statsValue}>{noPrice !== null ? `${Math.round(noPrice * 100)}%` : '--'}</Text></View>
                    <View style={styles.statsCard}><Text style={styles.statsLabel}>Resolves</Text><Text style={styles.statsValue}>{formatDeadline(detail.endDate, detail.active)}</Text></View>
                  </View>
                </View>
              ) : activeView === 'chart' ? (
                historyLoading ? (
                  <View style={styles.chartSkeleton}>
                    <ActivityIndicator size="small" color={semantic.text.faint} />
                  </View>
                ) : (
                  <MultiLineChart
                    series={[
                      { points: yesHistory, color: semantic.sentiment.negative, label: 'Yes' },
                      { points: noHistory, color: semantic.sentiment.positive, label: 'No' },
                    ]}
                    width={chartWidth}
                    height={chartHeight}
                  />
                )
              ) : (
                <OrderbookView book={orderbook} loading={orderbookLoading} />
              )}
            </View>
          </View>

          {/* ══ SOFT ZONE ══ */}
          <Animated.View style={[styles.softZone, { maxHeight: softZoneAnim }]}>
            {/* Drag handle */}
            <View style={styles.dragHandle} {...dragResponder.panHandlers}>
              <Pressable onPress={collapseNumpad}>
                <View style={styles.dragHandlePill} />
              </Pressable>
            </View>

            {/* Odds format toggle + Binary odds buttons */}
            <View style={styles.oddsSection}>
              <View style={styles.oddsHeader}>
                <Text style={styles.oddsTitle}>{"What's your pick?"}</Text>
                {/*
                <OddsFormatToggle format={format} onFormatChange={setFormat} />
                */}
              </View>
              {marketClosed && (
                <Text style={styles.marketClosedText}>This market is closed and no longer accepting new picks.</Text>
              )}
              <View style={styles.binaryBtns}>
                <Pressable
                  style={[styles.bnBtn, styles.bnBtnYes, selectedSide === 'yes' && styles.bnBtnYesSelected]}
                  disabled={marketClosed}
                  onPress={() => tapOdd('yes')}>
                  <Text style={styles.bnBtnYesPrice}>{yesPrice !== null ? formatOdds(yesPrice) : '--'}</Text>
                  <Text style={styles.bnBtnYesLabel}>Back YES</Text>
                </Pressable>
                <Pressable
                  style={[styles.bnBtn, styles.bnBtnNo, selectedSide === 'no' && styles.bnBtnNoSelected]}
                  disabled={marketClosed}
                  onPress={() => tapOdd('no')}>
                  <Text style={styles.bnBtnNoPrice}>{noPrice !== null ? formatOdds(noPrice) : '--'}</Text>
                  <Text style={styles.bnBtnNoLabel}>Back NO</Text>
                </Pressable>
              </View>
            </View>

            {/* Inline numpad */}
            <InlineNumpad
              visible={numpadOpen}
              side={selectedSide ?? 'yes'}
              pickLabel={selectedSide === 'no' ? 'NO' : 'YES'}
              price={selectedSide === 'no' ? (noPrice ?? 0.5) : (yesPrice ?? 0.5)}
              amount={numpadAmount}
              availableCash={cashBalance}
              onAmountChange={setNumpadAmount}
              onConfirm={() => { void submitOrder(); }}
              submitting={submitting}
              disabled={!poly.isReady && !privy.connected}
              guardrail={orderGuardrail}
            />
          </Animated.View>
        </View>
      ) : null}
      <CashOutConfirmModal
        visible={cashOutPosition !== null}
        position={cashOutPosition}
        submitting={submitting}
        onClose={() => setCashOutPosition(null)}
        onConfirm={confirmCashOut}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },

  // ── States ──
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.lg,
  },
  stateTitle: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  stateText: { color: semantic.text.dim, fontSize: tokens.fontSize.md },
  retryBtn: {
    marginTop: tokens.spacing.xs,
    backgroundColor: semantic.text.accent,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
  },
  retryText: {
    color: semantic.background.screen,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    fontWeight: '700',
  },

  // ── Body ──
  body: { flex: 1, position: 'relative' },

  // ── Dark zone ──
  darkZone: {
    flex: 1,
    paddingHorizontal: 20,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  displayRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
  },
  displayTabGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  displayTab: {
    height: 28,
    borderRadius: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayTabActive: {
    backgroundColor: tokens.colors.surface,
  },
  displayTabText: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  displayTabTextActive: {
    color: semantic.text.primary,
  },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeChipActive: {
    backgroundColor: tokens.colors.surface,
  },
  rangeChipText: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1,
    color: semantic.text.faint,
  },
  rangeChipTextActive: {
    color: semantic.text.primary,
  },
  toggleIcons: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  toggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: tokens.colors.surface,
  },
  viewContainer: {
    flex: 1,
    minHeight: 0,
  },
  chartSkeleton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picksView: {
    flex: 1,
    paddingTop: 10,
  },
  picksHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  picksTitle: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: semantic.text.primary,
    fontWeight: '700',
  },
  picksSubtitle: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  picksEmptyCard: {
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
    borderRadius: 12,
    padding: 14,
  },
  picksEmptyTitle: {
    color: semantic.text.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  picksEmptyText: {
    color: semantic.text.dim,
    fontSize: 10,
    lineHeight: 15,
  },
  statsView: {
    flex: 1,
    paddingTop: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statsCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
    borderRadius: 12,
    padding: 10,
  },
  statsLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  statsValue: {
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '800',
    color: semantic.text.primary,
  },

  // ── Soft zone ──
  softZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.colors.ground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  dragHandle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  dragHandlePill: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: semantic.text.faint,
  },
  separator: {
    height: 1,
    backgroundColor: semantic.predict.rowBorderSoft,
    marginHorizontal: 20,
  },
  // ── Binary odds ──
  oddsSection: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  oddsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  oddsTitle: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  marketClosedText: {
    marginBottom: 8,
    fontFamily: 'monospace',
    fontSize: 8,
    color: tokens.colors.vermillion,
  },
  binaryBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  bnBtn: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bnBtnYes: {
    backgroundColor: semantic.predict.outcomeYesBg,
  },
  bnBtnNo: {
    backgroundColor: semantic.predict.outcomeNoBg,
  },
  bnBtnYesSelected: {
    backgroundColor: 'rgba(74,140,111,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.35)',
  },
  bnBtnNoSelected: {
    backgroundColor: 'rgba(217,83,79,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.35)',
  },
  bnBtnYesPrice: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: semantic.sentiment.positive,
    lineHeight: 22,
  },
  bnBtnYesLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(74,140,111,0.55)',
  },
  bnBtnNoPrice: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: semantic.sentiment.negative,
    lineHeight: 22,
  },
  bnBtnNoLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(217,83,79,0.45)',
  },
});
