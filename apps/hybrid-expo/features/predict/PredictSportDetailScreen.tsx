import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Circle } from 'react-native-svg';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { fetchSportMarketDetail, fetchPriceHistory } from '@/features/predict/predict.api';
import type { PredictSport, PricePoint, SportMarketDetail, SportOutcomeDetail } from '@/features/predict/predict.types';
import { semantic, tokens } from '@/theme';

interface PredictSportDetailScreenProps {
  sport: PredictSport;
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

function outcomeColor(outcome: SportOutcomeDetail, isLead: boolean): string {
  if (outcome.label.toLowerCase().includes('draw')) return semantic.text.accent;
  return isLead ? semantic.sentiment.positive : semantic.sentiment.negative;
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

export function PredictSportDetailScreen({ sport, slug }: PredictSportDetailScreenProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<SportMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [interval, setInterval] = useState<Interval>('1h');
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
    if (!detail?.outcomes[activeTab]) return;
    void loadHistory(detail.outcomes[activeTab], interval);
  }, [detail, activeTab, interval]);

  // Sort outcomes: draw in middle, teams on sides — keep display order stable
  const sortedOutcomes = detail
    ? [...detail.outcomes].sort((a, b) => {
        const aIsDraw = a.label.toLowerCase().includes('draw');
        const bIsDraw = b.label.toLowerCase().includes('draw');
        if (aIsDraw) return 0;
        if (bIsDraw) return 0;
        return (b.price ?? -1) - (a.price ?? -1);
      })
    : [];

  const activeOutcome = sortedOutcomes[activeTab] ?? null;
  const leadPrice = sortedOutcomes[0]?.price ?? null;
  const activeColor = activeOutcome
    ? outcomeColor(activeOutcome, activeOutcome.price === leadPrice)
    : semantic.sentiment.positive;

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
            <Text style={styles.stateText}>Loading fixture...</Text>
          </View>
        ) : null}

        {!loading && errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Fixture unavailable</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <Pressable onPress={() => void loadDetail()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorMessage && detail ? (
          <>
            {/* match hero */}
            <View style={styles.heroCard}>
              <View style={styles.heroMetaRow}>
                <View style={styles.leagueBadge}>
                  <Text style={styles.leagueBadgeText}>{detail.sport.toUpperCase()}</Text>
                </View>
                <Text style={styles.kickoffText}>{formatKickoff(detail.endDate ?? detail.startDate)}</Text>
              </View>
              <Text style={styles.matchTitle}>{detail.title}</Text>
              <View style={styles.heroFootRow}>
                <Text style={styles.heroVolLabel}>Vol 7d</Text>
                <Text style={styles.heroVolValue}>{formatUsdCompact(detail.volume24h)}</Text>
              </View>
            </View>

            {/* outcome tabs */}
            <View style={styles.tabRow}>
              {sortedOutcomes.map((outcome, i) => {
                const isActive = i === activeTab;
                const pct = formatPercent(outcome.price);
                return (
                  <Pressable
                    key={outcome.conditionId ?? outcome.label}
                    onPress={() => setActiveTab(i)}
                    style={[styles.tab, isActive && styles.tabActive]}>
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                      {outcome.label.replace(/^Draw\s*\((.*)\)$/i, 'Draw')}
                    </Text>
                    <Text style={[styles.tabPct, isActive && styles.tabPctActive]}>{pct}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* sparkline for active outcome */}
            <View style={styles.sparkCard}>
              <View style={styles.sparkHeaderRow}>
                <Text style={styles.sparkOutcomeName} numberOfLines={1}>
                  {activeOutcome?.label.replace(/^Draw\s*\((.*)\)$/i, 'Draw') ?? ''} — price history
                </Text>
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
              <View style={styles.chartArea}>
                {historyLoading ? (
                  <View style={styles.chartSkeleton} />
                ) : history.length >= 2 ? (
                  <Sparkline points={history} width={315} height={64} color={activeColor} />
                ) : (
                  <View style={[styles.chartSkeleton, { opacity: 0.4 }]} />
                )}
              </View>
            </View>

            {/* 3-way outcome bars */}
            <View style={styles.outcomesSection}>
              {sortedOutcomes.map((outcome) => {
                const isLead = leadPrice !== null && outcome.price === leadPrice;
                const isDraw = outcome.label.toLowerCase().includes('draw');
                const pct = outcome.price !== null ? Math.round(outcome.price * 100) : 0;
                const color = outcomeColor(outcome, isLead);
                return (
                  <View key={outcome.conditionId ?? outcome.label} style={styles.outcomeBar}>
                    <View style={styles.outcomeBarHeader}>
                      <Text style={[styles.outcomeBarLabel, { color: isLead ? semantic.text.primary : semantic.text.dim }]} numberOfLines={1}>
                        {isDraw ? 'Draw' : outcome.label}
                      </Text>
                      <Text style={[styles.outcomeBarPct, { color }]}>{formatPercent(outcome.price)}</Text>
                    </View>
                    <View style={styles.outcomeTrack}>
                      <View style={[styles.outcomeFill, { width: `${pct}%`, backgroundColor: color, opacity: isLead ? 0.2 : 0.12 }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Vol (7d)</Text>
                <Text style={styles.statValue}>{formatUsdCompact(detail.volume24h)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Kick-off</Text>
                <Text style={styles.statValue}>{formatKickoff(detail.startDate).split('·')[0].trim()}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Markets</Text>
                <Text style={styles.statValue}>{detail.outcomes.length}</Text>
              </View>
            </View>

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
  // hero
  heroCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: 14,
    gap: 8,
  },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leagueBadge: {
    backgroundColor: semantic.predict.badgeSportBg,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  leagueBadgeText: {
    color: semantic.sentiment.positive,
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  kickoffText: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace' },
  matchTitle: { color: semantic.text.primary, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  heroFootRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroVolLabel: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace', letterSpacing: 1 },
  heroVolValue: { color: semantic.text.primary, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace', fontWeight: '700' },
  // tabs
  tabRow: { flexDirection: 'row', gap: 0 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.xs,
    marginHorizontal: 2,
    gap: 2,
  },
  tabActive: {
    borderBottomColor: semantic.text.accent,
    borderColor: semantic.border.muted,
  },
  tabLabel: { color: semantic.text.faint, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace', letterSpacing: 0.8 },
  tabLabelActive: { color: semantic.text.accent },
  tabPct: { color: semantic.text.faint, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  tabPctActive: { color: semantic.text.primary },
  // sparkline
  sparkCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: 12,
    gap: 8,
  },
  sparkHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sparkOutcomeName: { flex: 1, color: semantic.text.faint, fontSize: tokens.fontSize.xxs, fontFamily: 'monospace', letterSpacing: 1 },
  intervalRow: { flexDirection: 'row', gap: 4 },
  intervalChip: {
    paddingHorizontal: 7,
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
  chartSkeleton: { flex: 1, borderRadius: 6, backgroundColor: semantic.background.surfaceRaised },
  // outcome bars
  outcomesSection: { gap: 8 },
  outcomeBar: { gap: 5 },
  outcomeBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  outcomeBarLabel: { fontSize: tokens.fontSize.sm, fontWeight: '500', flex: 1 },
  outcomeBarPct: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  outcomeTrack: { height: 8, backgroundColor: semantic.background.surfaceRaised, borderRadius: 4, overflow: 'hidden' },
  outcomeFill: { height: '100%', borderRadius: 4 },
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
