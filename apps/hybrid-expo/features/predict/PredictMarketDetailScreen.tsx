import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Circle } from 'react-native-svg';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { fetchCuratedMarketDetail, fetchMarketPrice, fetchPriceHistory } from '@/features/predict/predict.api';
import type { GeopoliticsMarketDetail, LivePrice, PricePoint } from '@/features/predict/predict.types';
import { semantic, tokens } from '@/theme';

interface PredictMarketDetailScreenProps {
  slug: string;
}

type Interval = '1h' | '1d';

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

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

// Build an SVG path from price history points fitting into a given width×height box
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

  const dotCoords = buildSparkPath([last], width, height);
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

export function PredictMarketDetailScreen({ slug }: PredictMarketDetailScreenProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<GeopoliticsMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>('1h');
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [livePrice, setLivePrice] = useState<LivePrice | null>(null);
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

  async function loadHistory(iv: Interval, tokenId: string) {
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

  async function refreshPrice() {
    try {
      const price = await fetchMarketPrice(slug);
      setLivePrice(price);
    } catch { /* silent */ }
  }

  // Load history when detail or interval changes
  useEffect(() => {
    if (!detail) return;
    const tokenId = detail.outcomes[0] === 'Yes' ? detail.outcomePrices[0]?.toString() : null;
    // Use slug-based price endpoint for live; for history we need a clobTokenId
    // fetchPriceHistory needs a tokenId — if we don't have one yet use the slug as a no-op
    void loadHistory(interval, slug);
  }, [detail, interval]);

  // 30s live price refresh
  useEffect(() => {
    void refreshPrice();
    refreshTimer.current = globalThis.setInterval(() => { void refreshPrice(); }, 30_000);
    return () => {
      if (refreshTimer.current) globalThis.clearInterval(refreshTimer.current);
    };
  }, [slug]);

  useEffect(() => { void loadMarket(); }, [slug]);

  const yesPrice = livePrice?.yesPrice ?? (detail?.outcomePrices[0] ?? null);
  const noPrice  = livePrice?.noPrice  ?? (detail?.outcomePrices[1] ?? null);
  const yesPct   = yesPrice !== null ? Math.round(yesPrice * 100) : null;
  const noPct    = noPrice  !== null ? Math.round(noPrice * 100)  : null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={16} color={semantic.text.primary} />
          <Text style={styles.backText}>Predict</Text>
        </Pressable>
        <View style={styles.polyBadge}>
          <Text style={styles.polyBadgeText}>Polymarket</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={semantic.text.accent} />
            <Text style={styles.stateText}>Loading market...</Text>
          </View>
        ) : null}

        {!loading && errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Market unavailable</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <Pressable onPress={() => void loadMarket()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorMessage && detail ? (
          <>
            <View style={styles.questionWrap}>
              <Text style={styles.title}>{detail.question}</Text>
              <Text style={styles.endDate}>{formatDeadline(detail.endDate, detail.active)} · {formatUsdCompact(detail.volume24h)} weekly vol</Text>
            </View>

            {/* sparkline card */}
            <View style={styles.sparkCard}>
              <View style={styles.sparkTopRow}>
                <View style={styles.sparkPriceRow}>
                  <Text style={styles.sparkYes}>{yesPct !== null ? `${yesPct}%` : '--'}</Text>
                </View>
                <View style={styles.updatedRow}>
                  <View style={styles.updatedDot} />
                  <Text style={styles.updatedText}>
                    {livePrice ? formatSecondsAgo(livePrice.fetchedAt) : 'loading...'}
                  </Text>
                </View>
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

            {/* YES / NO bars */}
            <View style={styles.oddsSection}>
              <View style={styles.oddsPair}>
                {/* YES */}
                <View style={styles.oddsBarWrap}>
                  <View style={styles.oddsBarLabel}>
                    <Text style={styles.oddsLabelYes}>YES</Text>
                    <Text style={styles.oddsPrice}>${yesPrice?.toFixed(2) ?? '--'}</Text>
                  </View>
                  <View style={styles.oddsTrack}>
                    <View style={[styles.oddsFillYes, { width: `${yesPct ?? 50}%` }]}>
                      <Text style={styles.oddsPctYes}>{yesPct !== null ? `${yesPct}%` : '--'}</Text>
                    </View>
                  </View>
                </View>
                {/* NO */}
                <View style={styles.oddsBarWrap}>
                  <View style={styles.oddsBarLabel}>
                    <Text style={styles.oddsLabelNo}>NO</Text>
                    <Text style={styles.oddsPrice}>${noPrice?.toFixed(2) ?? '--'}</Text>
                  </View>
                  <View style={styles.oddsTrack}>
                    <View style={[styles.oddsFillNo, { width: `${noPct ?? 50}%` }]}>
                      <Text style={styles.oddsPctNo}>{noPct !== null ? `${noPct}%` : '--'}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Vol (7d)</Text>
                <Text style={styles.statValue}>{formatUsdCompact(detail.volume24h)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Vol (Total)</Text>
                <Text style={styles.statValue}>{formatUsdCompact(detail.volume)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Closes</Text>
                <Text style={styles.statValue}>{formatDeadline(detail.endDate, detail.active)}</Text>
              </View>
            </View>

            {/* description */}
            {detail.description ? (
              <View style={styles.descCard}>
                <Text style={styles.descLabel}>Resolution</Text>
                <Text style={styles.descText}>{detail.description}</Text>
              </View>
            ) : null}

            {/* CTA */}
            <View style={styles.ctaWrap}>
              <View style={styles.ctaBtn}>
                <Text style={styles.ctaText}>🔒  Connect Wallet to Trade</Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },
  topBar: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
  backText: { color: semantic.text.primary, fontSize: tokens.fontSize.sm, fontWeight: '600' },
  polyBadge: {
    backgroundColor: semantic.predict.badgeGeoBg,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  polyBadgeText: {
    color: semantic.text.accentDim,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  content: { padding: tokens.spacing.lg, paddingBottom: 128, gap: tokens.spacing.sm },
  questionWrap: { gap: 4 },
  title: { color: semantic.text.primary, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  endDate: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace' },
  // sparkline
  sparkCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: 12,
  },
  sparkTopRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 },
  sparkPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  sparkYes: { color: semantic.sentiment.positive, fontSize: 22, fontWeight: '700', fontFamily: 'monospace' },
  updatedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  updatedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: semantic.sentiment.positive },
  updatedText: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace' },
  intervalRow: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  intervalChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surfaceRaised,
  },
  intervalChipActive: { backgroundColor: 'rgba(232,197,71,0.08)', borderColor: 'rgba(232,197,71,0.25)' },
  intervalText: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace', letterSpacing: 1 },
  intervalTextActive: { color: semantic.text.accent },
  chartArea: { height: 64 },
  chartSkeleton: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: semantic.background.surfaceRaised,
  },
  // odds bars
  oddsSection: {},
  oddsPair: { gap: 8 },
  oddsBarWrap: { gap: 5 },
  oddsBarLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  oddsLabelYes: { color: semantic.sentiment.positive, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace', letterSpacing: 1.5, fontWeight: '700' },
  oddsLabelNo:  { color: semantic.sentiment.negative, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace', letterSpacing: 1.5, fontWeight: '700' },
  oddsPrice: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace' },
  oddsTrack: { height: 32, backgroundColor: semantic.background.surfaceRaised, borderRadius: 6, overflow: 'hidden' },
  oddsFillYes: {
    height: '100%',
    backgroundColor: 'rgba(52,199,123,0.15)',
    borderRadius: 6,
    justifyContent: 'center',
    paddingLeft: 10,
    minWidth: 40,
  },
  oddsFillNo: {
    height: '100%',
    backgroundColor: 'rgba(244,88,78,0.12)',
    borderRadius: 6,
    justifyContent: 'center',
    paddingLeft: 10,
    minWidth: 40,
  },
  oddsPctYes: { color: semantic.sentiment.positive, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  oddsPctNo:  { color: semantic.sentiment.negative, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  // stats
  statsRow: { flexDirection: 'row', gap: 6 },
  statBox: {
    flex: 1,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    padding: 10,
  },
  statLabel: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'monospace', marginBottom: 4 },
  statValue: { color: semantic.text.primary, fontSize: tokens.fontSize.sm, fontWeight: '700', fontFamily: 'monospace' },
  // description
  descCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    padding: 12,
    gap: 8,
  },
  descLabel: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'monospace' },
  descText: { color: semantic.text.dim, fontSize: tokens.fontSize.sm, lineHeight: 18 },
  // cta
  ctaWrap: { paddingBottom: 4 },
  ctaBtn: {
    height: 44,
    borderRadius: tokens.radius.sm,
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: semantic.text.faint, fontSize: tokens.fontSize.xs, fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase' },
  // states
  stateCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  stateTitle: { color: semantic.text.primary, fontSize: tokens.fontSize.md, fontWeight: '700' },
  stateText: { color: semantic.text.dim, fontSize: tokens.fontSize.md },
  retryButton: {
    marginTop: tokens.spacing.xs,
    backgroundColor: semantic.text.accent,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
    alignSelf: 'flex-start',
  },
  retryText: { color: semantic.background.screen, fontSize: tokens.fontSize.sm, fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: '700' },
});
