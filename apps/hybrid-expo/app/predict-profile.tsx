import { SafeAreaView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { semantic, tokens } from '@/theme';

// Placeholder screen — full implementation tracked in #062
export default function PredictProfileScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={16} color={semantic.text.primary} />
          <Text style={styles.backText}>Predict</Text>
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.body}>
        <Text style={styles.placeholder}>Profile screen — coming in #062</Text>
        <Text style={styles.sub}>Wallet connect · positions · P&amp;L</Text>
      </View>
      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs, width: 60 },
  backText: { color: semantic.text.primary, fontSize: tokens.fontSize.sm, fontWeight: '600' },
  title: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xs,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholder: { color: semantic.text.dim, fontSize: tokens.fontSize.md, fontFamily: 'monospace' },
  sub: { color: semantic.text.faint, fontSize: tokens.fontSize.sm, fontFamily: 'monospace' },
});
