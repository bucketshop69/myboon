import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTopBarLogo } from '@/components/AppTopBar';
import { AvatarTrigger } from '@/components/drawer/AvatarTrigger';
import { FeedCard } from '@/features/feed/components/FeedCard';
import { NarrativeSheet, type NarrativeSheetItem } from '@/features/feed/components/NarrativeSheet';
import { fetchFeedItems } from '@/features/feed/feed.api';
import type { FeedItem as NarrativeFeedItem } from '@/features/feed/feed.types';
import { fetchPredictFeed } from '@/features/predict/predict.api';
import type { FeedItem as PredictFeedItem, FeedItemBinary } from '@/features/predict/predict.types';
import {
  fetchPerpsMarkets,
  formatChange,
  formatPrice,
  formatUsdCompact,
} from '@/features/perps/perps.public-api';
import type { PerpsMarket } from '@/features/perps/perps.types';
import { semantic, tokens } from '@/theme';

const FEED_PREVIEW_LIMIT = 3;
const MARKET_PREVIEW_LIMIT = 3;
const POLYMARKET_PREVIEW_LIMIT = 5;
const HEADER_SCROLL_DISTANCE = 920;
const WALLET_SECTION_MIN_HEIGHT = 450;
const MOCKUP_FEED_SOFT = '#28A9C9';
const HOME_WALLET_CORE = '#031F2C';

function mixHex(start: string, end: string, amount: number): string {
  const normalize = (hex: string) => hex.replace('#', '');
  const startHex = normalize(start);
  const endHex = normalize(end);

  const channels = [0, 2, 4].map((index) => {
    const from = Number.parseInt(startHex.slice(index, index + 2), 16);
    const to = Number.parseInt(endHex.slice(index, index + 2), 16);
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0');
  });

  return `#${channels.join('')}`;
}

function formatOdds(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return '--';
  return `${Math.round(price * 100)}c`;
}

function getPredictRowOdds(market: PredictFeedItem): { primary: string; secondary: string } {
  if (market.type === 'binary') {
    const yesPrice = getBinaryYesPrice(market);
    const noPrice = yesPrice === null ? null : Math.max(0, 1 - yesPrice);
    return { primary: formatOdds(yesPrice), secondary: formatOdds(noPrice) };
  }

  const primary = market.outcomes[0]?.price ?? null;
  const secondary = market.outcomes[1]?.price ?? null;
  return { primary: formatOdds(primary), secondary: formatOdds(secondary) };
}

function getBinaryYesPrice(market: FeedItemBinary): number | null {
  if (Number.isFinite(market.price)) return market.price;
  const yes = market.outcomes.find((outcome) => outcome.label.toLowerCase() === 'yes');
  if (yes) return yes.price;
  return null;
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [feedItems, setFeedItems] = useState<NarrativeFeedItem[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<PredictFeedItem[]>([]);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [perps, setPerps] = useState<PerpsMarket[]>([]);
  const [perpsError, setPerpsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetItem, setSheetItem] = useState<NarrativeSheetItem | null>(null);

  const backgroundColor = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [mixHex(tokens.colors.backgroundDark, MOCKUP_FEED_SOFT, 0.32), HOME_WALLET_CORE],
    extrapolate: 'clamp',
  });

  const topPerps = useMemo(
    () => [...perps]
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
      .slice(0, MARKET_PREVIEW_LIMIT),
    [perps],
  );

  const loadHome = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setFeedError(null);
    setMarketsError(null);
    setPerpsError(null);

    const [feedResult, marketsResult, perpsResult] = await Promise.allSettled([
      fetchFeedItems(FEED_PREVIEW_LIMIT, 0),
      fetchPredictFeed(),
      fetchPerpsMarkets(),
    ]);

    if (feedResult.status === 'fulfilled') {
      setFeedItems(feedResult.value);
    } else {
      setFeedError(feedResult.reason instanceof Error ? feedResult.reason.message : 'Unable to load feed');
    }

    if (marketsResult.status === 'fulfilled') {
      setMarkets(marketsResult.value.items.slice(0, POLYMARKET_PREVIEW_LIMIT));
    } else {
      setMarketsError(marketsResult.reason instanceof Error ? marketsResult.reason.message : 'Unable to load markets');
    }

    if (perpsResult.status === 'fulfilled') {
      setPerps(perpsResult.value);
    } else {
      setPerpsError(perpsResult.reason instanceof Error ? perpsResult.reason.message : 'Unable to load perps');
    }

    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHome(false);
    setRefreshing(false);
  }, [loadHome]);

  const handleFeedPress = useCallback((item: NarrativeFeedItem) => {
    setSheetItem({
      id: item.id,
      category: item.category,
      createdAt: item.createdAt,
      actions: item.actions,
    });
  }, []);

  return (
    <View style={styles.screen}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor }]} />
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <AppTopBarLogo />
        <View style={styles.headerSpacer} />
        <AvatarTrigger />
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={semantic.text.primary}
            colors={[semantic.text.accent]}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 24 }]}
      >
        <HomeSectionTitle title="Feed" />
        <FeedSummary loading={loading} count={feedItems.length} error={feedError} />
        <View style={styles.feedStack}>
          {feedItems.map((item) => (
            <FeedCard key={item.id} item={item} onPress={handleFeedPress} />
          ))}
        </View>
        <RouteCard
          eyebrow="Show more"
          title="Open the full Feed"
          cta="Feed"
          onPress={() => router.push('/feed')}
        />

        <HomeSectionTitle title="Markets" />
        <View style={styles.marketStack}>
          <PolymarketPreview
            markets={markets}
            loading={loading}
            error={marketsError}
            onPress={() => router.push('/predict')}
          />
          <PerpsPreview
            markets={topPerps}
            loading={loading}
            error={perpsError}
            onPress={() => router.push('/trade')}
          />
        </View>

        <HomeSectionTitle title="Wallet" />
        <View style={styles.walletSection}>
          <WalletPreview
            onOpenWallet={() => router.push('/predict-profile')}
            onOpenPerps={() => router.push({ pathname: '/trade', params: { view: 'profile' } })}
            onSwap={() => router.push('/swap')}
          />
        </View>

        <DummySignalsSection />
      </Animated.ScrollView>

      <NarrativeSheet item={sheetItem} onClose={() => setSheetItem(null)} />
    </View>
  );
}

function HomeSectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function FeedSummary({ loading, count, error }: { loading: boolean; count: number; error: string | null }) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryTop}>
        <Text style={styles.summaryTitle}>Latest narratives</Text>
        <Text style={styles.summaryMeta}>Auto updated</Text>
      </View>
      <SummaryRow label="Top" value={loading ? '--' : String(Math.min(count, 1))} text="Priority story from the publisher stream" />
      <SummaryRow label="Actions" value={error ? '--' : 'Live'} text={error ?? 'Stories with market or perps routes'} />
      <SummaryRow label="Fresh" value="5m" text="Updated while the app is focused" />
    </View>
  );
}

function SummaryRow({ label, text, value }: { label: string; text: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryText} numberOfLines={2}>{text}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function RouteCard({
  eyebrow,
  title,
  cta,
  onPress,
}: {
  eyebrow: string;
  title: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.routeCard, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.routeCopy}>
        <Text style={styles.routeEyebrow}>{eyebrow}</Text>
        <Text style={styles.routeTitle}>{title}</Text>
      </View>
      <View style={styles.routePill}>
        <Text style={styles.routePillText}>{cta}</Text>
      </View>
    </Pressable>
  );
}

function PolymarketPreview({
  markets,
  loading,
  error,
  onPress,
}: {
  markets: PredictFeedItem[];
  loading: boolean;
  error: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.marketPreviewCard, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open Polymarket markets"
    >
      <PreviewHeader title="Polymarket" meta={loading ? 'Loading' : `${markets.length || 0} live`} />
      {error ? (
        <Text style={styles.previewState}>{error}</Text>
      ) : markets.length === 0 ? (
        <Text style={styles.previewState}>{loading ? 'Loading market odds...' : 'No markets available'}</Text>
      ) : (
        <View style={styles.polyList}>
          {markets.map((market) => {
            const odds = getPredictRowOdds(market);
            return (
              <View key={market.slug} style={styles.polyStrip}>
                <View style={styles.polyStripMeta}>
                  <Text style={styles.polyStripType}>
                    {market.type === 'match' ? market.sport : market.category}
                  </Text>
                </View>
                <Text style={styles.polyQuestion} numberOfLines={1}>{normalizeTitle(market.title)}</Text>
                <View style={styles.polyOdds}>
                  <Text style={[styles.polyOdd, styles.polyOddYes]}>{odds.primary}</Text>
                  <Text style={[styles.polyOdd, styles.polyOddNo]}>{odds.secondary}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

function PerpsPreview({
  markets,
  loading,
  error,
  onPress,
}: {
  markets: PerpsMarket[];
  loading: boolean;
  error: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.marketPreviewCard, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open perps markets"
    >
      <PreviewHeader title="Perps" meta={loading ? 'Loading' : 'Top movers'} />
      {error ? (
        <Text style={styles.previewState}>{error}</Text>
      ) : markets.length === 0 ? (
        <Text style={styles.previewState}>{loading ? 'Loading perps...' : 'No perps available'}</Text>
      ) : (
        <View style={styles.perpsList}>
          {markets.map((market) => {
            const base = market.symbol.split('-')[0];
            const isUp = market.change24h >= 0;
            return (
              <View key={market.symbol} style={styles.perpsRow}>
                <View style={styles.perpsCoin}>
                  <Text style={styles.perpsCoinText}>{base.slice(0, 3)}</Text>
                </View>
                <View style={styles.perpsCopy}>
                  <Text style={styles.perpsSymbol}>{market.symbol}</Text>
                  <Text style={styles.perpsSub}>Open interest {formatUsdCompact(market.openInterest)}</Text>
                </View>
                <View style={styles.perpsValue}>
                  <Text style={styles.perpsPrice}>{formatPrice(market.markPrice)}</Text>
                  <Text style={[styles.perpsChange, isUp ? styles.textPos : styles.textNeg]}>
                    {formatChange(market.change24h)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

function PreviewHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.previewHeader}>
      <Text style={styles.previewTitle}>{title}</Text>
      <Text style={styles.previewMeta}>{meta}</Text>
    </View>
  );
}

function WalletPreview({
  onOpenWallet,
  onOpenPerps,
  onSwap,
}: {
  onOpenWallet: () => void;
  onOpenPerps: () => void;
  onSwap: () => void;
}) {
  return (
    <View style={styles.walletWrap}>
      <View style={styles.walletHero}>
        <Text style={styles.meta}>Net worth</Text>
        <Text style={styles.walletValue}>$9,428</Text>
        <Text style={styles.walletDelta}>+3.8% today across 5 venues</Text>
      </View>
      <View style={styles.walletActions}>
        <WalletAction label="Picks" onPress={onOpenWallet} primary />
        <WalletAction label="Perps" onPress={onOpenPerps} />
        <WalletAction label="Swap" onPress={onSwap} />
      </View>
      <View style={styles.positionsCard}>
        <Text style={styles.meta}>Positions</Text>
        <PositionRow coin="P" name="Prediction cash" sub="Polymarket wallet" value="$1,240" delta="+6.2%" />
        <PositionRow coin="H" name="SOL-PERP" sub="Perps margin" value="$3,880" delta="+2.1%" />
        <PositionRow coin="M" name="Meteora LP" sub="SOL / USDC" value="$920" delta="+0.8%" />
      </View>
    </View>
  );
}

function WalletAction({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.walletAction,
      primary ? styles.walletActionPrimary : styles.walletActionAlt,
      pressed && styles.pressed,
    ]}>
      <Text style={[styles.walletActionText, primary ? styles.walletActionTextPrimary : styles.walletActionTextAlt]}>{label}</Text>
    </Pressable>
  );
}

function PositionRow({
  coin,
  name,
  sub,
  value,
  delta,
}: {
  coin: string;
  name: string;
  sub: string;
  value: string;
  delta: string;
}) {
  return (
    <View style={styles.positionRow}>
      <View style={styles.positionCoin}>
        <Text style={styles.positionCoinText}>{coin}</Text>
      </View>
      <View style={styles.positionCopy}>
        <Text style={styles.positionName}>{name}</Text>
        <Text style={styles.positionSub}>{sub}</Text>
      </View>
      <View style={styles.positionValueWrap}>
        <Text style={styles.positionValue}>{value}</Text>
        <Text style={styles.positionDelta}>{delta}</Text>
      </View>
    </View>
  );
}

function DummySignalsSection() {
  return (
    <View style={styles.dummyCard}>
      <PreviewHeader title="Next up" meta="Preview" />
      <DummyRow label="Alerts" text="Wallet and market events that need attention" value="Soon" />
      <DummyRow label="Agent" text="Personalized summaries from your active positions" value="3" />
      <DummyRow label="Watchlist" text="Pinned markets, tokens, and wallets in one place" value="Beta" />
    </View>
  );
}

function DummyRow({ label, text, value }: { label: string; text: string; value: string }) {
  return (
    <View style={styles.dummyRow}>
      <Text style={styles.dummyLabel}>{label}</Text>
      <Text style={styles.dummyText} numberOfLines={1}>{text}</Text>
      <Text style={styles.dummyValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#010B12',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: 6,
  },
  headerSpacer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
  },
  sectionHead: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: semantic.text.primary,
    fontSize: 54,
    lineHeight: 56,
    fontWeight: '800',
    letterSpacing: 0,
  },
  summaryCard: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: 'rgba(6,51,67,0.72)',
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
  },
  summaryTitle: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  summaryMeta: {
    color: semantic.text.faint,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summaryRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(24,90,112,0.64)',
  },
  summaryLabel: {
    width: 68,
    color: tokens.colors.accent,
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summaryText: {
    flex: 1,
    color: semantic.text.dim,
    fontSize: tokens.fontSize.sm,
    lineHeight: 16,
  },
  summaryValue: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '900',
    textAlign: 'right',
  },
  feedStack: {
    gap: tokens.spacing.md,
  },
  routeCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.md,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.86)',
    backgroundColor: 'rgba(6,51,67,0.82)',
  },
  routeCopy: {
    flex: 1,
    minWidth: 0,
  },
  routeEyebrow: {
    color: tokens.colors.accent,
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  routeTitle: {
    color: semantic.text.primary,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
  },
  routePill: {
    minWidth: 58,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: tokens.spacing.md,
  },
  routePillText: {
    color: semantic.background.screen,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  marketStack: {
    gap: tokens.spacing.md,
  },
  marketPreviewCard: {
    minHeight: 164,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.78)',
    backgroundColor: 'rgba(6,51,67,0.76)',
    padding: 13,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  previewTitle: {
    color: semantic.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  previewMeta: {
    color: semantic.text.faint,
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  previewState: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.sm,
    lineHeight: 18,
  },
  polyList: {
    gap: 9,
  },
  polyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: 32,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(24,90,112,0.52)',
  },
  polyStripMeta: {
    width: 48,
  },
  polyStripType: {
    color: tokens.colors.accent,
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  polyQuestion: {
    flex: 1,
    color: semantic.text.primary,
    fontSize: tokens.fontSize.xs,
    lineHeight: 14,
    fontWeight: '600',
  },
  polyOdds: {
    flexDirection: 'row',
    gap: 5,
  },
  polyOdd: {
    minWidth: 34,
    minHeight: 24,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 5,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '900',
    borderWidth: 1,
  },
  polyOddYes: {
    color: semantic.sentiment.positive,
    backgroundColor: 'rgba(6,214,160,0.12)',
    borderColor: 'rgba(6,214,160,0.24)',
  },
  polyOddNo: {
    color: semantic.sentiment.negative,
    backgroundColor: 'rgba(239,71,111,0.12)',
    borderColor: 'rgba(239,71,111,0.22)',
  },
  perpsList: {
    gap: 9,
  },
  perpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(24,90,112,0.52)',
  },
  perpsCoin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,138,178,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(245,250,252,0.14)',
  },
  perpsCoinText: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '900',
  },
  perpsCopy: {
    flex: 1,
    minWidth: 0,
  },
  perpsSymbol: {
    color: semantic.text.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  perpsSub: {
    color: semantic.text.faint,
    fontFamily: 'monospace',
    fontSize: 8,
  },
  perpsValue: {
    alignItems: 'flex-end',
  },
  perpsPrice: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '800',
  },
  perpsChange: {
    fontFamily: 'monospace',
    fontSize: 8,
    marginTop: 3,
  },
  textPos: {
    color: semantic.sentiment.positive,
  },
  textNeg: {
    color: semantic.sentiment.negative,
  },
  walletWrap: {
    gap: tokens.spacing.md,
  },
  walletSection: {
    minHeight: WALLET_SECTION_MIN_HEIGHT,
    justifyContent: 'flex-start',
  },
  walletHero: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.86)',
    backgroundColor: 'rgba(8,61,80,0.90)',
    padding: tokens.spacing.lg,
  },
  meta: {
    color: semantic.text.faint,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  walletValue: {
    color: semantic.text.primary,
    fontSize: 39,
    lineHeight: 42,
    fontWeight: '800',
    marginBottom: tokens.spacing.xs,
  },
  walletDelta: {
    color: semantic.sentiment.positive,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '800',
  },
  walletActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  walletAction: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  walletActionPrimary: {
    backgroundColor: tokens.colors.accent,
  },
  walletActionAlt: {
    backgroundColor: 'rgba(6,51,67,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.78)',
  },
  walletActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  walletActionTextPrimary: {
    color: semantic.background.screen,
  },
  walletActionTextAlt: {
    color: semantic.text.dim,
  },
  positionsCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.78)',
    backgroundColor: 'rgba(8,61,80,0.82)',
    padding: 13,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(24,90,112,0.62)',
  },
  positionCoin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.84)',
  },
  positionCoinText: {
    color: tokens.colors.accent,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '900',
  },
  positionCopy: {
    flex: 1,
  },
  positionName: {
    color: semantic.text.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  positionSub: {
    color: semantic.text.faint,
    fontFamily: 'monospace',
    fontSize: 8,
  },
  positionValueWrap: {
    alignItems: 'flex-end',
  },
  positionValue: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '800',
  },
  positionDelta: {
    color: semantic.sentiment.positive,
    fontFamily: 'monospace',
    fontSize: 8,
    marginTop: 3,
  },
  dummyCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.72)',
    backgroundColor: 'rgba(6,51,67,0.62)',
    padding: 13,
  },
  dummyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(24,90,112,0.50)',
  },
  dummyLabel: {
    width: 70,
    color: tokens.colors.accent,
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  dummyText: {
    flex: 1,
    color: semantic.text.dim,
    fontSize: tokens.fontSize.sm,
  },
  dummyValue: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.82,
  },
});
