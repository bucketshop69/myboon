import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { FeedCard } from '@/features/feed/components/FeedCard';
import type { FeedItem } from '@/features/feed/feed.types';
import { semantic, tokens } from '@/theme';

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
          tintColor={semantic.text.accent}
          colors={[semantic.text.accent]}
        />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator size="small" color={semantic.text.accent} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.md,
  },
  separator: {
    height: tokens.spacing.md,
  },
  footer: {
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
});
