import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { FEED_COLORS } from '@/features/feed/feed.constants';

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.68, duration: 760, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 760, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.titleRow}>
        <View style={styles.title} />
        <View style={styles.date} />
      </View>
      <View style={styles.body} />
      <View style={styles.bodyShort} />
    </Animated.View>
  );
}

export function FeedSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  card: {
    minHeight: 118,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: FEED_COLORS.border,
    backgroundColor: FEED_COLORS.card,
    padding: 14,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    width: '72%',
    height: 34,
    borderRadius: 4,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  date: {
    width: 28,
    height: 10,
    borderRadius: 3,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  body: {
    width: '94%',
    height: 11,
    borderRadius: 3,
    backgroundColor: FEED_COLORS.borderSoft,
  },
  bodyShort: {
    width: '62%',
    height: 11,
    borderRadius: 3,
    backgroundColor: FEED_COLORS.borderSoft,
  },
});
