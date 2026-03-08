import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type FeedCategory = 'Macro' | 'Geopolitics' | 'Tech' | 'Markets';
export type FeedSentiment = 'up' | 'down';

export interface FeedItem {
  id: string;
  percent: number;
  category: FeedCategory;
  timeAgo: string;
  title: string;
  description: string;
  sentiment: FeedSentiment;
  image?: string;
  isTop?: boolean;
}

export interface BottomNavItem {
  key: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  route: '/' | '/predict' | '/swap' | '/trade';
}
