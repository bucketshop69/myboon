import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchStoryDetail } from '@/features/feed/stories.api';
import { FEED_COLORS } from '@/features/feed/feed.constants';
import { toShortDate } from '@/features/feed/feed.api';
import type { StoryDetail, StorySummary } from '@/features/feed/feed.types';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.78);

interface StorySheetProps {
  story: StorySummary | null;
  onClose: () => void;
}

export function StorySheet({ story, onClose }: StorySheetProps) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const storySlug = story?.storySlug;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: story ? 0 : SHEET_HEIGHT,
      duration: story ? 260 : 220,
      useNativeDriver: true,
    }).start();
  }, [story, translateY]);

  useEffect(() => {
    let cancelled = false;
    if (!storySlug) {
      setDetail(null);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    setDetail(null);
    fetchStoryDetail(storySlug)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storySlug]);

  return (
    <Modal
      visible={story !== null}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close Story" />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>STORY</Text>
            <Text style={styles.updated}>{story ? `Updated ${toShortDate(story.updatedAt)}` : ''}</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close Story"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Text style={styles.title}>{story?.name ?? ''}</Text>

          {loading ? <Text style={styles.stateText}>Loading Story…</Text> : null}
          {error ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Story unavailable</Text>
              <Text style={styles.stateText}>This timeline could not be loaded.</Text>
            </View>
          ) : null}

          {detail ? (
            <>
              <View style={styles.currentCard}>
                <Text style={styles.currentLabel}>LATEST DEVELOPMENT</Text>
                <Text style={styles.currentText}>{detail.story.latestDevelopment}</Text>
              </View>

              <Text style={styles.timelineLabel}>TIMELINE</Text>
              <View style={styles.timeline}>
                {detail.events.map((event, index) => (
                  <View key={`${event.eventAt}-${index}`} style={styles.eventRow}>
                    <View style={styles.markerColumn}>
                      {index < detail.events.length - 1 ? <View style={styles.eventLine} /> : null}
                      <View style={[styles.eventDot, index === detail.events.length - 1 && styles.eventDotCurrent]} />
                    </View>
                    <View style={styles.eventCopy}>
                      <Text style={styles.eventDate}>{toShortDate(event.eventAt)}</Text>
                      <Text style={styles.eventText}>{event.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 30, 39, 0.76)',
  },
  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: -16,
    height: SHEET_HEIGHT + 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: FEED_COLORS.borderSoft,
    backgroundColor: FEED_COLORS.card,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 56,
    height: 4,
    marginTop: 12,
    borderRadius: 2,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: FEED_COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  updated: {
    color: FEED_COLORS.textFaint,
    fontSize: 11,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: FEED_COLORS.borderSoft,
    backgroundColor: FEED_COLORS.cardDeep,
  },
  closeText: {
    color: FEED_COLORS.text,
    fontSize: 20,
    lineHeight: 22,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 52,
  },
  title: {
    color: FEED_COLORS.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    marginBottom: 24,
  },
  currentCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: FEED_COLORS.border,
    backgroundColor: FEED_COLORS.cardActive,
    padding: 14,
    gap: 8,
    marginBottom: 26,
  },
  currentLabel: {
    color: FEED_COLORS.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  currentText: {
    color: FEED_COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  timelineLabel: {
    color: FEED_COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 16,
  },
  timeline: {
    gap: 0,
  },
  eventRow: {
    flexDirection: 'row',
    minHeight: 90,
  },
  markerColumn: {
    width: 18,
    alignItems: 'center',
  },
  eventLine: {
    position: 'absolute',
    top: 8,
    bottom: -8,
    width: 1,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  eventDot: {
    width: 7,
    height: 7,
    marginTop: 5,
    borderRadius: 4,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  eventDotCurrent: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: FEED_COLORS.accent,
  },
  eventCopy: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 24,
  },
  eventDate: {
    color: FEED_COLORS.textFaint,
    fontSize: 10,
    marginBottom: 7,
  },
  eventText: {
    color: FEED_COLORS.textDim,
    fontSize: 14,
    lineHeight: 21,
  },
  stateCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: FEED_COLORS.border,
    padding: 14,
    gap: 6,
  },
  stateTitle: {
    color: FEED_COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },
  stateText: {
    color: FEED_COLORS.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.72,
  },
});
