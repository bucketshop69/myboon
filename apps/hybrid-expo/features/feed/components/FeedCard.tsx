import { Image, StyleSheet, Text, View } from 'react-native';
import type { FeedItem } from '@/features/feed/feed.types';
import { semantic, tokens } from '@/theme';

interface FeedCardProps {
  item: FeedItem;
}

export function FeedCard({ item }: FeedCardProps) {
  return (
    <View style={[styles.card, item.isTop && styles.topCard]}>
      {item.isTop ? <View style={styles.topCardOverlay} /> : null}

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.metaDot,
              { backgroundColor: item.sentiment === 'up' ? semantic.sentiment.positive : semantic.sentiment.negative },
            ]}
          />
          <Text style={styles.categoryText}>{item.category}</Text>
          <Text style={styles.timeText}>{item.timeAgo}</Text>
        </View>

        <Text style={styles.titleText}>{item.title}</Text>
        <Text style={styles.descriptionText}>{item.description}</Text>

        {item.image ? <Image source={{ uri: item.image }} style={styles.heroImage} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
    padding: tokens.spacing.lg,
  },
  topCard: {
    ...tokens.shadow.card,
  },
  topCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: semantic.background.topCardOverlay,
  },
  body: {
    flex: 1,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  metaDot: {
    width: 5,
    height: 5,
    borderRadius: tokens.radius.full,
  },
  categoryText: {
    color: semantic.text.categoryMeta,
    fontSize: tokens.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: tokens.letterSpacing.mono,
    fontFamily: 'monospace',
  },
  timeText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.xs,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  titleText: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.body,
    fontWeight: '600',
    letterSpacing: tokens.letterSpacing.tighter,
  },
  descriptionText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.body,
  },
  heroImage: {
    marginTop: tokens.spacing.sm,
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: semantic.border.imageSoft,
  },
});
