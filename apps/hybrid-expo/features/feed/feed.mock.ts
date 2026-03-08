import type { BottomNavItem } from '@/features/feed/feed.types';

export const FILTERS = ['ALL', 'Geopolitics', 'Macro', 'Markets', 'Tech'] as const;

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { key: 'feed', icon: 'rss-feed', label: 'Feed', route: '/' },
  { key: 'predict', icon: 'psychology', label: 'Predict', route: '/predict' },
  { key: 'swap', icon: 'swap-horiz', label: 'Swap', route: '/swap' },
  { key: 'trade', icon: 'bar-chart', label: 'Trade', route: '/trade' },
];
