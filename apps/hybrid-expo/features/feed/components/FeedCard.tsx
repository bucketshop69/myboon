import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FEED_COLORS } from '@/features/feed/feed.constants';
import { toShortDate } from '@/features/feed/feed.api';
import type { FeedItem } from '@/features/feed/feed.types';

interface FeedCardProps {
  item: FeedItem;
  onPress: (item: FeedItem) => void;
}

export function FeedCard({ item, onPress }: FeedCardProps) {
  const date = toShortDate(item.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        item.isTop && styles.cardTop,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.headline}, ${date}`}
    >
      <View style={styles.titleRow}>
        <Text style={styles.headlineText} numberOfLines={2}>{item.headline}</Text>
        <Text style={styles.dateText}>{date}</Text>
      </View>
      <Text style={styles.bodyText} numberOfLines={2}>{item.description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 118,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: FEED_COLORS.border,
    backgroundColor: FEED_COLORS.card,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 13,
  },
  cardTop: {
    backgroundColor: FEED_COLORS.cardActive,
  },
  cardPressed: {
    backgroundColor: FEED_COLORS.cardDeep,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headlineText: {
    flex: 1,
    color: FEED_COLORS.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: -0.15,
  },
  dateText: {
    width: 38,
    color: FEED_COLORS.textFaint,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'right',
  },
  bodyText: {
    color: FEED_COLORS.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    paddingRight: 2,
  },
});
