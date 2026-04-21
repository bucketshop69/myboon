import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomNavItem } from '@/features/feed/feed.types';
import { semantic, tokens } from '@/theme';

interface BottomGlassNavProps {
  items: BottomNavItem[];
}

export function BottomGlassNav({ items }: BottomGlassNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function isActive(route: BottomNavItem['route']): boolean {
    if (route === '/') {
      return pathname === '/' || pathname === '/index';
    }
    if (route === '/predict') {
      return pathname === '/predict'
        || pathname.startsWith('/predict/')
        || pathname.startsWith('/predict-');
    }
    if (route === '/trade') {
      return pathname === '/trade'
        || pathname.startsWith('/trade/');
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map((item) => {
        const active = isActive(item.route);
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace(item.route);
            }}
            style={({ pressed }) => [
              styles.item,
              !active && styles.itemMuted,
              pressed && styles.itemPressed,
            ]}>
            <MaterialIcons
              name={item.icon}
              size={tokens.sizing.navIcon}
              color={active ? semantic.text.accent : semantic.text.primary}
            />
            <Text style={active ? styles.labelActive : styles.label}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    backgroundColor: semantic.background.screen,
    paddingHorizontal: tokens.spacing.xl,
    paddingTop: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xxs,
  },
  itemMuted: {
    opacity: tokens.opacity.muted,
  },
  itemPressed: {
    opacity: 0.8,
  },
  labelActive: {
    color: semantic.text.accent,
    fontSize: tokens.fontSize.xxs,
    textTransform: 'uppercase',
    letterSpacing: tokens.letterSpacing.nav,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  label: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.xxs,
    textTransform: 'uppercase',
    letterSpacing: tokens.letterSpacing.nav,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
});
