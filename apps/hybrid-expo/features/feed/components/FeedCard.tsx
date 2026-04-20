import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_STYLES, DEFAULT_CATEGORY_STYLE } from '@/features/feed/feed.constants';
import { toRelativeTime } from '@/features/feed/feed.api';
import type { FeedItem } from '@/features/feed/feed.types';
import { tokens } from '@/theme';

interface FeedCardProps {
  item: FeedItem;
  onPress: (item: FeedItem) => void;
}

export function FeedCard({ item, onPress }: FeedCardProps) {
  const catStyle = CATEGORY_STYLES[item.category] ?? DEFAULT_CATEGORY_STYLE;
  const timeAgo = toRelativeTime(item.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        item.isTop && styles.cardTop,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.category} narrative from ${timeAgo}`}
    >
      <View style={styles.body}>
        {/* Meta row: category pill + time */}
        <View style={styles.metaRow}>
          <View style={[styles.catPill, { backgroundColor: catStyle.backgroundColor }]}>
            <Text style={[styles.catPillText, { color: catStyle.color }]}>
              {item.category.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.timeText}>{timeAgo}</Text>
        </View>

        {/* Headline */}
        <Text style={styles.headlineText} numberOfLines={2}>{item.headline}</Text>

        {/* Body text */}
        {item.description ? (
          <Text style={styles.bodyText} numberOfLines={3}>{item.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#222318',
    borderWidth: 1,
    borderColor: '#302F20',
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  cardTop: {
    borderColor: 'rgba(199,183,112,0.14)',
    backgroundColor: 'rgba(199,183,112,0.025)',
  },
  cardPressed: {
    backgroundColor: '#2C2D1F',
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 13,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catPill: {
    height: 18,
    paddingHorizontal: 7,
    borderRadius: tokens.radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catPillText: {
    fontSize: tokens.fontSize.xxs,   // 9
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  timeText: {
    fontSize: tokens.fontSize.xs,    // 10
    fontFamily: 'monospace',
    color: '#5A5840',
  },
  headlineText: {
    fontSize: tokens.fontSize.md,    // 14
    color: 'rgba(208,202,168,0.95)',
    lineHeight: 20,
    letterSpacing: -0.2,
    fontWeight: '600',
  },
  bodyText: {
    fontSize: tokens.fontSize.sm,    // 12
    color: 'rgba(208,202,168,0.65)',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
});
