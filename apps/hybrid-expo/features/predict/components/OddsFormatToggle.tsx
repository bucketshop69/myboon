import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OddsFormat } from '@/hooks/useOddsFormat';
import { semantic, tokens } from '@/theme';

interface OddsFormatToggleProps {
  format: OddsFormat;
  onFormatChange: (f: OddsFormat) => void;
}

const OPTIONS: { value: OddsFormat; label: string }[] = [
  { value: 'probability', label: '%' },
  { value: 'decimal', label: 'Dec' },
  { value: 'points', label: 'Pts' },
];

export function OddsFormatToggle({ format, onFormatChange }: OddsFormatToggleProps) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((opt, i) => {
        const isActive = opt.value === format;
        const isFirst = i === 0;
        const isLast = i === OPTIONS.length - 1;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onFormatChange(opt.value)}
            style={[
              styles.pill,
              isActive && styles.pillActive,
              isFirst && styles.pillFirst,
              isLast && styles.pillLast,
            ]}>
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.xs,
    overflow: 'hidden',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: semantic.border.muted,
  },
  pillFirst: {},
  pillLast: {
    borderRightWidth: 0,
  },
  pillActive: {
    backgroundColor: semantic.text.accent,
  },
  pillText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  pillTextActive: {
    color: semantic.background.screen,
  },
});
