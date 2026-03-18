import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type FeedCategory = string;

export interface NarrativeAction {
  type: 'predict' | 'perps';
  asset?: string; // perps: 'BTC', 'ETH'
  slug?: string;  // predict: polymarket slug
}

export interface FeedItem {
  id: string;
  category: FeedCategory;
  timeAgo: string;
  description: string;
  isTop?: boolean;
  actions: NarrativeAction[];
}

export interface BottomNavItem {
  key: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  route: '/' | '/predict' | '/swap' | '/trade';
}
