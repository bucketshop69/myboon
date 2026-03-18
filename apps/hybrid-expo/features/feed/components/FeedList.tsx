import { FlatList, StyleSheet, View } from 'react-native';
import { FeedCard } from '@/features/feed/components/FeedCard';
import type { FeedItem } from '@/features/feed/feed.types';
import { tokens } from '@/theme';

interface FeedListProps {
  items: FeedItem[];
  onCardPress: (item: FeedItem) => void;
}

export function FeedList({ items, onCardPress }: FeedListProps) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <FeedCard item={item} onPress={onCardPress} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: 134,
  },
  separator: {
    height: tokens.spacing.md,
  },
});
