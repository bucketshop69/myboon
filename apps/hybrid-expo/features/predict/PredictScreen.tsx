import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarTrigger } from '@/components/drawer/AvatarTrigger';
import { fetchPredictFeed } from '@/features/predict/predict.api';
import type { FeedItem, FeedItemBinary, FeedItemMatch, FeedResponse } from '@/features/predict/predict.types';
import { useOddsFormat } from '@/hooks/useOddsFormat';
import { semantic, tokens } from '@/theme';
import { formatUsdCompact } from '@/lib/format';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatGameTime(isoDate: string | null): string {
  if (!isoDate) return 'TBD';
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return 'TBD';
  const date = new Date(time);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const clock = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${month} ${day} · ${clock}`;
}

function formatEndDate(endDate: string | null): string {
  if (!endDate) return '';
  const time = Date.parse(endDate);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return `Ends ${month} ${day}`;
}

// ─── category badge colors ───────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  crypto: { bg: 'rgba(123, 97, 255, 0.15)', text: '#7b61ff' },
  politics: { bg: 'rgba(232, 197, 71, 0.15)', text: tokens.colors.accent },
  macro: { bg: 'rgba(78, 168, 222, 0.15)', text: '#4ea8de' },
  sports: { bg: 'rgba(52, 199, 123, 0.15)', text: tokens.colors.positive },
};

function getCategoryColor(category: string): { bg: string; text: string } {
  const key = category.toLowerCase();
  return CATEGORY_COLORS[key] ?? { bg: semantic.predict.badgeGeoBg as string, text: semantic.text.accentDim as string };
}

// ─── sub-components ──────────────────────────────────────────────────────────

function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View style={[styles.pulseDot, { opacity }]} />;
}

function LiveBadge() {
  return (
    <View style={styles.liveBadge}>
      <PulsingDot />
      <Text style={styles.liveBadgeText}>LIVE</Text>
    </View>
  );
}


function CategoryBadge({ category }: { category: string }) {
  const colors = getCategoryColor(category);
  return (
    <View style={[styles.categoryBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.categoryBadgeText, { color: colors.text }]}>
        {category.toUpperCase()}
      </Text>
    </View>
  );
}

// ─── binary market card ──────────────────────────────────────────────────────

function BinaryCard({ item, onPress, formatOdds }: { item: FeedItemBinary; onPress: () => void; formatOdds: (p: number | null) => string }) {
  const yesPct = Math.round(item.price * 100);
  const noPct = 100 - yesPct;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.binaryCard, pressed && styles.cardPressed]}>
      {/* top row: image + category badge + question */}
      <View style={styles.binaryTop}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.binaryImg} resizeMode="cover" />
        ) : null}
        <View style={{ flex: 1 }}>
          <View style={styles.metaRow}>
            <CategoryBadge category={item.category} />
          </View>
          <Text style={styles.questionText} numberOfLines={2}>{item.title}</Text>
        </View>
      </View>

      {/* probability bar */}
      <View style={styles.binaryBarRow}>
        <Text style={styles.binaryBarLabel}>YES</Text>
        <View style={styles.binaryBarTrack}>
          <View style={[styles.binaryBarFillYes, { width: `${yesPct}%` }]} />
        </View>
        <Text style={styles.binaryBarLabel}>NO</Text>
      </View>

      {/* percentages + volume */}
      <View style={styles.binaryPctRow}>
        <Text style={styles.pctYes}>{formatOdds(item.price)}</Text>
        <Text style={styles.volBadge}>{formatUsdCompact(item.volume)} vol</Text>
        <Text style={styles.pctNo}>{formatOdds(1 - item.price)}</Text>
      </View>
    </Pressable>
  );
}

// ─── match card (epl / ipl) ──────────────────────────────────────────────────

function shortTeamName(label: string): string {
  // Strip "Draw (X vs Y)" to just "Draw", and shorten long team names
  if (label.toLowerCase().startsWith('draw')) return 'Draw';
  return label.replace(/\s*(FC|United|Wanderers|Hotspur|City)\b\.?/gi, '').trim();
}

function MatchCard({ item, onPress, formatOdds }: { item: FeedItemMatch; onPress: () => void; formatOdds: (p: number | null) => string }) {
  const isLive = item.status === 'live';
  const hasDraw = item.outcomes.length >= 3;
  // For display: first non-draw = team A, last non-draw = team B
  const nonDraw = item.outcomes.filter((o) => !o.label.toLowerCase().startsWith('draw'));
  const teamA = nonDraw[0]?.label ?? '';
  const teamB = nonDraw[1]?.label ?? '';
  const kickoff = item.gameStartTime ?? item.startDate;

  // Odds bar segments
  const teamAPrice = nonDraw[0]?.price ?? 0.5;
  const teamBPrice = nonDraw[1]?.price ?? 0.5;
  const drawOutcome = item.outcomes.find((o) => o.label.toLowerCase().startsWith('draw'));
  const drawPrice = drawOutcome?.price ?? 0;
  const teamAPct = Math.round(teamAPrice * 100);
  const teamBPct = Math.round(teamBPrice * 100);
  const drawPct = Math.round(drawPrice * 100);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sportCard,
        isLive && styles.sportCardLive,
        pressed && styles.cardPressed,
      ]}>
      {/* meta row: status badge + league */}
      <View style={styles.sportMeta}>
        {isLive ? <LiveBadge /> : (
          <View style={styles.upcomingBadgeInline}>
            <Text style={styles.upcomingKickoff}>{formatGameTime(kickoff)}</Text>
          </View>
        )}
        <Text style={styles.sportLeague}>{item.sport.toUpperCase()}</Text>
      </View>

      {/* teams row */}
      <View style={styles.teamsRow}>
        <Text style={styles.teamName} numberOfLines={1}>{shortTeamName(teamA)}</Text>
        <Text style={styles.vsBadge}>vs</Text>
        <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={1}>{shortTeamName(teamB)}</Text>
      </View>

      {/* odds bar */}
      <View style={styles.oddsBar}>
        <View style={[styles.oddsBarSeg, styles.oddsBarPos, { flex: teamAPct || 1 }]} />
        {hasDraw ? <View style={[styles.oddsBarSeg, styles.oddsBarDraw, { flex: drawPct || 1 }]} /> : null}
        <View style={[styles.oddsBarSeg, styles.oddsBarNeg, { flex: teamBPct || 1 }]} />
      </View>

      {/* odds row */}
      <View style={styles.oddsRow}>
        <Text style={[styles.oddsPct, styles.oddsPctPos]}>{formatOdds(teamAPrice)}</Text>
        {hasDraw ? (
          <Text style={styles.oddsDraw}>{drawPct}% draw</Text>
        ) : (
          <Text style={styles.sportVol}>Vol {formatUsdCompact(item.volume)}</Text>
        )}
        <Text style={[styles.oddsPct, styles.oddsPctNeg]}>{formatOdds(teamBPrice)}</Text>
      </View>

      {/* volume below odds row for 3-way */}
      {hasDraw ? <Text style={[styles.sportVol, { marginTop: 6 }]}>Vol {formatUsdCompact(item.volume)}</Text> : null}
    </Pressable>
  );
}

// ─── section header ───────────────────────────────────────────────────────────

function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={semantic.text.faint} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SectionHeader({ label, count, onPress, isLive }: { label: string; count?: number; onPress?: () => void; isLive?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.sectionLabelRow, pressed && styles.sectionPressed]}>
      <View style={styles.sectionLeft}>
        <Text style={[styles.sectionLabel, isLive && { color: tokens.colors.live }]}>{label}</Text>
        {count ? <View style={styles.sectionCountBadge}><Text style={styles.sectionCount}>{count}</Text></View> : null}
      </View>
      {onPress ? <ChevronRight /> : null}
    </Pressable>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

export default function PredictScreen() {
  const router = useRouter();
  const { formatOdds } = useOddsFormat();
  const insets = useSafeAreaInsets();

  const [feedData, setFeedData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  async function loadFeed() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchPredictFeed();
      setFeedData(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load predict feed';
      setErrorMessage(message);
      setFeedData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, []);

  // Build chip list: "All" + only categories that have items
  const chips = useMemo(() => {
    if (!feedData) return ['All'];
    const itemCats = new Set(feedData.items.map((i) => i.category.toLowerCase()));
    const withItems = feedData.categories.filter((c) => itemCats.has(c.toLowerCase()));
    return ['All', ...withItems];
  }, [feedData]);

  // Filtered items based on selected category
  const filteredItems = useMemo<FeedItem[]>(() => {
    if (!feedData) return [];
    if (activeCategory === 'All') return feedData.items;
    return feedData.items.filter((item) =>
      item.category.toLowerCase() === activeCategory.toLowerCase(),
    );
  }, [feedData, activeCategory]);

  // Derived sections (only used when "All" is selected)
  const liveItems = useMemo(
    () => feedData?.items.filter((item) => item.status === 'live') ?? [],
    [feedData],
  );

  const eplUpcoming = useMemo(
    () =>
      feedData?.items.filter(
        (item): item is FeedItemMatch =>
          item.type === 'match' &&
          item.sport === 'epl' &&
          item.status === 'upcoming',
      ) ?? [],
    [feedData],
  );

  const iplUpcoming = useMemo(
    () =>
      feedData?.items.filter(
        (item): item is FeedItemMatch =>
          item.type === 'match' &&
          item.sport === 'ipl' &&
          item.status === 'upcoming',
      ) ?? [],
    [feedData],
  );

  const binaryItems = useMemo(
    () =>
      feedData?.items.filter((item): item is FeedItemBinary => item.type === 'binary') ?? [],
    [feedData],
  );

  function navigateBinary(slug: string) {
    router.push({ pathname: '/predict-market/[slug]', params: { slug } });
  }

  function navigateMatch(sport: string, slug: string) {
    router.push({ pathname: '/predict-sport/[sport]/[slug]', params: { sport, slug } });
  }

  const isAllSelected = activeCategory === 'All';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* header */}
      <View style={styles.predictHeader}>
        <AvatarTrigger />
        <Text style={styles.predictTitle}>Predict</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* category filter chips */}
      <View style={styles.filterStripShell}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterStrip}>
          {chips.map((chip) => {
            const active = chip === activeCategory;
            return (
              <Pressable
                key={chip}
                onPress={() => setActiveCategory(chip)}
                style={[styles.filterChip, active ? styles.filterChipOn : styles.filterChipOff]}>
                <Text style={active ? styles.filterTextOn : styles.filterTextOff}>{chip}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* feed scroll */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.text.accent} />
        }>
        {/* loading */}
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={semantic.text.accent} />
            <Text style={styles.stateText}>Loading markets...</Text>
          </View>
        ) : null}

        {/* error */}
        {!loading && errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Predict unavailable</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadFeed()}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── "All" sectioned layout ── */}
        {!loading && !errorMessage && isAllSelected ? (
          <>
            {/* Live Now */}
            {liveItems.length > 0 ? (
              <View style={styles.sectionWrap}>
                <SectionHeader label="Live Now" isLive />
                {liveItems.map((item) =>
                  item.type === 'binary' ? (
                    <BinaryCard
                      key={item.slug}
                      item={item}
                      onPress={() => navigateBinary(item.slug)}
                      formatOdds={formatOdds}
                    />
                  ) : (
                    <MatchCard
                      key={item.slug}
                      item={item}
                      onPress={() => navigateMatch(item.sport, item.slug)}
                      formatOdds={formatOdds}
                    />
                  ),
                )}
              </View>
            ) : null}

            {/* EPL Upcoming */}
            {eplUpcoming.length > 0 ? (
              <View style={styles.sectionWrap}>
                <SectionHeader
                  label="EPL · Upcoming"
                  count={eplUpcoming.length}
                  onPress={() => setActiveCategory('sports')}
                />
                {eplUpcoming.map((item) => (
                  <MatchCard
                    key={item.slug}
                    item={item}
                    onPress={() => navigateMatch(item.sport, item.slug)}
                    formatOdds={formatOdds}
                  />
                ))}
              </View>
            ) : null}

            {/* IPL Upcoming */}
            {iplUpcoming.length > 0 ? (
              <View style={styles.sectionWrap}>
                <SectionHeader
                  label="IPL · Upcoming"
                  count={iplUpcoming.length}
                  onPress={() => setActiveCategory('sports')}
                />
                {iplUpcoming.map((item) => (
                  <MatchCard
                    key={item.slug}
                    item={item}
                    onPress={() => navigateMatch(item.sport, item.slug)}
                    formatOdds={formatOdds}
                  />
                ))}
              </View>
            ) : null}

            {/* Markets (binary) */}
            {binaryItems.length > 0 ? (
              <View style={styles.sectionWrap}>
                <SectionHeader
                  label="Markets"
                  count={binaryItems.length}
                />
                {binaryItems.map((item) => (
                  <BinaryCard
                    key={item.slug}
                    item={item}
                    onPress={() => navigateBinary(item.slug)}
                    formatOdds={formatOdds}
                  />
                ))}
              </View>
            ) : null}

            {/* empty state */}
            {liveItems.length === 0 && eplUpcoming.length === 0 && iplUpcoming.length === 0 && binaryItems.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>No markets</Text>
                <Text style={styles.stateText}>Pull down to refresh.</Text>
              </View>
            ) : null}
          </>
        ) : null}

        {/* ── category-filtered flat list ── */}
        {!loading && !errorMessage && !isAllSelected ? (
          <View style={styles.sectionWrap}>
            <SectionHeader label={activeCategory} />
            {filteredItems.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>No {activeCategory} markets available.</Text>
              </View>
            ) : null}
            {filteredItems.map((item) =>
              item.type === 'binary' ? (
                <BinaryCard
                  key={item.slug}
                  item={item}
                  onPress={() => navigateBinary(item.slug)}
                  formatOdds={formatOdds}
                />
              ) : (
                <MatchCard
                  key={item.slug}
                  item={item}
                  onPress={() => navigateMatch(item.sport, item.slug)}
                  formatOdds={formatOdds}
                />
              ),
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },
  // ─── header ───
  predictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
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
    backgroundColor: 'rgba(232, 197, 71, 0.12)',
    borderColor: 'rgba(232, 197, 71, 0.3)',
  },
  filterChipOff: {
    backgroundColor: semantic.background.surface,
    borderColor: semantic.border.muted,
  },
  filterTextOn: {
    color: tokens.colors.accent,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  filterTextOff: {
    color: semantic.text.faint,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  // ─── feed ───
  feedContent: {
    paddingHorizontal: 14,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
    gap: 6,
  },
  sectionWrap: {
    gap: 6,
  },
  // ─── section header ───
  sectionLabelRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
  },
  sectionPressed: {
    backgroundColor: tokens.colors.lift,
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionLabel: {
    color: semantic.text.primary,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  sectionCountBadge: {
    backgroundColor: tokens.colors.lift,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sectionCount: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: semantic.text.faint,
  },
  // ─── shared ───
  cardPressed: {
    opacity: 0.9,
  },
  metaRow: {
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  questionText: {
    color: semantic.text.primary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  // ─── badges ───
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(244, 88, 78, 0.25)',
    backgroundColor: 'rgba(244, 88, 78, 0.10)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.colors.live,
  },
  liveBadgeText: {
    color: tokens.colors.live,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  categoryBadge: {
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  // ─── binary card (mockup: geo-card) ───
  binaryCard: {
    marginBottom: 8,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 12,
    padding: 12,
  },
  binaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  binaryImg: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: tokens.colors.lift,
  },
  binaryBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 7,
  },
  binaryBarLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: semantic.text.faint,
    width: 24,
  },
  binaryBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: tokens.colors.lift,
    borderRadius: 2,
    overflow: 'hidden',
  },
  binaryBarFillYes: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: tokens.colors.positive,
    borderRadius: 2,
  },
  binaryPctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pctYes: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.positive,
  },
  pctNo: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.vermillion,
  },
  volBadge: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: semantic.text.faint,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  // ─── sport card (mockup: sport-card) ───
  sportCard: {
    marginHorizontal: 0,
    marginBottom: 8,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 12,
    padding: 12,
  },
  sportCardLive: {
    borderColor: 'rgba(244, 88, 78, 0.2)',
  },
  sportMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sportLeague: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  upcomingBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upcomingKickoff: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: semantic.text.faint,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  teamName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: semantic.text.primary,
  },
  teamNameRight: {
    textAlign: 'right',
  },
  vsBadge: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: semantic.text.faint,
    paddingHorizontal: 8,
  },
  // ─── odds bar (unified for sport + binary) ───
  oddsBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 6,
  },
  oddsBarSeg: {
    borderRadius: 3,
    minWidth: 3,
  },
  oddsBarPos: {
    backgroundColor: tokens.colors.positive,
  },
  oddsBarNeg: {
    backgroundColor: tokens.colors.vermillion,
  },
  oddsBarDraw: {
    backgroundColor: tokens.colors.accent,
  },
  oddsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  oddsPct: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
  },
  oddsPctPos: {
    color: tokens.colors.positive,
  },
  oddsPctNeg: {
    color: tokens.colors.vermillion,
  },
  oddsDraw: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: tokens.colors.accent,
  },
  sportVol: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: semantic.text.faint,
  },
  // ─── state cards ───
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
