import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedHeader } from '@/features/feed/components/FeedHeader';
import { FeedList } from '@/features/feed/components/FeedList';
import { FeedSkeleton } from '@/features/feed/components/FeedSkeleton';
import { NarrativeSheet } from '@/features/feed/components/NarrativeSheet';
import type { NarrativeSheetItem } from '@/features/feed/components/NarrativeSheet';
import { fetchFeedItems } from '@/features/feed/feed.api';
import type { FeedItem } from '@/features/feed/feed.types';
import { useFocusedAppStateInterval } from '@/hooks/useFocusedAppStateInterval';
import { semantic, tokens } from '@/theme';

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
      category: item.category,
      createdAt: item.createdAt,
      actions: item.actions,
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
    backgroundColor: semantic.background.screen,
  },
  bodyFill: {
    flex: 1,
  },
  stateWrap: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.lg,
    padding: tokens.spacing.lg,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    backgroundColor: semantic.background.surface,
    gap: tokens.spacing.sm,
    alignItems: 'flex-start',
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
  },
  retryButtonText: {
    color: semantic.background.screen,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
