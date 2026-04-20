import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { tokens } from '@/theme';

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.metaRow}>
        <View style={styles.pillPlaceholder} />
        <View style={styles.timePlaceholder} />
      </View>
      <View style={styles.headlinePlaceholder} />
      <View style={styles.bodyPlaceholder} />
      <View style={styles.bodyPlaceholderShort} />
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
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  card: {
    backgroundColor: '#222318',
    borderWidth: 1,
    borderColor: '#302F20',
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 13,
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillPlaceholder: {
    width: 64,
    height: 18,
    borderRadius: tokens.radius.xs,
    backgroundColor: '#302F20',
  },
  timePlaceholder: {
    width: 40,
    height: 12,
    borderRadius: tokens.radius.xs,
    backgroundColor: '#302F20',
  },
  headlinePlaceholder: {
    width: '85%',
    height: 14,
    borderRadius: tokens.radius.xs,
    backgroundColor: '#302F20',
  },
  bodyPlaceholder: {
    width: '100%',
    height: 12,
    borderRadius: tokens.radius.xs,
    backgroundColor: '#2A2B1E',
  },
  bodyPlaceholderShort: {
    width: '60%',
    height: 12,
    borderRadius: tokens.radius.xs,
    backgroundColor: '#2A2B1E',
  },
});
