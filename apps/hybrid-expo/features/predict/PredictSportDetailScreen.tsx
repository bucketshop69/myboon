import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { fetchSportMarketDetail, fetchPriceHistory, fetchClobBalance, placeBet } from '@/features/predict/predict.api';
import type { PredictSport, PricePoint, SportMarketDetail, SportOutcomeDetail } from '@/features/predict/predict.types';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { semantic, tokens } from '@/theme';

interface PredictSportDetailScreenProps {
  sport: PredictSport;
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

function formatKickoff(isoDate: string | null): string {
  if (!isoDate) return 'TBD';
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return 'TBD';
  const date = new Date(time);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const clock = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${month} ${day} · ${clock}`;
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
  const coords = points.map((pt) => ({
    x: ((pt.t - minT) / rangeT) * (w - pad * 2) + pad,
    y: h - pad - ((pt.p - minP) / rangeP) * (h - pad * 2),
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${h} L${coords[0].x.toFixed(1)},${h} Z`;
  return { linePath, areaPath };
}

function Sparkline({ points, width, height, color }: { points: PricePoint[]; width: number; height: number; color: string }) {
  const paths = buildSparkPath(points, width, height);
  if (!paths) return <View style={{ width, height, backgroundColor: semantic.background.surfaceRaised, borderRadius: 6 }} />;

  const last = points[points.length - 1];
  const prices = points.map((p) => p.p);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const rangeP = maxP - minP || 0.01;
  const rangeT = (points[points.length - 1].t - points[0].t) || 1;
  const pad = 4;
  const lx = ((last.t - points[0].t) / rangeT) * (width - pad * 2) + pad;
  const ly = height - pad - ((last.p - minP) / rangeP) * (height - pad * 2);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="sportSg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={paths.areaPath} fill="url(#sportSg)" />
      <Path d={paths.linePath} stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Circle cx={lx} cy={ly} r={3} fill={color} />
    </Svg>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'position', label: 'Position' },
  { key: 'stats', label: 'Stats' },
  { key: 'rules', label: 'Rules' },
  { key: 'feed', label: 'Feed' },
];

function outcomeColor(outcome: SportOutcomeDetail, isLead: boolean): string {
  if (outcome.label.toLowerCase().includes('draw')) return semantic.text.accent;
  return isLead ? semantic.sentiment.positive : semantic.sentiment.negative;
}

export function PredictSportDetailScreen({ sport, slug }: PredictSportDetailScreenProps) {
  const router = useRouter();
  const poly = usePolymarketWallet();
  const [detail, setDetail] = useState<SportMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>('1h');
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('position');

  // Sparkline tracks which outcome index
  const [sparkOutcomeIdx, setSparkOutcomeIdx] = useState(0);

  // Bet slip state
  const [betSlipVisible, setBetSlipVisible] = useState(false);
  const [betSlipSide, setBetSlipSide] = useState<'yes' | 'no'>('yes');
  const [betSlipLabel, setBetSlipLabel] = useState('');
  const [betSlipOutcome, setBetSlipOutcome] = useState('');
  const [betSlipTokenID, setBetSlipTokenID] = useState<string | null>(null);
  const [betSlipPrice, setBetSlipPrice] = useState(0.5);
  const [betSlipAmount, setBetSlipAmount] = useState(0);

  // Order submission state
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<'success' | 'error' | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // CLOB balance
  const [clobBalance, setClobBalance] = useState<number | null>(null);

  // Track keyboard visibility
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  async function loadDetail() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await fetchSportMarketDetail(sport, slug);
      setDetail(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load fixture');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(outcome: SportOutcomeDetail, iv: Interval) {
    const tokenId = outcome.clobTokenIds[0];
    if (!tokenId) { setHistory([]); return; }
    setHistoryLoading(true);
    try {
      const result = await fetchPriceHistory(tokenId, iv);
      setHistory(result.history);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { void loadDetail(); }, [slug, sport]);

  useEffect(() => {
    if (!detail?.outcomes[sparkOutcomeIdx]) return;
    void loadHistory(detail.outcomes[sparkOutcomeIdx], interval);
  }, [detail, sparkOutcomeIdx, interval]);

  // Sort outcomes: lead team first, draw in middle
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
  const sparkOutcome = sortedOutcomes[sparkOutcomeIdx] ?? null;
  const sparkColor = sparkOutcome
    ? outcomeColor(sparkOutcome, sparkOutcome.price === leadPrice)
    : semantic.sentiment.positive;

  const isUp = history.length >= 2 ? history[history.length - 1].p >= history[0].p : true;

  // The displayed sparkline price is the current outcome's price
  const sparkPct = sparkOutcome?.price !== null ? Math.round((sparkOutcome?.price ?? 0) * 100) : null;

  const openBetSlip = useCallback((outcome: SportOutcomeDetail, side: 'yes' | 'no') => {
    const price = side === 'yes' ? (outcome.bestAsk ?? outcome.price ?? 0.5) : (outcome.bestBid ?? (1 - (outcome.price ?? 0.5)));
    setBetSlipSide(side);
    setBetSlipLabel(side.toUpperCase());
    setBetSlipOutcome(outcome.label.replace(/^Draw\s*\((.*)\)$/i, 'Draw'));
    setBetSlipTokenID(outcome.clobTokenIds[side === 'yes' ? 0 : 1] ?? outcome.clobTokenIds[0] ?? null);
    setBetSlipPrice(price);
    setBetSlipAmount(0);
    setOrderResult(null);
    setOrderError(null);
    setBetSlipVisible(true);

    if (poly.polygonAddress) {
      fetchClobBalance(poly.polygonAddress).then((b) => {
        if (b) setClobBalance(b.balance);
      });
    }
  }, [poly.polygonAddress]);

  async function submitOrder() {
    if (!poly.polygonAddress || !betSlipTokenID) return;

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

    setOrderLoading(true);
    setOrderResult(null);
    setOrderError(null);

    try {
      const result = await placeBet({
        polygonAddress: poly.polygonAddress,
        tokenID: betSlipTokenID,
        price: betSlipPrice,
        amount: betSlipAmount,
        side: 'BUY',
      });

      if (result.success) {
        setOrderResult('success');
      } else {
        setOrderResult('error');
        setOrderError(result.error ?? 'Order failed');
      }
    } catch (err) {
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
          {detail?.title ?? 'Loading...'}
        </Text>
        <View style={styles.avatarRing}>
          <View style={styles.avatarInner} />
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

          {/* ── TOP ZONE: SPARKLINE CARD ── */}
          <View style={styles.topZone}>
            <View style={styles.sparkCard}>
              <View style={styles.sparkTopRow}>
                <View>
                  <Text style={[styles.bigPrice, { color: sparkColor }]}>
                    {sparkPct !== null ? `${sparkPct}%` : '--'}
                  </Text>
                  <Text style={styles.sparkOutcomeName} numberOfLines={1}>
                    {sparkOutcome?.label.replace(/^Draw\s*\((.*)\)$/i, 'Draw') ?? ''}
                  </Text>
                </View>
                <View style={styles.sparkRightCol}>
                  <View style={styles.liveBadge}>
                    <View style={[styles.liveDot, { backgroundColor: sparkColor }]} />
                    <Text style={styles.liveText}>live</Text>
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

              {/* Outcome selector pills for sparkline */}
              <View style={styles.sparkOutcomeRow}>
                {sortedOutcomes.map((outcome, i) => {
                  const isDraw = outcome.label.toLowerCase().includes('draw');
                  const label = isDraw ? 'Draw' : outcome.label;
                  return (
                    <Pressable
                      key={outcome.conditionId ?? outcome.label}
                      onPress={() => setSparkOutcomeIdx(i)}
                      style={[styles.sparkOutcomeChip, sparkOutcomeIdx === i && styles.sparkOutcomeChipActive]}>
                      <Text
                        style={[styles.sparkOutcomeChipText, sparkOutcomeIdx === i && styles.sparkOutcomeChipTextActive]}
                        numberOfLines={1}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.chartArea}>
                {historyLoading ? (
                  <View style={styles.chartSkeleton} />
                ) : history.length >= 2 ? (
                  <Sparkline points={history} width={315} height={64} color={sparkColor} />
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
                <View style={styles.emptyState}>
                  <MaterialIcons name="show-chart" size={32} color={semantic.text.faint} />
                  <Text style={styles.emptyTitle}>No positions yet</Text>
                  <Text style={styles.emptyBody}>Trade below to open a position</Text>
                </View>
              ) : null}

              {/* STATS TAB */}
              {activeTab === 'stats' ? (
                <View style={styles.tabSection}>
                  {/* Metric row */}
                  <View style={styles.metricRow}>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Traders</Text>
                      <Text style={styles.metricValue}>--</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Volume</Text>
                      <Text style={styles.metricValue}>{formatUsdCompact(detail.volume24h)}</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricLabel}>Liquidity</Text>
                      <Text style={styles.metricValue}>{formatUsdCompact(detail.liquidity)}</Text>
                    </View>
                  </View>

                  {/* Outcome concentration */}
                  <View style={styles.statsCard}>
                    <Text style={styles.cardLabel}>Outcome Concentration</Text>
                    {sortedOutcomes.map((outcome) => {
                      const isDraw = outcome.label.toLowerCase().includes('draw');
                      const isLead = leadPrice !== null && outcome.price === leadPrice;
                      const color = outcomeColor(outcome, isLead);
                      const pct = outcome.price !== null ? Math.round(outcome.price * 100) : 0;
                      return (
                        <View key={outcome.conditionId ?? outcome.label} style={styles.concBar}>
                          <View style={styles.concBarHeader}>
                            <Text style={[styles.concBarLabel, { color: isLead ? semantic.text.primary : semantic.text.dim }]} numberOfLines={1}>
                              {isDraw ? 'Draw' : outcome.label}
                            </Text>
                            <Text style={[styles.concBarPct, { color }]}>{pct}%</Text>
                          </View>
                          <View style={styles.concTrack}>
                            <View style={[styles.concFill, { width: `${pct}%`, backgroundColor: color, opacity: isLead ? 0.25 : 0.15 }]} />
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* 24h Activity */}
                  <View style={styles.statsCard}>
                    <Text style={styles.cardLabel}>24h Activity</Text>
                    <View style={styles.activityRow}>
                      <View style={styles.activityItem}>
                        <Text style={styles.activityKey}>Kick-off</Text>
                        <Text style={styles.activityVal}>{formatKickoff(detail.startDate)}</Text>
                      </View>
                      <View style={styles.activityItem}>
                        <Text style={styles.activityKey}>Markets</Text>
                        <Text style={styles.activityVal}>{detail.outcomes.length}</Text>
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
                      <Text style={styles.rulesMetaItem}>{formatKickoff(detail.endDate)}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* FEED TAB */}
              {activeTab === 'feed' ? (
                <View style={styles.tabSection}>
                  {[
                    { source: 'Smart Money Alert', text: 'Sharp money rotating into the home team — $8K YES at 58¢', time: '2m ago' },
                    { source: 'Market Signal', text: 'Draw probability dropped 4% after team news update', time: '22m ago' },
                    { source: 'Whale Watch', text: 'Top 3 traders net long home team by $19K', time: '1h ago' },
                  ].map((item, i) => (
                    <View key={i} style={styles.feedCard}>
                      <View style={styles.feedCardHeader}>
                        <Text style={styles.feedSource}>{item.source}</Text>
                        <Text style={styles.feedTime}>{item.time}</Text>
                      </View>
                      <Text style={styles.feedText}>{item.text}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

            </ScrollView>
          </View>

          {/* ── BOTTOM ZONE: OUTCOME SELECTION ROWS ── */}
          <View style={styles.bottomZone}>
            {sortedOutcomes.map((outcome) => {
              const isDraw = outcome.label.toLowerCase().includes('draw');
              const isLead = leadPrice !== null && outcome.price === leadPrice;
              const label = isDraw ? 'Draw' : outcome.label;
              const yesCents = outcome.price !== null ? Math.round(outcome.price * 100) : null;
              const noCents = outcome.price !== null ? Math.round((1 - outcome.price) * 100) : null;
              return (
                <View key={outcome.conditionId ?? outcome.label} style={styles.outcomeRow}>
                  <View style={styles.outcomeMeta}>
                    <Text style={[styles.outcomeLabel, { color: isLead ? semantic.text.primary : semantic.text.dim }]} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={styles.outcomeVol}>{formatUsdCompact(outcome.volume24h)} vol</Text>
                  </View>
                  <View style={styles.outcomeBtns}>
                    <Pressable
                      style={styles.outcomeBtnYes}
                      onPress={() => openBetSlip(outcome, 'yes')}>
                      <Text style={styles.outcomeBtnYesLabel}>YES</Text>
                      <Text style={styles.outcomeBtnYesPrice}>{yesCents !== null ? `${yesCents}¢` : '--'}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.outcomeBtnNo}
                      onPress={() => openBetSlip(outcome, 'no')}>
                      <Text style={styles.outcomeBtnNoLabel}>NO</Text>
                      <Text style={styles.outcomeBtnNoPrice}>{noCents !== null ? `${noCents}¢` : '--'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

        </View>
      ) : null}

      {/* ── BET SLIP BOTTOM SHEET ── */}
      <Modal
        visible={betSlipVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { Keyboard.dismiss(); setBetSlipVisible(false); }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (keyboardOpen) {
              Keyboard.dismiss();
            } else {
              setBetSlipVisible(false);
            }
          }}
        />
        <View style={styles.betSlip}>
          <View style={styles.betSlipHandle} />
          <View style={styles.betSlipHeader}>
            <View style={styles.betSlipTitleCol}>
              <Text style={styles.betSlipOutcome}>{betSlipOutcome}</Text>
              <Text style={styles.betSlipTitle}>{detail?.title ?? ''}</Text>
            </View>
            <View style={[styles.sideBadge, betSlipSide === 'yes' ? styles.sideBadgeYes : styles.sideBadgeNo]}>
              <Text style={[styles.sideBadgeText, { color: betSlipSide === 'yes' ? semantic.sentiment.positive : semantic.sentiment.negative }]}>
                {betSlipLabel}
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
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  Confirm {betSlipLabel} — ${betSlipAmount > 0 ? betSlipAmount : '0'}
                </Text>
              )}
            </Pressable>
          )}
        </View>
        </KeyboardAvoidingView>
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
  sparkOutcomeName: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
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
  sparkOutcomeRow: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    flexWrap: 'wrap',
  },
  sparkOutcomeChip: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 3,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surfaceRaised,
  },
  sparkOutcomeChipActive: {
    backgroundColor: 'rgba(232,197,71,0.10)',
    borderColor: 'rgba(232,197,71,0.2)',
  },
  sparkOutcomeChipText: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
  },
  sparkOutcomeChipTextActive: { color: semantic.text.accent },
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
  concBar: { gap: 4 },
  concBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  concBarLabel: {
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    flex: 1,
  },
  concBarPct: {
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  concTrack: {
    height: 8,
    backgroundColor: semantic.background.surfaceRaised,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  concFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
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

  // ── Bottom zone: Sport outcome rows ──
  bottomZone: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.xs,
    gap: tokens.spacing.xs,
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  outcomeMeta: {
    flex: 1,
    gap: 2,
  },
  outcomeLabel: {
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  outcomeVol: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
  },
  outcomeBtns: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  outcomeBtnYes: {
    width: 56,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    backgroundColor: 'rgba(52,199,123,0.15)',
    borderColor: 'rgba(52,199,123,0.3)',
    alignItems: 'center',
    gap: 1,
  },
  outcomeBtnYesLabel: {
    color: semantic.sentiment.positive,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  outcomeBtnYesPrice: {
    color: semantic.sentiment.positive,
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  outcomeBtnNo: {
    width: 56,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    backgroundColor: 'rgba(244,88,78,0.12)',
    borderColor: 'rgba(244,88,78,0.25)',
    alignItems: 'center',
    gap: 1,
  },
  outcomeBtnNoLabel: {
    color: semantic.sentiment.negative,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  outcomeBtnNoPrice: {
    color: semantic.sentiment.negative,
    fontSize: tokens.fontSize.xs,
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
  betSlipTitleCol: {
    flex: 1,
    gap: 3,
  },
  betSlipOutcome: {
    color: semantic.text.accent,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  betSlipTitle: {
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
  orderFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: tokens.spacing.xs,
  },
  orderFeedbackText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
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
