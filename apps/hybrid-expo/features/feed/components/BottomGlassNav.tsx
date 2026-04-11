import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomNavItem } from '@/features/feed/feed.types';
import { semantic, tokens } from '@/theme';

interface BottomGlassNavProps {
  items: BottomNavItem[];
}

export function BottomGlassNav({ items }: BottomGlassNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navWidth = Math.min(400, width * 0.9);

  function isActive(route: BottomNavItem['route']): boolean {
    if (route === '/') {
      return pathname === '/' || pathname === '/index';
    }
    return pathname === route;
  }

  return (
    <View style={[styles.wrap, { width: navWidth, bottom: Math.max(insets.bottom, 8) }]}>
      {items.map((item) => {
        const active = isActive(item.route);
        return (
          <Pressable
            key={item.key}
            onPress={() => router.replace(item.route)}
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
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    zIndex: 20,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.nav,
    backgroundColor: semantic.background.nav,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...tokens.shadow.nav,
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
