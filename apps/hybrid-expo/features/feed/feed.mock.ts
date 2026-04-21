import type { BottomNavItem } from '@/features/feed/feed.types';

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { key: 'feed', icon: 'rss-feed', label: 'Feed', route: '/' },
  { key: 'predict', icon: 'psychology', label: 'Predict', route: '/predict' },
  { key: 'trade', icon: 'bar-chart', label: 'Trade', route: '/trade' },
  { key: 'defi', icon: 'swap-horiz', label: 'Defi', route: '/swap' },
];
