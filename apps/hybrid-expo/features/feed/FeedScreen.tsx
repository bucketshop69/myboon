import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { FeedHeader } from '@/features/feed/components/FeedHeader';
import { FeedList } from '@/features/feed/components/FeedList';
import { NarrativeSheet } from '@/features/feed/components/NarrativeSheet';
import type { NarrativeSheetItem } from '@/features/feed/components/NarrativeSheet';
import { fetchFeedItems } from '@/features/feed/feed.api';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import type { FeedItem } from '@/features/feed/feed.types';
import { semantic, tokens } from '@/theme';

export default function FeedScreen() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<NarrativeSheetItem | null>(null);

  async function loadFeed(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextItems = await fetchFeedItems(20);
      setItems(nextItems);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load feed';
      setErrorMessage(message);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  const handleCardPress = useCallback((item: FeedItem) => {
    setSheetItem({
      id: item.id,
      category: item.category,
      timeAgo: item.timeAgo,
      actions: item.actions,
    });
  }, []);

  const handleSheetClose = useCallback(() => {
    setSheetItem(null);
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <FeedHeader />

      {isLoading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={semantic.text.accent} />
          <Text style={styles.stateText}>Loading feed...</Text>
        </View>
      ) : null}

      {!isLoading && errorMessage ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Feed unavailable</Text>
          <Text style={styles.stateText}>{errorMessage}</Text>
          <Pressable onPress={() => void loadFeed()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : null}

      {!isLoading && !errorMessage && items.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>No narratives yet</Text>
          <Text style={styles.stateText}>Publisher has not emitted new feed items.</Text>
        </View>
      ) : null}

      {!isLoading && !errorMessage && items.length > 0 ? (
        <FeedList items={items} onCardPress={handleCardPress} />
      ) : null}

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />

      <NarrativeSheet item={sheetItem} onClose={handleSheetClose} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
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
