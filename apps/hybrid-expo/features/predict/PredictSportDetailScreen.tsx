import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
import { cancelOrder, fetchClobBalance, fetchMarketPositions, fetchOpenOrders, fetchOrderbook, fetchPortfolio, fetchPriceHistory, fetchSportMarketDetail, placeBet } from '@/features/predict/predict.api';
import type { OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import type { PredictSport, PricePoint, SportMarketDetail, SportOutcomeDetail, Orderbook } from '@/features/predict/predict.types';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { semantic, tokens } from '@/theme';
import { formatUsdCompact } from '@/lib/format';
import { useOddsFormat } from '@/hooks/useOddsFormat';
import { OddsFormatToggle } from '@/features/predict/components/OddsFormatToggle';
import { MultiLineChart } from '@/features/predict/components/MultiLineChart';
import { OrderbookView } from '@/features/predict/components/OrderbookView';
import { InlineNumpad } from '@/features/predict/components/InlineNumpad';
import { DetailPicksPanel } from '@/features/predict/components/DetailPicksPanel';
import { CashOutConfirmModal } from '@/features/predict/components/CashOutConfirmModal';
import { formatPredictTitle } from '@/features/predict/formatPredictTitle';
import { truncateUsd } from '@/features/predict/formatPredictMoney';

interface PredictSportDetailScreenProps {
  sport: PredictSport;
  slug: string;
}

type Interval = '5m' | '1h' | '1d';
type ActiveView = 'picks' | 'stats' | 'chart' | 'orderbook';

const SOFT_COLLAPSED = 280; // handle + stats + ~3 selection rows
const SOFT_EXPANDED = 720;

function outcomeColor(outcome: SportOutcomeDetail, isLead: boolean): string {
  if (outcome.label.toLowerCase().includes('draw')) return semantic.text.accent;
  return isLead ? semantic.sentiment.positive : semantic.sentiment.negative;
}

function sportOutcomeLabel(outcome: SportOutcomeDetail): string {
  return outcome.label.toLowerCase().includes('draw') ? 'Draw' : outcome.label;
}

function outcomeTone(outcome: SportOutcomeDetail, index: number): 'lead' | 'draw' | 'trail' {
  if (outcome.label.toLowerCase().includes('draw')) return 'draw';
  return index === 0 ? 'lead' : 'trail';
}

function sortSportOutcomes(outcomes: SportOutcomeDetail[]): SportOutcomeDetail[] {
  const list = [...outcomes];
  const byPriceDesc = (a: SportOutcomeDetail, b: SportOutcomeDetail) => (b.price ?? -1) - (a.price ?? -1);
  const draw = list.find((outcome) => outcome.label.toLowerCase().includes('draw'));

  if (list.length === 3 && draw) {
    const teams = list.filter((outcome) => outcome !== draw).sort(byPriceDesc);
    if (teams.length === 2) return [teams[0], draw, teams[1]];
  }

  return list.sort((a, b) => {
    const aIsDraw = a.label.toLowerCase().includes('draw');
    const bIsDraw = b.label.toLowerCase().includes('draw');
    if (aIsDraw && !bIsDraw) return 1;
    if (!aIsDraw && bIsDraw) return -1;
    return byPriceDesc(a, b);
  });
}

function formatPositionOutcome(outcome: string | null | undefined): string {
  if (!outcome) return '';
  return outcome.toLowerCase().includes('draw') ? 'Draw' : outcome;
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

export function PredictSportDetailScreen({ sport, slug }: PredictSportDetailScreenProps) {
  const router = useRouter();
  const poly = usePolymarketWallet();
  const { format, setFormat, formatOdds } = useOddsFormat();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Market data
  const [detail, setDetail] = useState<SportMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Chart data
  const [interval, setInterval] = useState<Interval>('1h');
  const [seriesData, setSeriesData] = useState<PricePoint[][]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('picks');
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [orderbookLoading, setOrderbookLoading] = useState(false);
  const [obOutcomeIdx, setObOutcomeIdx] = useState(0);

  // Numpad state
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [selectedOutcomeIdx, setSelectedOutcomeIdx] = useState<number | null>(null);
  const [numpadAmount, setNumpadAmount] = useState('50');
  const [submitting, setSubmitting] = useState(false);
  const [pickScope, setPickScope] = useState<'market' | 'all'>('market');
  const [marketPositions, setMarketPositions] = useState<PortfolioPosition[]>([]);
  const [allPositions, setAllPositions] = useState<PortfolioPosition[]>([]);
  const [redeemablePositions, setRedeemablePositions] = useState<PortfolioPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
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

  // Live badge pulse
  const livePulse = useRef(new Animated.Value(1)).current;

  const sortedOutcomes = detail ? sortSportOutcomes(detail.outcomes) : [];
  const leadPrice = sortedOutcomes[0]?.price ?? null;

  async function loadDetail() {
    setLoading(true);
    setErrorMessage(null);
    try {
      setDetail(await fetchSportMarketDetail(sport, slug));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load fixture');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(outcomes: SportOutcomeDetail[], iv: Interval) {
    setHistoryLoading(true);
    try {
      const results = await Promise.all(
        outcomes.map((o) => {
          const tokenId = o.clobTokenIds[0];
          if (!tokenId) return Promise.resolve({ history: [] });
          return fetchPriceHistory(tokenId, iv);
        })
      );
      setSeriesData(results.map((r) => r.history));
    } catch {
      setSeriesData([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadOrderbook(outcomeIdx: number) {
    const tokenId = sortedOutcomes[outcomeIdx]?.clobTokenIds[0];
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
      setOpenOrders([]);
      return;
    }
    setPicksLoading(true);
    try {
      const [market, portfolio, orders] = await Promise.all([
        fetchMarketPositions(gammaAddr, slug).catch(() => []),
        fetchPortfolio(gammaAddr).catch(() => null),
        poly.polygonAddress ? fetchOpenOrders(poly.polygonAddress).catch(() => []) : Promise.resolve([]),
      ]);
      setMarketPositions(market);
      setAllPositions(portfolio?.positions ?? []);
      setRedeemablePositions(portfolio?.redeemablePositions ?? []);
      setOpenOrders(orders);
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
      }
    } finally {
      setCancellingOrderId(null);
    }
  }

  useEffect(() => { void loadDetail(); }, [slug, sport]);

  useEffect(() => {
    if (sortedOutcomes.length > 0) void loadHistory(sortedOutcomes, interval);
  }, [detail, interval]);

  useEffect(() => {
    if (activeView === 'orderbook' && sortedOutcomes.length > 0) void loadOrderbook(obOutcomeIdx);
  }, [activeView, detail, obOutcomeIdx]);

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

  // LIVE pulse
  useEffect(() => {
    if (detail?.status !== 'live') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [detail?.status, livePulse]);

  // Animate soft zone
  useEffect(() => {
    Animated.timing(softZoneAnim, {
      toValue: numpadOpen ? SOFT_EXPANDED : SOFT_COLLAPSED,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [numpadOpen, softZoneAnim]);

  // Build chart series
  const chartSeries = sortedOutcomes.map((outcome, i) => {
    const isLead = leadPrice !== null && outcome.price === leadPrice;
    return {
      points: seriesData[i] ?? [],
      color: outcomeColor(outcome, isLead),
      label: sportOutcomeLabel(outcome),
    };
  });

  function tapOdd(outcomeIdx: number) {
    if (numpadOpen && selectedOutcomeIdx === outcomeIdx) {
      setNumpadOpen(false);
      setSelectedOutcomeIdx(null);
      return;
    }
    setSelectedOutcomeIdx(outcomeIdx);
    setNumpadAmount('50');
    setNumpadOpen(true);
  }

  function backMorePosition(position: PortfolioPosition) {
    if (position.slug && position.slug !== slug) {
      router.push(marketHrefForSlug(position.slug));
      return;
    }
    const byOutcome = sortedOutcomes.findIndex((outcome) =>
      sportOutcomeLabel(outcome).toLowerCase() === formatPositionOutcome(position.outcome).toLowerCase()
    );
    if (byOutcome >= 0) {
      tapOdd(byOutcome);
      return;
    }
    const byIndex = sortedOutcomes.findIndex((outcome) => outcome.conditionId === position.conditionId);
    tapOdd(byIndex >= 0 ? byIndex : 0);
  }

  function collapseNumpad() {
    setNumpadOpen(false);
    setSelectedOutcomeIdx(null);
  }

  async function submitOrder() {
    if (!detail || selectedOutcomeIdx === null || submitting) return;
    const amount = parseFloat(numpadAmount);
    if (!amount || amount <= 0) return;
    if (cashBalance !== null && amount > cashBalance + 0.000001) return;

    const outcome = sortedOutcomes[selectedOutcomeIdx];
    if (!outcome) return;

    const tokenID = outcome.clobTokenIds[0];
    if (!tokenID) {
      Alert.alert('Error', 'No token ID for this outcome');
      return;
    }

    const price = outcome.price;
    if (!price || price <= 0 || price >= 1) {
      Alert.alert('Error', 'Invalid price');
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

  const numpadPrice = (() => {
    if (selectedOutcomeIdx === null) return 0.5;
    const outcome = sortedOutcomes[selectedOutcomeIdx];
    if (!outcome?.price) return 0.5;
    return outcome.price;
  })();
  const selectedOutcome = selectedOutcomeIdx !== null ? sortedOutcomes[selectedOutcomeIdx] : null;
  const selectedOutcomeLabel = selectedOutcome ? sportOutcomeLabel(selectedOutcome) : undefined;
  const displayTitle = detail
    ? formatPredictTitle({
        title: detail.title,
        slug: detail.slug,
        outcomes: detail.outcomes.map((outcome) => outcome.label),
      })
    : 'Loading...';

  const chartWidth = screenWidth - 40;
  const chartHeight = 180;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={16} color={semantic.text.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {detail?.status === 'live' && (
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, { opacity: livePulse }]} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          <View style={styles.cashPill}>
            <Text style={styles.cashPillLabel}>Cash</Text>
            <Text style={styles.cashPillValue}>{truncateUsd(cashBalance)}</Text>
          </View>
        </View>
      </View>

      {/* ── LOADING / ERROR ── */}
      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={semantic.text.accent} />
          <Text style={styles.stateText}>Loading fixture...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Fixture unavailable</Text>
          <Text style={styles.stateText}>{errorMessage}</Text>
          <Pressable onPress={() => void loadDetail()} style={styles.retryBtn}>
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
                  loading={picksLoading}
                  marketPositions={marketPositions}
                  allPositions={allPositions}
                  redeemablePositions={redeemablePositions}
                  openOrders={openOrders}
                  cancellingOrderId={cancellingOrderId}
                  polygonAddress={poly.polygonAddress}
                  onScopeChange={setPickScope}
                  onCashOut={handleCashOut}
                  onBackMore={backMorePosition}
                  onCancelOrder={(orderId) => void handleCancelOrder(orderId)}
                  onRedeemed={() => void loadPicks()}
                />
              ) : activeView === 'stats' ? (
                <View style={styles.statsView}>
                  <View style={styles.picksHeading}>
                    <Text style={styles.picksTitle}>Stats</Text>
                    <Text style={styles.picksSubtitle}>Live market</Text>
                  </View>
                  <View style={styles.statsGrid}>
                    <View style={styles.statsCard}><Text style={styles.statsLabel}>Volume</Text><Text style={styles.statsValue}>{formatUsdCompact(detail.volume24h)}</Text></View>
                    <View style={styles.statsCard}><Text style={styles.statsLabel}>Liquidity</Text><Text style={styles.statsValue}>{formatUsdCompact(detail.liquidity)}</Text></View>
                    <View style={styles.statsCard}><Text style={styles.statsLabel}>Leader</Text><Text style={styles.statsValue}>{sortedOutcomes[0] ? sportOutcomeLabel(sortedOutcomes[0]) : '--'}</Text></View>
                    <View style={styles.statsCard}><Text style={styles.statsLabel}>Chance</Text><Text style={styles.statsValue}>{leadPrice !== null ? `${Math.round(leadPrice * 100)}%` : '--'}</Text></View>
                  </View>
                </View>
              ) : activeView === 'chart' ? (
                historyLoading ? (
                  <View style={styles.chartSkeleton}>
                    <ActivityIndicator size="small" color={semantic.text.faint} />
                  </View>
                ) : (
                  <MultiLineChart
                    series={chartSeries}
                    width={chartWidth}
                    height={chartHeight}
                  />
                )
              ) : (
                <View style={styles.obWrap}>
                  {/* Outcome tabs for orderbook */}
                  <View style={styles.obOutcomeTabs}>
                    {sortedOutcomes.map((o, i) => {
                      const label = sportOutcomeLabel(o);
                      return (
                        <Pressable
                          key={`${o.conditionId ?? o.label}-${i}`}
                          style={[styles.obOutcomeTab, obOutcomeIdx === i && styles.obOutcomeTabActive]}
                          onPress={() => setObOutcomeIdx(i)}>
                          <Text style={[styles.obOutcomeTabText, obOutcomeIdx === i && styles.obOutcomeTabTextActive]} numberOfLines={1}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <OrderbookView book={orderbook} loading={orderbookLoading} />
                </View>
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

            {/* Selection rows */}
            <View style={styles.oddsSection}>
              <View style={styles.selHeader}>
                <Text style={styles.selHeaderLabel}>{"What's your pick?"}</Text>
                {/*
                <OddsFormatToggle format={format} onFormatChange={setFormat} />
                */}
              </View>
              {sortedOutcomes.map((outcome, i) => {
                const label = sportOutcomeLabel(outcome);
                const isSelected = selectedOutcomeIdx === i;
                const tone = outcomeTone(outcome, i);
                return (
                  <View key={`${outcome.conditionId ?? outcome.label}-${i}`} style={[styles.selRow, i > 0 && styles.selRowBorder]}>
                    <View style={styles.selInfo}>
                      <Text style={styles.selName} numberOfLines={1}>{label}</Text>
                      <Text style={styles.selVol}>{formatUsdCompact(outcome.volume24h)} vol</Text>
                    </View>
                    <View style={styles.selBtns}>
                      <Pressable
                        style={[
                          styles.selBtn,
                          tone === 'lead' ? styles.selBtnLead : tone === 'draw' ? styles.selBtnDraw : styles.selBtnTrail,
                          isSelected && (tone === 'lead' ? styles.selBtnLeadSelected : tone === 'draw' ? styles.selBtnDrawSelected : styles.selBtnTrailSelected),
                        ]}
                        onPress={() => tapOdd(i)}>
                        <Text style={[
                          styles.selBtnPct,
                          tone === 'lead' ? styles.selBtnPctLead : tone === 'draw' ? styles.selBtnPctDraw : styles.selBtnPctTrail,
                        ]}>
                          {outcome.price !== null ? formatOdds(outcome.price) : '--'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Inline numpad */}
            <InlineNumpad
              visible={numpadOpen}
              side="yes"
              pickLabel={selectedOutcomeLabel}
              price={numpadPrice}
              amount={numpadAmount}
              availableCash={cashBalance}
              onAmountChange={setNumpadAmount}
              onConfirm={() => { void submitOrder(); }}
              submitting={submitting}
              disabled={!poly.isReady}
            />
          </Animated.View>
        </View>
      ) : null}
      <CashOutConfirmModal
        visible={cashOutPosition !== null}
        position={cashOutPosition}
        onClose={() => setCashOutPosition(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },

  // ── Header ──
  headerBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    flexShrink: 0,
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    color: semantic.text.primary,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: semantic.sentiment.negative,
  },
  liveText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.sentiment.negative,
  },
  cashPill: {
    minHeight: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,197,71,0.25)',
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  cashPillLabel: {
    fontFamily: 'monospace',
    fontSize: 6,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  cashPillValue: {
    fontFamily: 'monospace',
    fontSize: 9.5,
    fontWeight: '800',
    color: semantic.text.primary,
  },

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
  rangeChipActive: { backgroundColor: tokens.colors.surface },
  rangeChipText: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1,
    color: semantic.text.faint,
  },
  rangeChipTextActive: { color: semantic.text.primary },
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
  toggleBtnActive: { backgroundColor: tokens.colors.surface },
  viewContainer: { flex: 1, minHeight: 0 },
  chartSkeleton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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

  // ── Orderbook wrapper ──
  obWrap: { flex: 1 },
  obOutcomeTabs: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 6,
  },
  obOutcomeTab: {
    paddingVertical: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  obOutcomeTabActive: {
    borderBottomColor: semantic.text.accent,
  },
  obOutcomeTabText: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.5,
    color: semantic.text.faint,
  },
  obOutcomeTabTextActive: { color: semantic.text.dim },

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
  // ── Selection rows ──
  oddsSection: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  selHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 2,
  },
  selHeaderLabel: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  selRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  selRowBorder: {
    borderTopWidth: 1,
    borderTopColor: semantic.predict.rowBorderSoft,
  },
  selInfo: { flex: 1, minWidth: 0 },
  selName: {
    fontSize: 12,
    fontWeight: '600',
    color: semantic.text.primary,
  },
  selVol: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.dim,
    marginTop: 1,
  },
  selBtns: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  selBtn: {
    width: 92,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selBtnLead: {
    backgroundColor: semantic.predict.outcomeYesBg,
  },
  selBtnDraw: {
    backgroundColor: semantic.predict.outcomeDrawBg,
  },
  selBtnTrail: {
    backgroundColor: semantic.predict.outcomeNoBg,
  },
  selBtnLeadSelected: {
    backgroundColor: 'rgba(74,140,111,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.35)',
  },
  selBtnDrawSelected: {
    backgroundColor: 'rgba(199,183,112,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(199,183,112,0.35)',
  },
  selBtnTrailSelected: {
    backgroundColor: 'rgba(217,83,79,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.35)',
  },
  selBtnPct: {
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  selBtnPctLead: {
    color: semantic.sentiment.positive,
  },
  selBtnPctDraw: {
    color: semantic.text.accent,
  },
  selBtnPctTrail: {
    color: semantic.sentiment.negative,
  },
});
