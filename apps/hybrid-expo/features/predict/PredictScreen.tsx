import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { OddsFormatToggle } from '@/features/predict/components/OddsFormatToggle';
import { fetchCuratedMarkets, fetchSportsMarkets, fetchTrendingMarkets } from '@/features/predict/predict.api';
import type { GeopoliticsMarket, PredictFilter, SportMarket, TrendingMarket } from '@/features/predict/predict.types';
import { useOddsFormat } from '@/hooks/useOddsFormat';
import { semantic, tokens } from '@/theme';

const FILTERS: PredictFilter[] = ['All', 'Geopolitics', 'EPL', 'UCL'];
const BINARY_ROW_HEIGHT = 40;
const SPORT_ROW_HEIGHT = 34;

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

function TrendingCard({ market, onPress, formatOdds }: { market: TrendingMarket; onPress: () => void; formatOdds: (p: number | null) => string }) {
  const yes = market.yesPrice !== null ? Math.round(market.yesPrice * 100) : null;
  const isHigh = yes !== null && yes >= 50;
  const volText = market.volume24h !== null ? formatUsdCompact(market.volume24h) : '--';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.trendCard, pressed && styles.cardPressed]}>
      <Text style={styles.trendQuestion} numberOfLines={2}>{market.question}</Text>
      <View style={styles.trendFooter}>
        <View style={[styles.trendPill, isHigh ? styles.trendPillYes : styles.trendPillNo]}>
          <Text style={[styles.trendPillText, isHigh ? styles.trendPillTextYes : styles.trendPillTextNo]}>
            {formatOdds(market.yesPrice)}
          </Text>
        </View>
        <Text style={styles.trendVol}>{volText}</Text>
      </View>
      {/* mini progress bar */}
      <View style={styles.trendBar}>
        <View style={[styles.trendBarFill, { width: `${yes ?? 50}%` }, isHigh ? styles.trendBarFillYes : styles.trendBarFillNo]} />
      </View>
    </Pressable>
  );
}

function BinaryMarketCard({ market, featured, onPress, formatOdds }: { market: GeopoliticsMarket; featured: boolean; onPress: () => void; formatOdds: (p: number | null) => string }) {
  const fallbackNo = market.yesPrice !== null ? 1 - market.yesPrice : null;
  const yesText = formatOdds(market.yesPrice);
  const noText = formatOdds(market.noPrice ?? fallbackNo);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardBase, featured && styles.cardFeatured, pressed && styles.cardPressed]}>
      <View style={[styles.accentBar, featured && styles.accentBarFeatured]} />

      <View style={styles.cardTop}>
        <View style={styles.metaRow}>
          <View style={styles.geoBadge}>
            <Text style={styles.badgeTextGeo}>Geopolitics</Text>
          </View>
          <Text style={styles.deadlineText}>{formatDeadline(market.endDate, market.active)}</Text>
        </View>
        <Text style={styles.questionText} numberOfLines={2}>
          {market.question}
        </Text>
      </View>

      <View style={styles.outcomesWrap}>
        <View style={[styles.outcomeRow, { height: BINARY_ROW_HEIGHT }]}>
          <View style={styles.outcomeLeft}>
            <View style={[styles.outcomeTag, styles.outcomeTagYes]}>
              <Text style={styles.outcomeTagYesText}>YES</Text>
            </View>
            <Text style={styles.outcomeLabel}>Yes</Text>
          </View>
          <Text style={styles.outcomePctYes}>{yesText}</Text>
        </View>

        <View style={[styles.outcomeRow, { height: BINARY_ROW_HEIGHT }]}>
          <View style={styles.outcomeLeft}>
            <View style={[styles.outcomeTag, styles.outcomeTagNo]}>
              <Text style={styles.outcomeTagNoText}>NO</Text>
            </View>
            <Text style={styles.outcomeLabel}>No</Text>
          </View>
          <Text style={styles.outcomePctNo}>{noText}</Text>
        </View>
      </View>

      <View style={styles.cardFoot}>
        <Text style={styles.volText}>
          Vol 24h <Text style={styles.volTextValue}>{formatUsdCompact(market.volume24h)}</Text>
        </Text>
        <Text style={styles.volText}>{formatDeadline(market.endDate, market.active)}</Text>
      </View>
    </Pressable>
  );
}

function SportMarketCard({ market, onPress, formatOdds }: { market: SportMarket; onPress: () => void; formatOdds: (p: number | null) => string }) {
  const rankedOutcomes = [...market.outcomes]
    .slice(0, 3)
    .sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  const leadValue = rankedOutcomes[0]?.price ?? null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardBase, pressed && styles.cardPressed]}>
      <View style={[styles.accentBar, styles.accentBarSport]} />

      <View style={styles.cardTop}>
        <View style={styles.metaRow}>
          <View style={styles.sportBadge}>
            <Text style={styles.badgeTextSport}>{market.sport.toUpperCase()}</Text>
          </View>
          <Text style={styles.deadlineText}>{formatKickoff(market.endDate ?? market.startDate)}</Text>
        </View>
        <Text style={styles.questionText} numberOfLines={2}>
          {market.title}
        </Text>
      </View>

      <View style={styles.outcomesWrap}>
        {rankedOutcomes.map((outcome) => {
          const isDraw = outcome.label.toLowerCase().includes('draw');
          const isLead = leadValue !== null && outcome.price === leadValue;

          return (
            <View key={outcome.conditionId ?? outcome.label} style={[styles.outcomeRow, { height: SPORT_ROW_HEIGHT }]}>
              <View style={styles.outcomeLeft}>
                {isDraw ? (
                  <View style={[styles.outcomeTag, styles.outcomeTagDraw]}>
                    <Text style={styles.outcomeTagDrawText}>DRAW</Text>
                  </View>
                ) : null}
                <Text style={[styles.outcomeLabel, !isLead && styles.outcomeLabelDim]} numberOfLines={1}>
                  {outcome.label.replace(/^Draw\s*\((.*)\)$/i, 'Draw')}
                </Text>
              </View>
              <Text style={isLead ? styles.outcomePctLead : styles.outcomePctDim}>
                {formatOdds(outcome.price)}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.cardFoot}>
        <Text style={styles.volText}>
          Vol 24h <Text style={styles.volTextValue}>{formatUsdCompact(market.volume24h)}</Text>
        </Text>
      </View>
    </Pressable>
  );
}

export default function PredictScreen() {
  const router = useRouter();
  const { format, setFormat, formatOdds } = useOddsFormat();
  const [filter, setFilter] = useState<PredictFilter>('All');
  const [geoMarkets, setGeoMarkets] = useState<GeopoliticsMarket[]>([]);
  const [eplMarkets, setEplMarkets] = useState<SportMarket[]>([]);
  const [uclMarkets, setUclMarkets] = useState<SportMarket[]>([]);
  const [trendingMarkets, setTrendingMarkets] = useState<TrendingMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadPredictData() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [geo, epl, ucl, trending] = await Promise.all([
        fetchCuratedMarkets(),
        fetchSportsMarkets('epl'),
        fetchSportsMarkets('ucl'),
        fetchTrendingMarkets(10).catch(() => [] as TrendingMarket[]),
      ]);

      setGeoMarkets(geo);
      setEplMarkets(epl);
      setUclMarkets(ucl);
      setTrendingMarkets(trending);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load predict markets';
      setErrorMessage(message);
      setGeoMarkets([]);
      setEplMarkets([]);
      setUclMarkets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPredictData();
  }, []);

  const sortedGeo = useMemo(() => [...geoMarkets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)), [geoMarkets]);
  const sortedEpl = useMemo(() => [...eplMarkets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)), [eplMarkets]);
  const sortedUcl = useMemo(() => [...uclMarkets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)), [uclMarkets]);

  return (
    <SafeAreaView style={styles.screen}>
      {/* header */}
      <View style={styles.predictHeader}>
        <Pressable onPress={() => router.push('/predict-profile')} style={styles.avatarRing}>
          <View style={styles.avatarInner}><Text style={styles.avatarText}>B</Text></View>
        </Pressable>
        <Text style={styles.predictTitle}>Predict</Text>
        <View style={styles.liveChip}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* trending strip */}
      {trendingMarkets.length > 0 ? (
        <View style={styles.trendSection}>
          <Text style={styles.trendLabel}>↗ Trending</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendScroll}>
            {trendingMarkets.map((m) => (
              <TrendingCard
                key={m.slug}
                market={m}
                onPress={() => router.push({ pathname: '/predict-market/[slug]', params: { slug: m.slug } })}
                formatOdds={formatOdds}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.filterStripShell}>
        <View style={styles.filterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterStrip}>
            {FILTERS.map((value) => {
              const active = value === filter;
              return (
                <Pressable
                  key={value}
                  onPress={() => setFilter(value)}
                  style={[styles.filterChip, active ? styles.filterChipOn : styles.filterChipOff]}>
                  <Text style={active ? styles.filterTextOn : styles.filterTextOff}>{value}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.toggleWrap}>
            <OddsFormatToggle format={format} onFormatChange={setFormat} />
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.feedContent}>
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={semantic.text.accent} />
            <Text style={styles.stateText}>Loading predict markets...</Text>
          </View>
        ) : null}

        {!loading && errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Predict unavailable</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadPredictData()}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorMessage && (filter === 'All' || filter === 'Geopolitics') ? (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>Geopolitics · Active</Text>
              <Text style={styles.sectionLabelRight}>{sortedGeo.length} markets</Text>
            </View>
            {sortedGeo.map((market, index) => (
              <BinaryMarketCard
                key={market.slug}
                market={market}
                featured={index === 0}
                onPress={() => router.push({ pathname: '/predict-market/[slug]', params: { slug: market.slug } })}
                formatOdds={formatOdds}
              />
            ))}
          </View>
        ) : null}

        {!loading && !errorMessage && (filter === 'All' || filter === 'EPL') ? (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>EPL · Matchday</Text>
              <Text style={styles.sectionLabelRight}>{sortedEpl.length} fixtures</Text>
            </View>
            {sortedEpl.map((market) => (
              <SportMarketCard
                key={market.slug}
                market={market}
                onPress={() =>
                  router.push({
                    pathname: '/predict-sport/[sport]/[slug]',
                    params: { sport: market.sport, slug: market.slug },
                  })
                }
                formatOdds={formatOdds}
              />
            ))}
          </View>
        ) : null}

        {!loading && !errorMessage && (filter === 'All' || filter === 'UCL') ? (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>UCL · Fixtures</Text>
              <Text style={styles.sectionLabelRight}>{sortedUcl.length} fixtures</Text>
            </View>
            {sortedUcl.map((market) => (
              <SportMarketCard
                key={market.slug}
                market={market}
                onPress={() =>
                  router.push({
                    pathname: '/predict-sport/[sport]/[slug]',
                    params: { sport: market.sport, slug: market.slug },
                  })
                }
                formatOdds={formatOdds}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },
  // ─── predict header ───
  predictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  avatarRing: {
    width: 28, height: 28,
    borderRadius: 14,
    padding: 2,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: semantic.text.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: semantic.background.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: semantic.text.primary,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  predictTitle: {
    flex: 1,
    textAlign: 'center',
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xs,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(52,199,123,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,123,0.18)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveDot: {
    width: 5, height: 5,
    borderRadius: 3,
    backgroundColor: semantic.sentiment.positive,
  },
  liveText: {
    color: semantic.sentiment.positive,
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  // ─── trending strip ───
  trendSection: {
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    paddingTop: 10,
  },
  trendLabel: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    paddingHorizontal: tokens.spacing.lg,
    marginBottom: 8,
  },
  trendScroll: {
    gap: 8,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: 12,
  },
  trendCard: {
    width: 144,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    padding: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  trendQuestion: {
    color: semantic.text.primary,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 8,
    minHeight: 28,
  },
  trendFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trendPill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  trendPillYes: { backgroundColor: 'rgba(52,199,123,0.15)' },
  trendPillNo:  { backgroundColor: 'rgba(244,88,78,0.12)' },
  trendPillText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  trendPillTextYes: { color: semantic.sentiment.positive },
  trendPillTextNo:  { color: semantic.sentiment.negative },
  trendVol: {
    color: semantic.text.faint,
    fontSize: 8,
    fontFamily: 'monospace',
  },
  trendBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 2,
    backgroundColor: semantic.border.muted,
  },
  trendBarFill: { height: 2, borderRadius: 1 },
  trendBarFillYes: { backgroundColor: semantic.sentiment.positive },
  trendBarFillNo:  { backgroundColor: semantic.sentiment.negative },
  // ─── filter strip ───
  filterStripShell: {
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterStrip: {
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    flex: 1,
  },
  toggleWrap: {
    paddingRight: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
  },
  filterChipOn: {
    backgroundColor: semantic.text.accent,
    borderColor: semantic.text.accent,
  },
  filterChipOff: {
    backgroundColor: semantic.background.surfaceRaised,
    borderColor: semantic.text.faint,
  },
  filterTextOn: {
    color: semantic.background.screen,
    fontSize: tokens.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  filterTextOff: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  feedContent: {
    paddingHorizontal: 14,
    paddingTop: tokens.spacing.sm,
    paddingBottom: 128,
    gap: 6,
  },
  sectionWrap: {
    gap: 6,
  },
  sectionLabelRow: {
    paddingVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xs,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  sectionLabelRight: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xs,
    letterSpacing: 0.8,
    textTransform: 'lowercase',
    fontFamily: 'monospace',
  },
  cardBase: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardFeatured: {
    backgroundColor: '#252619',
    borderColor: semantic.predict.cardFeatured,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 2,
    backgroundColor: semantic.text.accentDim,
    opacity: 0.7,
  },
  accentBarFeatured: {
    backgroundColor: semantic.text.accent,
    opacity: 1,
  },
  accentBarSport: {
    backgroundColor: semantic.sentiment.positive,
    opacity: 0.6,
  },
  cardTop: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  metaRow: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  geoBadge: {
    backgroundColor: semantic.predict.badgeGeoBg,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sportBadge: {
    backgroundColor: semantic.predict.badgeSportBg,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeTextGeo: {
    color: semantic.text.accentDim,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  badgeTextSport: {
    color: semantic.sentiment.positive,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  deadlineText: {
    marginLeft: 'auto',
    color: semantic.text.faint,
    fontSize: 8,
    letterSpacing: 0.6,
    fontFamily: 'monospace',
  },
  questionText: {
    color: semantic.text.primary,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.1,
    fontWeight: '600',
  },
  outcomesWrap: {
    paddingHorizontal: 12,
    gap: 2,
  },
  outcomeRow: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.predict.rowBorderSoft,
    borderRadius: tokens.radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  outcomeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    paddingRight: tokens.spacing.sm,
  },
  outcomeTag: {
    minWidth: 36,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeTagYes: {
    backgroundColor: semantic.predict.outcomeYesBg,
    borderColor: semantic.predict.outcomeYesBorder,
  },
  outcomeTagNo: {
    backgroundColor: semantic.predict.outcomeNoBg,
    borderColor: semantic.predict.outcomeNoBorder,
  },
  outcomeTagDraw: {
    backgroundColor: semantic.predict.outcomeDrawBg,
    borderColor: semantic.predict.outcomeDrawBorder,
  },
  outcomeTagYesText: {
    color: semantic.sentiment.positive,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  outcomeTagNoText: {
    color: semantic.sentiment.negative,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  outcomeTagDrawText: {
    color: semantic.text.dim,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  outcomeLabel: {
    color: semantic.text.primary,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  outcomeLabelDim: {
    color: semantic.text.dim,
  },
  outcomePctYes: {
    color: semantic.sentiment.positive,
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },
  outcomePctNo: {
    color: semantic.sentiment.negative,
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },
  outcomePctLead: {
    color: semantic.text.accent,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },
  outcomePctDim: {
    color: semantic.text.dim,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },
  cardFoot: {
    marginTop: 6,
    paddingTop: 8,
    paddingBottom: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  volText: {
    color: semantic.text.faint,
    fontSize: 9,
    letterSpacing: 0.7,
    fontFamily: 'monospace',
  },
  volTextValue: {
    color: semantic.text.dim,
  },
  stateCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  stateTitle: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  stateText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.md,
  },
  retryButton: {
    marginTop: tokens.spacing.xs,
    backgroundColor: semantic.text.accent,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: semantic.background.screen,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
