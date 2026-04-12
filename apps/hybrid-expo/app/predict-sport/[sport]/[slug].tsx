import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, StyleSheet, Text } from 'react-native';
import { PredictSportDetailScreen } from '@/features/predict/PredictSportDetailScreen';
import { semantic, tokens } from '@/theme';

export default function PredictSportDetailRoute() {
  const params = useLocalSearchParams<{ sport?: string; slug?: string }>();
  const sport = typeof params.sport === 'string' ? params.sport.toLowerCase() : '';
  const slug = typeof params.slug === 'string' ? params.slug : '';

  if (!slug || !sport) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.text}>Invalid sport market route</Text>
      </SafeAreaView>
    );
  }

  return <PredictSportDetailScreen sport={sport} slug={slug} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.background.screen,
    padding: tokens.spacing.lg,
  },
  text: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
  },
});
