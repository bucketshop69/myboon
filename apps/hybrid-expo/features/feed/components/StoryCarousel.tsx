import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FEED_COLORS } from '@/features/feed/feed.constants';
import { toShortDate } from '@/features/feed/feed.api';
import type { StorySummary } from '@/features/feed/feed.types';

const CARD_WIDTH = 288;
const CARD_GAP = 12;

interface StoryCarouselProps {
  stories: StorySummary[];
  onStoryPress: (story: StorySummary) => void;
}

export function StoryCarousel({ stories, onStoryPress }: StoryCarouselProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={CARD_WIDTH + CARD_GAP}
      contentContainerStyle={styles.content}
    >
      {stories.map((story) => (
        <StoryCard key={story.storySlug} story={story} onPress={onStoryPress} />
      ))}
    </ScrollView>
  );
}

function StoryCard({ story, onPress }: { story: StorySummary; onPress: (story: StorySummary) => void }) {
  const markerCount = Math.min(3, Math.max(1, story.eventCount));

  return (
    <Pressable
      onPress={() => onPress(story)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${story.name} Story, updated ${toShortDate(story.updatedAt)}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>{story.name}</Text>
        <Text style={styles.date}>{toShortDate(story.updatedAt)}</Text>
      </View>

      <View style={styles.developmentRow}>
        <View style={styles.timeline} accessibilityElementsHidden>
          <View style={styles.timelineLine} />
          {Array.from({ length: markerCount }, (_, index) => (
            <View
              key={index}
              style={[styles.timelineDot, index === markerCount - 1 && styles.timelineDotCurrent]}
            />
          ))}
        </View>
        <Text style={styles.development} numberOfLines={3}>{story.latestDevelopment}</Text>
      </View>

      <Text style={styles.arrow} accessibilityElementsHidden>→</Text>
    </Pressable>
  );
}

export function StoryCarouselSkeleton() {
  return (
    <View style={styles.skeletonRow}>
      <View style={[styles.card, styles.skeletonCard]}>
        <View style={[styles.skeletonLine, styles.skeletonTitle]} />
        <View style={[styles.skeletonLine, styles.skeletonBody]} />
        <View style={[styles.skeletonLine, styles.skeletonBodyShort]} />
      </View>
      <View style={[styles.card, styles.skeletonPeek]} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: CARD_GAP,
    paddingRight: 56,
  },
  card: {
    width: CARD_WIDTH,
    height: 145,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: FEED_COLORS.border,
    backgroundColor: FEED_COLORS.cardDeep,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  cardPressed: {
    backgroundColor: FEED_COLORS.cardActive,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    flex: 1,
    color: FEED_COLORS.text,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '900',
  },
  date: {
    color: FEED_COLORS.textFaint,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 5,
  },
  developmentRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 11,
    paddingRight: 6,
    minHeight: 54,
    gap: 10,
  },
  timeline: {
    width: 10,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  timelineLine: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    width: 1,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  timelineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  timelineDotCurrent: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: FEED_COLORS.accent,
  },
  development: {
    flex: 1,
    color: FEED_COLORS.textDim,
    fontSize: 13,
    lineHeight: 18,
  },
  arrow: {
    position: 'absolute',
    right: 16,
    bottom: 9,
    color: FEED_COLORS.accent,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  skeletonRow: {
    height: 145,
    flexDirection: 'row',
    gap: CARD_GAP,
    overflow: 'hidden',
  },
  skeletonCard: {
    gap: 14,
    opacity: 0.72,
  },
  skeletonPeek: {
    width: 72,
    opacity: 0.46,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 4,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  skeletonTitle: {
    width: '48%',
    height: 20,
  },
  skeletonBody: {
    width: '92%',
  },
  skeletonBodyShort: {
    width: '64%',
  },
});
