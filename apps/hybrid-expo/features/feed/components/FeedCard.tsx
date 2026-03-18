import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedItem } from '@/features/feed/feed.types';
import { tokens } from '@/theme';

// Category pill colors — spec-matched, not derived from theme tokens
// (these are intentionally narrow, not in semantic.ts)
const CATEGORY_STYLES: Record<
  string,
  { backgroundColor: string; color: string }
> = {
  Geopolitics: { backgroundColor: 'rgba(199,183,112,0.12)', color: '#c7b770' },
  Macro:       { backgroundColor: 'rgba(90,88,64,0.30)',    color: '#8A7A50' },
  Markets:     { backgroundColor: 'rgba(74,140,111,0.12)',  color: '#4A8C6F' },
  Tech:        { backgroundColor: 'rgba(100,120,200,0.12)', color: '#7A9AC8' },
};

interface FeedCardProps {
  item: FeedItem;
  onPress: (item: FeedItem) => void;
}

export function FeedCard({ item, onPress }: FeedCardProps) {
  const catStyle = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.Macro;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        item.isTop && styles.cardTop,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.category} narrative from ${item.timeAgo}`}
    >
      <View style={styles.body}>
        {/* Meta row: category pill + time */}
        <View style={styles.metaRow}>
          <View style={[styles.catPill, { backgroundColor: catStyle.backgroundColor }]}>
            <Text style={[styles.catPillText, { color: catStyle.color }]}>
              {item.category.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.timeText}>{item.timeAgo}</Text>
        </View>

        {/* Body text */}
        <Text style={styles.bodyText}>{item.description}</Text>
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
  bodyText: {
    fontSize: tokens.fontSize.md,    // 14
    color: 'rgba(208,202,168,0.88)',
    lineHeight: 21,
    letterSpacing: -0.2,
  },
});
