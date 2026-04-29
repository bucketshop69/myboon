import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchTrendingMarkets } from '@/features/predict/predict.api';
import type { TrendingMarket } from '@/features/predict/predict.types';
import { semantic, tokens } from '@/theme';

interface EmptyPortfolioProps {
  onDeposit: () => void;
  hasBalance: boolean;
}

export function EmptyPortfolio({ onDeposit, hasBalance }: EmptyPortfolioProps) {
  const router = useRouter();
  const [trending, setTrending] = useState<TrendingMarket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendingMarkets(5)
      .then(setTrending)
      .catch(() => setTrending([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      {/* CTA */}
      <View style={styles.ctaCard}>
        <MaterialIcons name="rocket-launch" size={20} color={tokens.colors.primary} />
        <Text style={styles.ctaTitle}>
          {hasBalance ? 'Ready to trade' : 'Fund your account'}
        </Text>
        <Text style={styles.ctaDesc}>
          {hasBalance
            ? 'Pick a market below and place your first prediction'
            : 'Deposit USDC to start trading on prediction markets'}
        </Text>
        {!hasBalance && (
          <Pressable style={styles.ctaBtn} onPress={onDeposit}>
            <MaterialIcons name="arrow-downward" size={12} color={tokens.colors.backgroundDark} />
            <Text style={styles.ctaBtnText}>Deposit</Text>
          </Pressable>
        )}
      </View>

      {/* Trending markets */}
      <View style={styles.trendingSection}>
        <Text style={styles.trendingTitle}>TRENDING MARKETS</Text>
        {loading ? (
          <ActivityIndicator size="small" color={semantic.text.faint} style={{ paddingVertical: 20 }} />
        ) : trending.length === 0 ? (
          <Text style={styles.trendingEmpty}>No markets available</Text>
        ) : (
          trending.map((m, i) => {
            const yesPrice = m.yesPrice ?? 0;
            return (
              <Pressable
                key={`${m.slug}-${i}`}
                style={styles.marketRow}
                onPress={() => router.push(`/predict-market/${encodeURIComponent(m.slug)}`)}
                accessibilityLabel={`View market: ${m.question}`}
              >
                <View style={styles.marketInfo}>
                  <Text style={styles.marketQuestion} numberOfLines={2}>
                    {m.question}
                  </Text>
                  {m.volume24h != null && m.volume24h > 0 && (
                    <Text style={styles.marketVol}>
                      ${m.volume24h >= 1000 ? `${(m.volume24h / 1000).toFixed(0)}K` : m.volume24h.toFixed(0)} vol
                    </Text>
                  )}
                </View>
                <View style={styles.marketPrice}>
                  <Text style={styles.marketPriceVal}>{Math.round(yesPrice * 100)}{'\u00A2'}</Text>
                  <Text style={styles.marketPriceLabel}>YES</Text>
                </View>
                <MaterialIcons name="chevron-right" size={14} color={semantic.text.faint} />
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },

  // CTA card
  ctaCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  ctaTitle: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.3,
  },
  ctaDesc: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
    textAlign: 'center',
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.colors.viridian,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 4,
    minHeight: 36,
  },
  ctaBtnText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.backgroundDark,
  },

  // Trending
  trendingSection: {
    gap: 6,
  },
  trendingTitle: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 2,
    color: semantic.text.dim,
    marginBottom: 2,
  },
  trendingEmpty: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.faint,
    textAlign: 'center',
    paddingVertical: 16,
  },
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 10,
    minHeight: 48,
  },
  marketInfo: {
    flex: 1,
    gap: 3,
  },
  marketQuestion: {
    fontSize: 10,
    color: semantic.text.primary,
    lineHeight: 14,
  },
  marketVol: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
  },
  marketPrice: {
    alignItems: 'center',
    gap: 1,
  },
  marketPriceVal: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    color: tokens.colors.viridian,
  },
  marketPriceLabel: {
    fontFamily: 'monospace',
    fontSize: 6.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(74,140,111,0.55)',
  },
});
