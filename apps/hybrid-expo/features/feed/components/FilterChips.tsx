import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { semantic, tokens } from '@/theme';

interface FilterChipsProps {
  filters: readonly string[];
  activeIndex?: number;
}

export function FilterChips({ filters, activeIndex = 0 }: FilterChipsProps) {
  return (
    <View style={styles.section}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {filters.map((filter, index) => {
          const active = index === activeIndex;
          return (
            <View key={filter} style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}>
              <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>{filter}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: tokens.spacing.lg,
    paddingBottom: 10,
  },
  row: {
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  chip: {
    height: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.xs,
  },
  chipActive: {
    backgroundColor: semantic.text.accent,
  },
  chipInactive: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
  },
  label: {
    fontSize: tokens.fontSize.sm,
    letterSpacing: tokens.letterSpacing.tight,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  labelActive: {
    color: semantic.background.screen,
  },
  labelInactive: {
    color: semantic.text.dim,
  },
});
