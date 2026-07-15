import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedHeader } from '@/features/feed/components/FeedHeader';
import { FeedList } from '@/features/feed/components/FeedList';
import { FeedSkeleton } from '@/features/feed/components/FeedSkeleton';
import { NarrativeSheet } from '@/features/feed/components/NarrativeSheet';
import type { NarrativeSheetItem } from '@/features/feed/components/NarrativeSheet';
import { fetchFeedItems } from '@/features/feed/feed.api';
import { FEED_COLORS } from '@/features/feed/feed.constants';
import type { FeedItem } from '@/features/feed/feed.types';
import { useFocusedAppStateInterval } from '@/hooks/useFocusedAppStateInterval';

const PAGE_SIZE = 20;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const TIMEAGO_TICK_MS = 60 * 1000; // 1 minute

export default function FeedScreen() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<NarrativeSheetItem | null>(null);
  const [, setTick] = useState(0); // force re-render for live timeAgo

  const loadingMoreRef = useRef(false);

  async function loadFeed(silent = false): Promise<void> {
    if (!silent) setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextItems = await fetchFeedItems(PAGE_SIZE, 0);
      setItems(nextItems);
      setHasMore(nextItems.length >= PAGE_SIZE);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load feed';
      if (!silent) setErrorMessage(message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextItems = await fetchFeedItems(PAGE_SIZE, 0);
      setItems(nextItems);
      setHasMore(nextItems.length >= PAGE_SIZE);
    } catch {
      // silent fail on pull-to-refresh
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleEndReached = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const moreItems = await fetchFeedItems(PAGE_SIZE, items.length);
      if (moreItems.length < PAGE_SIZE) setHasMore(false);
      setItems((prev) => [...prev, ...moreItems]);
    } catch {
      // silent fail on pagination
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [hasMore, items.length]);

  // Initial load
  useEffect(() => {
    void loadFeed();
  }, []);

  // Auto-refresh every 5 minutes while the feed is visible and the app is active.
  useFocusedAppStateInterval(() => void loadFeed(true), AUTO_REFRESH_MS);

  // Tick every minute to update timeAgo displays while the feed is visible.
  useFocusedAppStateInterval(() => setTick((t) => t + 1), TIMEAGO_TICK_MS);

  const handleCardPress = useCallback((item: FeedItem) => {
    setSheetItem({
      id: item.id,
      title: item.headline,
      summary: item.description,
      createdAt: item.createdAt,
    });
  }, []);

  const handleSheetClose = useCallback(() => {
    setSheetItem(null);
  }, []);

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FeedHeader />

      {isLoading ? (
        <FeedSkeleton />
      ) : null}

      {!isLoading && errorMessage ? (
        <View style={styles.bodyFill}>
          <View style={styles.stateWrap}>
            <Text style={styles.stateTitle}>Feed unavailable</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <Pressable onPress={() => void loadFeed()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!isLoading && !errorMessage && items.length === 0 ? (
        <View style={styles.bodyFill}>
          <View style={styles.stateWrap}>
            <Text style={styles.stateTitle}>No narratives yet</Text>
            <Text style={styles.stateText}>Publisher has not emitted new feed items.</Text>
          </View>
        </View>
      ) : null}

      {!isLoading && !errorMessage && items.length > 0 ? (
        <FeedList
          items={items}
          onCardPress={handleCardPress}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleEndReached}
          loadingMore={loadingMore}
        />
      ) : null}

      <NarrativeSheet item={sheetItem} onClose={handleSheetClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: FEED_COLORS.screen,
  },
  bodyFill: {
    flex: 1,
  },
  stateWrap: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: FEED_COLORS.border,
    borderRadius: 7,
    backgroundColor: FEED_COLORS.card,
    gap: 8,
    alignItems: 'flex-start',
  },
  stateTitle: {
    color: FEED_COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },
  stateText: {
    color: FEED_COLORS.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: FEED_COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  retryButtonText: {
    color: FEED_COLORS.cardDeep,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
});
