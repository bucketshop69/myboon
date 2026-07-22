import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { AppTopBarLogo } from '@/components/AppTopBar';
import { AvatarTrigger } from '@/components/drawer/AvatarTrigger';
import { FeedCard } from '@/features/feed/components/FeedCard';
import { NarrativeSheet, type NarrativeSheetItem } from '@/features/feed/components/NarrativeSheet';
import { StoryCarousel, StoryCarouselSkeleton } from '@/features/feed/components/StoryCarousel';
import { StorySheet } from '@/features/feed/components/StorySheet';
import { fetchFeedItems } from '@/features/feed/feed.api';
import { FEED_COLORS } from '@/features/feed/feed.constants';
import { fetchStories } from '@/features/feed/stories.api';
import type { FeedItem as NarrativeFeedItem, StorySummary } from '@/features/feed/feed.types';
import {
  KAMINO_MARK_SVG,
  METEORA_MARK_SVG,
  ORCA_MARK_SVG,
  PACIFICA_MARK_SVG,
  PHOENIX_MARK_SVG,
  POLYMARKET_MARK_SVG,
  RAYDIUM_MARK_SVG,
} from '@/features/home/marketBrandAssets';
import { PerpsAccountRow } from '@/features/wallet/PerpsAccountRow';
import { WalletAccountRow } from '@/features/wallet/WalletAccountRow';
import { WalletActivityTiles } from '@/features/wallet/WalletActivityTiles';
import { WalletHero } from '@/features/wallet/WalletHero';
import { useProtocolAccounts } from '@/features/wallet/useProtocolAccounts';
import { useSectionVisibility } from '@/features/wallet/useSectionVisibility';
import {
  WALLET_PROTOCOL_IDS,
  type WalletProtocolId,
  type WalletSourcesState,
  type WalletTotals,
} from '@/features/wallet/wallet.types';
import { useWallet } from '@/hooks/useWallet';
import { semantic, tokens } from '@/theme';

const FEED_PREVIEW_LIMIT = 3;
const HEADER_SCROLL_DISTANCE = 920;
const WALLET_SECTION_MIN_HEIGHT = 450;
const MOCKUP_FEED_SOFT = '#28A9C9';
const HOME_WALLET_CORE = '#031F2C';

type MarketAppIcon = {
  xml: string;
  width: number;
  height: number;
};

type MarketHomeApp = {
  id: 'polymarket' | 'pacifica' | 'phoenix' | 'meteora' | 'orca' | 'raydium' | 'kamino';
  name: string;
  icon: MarketAppIcon;
  route?: '/predict' | '/trade' | '/markets/phoenix' | '/markets/meteora';
};

const MARKET_APPS: MarketHomeApp[] = [
  {
    id: 'polymarket',
    name: 'Polymarket',
    icon: { xml: POLYMARKET_MARK_SVG, width: 46, height: 50 },
    route: '/predict',
  },
  {
    id: 'pacifica',
    name: 'Pacifica',
    icon: { xml: PACIFICA_MARK_SVG, width: 52, height: 52 },
    route: '/trade',
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    icon: { xml: PHOENIX_MARK_SVG, width: 46, height: 50 },
    route: '/markets/phoenix',
  },
  {
    id: 'meteora',
    name: 'Meteora',
    icon: { xml: METEORA_MARK_SVG, width: 52, height: 52 },
    route: '/markets/meteora',
  },
  {
    id: 'orca',
    name: 'Orca',
    icon: { xml: ORCA_MARK_SVG, width: 54, height: 54 },
  },
  {
    id: 'raydium',
    name: 'Raydium',
    icon: { xml: RAYDIUM_MARK_SVG, width: 46, height: 52 },
  },
  {
    id: 'kamino',
    name: 'Kamino',
    icon: { xml: KAMINO_MARK_SVG, width: 56, height: 24 },
  },
];

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

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const wallet = useWallet();
  const walletAddress = wallet.connected ? wallet.address : null;
  const { totals: walletTotals, sources: walletSources, notifyVisibility, refreshAll: refreshWallet, retrySource: retryWalletSource } = useProtocolAccounts(walletAddress);
  const { isVisible: walletSectionVisible, onSectionLayout, onViewportLayout, onScroll: onWalletScroll } = useSectionVisibility();
  const [walletRefreshing, setWalletRefreshing] = useState(false);

  const [feedItems, setFeedItems] = useState<NarrativeFeedItem[]>([]);
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetItem, setSheetItem] = useState<NarrativeSheetItem | null>(null);
  const [storySheet, setStorySheet] = useState<StorySummary | null>(null);

  const backgroundColor = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [mixHex(tokens.colors.backgroundDark, MOCKUP_FEED_SOFT, 0.32), HOME_WALLET_CORE],
    extrapolate: 'clamp',
  });

  const loadHome = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setFeedError(null);
    setStoriesError(null);

    const [storiesResult, feedResult] = await Promise.allSettled([
      fetchStories(),
      fetchFeedItems(FEED_PREVIEW_LIMIT, 0),
    ]);

    if (storiesResult.status === 'fulfilled') {
      setStories(storiesResult.value);
    } else {
      setStoriesError(storiesResult.reason instanceof Error ? storiesResult.reason.message : 'Unable to load Stories');
    }

    if (feedResult.status === 'fulfilled') {
      setFeedItems(feedResult.value);
    } else {
      setFeedError(feedResult.reason instanceof Error ? feedResult.reason.message : 'Unable to load feed');
    }

    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    notifyVisibility(walletSectionVisible);
  }, [walletSectionVisible, notifyVisibility]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHome(false);
    setRefreshing(false);
  }, [loadHome]);

  const handleWalletRefresh = useCallback(() => {
    setWalletRefreshing(true);
    refreshWallet();
    // Purely visual — sources resolve independently and asynchronously; this
    // just gives the tap a brief acknowledgement rather than tracking every
    // source's settle.
    setTimeout(() => setWalletRefreshing(false), 700);
  }, [refreshWallet]);

  const handleFeedPress = useCallback((item: NarrativeFeedItem) => {
    setSheetItem({
      id: item.id,
      title: item.headline,
      summary: item.description,
      createdAt: item.createdAt,
    });
  }, []);

  const handleMarketAppPress = useCallback((app: MarketHomeApp) => {
    if (!app.route) return;
    router.push(app.route);
  }, [router]);

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
          { useNativeDriver: false, listener: onWalletScroll },
        )}
        onLayout={onViewportLayout}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 24 }]}
      >
        <HomeSectionTitle title="Feed" />
        <Text style={styles.developingLabel}>DEVELOPING STORIES</Text>
        {loading ? <StoryCarouselSkeleton /> : null}
        {!loading && stories.length > 0 ? (
          <StoryCarousel stories={stories} onStoryPress={setStorySheet} />
        ) : null}
        {!loading && stories.length === 0 ? (
          <InlineFeedState
            title={storiesError ? 'Stories unavailable' : 'No developing Stories'}
            text={storiesError ?? 'Selected Stories will appear here.'}
            compact
          />
        ) : null}

        <View style={styles.recentHeader}>
          <Text style={styles.recentTitle}>Recent</Text>
        </View>
        {loading ? <FeedPreviewSkeleton /> : null}
        {!loading && feedItems.length > 0 ? (
          <View style={styles.feedStack}>
            {feedItems.map((item) => (
              <FeedCard key={item.id} item={item} onPress={handleFeedPress} />
            ))}
          </View>
        ) : null}
        {!loading && feedItems.length === 0 ? (
          <InlineFeedState
            title={feedError ? 'Feed unavailable' : 'No recent Feed items'}
            text={feedError ?? 'Published Feed items will appear here.'}
          />
        ) : null}
        <RouteCard
          eyebrow="Show more"
          title="Open the full Feed"
          cta="Feed"
          onPress={() => router.push('/feed')}
        />

        <HomeSectionTitle title="Markets" />
        <MarketsHomeLauncher
          apps={MARKET_APPS}
          onAppPress={handleMarketAppPress}
        />

        <HomeSectionTitle title="Wallet" />
        <View style={styles.walletSection} onLayout={onSectionLayout}>
          <WalletPreview
            walletTotals={walletTotals}
            walletSources={walletSources}
            hasAnyResolved={WALLET_PROTOCOL_IDS.some((id) => walletSources[id].status === 'resolved')}
            walletRefreshing={walletRefreshing}
            onWalletRefresh={handleWalletRefresh}
            onRetrySource={retryWalletSource}
            onOpenMeteora={() => router.push('/markets/meteora/profile')}
            onOpenPhoenix={() => router.push('/markets/phoenix/profile')}
            onOpenPacifica={() => router.push('/trade?view=profile')}
          />
        </View>

        <DummySignalsSection />
      </Animated.ScrollView>

      <NarrativeSheet item={sheetItem} onClose={() => setSheetItem(null)} />
      <StorySheet story={storySheet} onClose={() => setStorySheet(null)} />
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

function InlineFeedState({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <View style={[styles.inlineState, compact && styles.inlineStateCompact]}>
      <Text style={styles.inlineStateTitle}>{title}</Text>
      <Text style={styles.inlineStateText}>{text}</Text>
    </View>
  );
}

function FeedPreviewSkeleton() {
  return (
    <View style={styles.feedStack}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.feedSkeletonCard}>
          <View style={styles.feedSkeletonTitle} />
          <View style={styles.feedSkeletonBody} />
          <View style={styles.feedSkeletonBodyShort} />
        </View>
      ))}
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

function PreviewHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.previewHeader}>
      <Text style={styles.previewTitle}>{title}</Text>
      <Text style={styles.previewMeta}>{meta}</Text>
    </View>
  );
}

function MarketsHomeLauncher({
  apps,
  onAppPress,
}: {
  apps: MarketHomeApp[];
  onAppPress: (app: MarketHomeApp) => void;
}) {
  return (
    <View style={styles.marketsLauncher}>
      <View style={styles.marketAppGrid}>
        {apps.map((app) => (
          <MarketAppTile
            key={app.id}
            app={app}
            onPress={() => onAppPress(app)}
          />
        ))}
      </View>
    </View>
  );
}

function MarketAppTile({
  app,
  onPress,
}: {
  app: MarketHomeApp;
  onPress: () => void;
}) {
  const disabled = !app.route;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={disabled ? `${app.name} unavailable` : `Open ${app.name}`}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.marketAppTile,
        disabled && styles.marketAppTileDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.marketAppIcon}>
        <MarketAppBrandIcon icon={app.icon} />
      </View>
      <Text style={styles.marketAppName} numberOfLines={1}>{app.name}</Text>
    </Pressable>
  );
}

function MarketAppBrandIcon({ icon }: { icon: MarketAppIcon }) {
  return <SvgXml xml={icon.xml} width={icon.width} height={icon.height} />;
}

function WalletPreview({
  walletTotals,
  walletSources,
  hasAnyResolved,
  walletRefreshing,
  onWalletRefresh,
  onRetrySource,
  onOpenMeteora,
  onOpenPhoenix,
  onOpenPacifica,
}: {
  walletTotals: WalletTotals;
  walletSources: WalletSourcesState;
  hasAnyResolved: boolean;
  walletRefreshing: boolean;
  onWalletRefresh: () => void;
  onRetrySource: (id: WalletProtocolId) => void;
  onOpenMeteora: () => void;
  onOpenPhoenix: () => void;
  onOpenPacifica: () => void;
}) {
  return (
    <View style={styles.walletWrap}>
      <WalletHero
        totals={walletTotals}
        hasAnyResolved={hasAnyResolved}
        isRefreshing={walletRefreshing}
        onRefresh={onWalletRefresh}
      />
      <WalletActivityTiles />
      <View style={styles.accountsList}>
        <WalletAccountRow protocol="spot" source={walletSources.spot} onRetry={onRetrySource} />
        <WalletAccountRow
          protocol="meteora"
          source={walletSources.meteora}
          onRetry={onRetrySource}
          onPress={onOpenMeteora}
        />
        <PerpsAccountRow protocol="phoenix" source={walletSources.phoenix} onRetry={onRetrySource} onPress={onOpenPhoenix} />
        <PerpsAccountRow protocol="pacifica" source={walletSources.pacifica} onRetry={onRetrySource} onPress={onOpenPacifica} />
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
  developingLabel: {
    color: FEED_COLORS.accent,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 14,
  },
  recentHeader: {
    marginTop: 26,
    marginBottom: 13,
  },
  recentTitle: {
    color: FEED_COLORS.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  feedStack: {
    gap: 10,
  },
  inlineState: {
    minHeight: 118,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: FEED_COLORS.border,
    backgroundColor: FEED_COLORS.card,
    padding: 14,
    justifyContent: 'center',
    gap: 6,
  },
  inlineStateCompact: {
    minHeight: 145,
  },
  inlineStateTitle: {
    color: FEED_COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },
  inlineStateText: {
    color: FEED_COLORS.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
  feedSkeletonCard: {
    minHeight: 118,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: FEED_COLORS.border,
    backgroundColor: FEED_COLORS.card,
    padding: 14,
    gap: 11,
    opacity: 0.68,
  },
  feedSkeletonTitle: {
    width: '72%',
    height: 32,
    borderRadius: 4,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  feedSkeletonBody: {
    width: '94%',
    height: 11,
    borderRadius: 3,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  feedSkeletonBodyShort: {
    width: '62%',
    height: 11,
    borderRadius: 3,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  routeCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: 8,
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
  marketsLauncher: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.78)',
    backgroundColor: 'rgba(6,51,67,0.62)',
    padding: 10,
  },
  marketAppGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  marketAppTile: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.74)',
    backgroundColor: 'rgba(3,31,44,0.46)',
    paddingHorizontal: 8,
    paddingVertical: 14,
    gap: 11,
  },
  marketAppTileDisabled: {
    opacity: 0.58,
  },
  marketAppIcon: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,250,252,0.10)',
    backgroundColor: 'rgba(1,11,18,0.34)',
  },
  marketAppName: {
    color: semantic.text.primary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center',
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
  walletWrap: {
    gap: tokens.spacing.md,
  },
  walletSection: {
    minHeight: WALLET_SECTION_MIN_HEIGHT,
    justifyContent: 'flex-start',
  },
  meta: {
    color: semantic.text.faint,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  accountsList: {
    gap: tokens.spacing.sm,
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
