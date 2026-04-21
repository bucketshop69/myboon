import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WalletHeaderButton } from '@/components/wallet/WalletHeaderButton';
import { fetchCuratedMarkets, fetchSportsMarkets } from '@/features/predict/predict.api';
import type { GeopoliticsMarket, PredictFilter, SportMarket } from '@/features/predict/predict.types';
import { useOddsFormat } from '@/hooks/useOddsFormat';
import { semantic, tokens } from '@/theme';
import { formatUsdCompact } from '@/lib/format';

const FILTERS: PredictFilter[] = ['All', 'Geopolitics', 'EPL', 'UCL'];
const BINARY_ROW_HEIGHT = 40;
const SPORT_ROW_HEIGHT = 34;

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
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
        <Text style={styles.volText}>
          Liq <Text style={styles.volTextValue}>{formatUsdCompact(market.liquidity)}</Text>
        </Text>
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
  const { formatOdds } = useOddsFormat();
  const [filter, setFilter] = useState<PredictFilter>('All');
  const [geoMarkets, setGeoMarkets] = useState<GeopoliticsMarket[]>([]);
  const [eplMarkets, setEplMarkets] = useState<SportMarket[]>([]);
  const [uclMarkets, setUclMarkets] = useState<SportMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');

  async function loadPredictData() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [geo, epl, ucl] = await Promise.all([
        fetchCuratedMarkets(),
        fetchSportsMarkets('epl'),
        fetchSportsMarkets('ucl'),
      ]);

      setGeoMarkets(geo);
      setEplMarkets(epl);
      setUclMarkets(ucl);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPredictData();
    setRefreshing(false);
  }, []);

  const query = searchText.trim().toLowerCase();

  const sortedGeo = useMemo(() => {
    const sorted = [...geoMarkets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    if (!query) return sorted;
    return sorted.filter((m) => m.question.toLowerCase().includes(query));
  }, [geoMarkets, query]);

  const sortedEpl = useMemo(() => {
    const sorted = [...eplMarkets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    if (!query) return sorted;
    return sorted.filter((m) => m.title.toLowerCase().includes(query) || m.outcomes.some((o) => o.label.toLowerCase().includes(query)));
  }, [eplMarkets, query]);

  const sortedUcl = useMemo(() => {
    const sorted = [...uclMarkets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    if (!query) return sorted;
    return sorted.filter((m) => m.title.toLowerCase().includes(query) || m.outcomes.some((o) => o.label.toLowerCase().includes(query)));
  }, [uclMarkets, query]);

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* header */}
      <View style={styles.predictHeader}>
        <Pressable onPress={() => router.push('/predict-profile')} style={styles.avatarRing}>
          <View style={styles.avatarInner}><Text style={styles.avatarText}>B</Text></View>
        </Pressable>
        <Text style={styles.predictTitle}>Predict</Text>
        <WalletHeaderButton />
      </View>

      <View style={styles.filterStripShell}>
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
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.text.accent} />}>
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

      {/* Bottom search bar */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={16} color={semantic.text.dim} />
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search markets..."
          placeholderTextColor={semantic.text.faint}
          autoCorrect={false}
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => setSearchText('')} hitSlop={8} style={styles.searchClear}>
            <MaterialIcons name="close" size={14} color={semantic.text.dim} />
          </Pressable>
        )}
      </View>

    </View>
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
  // ─── filter strip ───
  filterStripShell: {
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  filterStrip: {
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.lg,
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
    paddingBottom: tokens.spacing.md,
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
  // ─── search bar ───
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    color: semantic.text.primary,
    padding: 0,
  },
  searchClear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: semantic.background.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
