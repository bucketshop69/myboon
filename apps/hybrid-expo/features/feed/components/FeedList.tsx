import { ScrollView, StyleSheet } from 'react-native';
import { FeedCard } from '@/features/feed/components/FeedCard';
import type { FeedItem } from '@/features/feed/feed.types';
import { tokens } from '@/theme';

interface FeedListProps {
  items: FeedItem[];
}

export function FeedList({ items }: FeedListProps) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      {items.map((item) => (
        <FeedCard item={item} key={item.id} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: 134,
    gap: tokens.spacing.md,
  },
});
