import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { FeedCard } from '@/features/feed/components/FeedCard';
import { FEED_COLORS } from '@/features/feed/feed.constants';
import type { FeedItem } from '@/features/feed/feed.types';

interface FeedListProps {
  items: FeedItem[];
  onCardPress: (item: FeedItem) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  loadingMore: boolean;
}

export function FeedList({ items, onCardPress, refreshing, onRefresh, onEndReached, loadingMore }: FeedListProps) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <FeedCard item={item} onPress={onCardPress} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={FEED_COLORS.accent}
          colors={[FEED_COLORS.accent]}
        />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator size="small" color={FEED_COLORS.accent} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  separator: {
    height: 10,
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
