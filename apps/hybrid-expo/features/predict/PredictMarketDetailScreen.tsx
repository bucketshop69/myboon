import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop, Circle } from 'react-native-svg';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { fetchCuratedMarketDetail, fetchMarketPrice, fetchMarketPositions, fetchPriceHistory, fetchClobBalance, fetchOpenOrders, cancelOrder, placeBet } from '@/features/predict/predict.api';
import type { OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import type { GeopoliticsMarketDetail, LivePrice, PricePoint } from '@/features/predict/predict.types';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { V2_CONTRACTS } from '@/hooks/useEvmSigner';
import { semantic, tokens } from '@/theme';

interface PredictMarketDetailScreenProps {
  slug: string;
}

type Interval = '1h' | '1d';
type Tab = 'position' | 'stats' | 'rules' | 'feed';

function formatUsdCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDeadline(endDate: string | null, active: boolean | null): string {
  if (!endDate) return active === false ? 'Closed' : 'Open';
  const time = Date.parse(endDate);
  if (Number.isNaN(time)) return active === false ? 'Closed' : 'Open';
  const date = new Date(time);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${active === false ? 'Ended' : 'Ends'} ${month} ${day}`;
}

function formatSecondsAgo(isoStr: string): string {
  const diff = Math.floor((Date.now() - Date.parse(isoStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function buildSparkPath(points: PricePoint[], w: number, h: number): { linePath: string; areaPath: string } | null {
  if (points.length < 2) return null;
  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const rangeT = maxT - minT || 1;
  const prices = points.map((p) => p.p);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const rangeP = maxP - minP || 0.01;
  const pad = 4;

  const coords = points.map((pt) => {
    const x = ((pt.t - minT) / rangeT) * (w - pad * 2) + pad;
    const y = h - pad - ((pt.p - minP) / rangeP) * (h - pad * 2);
    return { x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${h} L${coords[0].x.toFixed(1)},${h} Z`;
  return { linePath, areaPath };
}

function Sparkline({ points, width, height }: { points: PricePoint[]; width: number; height: number }) {
  const paths = buildSparkPath(points, width, height);
  if (!paths) return <View style={{ width, height, backgroundColor: semantic.background.surfaceRaised, borderRadius: 6 }} />;

  const last = points[points.length - 1];
  const first = points[0];
  const isUp = last.p >= first.p;
  const color = isUp ? semantic.sentiment.positive : semantic.sentiment.negative;
  const gradId = isUp ? 'sgUp' : 'sgDn';

  const lastCoord = (() => {
    const rangeT = (points[points.length - 1].t - points[0].t) || 1;
    const prices = points.map((p) => p.p);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const rangeP = maxP - minP || 0.01;
    const pad = 4;
    const x = ((last.t - points[0].t) / rangeT) * (width - pad * 2) + pad;
    const y = height - pad - ((last.p - minP) / rangeP) * (height - pad * 2);
    return { x, y };
  })();

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={paths.areaPath} fill={`url(#${gradId})`} />
      <Path d={paths.linePath} stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Circle cx={lastCoord.x} cy={lastCoord.y} r={3} fill={color} />
    </Svg>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'position', label: 'Position' },
  { key: 'stats', label: 'Stats' },
  { key: 'rules', label: 'Rules' },
  { key: 'feed', label: 'Feed' },
];

export function PredictMarketDetailScreen({ slug }: PredictMarketDetailScreenProps) {
  const router = useRouter();
  const poly = usePolymarketWallet();
  const [detail, setDetail] = useState<GeopoliticsMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>('1h');
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [livePrice, setLivePrice] = useState<LivePrice | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('position');

  // Bet slip state
  const [betSlipVisible, setBetSlipVisible] = useState(false);
  const [betSlipSide, setBetSlipSide] = useState<'yes' | 'no'>('yes');
  const [betSlipLabel, setBetSlipLabel] = useState('');
  const [betSlipPrice, setBetSlipPrice] = useState(0.5);
  const [betSlipAmount, setBetSlipAmount] = useState(50);

  // Order submission state
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<'success' | 'error' | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // CLOB balance for bet slip
  const [clobBalance, setClobBalance] = useState<number | null>(null);

  // Market positions + open orders for current user
  const [marketPositions, setMarketPositions] = useState<PortfolioPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);

  // Sell mode state
  const [betSlipMode, setBetSlipMode] = useState<'buy' | 'sell'>('buy');

  const refreshTimer = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);

  async function loadMarket() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await fetchCuratedMarketDetail(slug);
      setDetail(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load market');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(iv: Interval) {
    setHistoryLoading(true);
    try {
      const result = await fetchPriceHistory(slug, iv);
      setHistory(result.history);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshPrice() {
    try {
      const price = await fetchMarketPrice(slug);
      setLivePrice(price);
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (!detail) return;
    void loadHistory(interval);
  }, [detail, interval]);

  useEffect(() => {
    void refreshPrice();
    refreshTimer.current = globalThis.setInterval(() => { void refreshPrice(); }, 30_000);
    return () => {
      if (refreshTimer.current) globalThis.clearInterval(refreshTimer.current);
    };
  }, [slug]);

  useEffect(() => { void loadMarket(); }, [slug]);

  // Fetch user's orders + positions for this market
  const loadOrdersAndPositions = useCallback(() => {
    if (!poly.polygonAddress) return;
    const gammaAddr = poly.safeAddress ?? poly.polygonAddress;
    fetchOpenOrders(poly.polygonAddress).then(setOpenOrders).catch(() => setOpenOrders([]));
    fetchMarketPositions(gammaAddr, slug).then(setMarketPositions).catch(() => setMarketPositions([]));
  }, [poly.polygonAddress, poly.safeAddress, slug]);

  useEffect(() => {
    if (poly.polygonAddress && detail) loadOrdersAndPositions();
  }, [poly.polygonAddress, detail, loadOrdersAndPositions]);

  const yesPrice = livePrice?.yesPrice ?? (detail?.outcomePrices[0] ?? null);
  const noPrice  = livePrice?.noPrice  ?? (detail?.outcomePrices[1] ?? null);
  const yesPct   = yesPrice !== null ? Math.round(yesPrice * 100) : null;
  const noPct    = noPrice  !== null ? Math.round(noPrice * 100)  : null;

  const isUp = history.length >= 2 ? history[history.length - 1].p >= history[0].p : true;
  const changePct = history.length >= 2
    ? ((history[history.length - 1].p - history[0].p) / (history[0].p || 0.01)) * 100
    : null;

  const openBetSlip = useCallback((side: 'yes' | 'no') => {
    const price = side === 'yes' ? (yesPrice ?? 0.5) : (noPrice ?? 0.5);
    setBetSlipSide(side);
    setBetSlipLabel(side === 'yes' ? 'YES' : 'NO');
    setBetSlipPrice(price);
    setBetSlipAmount(0);
    setBetSlipMode('buy');
    setOrderResult(null);
    setOrderError(null);
    setBetSlipVisible(true);

    // Fetch latest balance — null means 401 (session expired)
    if (poly.polygonAddress) {
      fetchClobBalance(poly.polygonAddress).then((b) => {
        if (b) {
          setClobBalance(b.balance);
        } else {
          poly.disable();
        }
      });
    }
  }, [yesPrice, noPrice, poly.polygonAddress]);

  async function submitOrder() {
    if (!detail || !poly.polygonAddress) return;

    if (betSlipAmount <= 0) {
      setOrderResult('error');
      setOrderError('Enter an amount');
      return;
    }

    if (clobBalance !== null && betSlipAmount > clobBalance) {
      setOrderResult('error');
      setOrderError(`Insufficient balance ($${clobBalance.toFixed(2)} available)`);
      return;
    }

    // Yes = clobTokenIds[0], No = clobTokenIds[1]
    const tokenID = betSlipSide === 'yes' ? detail.clobTokenIds[0] : detail.clobTokenIds[1];
    if (!tokenID) {
      setOrderResult('error');
      setOrderError('Market token not available');
      return;
    }

    setOrderLoading(true);
    setOrderResult(null);
    setOrderError(null);

    try {
      // Local signing: phone signs EIP-712, server just proxies
      const exchangeAddress = detail?.negRisk
        ? V2_CONTRACTS.NEG_RISK_CTF_EXCHANGE
        : V2_CONTRACTS.CTF_EXCHANGE;
      const orderSide = betSlipMode === 'sell' ? 'SELL' : 'BUY';
      const size = Math.floor((betSlipAmount / betSlipPrice) * 100) / 100;

      let signedOrder: unknown = undefined;
      if (poly.canSignLocally) {
        console.log('[order] Signing locally:', { tokenID, price: betSlipPrice, size, side: orderSide, exchangeAddress });
        signedOrder = await poly.signOrder({
          tokenID,
          price: betSlipPrice,
          size,
          side: orderSide,
          exchangeAddress,
        });
        console.log('[order] Signed locally, posting to server');
      }

      const result = await placeBet({
        polygonAddress: poly.polygonAddress,
        tokenID,
        price: betSlipPrice,
        amount: betSlipAmount,
        side: orderSide,
        signedOrder,
      });

      if (result.success) {
        setOrderResult('success');
        // Refresh orders, positions, balance
        loadOrdersAndPositions();
        if (poly.polygonAddress) {
          fetchClobBalance(poly.polygonAddress).then((b) => { if (b) setClobBalance(b.balance); });
        }
      } else {
        // Session expired — clear stale state so wallet connect button appears
        if (result.error?.includes('No active session')) {
          poly.disable();
          setOrderResult('error');
          setOrderError('Session expired — connect wallet to continue');
          return;
        }
        setOrderResult('error');
        setOrderError(result.error ?? 'Order failed');
      }
    } catch (err) {
      console.log('[order] Exception:', err);
      setOrderResult('error');
      setOrderError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setOrderLoading(false);
    }
  }

  const payout = betSlipPrice > 0 ? betSlipAmount / betSlipPrice : 0;

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── HEADER BAR ── */}
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={16} color={semantic.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {detail?.question ?? 'Loading...'}
        </Text>
        <Pressable onPress={() => router.push('/predict-profile')} style={styles.avatarRing}>
          <View style={styles.avatarInner} />
        </Pressable>
      </View>

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

          {/* ── TOP ZONE: SPARKLINE CARD ── */}
          <View style={styles.topZone}>
            <View style={styles.sparkCard}>
              <View style={styles.sparkTopRow}>
                <View>
                  <Text style={[styles.bigPrice, { color: isUp ? semantic.sentiment.positive : semantic.sentiment.negative }]}>
                    {yesPct !== null ? `${yesPct}%` : '--'}
                  </Text>
                  {changePct !== null ? (
                    <Text style={[styles.changeText, { color: isUp ? semantic.sentiment.positive : semantic.sentiment.negative }]}>
                      {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{changePct.toFixed(1)}%
                    </Text>
                  ) : null}
                </View>
                <View style={styles.sparkRightCol}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>
                      {livePrice ? `updated ${formatSecondsAgo(livePrice.fetchedAt)}` : 'loading...'}
                    </Text>
                  </View>
                  <View style={styles.intervalRow}>
                    {(['1h', '1d'] as Interval[]).map((iv) => (
                      <Pressable
                        key={iv}
                        onPress={() => setInterval(iv)}
                        style={[styles.intervalChip, interval === iv && styles.intervalChipActive]}>
                        <Text style={[styles.intervalText, interval === iv && styles.intervalTextActive]}>
                          {iv === '1h' ? '1D' : '1W'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.chartArea}>
                {historyLoading ? (
                  <View style={styles.chartSkeleton} />
                ) : history.length >= 2 ? (
                  <Sparkline points={history} width={315} height={64} />
                ) : (
                  <View style={[styles.chartSkeleton, { opacity: 0.4 }]} />
                )}
              </View>
            </View>
          </View>

          {/* ── MID ZONE: TABS ── */}
          <View style={styles.midZone}>
            {/* Tab bar */}
            <View style={styles.tabBar}>
              {TABS.map((tab) => (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tabChip, activeTab === tab.key && styles.tabChipActive]}>
                  <Text style={[styles.tabChipText, activeTab === tab.key && styles.tabChipTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Tab content */}
            <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabContentInner}>

              {/* POSITION TAB */}
              {activeTab === 'position' ? (
                <View style={{ gap: 12 }}>
                  {/* Open Orders */}
                  {openOrders.length > 0 && (
                    <View>
                      <Text style={styles.posSecTitle}>Open Orders</Text>
                      {openOrders.map((o) => {
                        const sizeNum = parseFloat(o.original_size) || 0;
                        const matched = parseFloat(o.size_matched) || 0;
                        const priceNum = parseFloat(o.price) || 0;
                        const cost = sizeNum * priceNum;
                        const fillPct = sizeNum > 0 ? Math.round((matched / sizeNum) * 100) : 0;
                        return (
                          <View key={o.id} style={styles.positionCard}>
                            <View style={styles.positionHeader}>
                              <View style={[styles.posSideBadge, o.side === 'BUY' ? styles.posSideBadgeYes : styles.posSideBadgeNo]}>
                                <Text style={[styles.posSideBadgeText, { color: o.side === 'BUY' ? semantic.sentiment.positive : semantic.sentiment.negative }]}>
                                  {o.side}
                                </Text>
                              </View>
                              <Text style={styles.orderOutcomeText} numberOfLines={1}>{o.outcome || '--'}</Text>
                              <Pressable
                                onPress={async () => {
                                  if (!poly.polygonAddress) return;
                                  await cancelOrder(poly.polygonAddress, o.id);
                                  loadOrdersAndPositions();
                                }}
                                style={styles.cancelBtn}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                              </Pressable>
                            </View>
                            <View style={styles.positionStats}>
                              <View style={styles.positionStat}>
                                <Text style={styles.posStatLabel}>Price</Text>
                                <Text style={styles.posStatVal}>{Math.round(priceNum * 100)}¢</Text>
                              </View>
                              <View style={styles.positionStat}>
                                <Text style={styles.posStatLabel}>Shares</Text>
                                <Text style={styles.posStatVal}>{sizeNum.toFixed(2)}</Text>
                              </View>
                              <View style={styles.positionStat}>
                                <Text style={styles.posStatLabel}>Cost</Text>
                                <Text style={styles.posStatVal}>${cost.toFixed(2)}</Text>
                              </View>
                              <View style={styles.positionStat}>
                                <Text style={styles.posStatLabel}>Filled</Text>
                                <Text style={styles.posStatVal}>{fillPct}%</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Positions */}
                  {marketPositions.length > 0 && (
                    <View>
                      <Text style={styles.posSecTitle}>Positions</Text>
                      {marketPositions.map((pos, i) => {
                        const pnl = pos.cashPnl ?? 0;
                        const isPositive = pnl >= 0;
                        return (
                          <View key={`${pos.conditionId}-${i}`} style={styles.positionCard}>
                            <View style={styles.positionHeader}>
                              <View style={[styles.posSideBadge, pos.outcome === 'No' ? styles.posSideBadgeNo : styles.posSideBadgeYes]}>
                                <Text style={[styles.posSideBadgeText, { color: pos.outcome === 'No' ? semantic.sentiment.negative : semantic.sentiment.positive }]}>
                                  {pos.outcome?.toUpperCase() ?? 'YES'}
                                </Text>
                              </View>
                              <Text style={[styles.positionPnl, { color: isPositive ? semantic.sentiment.positive : semantic.sentiment.negative }]}>
                                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                              </Text>
                              <Pressable
                                onPress={() => {
                                  const side = pos.outcome === 'No' ? 'no' : 'yes';
                                  const price = side === 'yes' ? (yesPrice ?? 0.5) : (noPrice ?? 0.5);
                                  setBetSlipSide(side);
                                  setBetSlipLabel(side === 'yes' ? 'YES' : 'NO');
                                  setBetSlipPrice(price);
                                  setBetSlipAmount(0);
                                  setBetSlipMode('sell');
                                  setOrderResult(null);
                                  setOrderError(null);
                                  setBetSlipVisible(true);
                                  if (poly.polygonAddress) {
                                    fetchClobBalance(poly.polygonAddress).then((b) => {
                                      if (b) setClobBalance(b.balance);
                                    });
                                  }
                                }}
                                style={styles.sellBtn}>
                                <Text style={styles.sellBtnText}>Sell</Text>
                              </Pressable>
                            </View>
                            <View style={styles.positionStats}>
                              <View style={styles.positionStat}>
                                <Text style={styles.posStatLabel}>Shares</Text>
                                <Text style={styles.posStatVal}>{pos.size?.toFixed(1) ?? '--'}</Text>
                              </View>
                              <View style={styles.positionStat}>
                                <Text style={styles.posStatLabel}>Avg</Text>
                                <Text style={styles.posStatVal}>{pos.avgPrice?.toFixed(2) ?? '--'}¢</Text>
                              </View>
                              <View style={styles.positionStat}>
                                <Text style={styles.posStatLabel}>Current</Text>
                                <Text style={styles.posStatVal}>{pos.curPrice?.toFixed(2) ?? '--'}¢</Text>
                              </View>
                              <View style={styles.positionStat}>
                                <Text style={styles.posStatLabel}>Value</Text>
                                <Text style={styles.posStatVal}>${pos.currentValue?.toFixed(2) ?? '--'}</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Empty state */}
                  {openOrders.length === 0 && marketPositions.length === 0 && (
                    <View style={styles.emptyState}>
                      <MaterialIcons name="show-chart" size={32} color={semantic.text.faint} />
                      <Text style={styles.emptyTitle}>No positions yet</Text>
                      <Text style={styles.emptyBody}>Trade below to open a position</Text>
                    </View>
                  )}
                </View>
              ) : null}

              {/* STATS TAB */}
              {activeTab === 'stats' ? (
                <View style={styles.tabSection}>
                  {/* Market sentiment bar */}
                  <View style={styles.statsCard}>
                    <Text style={styles.cardLabel}>Market Sentiment</Text>
                    <View style={styles.smartMoneyRow}>
                      <Text style={styles.smYesLabel}>YES</Text>
                      <View style={styles.smTrack}>
                        <View style={[styles.smFillYes, { width: `${yesPct ?? 50}%` }]} />
                      </View>
                      <Text style={styles.smNoLabel}>NO</Text>
                    </View>
                    <View style={styles.smPctRow}>
                      <Text style={styles.smYesPct}>{yesPct ?? '--'}%</Text>
                      <Text style={styles.smNoPct}>{noPct ?? '--'}%</Text>
                    </View>
                  </View>

                  {/* Metric row */}
                  <View style={styles.metricRow}>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Volume</Text>
                      <Text style={styles.metricValue}>{formatUsdCompact(detail.volume24h)}</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Liquidity</Text>
                      <Text style={styles.metricValue}>{formatUsdCompact(detail.liquidity)}</Text>
                    </View>
                  </View>

                  {/* 24h Activity */}
                  <View style={styles.statsCard}>
                    <Text style={styles.cardLabel}>24h Activity</Text>
                    <View style={styles.activityRow}>
                      <View style={styles.activityItem}>
                        <Text style={styles.activityKey}>Closes</Text>
                        <Text style={styles.activityVal}>{formatDeadline(detail.endDate, detail.active)}</Text>
                      </View>
                      <View style={styles.activityItem}>
                        <Text style={styles.activityKey}>Vol (Total)</Text>
                        <Text style={styles.activityVal}>{formatUsdCompact(detail.volume)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* RULES TAB */}
              {activeTab === 'rules' ? (
                <View style={styles.tabSection}>
                  <View style={styles.statsCard}>
                    <Text style={styles.cardLabel}>Resolution Criteria</Text>
                    <Text style={styles.rulesText}>
                      {detail.description ?? 'No resolution criteria provided.'}
                    </Text>
                    <View style={styles.rulesMeta}>
                      <Text style={styles.rulesMetaItem}>Source: Polymarket</Text>
                      <Text style={styles.rulesMetaItem}>{formatDeadline(detail.endDate, detail.active)}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* FEED TAB */}
              {activeTab === 'feed' ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="rss-feed" size={32} color={semantic.text.faint} />
                  <Text style={styles.emptyTitle}>Coming Soon</Text>
                  <Text style={styles.emptyBody}>Live market activity and signals will appear here</Text>
                </View>
              ) : null}

            </ScrollView>
          </View>

          {/* ── BOTTOM ZONE: YES / NO BUTTONS ── */}
          <View style={styles.bottomZone}>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnYes]}
                onPress={() => openBetSlip('yes')}>
                <Text style={styles.actionBtnLabel}>Yes</Text>
                <Text style={styles.actionBtnPrice}>{yesPct !== null ? `${yesPct}¢` : '--'}</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnNo]}
                onPress={() => openBetSlip('no')}>
                <Text style={[styles.actionBtnLabel, { color: semantic.sentiment.negative }]}>No</Text>
                <Text style={[styles.actionBtnPrice, { color: semantic.sentiment.negative }]}>{noPct !== null ? `${noPct}¢` : '--'}</Text>
              </Pressable>
            </View>
          </View>

        </View>
      ) : null}

      {/* ── BET SLIP BOTTOM SHEET ── */}
      <Modal
        visible={betSlipVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBetSlipVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setBetSlipVisible(false)} />
        <View style={styles.betSlip}>
          <View style={styles.betSlipHandle} />
          <View style={styles.betSlipHeader}>
            <Text style={styles.betSlipTitle}>{detail?.question ?? ''}</Text>
            <View style={[styles.sideBadge, betSlipMode === 'sell' ? styles.sideBadgeNo : betSlipSide === 'yes' ? styles.sideBadgeYes : styles.sideBadgeNo]}>
              <Text style={[styles.sideBadgeText, { color: betSlipMode === 'sell' ? semantic.sentiment.negative : betSlipSide === 'yes' ? semantic.sentiment.positive : semantic.sentiment.negative }]}>
                {betSlipMode === 'sell' ? `SELL ${betSlipLabel}` : betSlipLabel}
              </Text>
            </View>
          </View>

          {/* Balance + Entry price row */}
          <View style={styles.betSlipRow}>
            <View>
              <Text style={styles.betSlipMetaLabel}>Balance</Text>
              <Text style={styles.betSlipMetaValue}>
                {clobBalance !== null ? `$${clobBalance.toFixed(2)}` : '--'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.betSlipMetaLabel}>Entry price</Text>
              <Text style={styles.betSlipMetaValue}>{Math.round(betSlipPrice * 100)}¢</Text>
            </View>
          </View>

          {/* Amount input */}
          <View style={styles.amountWrap}>
            <View style={styles.amountLabelRow}>
              <Text style={styles.amountLabel}>Amount</Text>
              {clobBalance !== null && clobBalance > 0 && (
                <Pressable onPress={() => setBetSlipAmount(Math.floor(clobBalance * 100) / 100)}>
                  <Text style={styles.maxBtn}>MAX</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.amountInputRow}>
              <Text style={styles.amountDollar}>$</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={betSlipAmount > 0 ? betSlipAmount.toString() : ''}
                placeholder="0.00"
                placeholderTextColor={semantic.text.faint}
                onChangeText={(v) => {
                  if (v === '') { setBetSlipAmount(0); return; }
                  const n = parseFloat(v);
                  if (!Number.isNaN(n)) setBetSlipAmount(n);
                }}
              />
            </View>
          </View>

          {/* Payout row */}
          <View style={styles.payoutRow}>
            <View>
              <Text style={styles.betSlipMetaLabel}>Est. Payout</Text>
              <Text style={[styles.betSlipMetaValue, { color: semantic.sentiment.positive }]}>
                ${payout.toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.betSlipMetaLabel}>Shares</Text>
              <Text style={styles.betSlipMetaValue}>
                {betSlipPrice > 0 ? (betSlipAmount / betSlipPrice).toFixed(2) : '0'}
              </Text>
            </View>
          </View>

          {/* Order result feedback */}
          {orderResult === 'success' ? (
            <View style={styles.orderFeedback}>
              <MaterialIcons name="check-circle" size={18} color={semantic.sentiment.positive} />
              <Text style={[styles.orderFeedbackText, { color: semantic.sentiment.positive }]}>
                Order placed
              </Text>
            </View>
          ) : orderResult === 'error' ? (
            <View style={styles.orderFeedback}>
              <MaterialIcons name="error-outline" size={18} color={semantic.sentiment.negative} />
              <Text style={[styles.orderFeedbackText, { color: semantic.sentiment.negative }]}>
                {orderError ?? 'Order failed'}
              </Text>
            </View>
          ) : null}

          {/* Confirm / Auth button */}
          {!poly.isReady ? (
            <Pressable
              style={[styles.confirmBtn, styles.confirmBtnAuth]}
              onPress={() => { void poly.enable(); }}>
              {poly.isLoading ? (
                <ActivityIndicator size="small" color={semantic.text.primary} />
              ) : (
                <Text style={styles.confirmBtnText}>Open Account to Trade</Text>
              )}
            </Pressable>
          ) : orderResult === 'success' ? (
            <Pressable
              style={[styles.confirmBtn, betSlipSide === 'yes' ? styles.confirmBtnYes : styles.confirmBtnNo]}
              onPress={() => setBetSlipVisible(false)}>
              <Text style={styles.confirmBtnText}>Done</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.confirmBtn, betSlipSide === 'yes' ? styles.confirmBtnYes : styles.confirmBtnNo]}
              disabled={orderLoading}
              onPress={() => { void submitOrder(); }}>
              {orderLoading ? (
                <ActivityIndicator size="small" color={semantic.text.primary} />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {betSlipMode === 'sell' ? 'Sell' : 'Confirm'} {betSlipLabel} — ${betSlipAmount}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </Modal>

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },

  // ── Header ──
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    gap: tokens.spacing.sm,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    color: semantic.text.primary,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  avatarRing: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.full,
    borderWidth: 1.5,
    borderColor: semantic.text.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInner: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.full,
    backgroundColor: semantic.background.surfaceRaised,
  },

  // ── Body layout ──
  body: { flex: 1 },

  // ── Top zone ──
  topZone: { flexShrink: 0, padding: tokens.spacing.md },
  sparkCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  sparkTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  bigPrice: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
    fontFamily: 'monospace',
    lineHeight: 28,
  },
  changeText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  sparkRightCol: {
    alignItems: 'flex-end',
    gap: tokens.spacing.xs,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: tokens.radius.full,
    backgroundColor: semantic.sentiment.positive,
  },
  liveText: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
  },
  intervalRow: { flexDirection: 'row', gap: tokens.spacing.xs },
  intervalChip: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 3,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surfaceRaised,
  },
  intervalChipActive: {
    backgroundColor: 'rgba(232,197,71,0.12)',
    borderColor: 'rgba(232,197,71,0.15)',
  },
  intervalText: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  intervalTextActive: { color: semantic.text.accent },
  chartArea: { height: 64 },
  chartSkeleton: {
    flex: 1,
    borderRadius: tokens.radius.sm,
    backgroundColor: semantic.background.surfaceRaised,
  },

  // ── Mid zone ──
  midZone: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    flexShrink: 0,
  },
  tabChip: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabChipActive: {
    backgroundColor: 'rgba(232,197,71,0.12)',
    borderColor: 'rgba(232,197,71,0.15)',
  },
  tabChipText: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tabChipTextActive: { color: semantic.text.accent },
  tabContent: { flex: 1 },
  tabContentInner: { padding: tokens.spacing.md, gap: tokens.spacing.sm, paddingBottom: tokens.spacing.xl },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  emptyTitle: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  emptyBody: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    textAlign: 'center',
  },

  // ── Position card ──
  positionCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: 12,
    gap: 10,
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posSideBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  posSideBadgeYes: { backgroundColor: 'rgba(52,199,123,0.12)' },
  posSideBadgeNo: { backgroundColor: 'rgba(244,88,78,0.12)' },
  posSideBadgeText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
  },
  positionPnl: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  positionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  positionStat: {
    alignItems: 'center',
    gap: 2,
  },
  posStatLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  posStatVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    color: semantic.text.primary,
  },

  // ── Position section ──
  posSecTitle: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  orderOutcomeText: {
    flex: 1,
    color: semantic.text.dim,
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    marginLeft: 8,
  },
  cancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surfaceRaised,
  },
  cancelBtnText: {
    color: semantic.text.dim,
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sellBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.xs,
    backgroundColor: 'rgba(244,88,78,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244,88,78,0.3)',
  },
  sellBtnText: {
    color: semantic.sentiment.negative,
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Stats tab ──
  tabSection: { gap: tokens.spacing.sm },
  statsCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  cardLabel: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  smartMoneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  smYesLabel: {
    color: semantic.sentiment.positive,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
    width: 24,
  },
  smNoLabel: {
    color: semantic.sentiment.negative,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
    width: 24,
    textAlign: 'right',
  },
  smTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(244,88,78,0.2)',
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  smFillYes: {
    height: '100%',
    backgroundColor: semantic.sentiment.positive,
    borderRadius: tokens.radius.full,
    opacity: 0.7,
  },
  smPctRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  smYesPct: {
    color: semantic.sentiment.positive,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  smNoPct: {
    color: semantic.sentiment.negative,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  metricRow: { flexDirection: 'row', gap: tokens.spacing.xs },
  metricBox: {
    flex: 1,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
  },
  metricLabel: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  activityRow: { flexDirection: 'row', gap: tokens.spacing.xl },
  activityItem: { gap: 4 },
  activityKey: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  activityVal: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '600',
  },

  // ── Rules tab ──
  rulesText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.sm,
    lineHeight: 18,
  },
  rulesMeta: {
    flexDirection: 'row',
    gap: tokens.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    paddingTop: tokens.spacing.sm,
  },
  rulesMetaItem: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
  },

  // ── Feed tab ──
  feedCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  feedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feedSource: {
    color: semantic.text.accent,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  feedTime: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
  },
  feedText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.sm,
    lineHeight: 18,
  },

  // ── Bottom zone ──
  bottomZone: {
    flexShrink: 0,
    padding: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    paddingBottom: tokens.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  actionBtnYes: {
    backgroundColor: 'rgba(52,199,123,0.15)',
    borderColor: 'rgba(52,199,123,0.3)',
  },
  actionBtnNo: {
    backgroundColor: 'rgba(244,88,78,0.12)',
    borderColor: 'rgba(244,88,78,0.3)',
  },
  actionBtnLabel: {
    color: semantic.sentiment.positive,
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  actionBtnPrice: {
    color: semantic.sentiment.positive,
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
    fontWeight: '700',
  },

  // ── Bet slip ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  betSlip: {
    backgroundColor: semantic.background.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: semantic.border.muted,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
    paddingBottom: 40,
  },
  betSlipHandle: {
    width: 40,
    height: 4,
    borderRadius: tokens.radius.full,
    backgroundColor: semantic.border.muted,
    alignSelf: 'center',
    marginBottom: tokens.spacing.xs,
  },
  betSlipHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  betSlipTitle: {
    flex: 1,
    color: semantic.text.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  sideBadge: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xxs,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    flexShrink: 0,
  },
  sideBadgeYes: {
    backgroundColor: 'rgba(52,199,123,0.12)',
    borderColor: 'rgba(52,199,123,0.3)',
  },
  sideBadgeNo: {
    backgroundColor: 'rgba(244,88,78,0.12)',
    borderColor: 'rgba(244,88,78,0.3)',
  },
  sideBadgeText: {
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 1,
  },
  betSlipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  betSlipMetaLabel: {
    color: semantic.text.dim,
    fontSize: 8,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  betSlipMetaValue: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  amountWrap: { gap: tokens.spacing.xs },
  amountLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    color: semantic.text.dim,
    fontSize: 8,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  maxBtn: {
    color: tokens.colors.primary,
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 1,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
  },
  amountDollar: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
    marginRight: tokens.spacing.xs,
  },
  amountInput: {
    flex: 1,
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
    paddingVertical: tokens.spacing.sm,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: tokens.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
  },
  confirmBtn: {
    height: 48,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnYes: { backgroundColor: semantic.sentiment.positive },
  confirmBtnNo: { backgroundColor: semantic.sentiment.negative },
  confirmBtnAuth: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  orderFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  orderFeedbackText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
  },

  // ── Loading / error states ──
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
    alignSelf: 'center',
  },
  retryText: {
    color: semantic.background.screen,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});
