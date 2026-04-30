import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
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
import { fetchSportMarketDetail, fetchPriceHistory, fetchOrderbook } from '@/features/predict/predict.api';
import type { PredictSport, PricePoint, SportMarketDetail, SportOutcomeDetail, Orderbook } from '@/features/predict/predict.types';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { V2_CONTRACTS } from '@/hooks/useEvmSigner';
import { resolveApiBaseUrl, fetchWithTimeout } from '@/lib/api';
import { semantic, tokens } from '@/theme';
import { formatUsdCompact } from '@/lib/format';
import { useOddsFormat } from '@/hooks/useOddsFormat';
import { OddsFormatToggle } from '@/features/predict/components/OddsFormatToggle';
import { MultiLineChart } from '@/features/predict/components/MultiLineChart';
import { OrderbookView } from '@/features/predict/components/OrderbookView';
import { StatsStrip } from '@/features/predict/components/StatsStrip';
import { InlineNumpad } from '@/features/predict/components/InlineNumpad';

interface PredictSportDetailScreenProps {
  sport: PredictSport;
  slug: string;
}

type Interval = '5m' | '1h' | '1d';
type ActiveView = 'chart' | 'orderbook';

const SOFT_COLLAPSED = 280; // handle + stats + ~3 selection rows
const SOFT_EXPANDED = 720;

function formatKickoff(isoDate: string | null): string {
  if (!isoDate) return 'TBD';
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return 'TBD';
  const date = new Date(time);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const clock = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${month} ${day} \u00B7 ${clock}`;
}

function outcomeColor(outcome: SportOutcomeDetail, isLead: boolean): string {
  if (outcome.label.toLowerCase().includes('draw')) return semantic.text.accent;
  return isLead ? semantic.sentiment.positive : semantic.sentiment.negative;
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
  const [activeView, setActiveView] = useState<ActiveView>('chart');
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [orderbookLoading, setOrderbookLoading] = useState(false);
  const [obOutcomeIdx, setObOutcomeIdx] = useState(0);

  // Numpad state
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [selectedOutcomeIdx, setSelectedOutcomeIdx] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no' | null>(null);
  const [numpadAmount, setNumpadAmount] = useState('50');
  const [submitting, setSubmitting] = useState(false);

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

  // Sort outcomes: lead first, draw in middle
  const sortedOutcomes = detail
    ? [...detail.outcomes].sort((a, b) => {
        const aIsDraw = a.label.toLowerCase().includes('draw');
        const bIsDraw = b.label.toLowerCase().includes('draw');
        if (aIsDraw && !bIsDraw) return 1;
        if (!aIsDraw && bIsDraw) return -1;
        return (b.price ?? -1) - (a.price ?? -1);
      })
    : [];
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

  useEffect(() => { void loadDetail(); }, [slug, sport]);

  useEffect(() => {
    if (sortedOutcomes.length > 0) void loadHistory(sortedOutcomes, interval);
  }, [detail, interval]);

  useEffect(() => {
    if (activeView === 'orderbook' && sortedOutcomes.length > 0) void loadOrderbook(obOutcomeIdx);
  }, [activeView, detail, obOutcomeIdx]);

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
      label: outcome.label.toLowerCase().includes('draw') ? 'Draw' : outcome.label,
    };
  });

  function tapOdd(outcomeIdx: number, side: 'yes' | 'no') {
    if (numpadOpen && selectedOutcomeIdx === outcomeIdx && selectedSide === side) {
      setNumpadOpen(false);
      setSelectedOutcomeIdx(null);
      setSelectedSide(null);
      return;
    }
    setSelectedOutcomeIdx(outcomeIdx);
    setSelectedSide(side);
    setNumpadAmount('50');
    setNumpadOpen(true);
  }

  function collapseNumpad() {
    setNumpadOpen(false);
    setSelectedOutcomeIdx(null);
    setSelectedSide(null);
  }

  async function submitOrder() {
    if (!detail || selectedOutcomeIdx === null || !selectedSide || submitting) return;
    const amount = parseFloat(numpadAmount);
    if (!amount || amount <= 0) return;

    const outcome = sortedOutcomes[selectedOutcomeIdx];
    if (!outcome) return;

    // For "yes" buy the yes token (clobTokenIds[0]), for "no" buy the no token (clobTokenIds[1])
    const tokenID = selectedSide === 'yes' ? outcome.clobTokenIds[0] : outcome.clobTokenIds[1];
    if (!tokenID) {
      Alert.alert('Error', 'No token ID for this outcome');
      return;
    }

    const price = selectedSide === 'yes' ? outcome.price : (outcome.price !== null ? 1 - outcome.price : null);
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

      const exchangeAddress = detail.negRisk
        ? V2_CONTRACTS.NEG_RISK_CTF_EXCHANGE
        : V2_CONTRACTS.CTF_EXCHANGE;

      const signedOrder = await poly.signOrder({
        tokenID,
        price,
        size: Math.floor((amount / price) * 100) / 100,
        side: 'BUY',
        exchangeAddress,
      });

      const res = await fetchWithTimeout(`${resolveApiBaseUrl()}/clob/order/signed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polygonAddress: poly.polygonAddress,
          signedOrder,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Order failed');
      }

      const label = outcome.label.toLowerCase().includes('draw') ? 'Draw' : outcome.label;
      Alert.alert('Order placed', `${selectedSide.toUpperCase()} ${label} $${amount} @ ${Math.round(price * 100)}\u00A2`);
      collapseNumpad();
    } catch (err: any) {
      Alert.alert('Order failed', err.message || 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  const numpadPrice = (() => {
    if (selectedOutcomeIdx === null || selectedSide === null) return 0.5;
    const outcome = sortedOutcomes[selectedOutcomeIdx];
    if (!outcome?.price) return 0.5;
    return selectedSide === 'yes' ? outcome.price : 1 - outcome.price;
  })();

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
            {detail?.title ?? 'Loading...'}
          </Text>
        </View>
        {detail?.status === 'live' && (
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, { opacity: livePulse }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
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
                      const isDraw = o.label.toLowerCase().includes('draw');
                      const label = isDraw ? 'Draw' : o.label;
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

            {/* Stats strip */}
            <StatsStrip stats={[
              { value: formatUsdCompact(detail.volume24h), label: 'Volume' },
              { value: formatUsdCompact(detail.liquidity), label: 'Liquidity' },
              { value: '--', label: 'Traders' },
            ]} />

            {/* Separator */}
            <View style={styles.separator} />

            {/* Selection rows */}
            <View style={styles.oddsSection}>
              <View style={styles.selHeader}>
                <Text style={styles.selHeaderLabel}>{sortedOutcomes.length} Selections</Text>
                <OddsFormatToggle format={format} onFormatChange={setFormat} />
              </View>
              {sortedOutcomes.map((outcome, i) => {
                const isDraw = outcome.label.toLowerCase().includes('draw');
                const label = isDraw ? 'Draw' : outcome.label;
                const isSelected = (side: 'yes' | 'no') => selectedOutcomeIdx === i && selectedSide === side;
                return (
                  <View key={`${outcome.conditionId ?? outcome.label}-${i}`} style={[styles.selRow, i > 0 && styles.selRowBorder]}>
                    <View style={styles.selInfo}>
                      <Text style={styles.selName} numberOfLines={1}>{label}</Text>
                      <Text style={styles.selVol}>{formatUsdCompact(outcome.volume24h)} vol</Text>
                    </View>
                    <View style={styles.selBtns}>
                      <Pressable
                        style={[styles.selBtn, styles.selBtnYes, isSelected('yes') && styles.selBtnYesSelected]}
                        onPress={() => tapOdd(i, 'yes')}>
                        <Text style={styles.selBtnYesPct}>{outcome.price !== null ? formatOdds(outcome.price) : '--'}</Text>
                        <Text style={styles.selBtnYesLabel}>Yes</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.selBtn, styles.selBtnNo, isSelected('no') && styles.selBtnNoSelected]}
                        onPress={() => tapOdd(i, 'no')}>
                        <Text style={styles.selBtnNoPct}>{outcome.price !== null ? formatOdds(1 - outcome.price) : '--'}</Text>
                        <Text style={styles.selBtnNoLabel}>No</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Inline numpad */}
            <InlineNumpad
              visible={numpadOpen}
              side={selectedSide ?? 'yes'}
              price={numpadPrice}
              amount={numpadAmount}
              onAmountChange={setNumpadAmount}
              onConfirm={() => { void submitOrder(); }}
              submitting={submitting}
              disabled={!poly.isReady}
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
    fontSize: 8,
    letterSpacing: 1,
    color: semantic.text.dim,
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
    width: 58,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  selBtnYes: { backgroundColor: semantic.predict.outcomeYesBg },
  selBtnNo: { backgroundColor: semantic.predict.outcomeNoBg },
  selBtnYesSelected: {
    backgroundColor: 'rgba(74,140,111,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.35)',
  },
  selBtnNoSelected: {
    backgroundColor: 'rgba(217,83,79,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.35)',
  },
  selBtnYesPct: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.sentiment.positive,
    lineHeight: 14,
  },
  selBtnYesLabel: {
    fontFamily: 'monospace',
    fontSize: 6.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(74,140,111,0.55)',
  },
  selBtnNoPct: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.sentiment.negative,
    lineHeight: 14,
  },
  selBtnNoLabel: {
    fontFamily: 'monospace',
    fontSize: 6.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(217,83,79,0.45)',
  },
});
