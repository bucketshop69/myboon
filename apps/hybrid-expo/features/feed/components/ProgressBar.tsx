import { StyleSheet, View } from 'react-native';
import { semantic, tokens } from '@/theme';

interface ProgressBarProps {
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${value}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    marginTop: tokens.spacing.sm,
    width: '100%',
    height: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
    backgroundColor: semantic.border.muted,
  },
  fill: {
    height: '100%',
    backgroundColor: semantic.text.accent,
  },
});
