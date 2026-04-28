import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCuratedMarketDetail, fetchMarketPrice, fetchPriceHistory, fetchOrderbook } from '@/features/predict/predict.api';
import type { GeopoliticsMarketDetail, LivePrice, Orderbook, PricePoint } from '@/features/predict/predict.types';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { semantic, tokens } from '@/theme';
import { formatUsdCompact } from '@/lib/format';
import { MultiLineChart } from '@/features/predict/components/MultiLineChart';
import { OrderbookView } from '@/features/predict/components/OrderbookView';
import { StatsStrip } from '@/features/predict/components/StatsStrip';
import { InlineNumpad } from '@/features/predict/components/InlineNumpad';

interface PredictMarketDetailScreenProps {
  slug: string;
}

type Interval = '5m' | '1h' | '1d';
type ActiveView = 'chart' | 'orderbook';

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

export function PredictMarketDetailScreen({ slug }: PredictMarketDetailScreenProps) {
  const router = useRouter();
  const poly = usePolymarketWallet();
  const privy = usePrivyWallet();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Market data
  const [detail, setDetail] = useState<GeopoliticsMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<LivePrice | null>(null);

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
  const [numpadAmount, setNumpadAmount] = useState('50');

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

  async function refreshPrice() {
    try {
      setLivePrice(await fetchMarketPrice(slug));
    } catch { /* silent */ }
  }

  useEffect(() => { void loadMarket(); }, [slug]);

  useEffect(() => {
    if (detail) void loadHistory(interval);
  }, [detail, interval]);

  useEffect(() => {
    void refreshPrice();
    refreshTimer.current = globalThis.setInterval(() => { void refreshPrice(); }, 30_000);
    return () => { if (refreshTimer.current) globalThis.clearInterval(refreshTimer.current); };
  }, [slug]);

  // Load orderbook when switching to orderbook view
  useEffect(() => {
    if (activeView === 'orderbook' && detail) void loadOrderbook();
  }, [activeView, detail]);

  // Animate soft zone
  useEffect(() => {
    Animated.timing(softZoneAnim, {
      toValue: numpadOpen ? SOFT_EXPANDED : SOFT_COLLAPSED,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [numpadOpen, softZoneAnim]);

  const yesPrice = livePrice?.yesPrice ?? (detail?.outcomePrices[0] ?? null);
  const noPrice = livePrice?.noPrice ?? (detail?.outcomePrices[1] ?? null);
  const yesPct = yesPrice !== null ? Math.round(yesPrice * 100) : null;
  const noPct = noPrice !== null ? Math.round(noPrice * 100) : null;

  function tapOdd(side: 'yes' | 'no') {
    if (numpadOpen && selectedSide === side) {
      // same tap — collapse
      setNumpadOpen(false);
      setSelectedSide(null);
      return;
    }
    setSelectedSide(side);
    setNumpadAmount('50');
    setNumpadOpen(true);
  }

  function collapseNumpad() {
    setNumpadOpen(false);
    setSelectedSide(null);
  }

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
          <Text style={styles.headerTitle} numberOfLines={2}>
            {detail?.question ?? 'Loading...'}
          </Text>
        </View>
        <Text style={styles.headerEnd}>
          {detail ? formatDeadline(detail.endDate, detail.active) : ''}
        </Text>
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
          {/* ══ DARK ZONE ══ */}
          <View style={[styles.darkZone, { paddingBottom: SOFT_COLLAPSED }]}>
            {/* Range chips + view toggle */}
            <View style={styles.chipRow}>
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
              <View style={styles.toggleIcons}>
                <Pressable
                  style={[styles.toggleBtn, activeView === 'chart' && styles.toggleBtnActive]}
                  onPress={() => setActiveView('chart')}>
                  <MaterialIcons name="show-chart" size={14} color={activeView === 'chart' ? semantic.text.primary : semantic.text.faint} />
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, activeView === 'orderbook' && styles.toggleBtnActive]}
                  onPress={() => setActiveView('orderbook')}>
                  <MaterialIcons name="view-list" size={14} color={activeView === 'orderbook' ? semantic.text.primary : semantic.text.faint} />
                </Pressable>
              </View>
            </View>

            {/* Chart or Orderbook */}
            <View style={styles.viewContainer}>
              {activeView === 'chart' ? (
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

            {/* Stats strip */}
            <StatsStrip stats={[
              { value: formatUsdCompact(detail.volume24h), label: 'Volume' },
              { value: formatUsdCompact(detail.liquidity), label: 'Liquidity' },
              { value: '--', label: 'Traders' },
            ]} />

            {/* Separator */}
            <View style={styles.separator} />

            {/* Binary odds buttons */}
            <View style={styles.oddsSection}>
              <View style={styles.binaryBtns}>
                <Pressable
                  style={[styles.bnBtn, styles.bnBtnYes, selectedSide === 'yes' && styles.bnBtnYesSelected]}
                  onPress={() => tapOdd('yes')}>
                  <Text style={styles.bnBtnYesPrice}>{yesPct !== null ? `${yesPct}\u00A2` : '--'}</Text>
                  <Text style={styles.bnBtnYesLabel}>Yes</Text>
                </Pressable>
                <Pressable
                  style={[styles.bnBtn, styles.bnBtnNo, selectedSide === 'no' && styles.bnBtnNoSelected]}
                  onPress={() => tapOdd('no')}>
                  <Text style={styles.bnBtnNoPrice}>{noPct !== null ? `${noPct}\u00A2` : '--'}</Text>
                  <Text style={styles.bnBtnNoLabel}>No</Text>
                </Pressable>
              </View>
            </View>

            {/* Inline numpad */}
            <InlineNumpad
              visible={numpadOpen}
              side={selectedSide ?? 'yes'}
              price={selectedSide === 'no' ? (noPrice ?? 0.5) : (yesPrice ?? 0.5)}
              amount={numpadAmount}
              onAmountChange={setNumpadAmount}
              onConfirm={() => { /* CLOB v2 pending */ }}
            />
          </Animated.View>
        </View>
      ) : null}
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
  headerEnd: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
    flexShrink: 0,
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
