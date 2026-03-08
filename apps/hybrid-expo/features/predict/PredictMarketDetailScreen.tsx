import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { FeedHeader } from '@/features/feed/components/FeedHeader';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { fetchCuratedMarketDetail } from '@/features/predict/predict.api';
import type { GeopoliticsMarketDetail } from '@/features/predict/predict.types';
import { semantic, tokens } from '@/theme';

interface PredictMarketDetailScreenProps {
  slug: string;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatUsdCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDeadline(endDate: string | null, active: boolean | null): string {
  if (!endDate) return active === false ? 'Closed' : 'Open';
  const time = Date.parse(endDate);
  if (Number.isNaN(time)) return active === false ? 'Closed' : 'Open';
  const date = new Date(time);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${active === false ? 'Ended' : 'Ends'} ${month} ${day}`;
}

export function PredictMarketDetailScreen({ slug }: PredictMarketDetailScreenProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<GeopoliticsMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadMarket() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await fetchCuratedMarketDetail(slug);
      setDetail(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load market';
      setErrorMessage(message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMarket();
  }, [slug]);

  const outcomeRows = useMemo(() => {
    if (!detail) return [];

    if (detail.outcomes.length > 0 && detail.outcomePrices.length > 0) {
      return detail.outcomes.map((label, index) => ({
        label,
        price: detail.outcomePrices[index] ?? null,
      }));
    }

    return [];
  }, [detail]);

  return (
    <SafeAreaView style={styles.screen}>
      <FeedHeader />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={16} color={semantic.text.primary} />
          <Text style={styles.backText}>Predict</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={semantic.text.accent} />
            <Text style={styles.stateText}>Loading market detail...</Text>
          </View>
        ) : null}

        {!loading && errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Market unavailable</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <Pressable onPress={() => void loadMarket()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorMessage && detail ? (
          <View style={styles.card}>
            <View style={styles.metaRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Geopolitics</Text>
              </View>
              <Text style={styles.deadlineText}>{formatDeadline(detail.endDate, detail.active)}</Text>
            </View>

            <Text style={styles.title}>{detail.question}</Text>

            <View style={styles.outcomes}>
              {outcomeRows.map((row) => {
                const key = row.label.toLowerCase();
                const isYes = key.includes('yes');
                const isNo = key.includes('no');
                return (
                  <View key={row.label} style={styles.outcomeRow}>
                    <Text style={styles.outcomeLabel}>{row.label}</Text>
                    <Text style={isYes ? styles.pctYes : isNo ? styles.pctNo : styles.pctDim}>
                      {formatPercent(row.price)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {detail.description ? <Text style={styles.description}>{detail.description}</Text> : null}

            <View style={styles.statsRow}>
              <Text style={styles.statText}>
                Vol 24h <Text style={styles.statTextValue}>{formatUsdCompact(detail.volume24h)}</Text>
              </Text>
              <Text style={styles.statText}>
                Total <Text style={styles.statTextValue}>{formatUsdCompact(detail.volume)}</Text>
              </Text>
              <Text style={styles.statText}>
                Liq <Text style={styles.statTextValue}>{formatUsdCompact(detail.liquidity)}</Text>
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },
  topBar: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  backText: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  content: {
    padding: tokens.spacing.lg,
    paddingBottom: 128,
    gap: tokens.spacing.sm,
  },
  card: {
    backgroundColor: semantic.background.surface,
    borderColor: semantic.border.muted,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  badge: {
    backgroundColor: semantic.predict.badgeGeoBg,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: semantic.text.accentDim,
    fontSize: tokens.fontSize.xxs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  deadlineText: {
    marginLeft: 'auto',
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 0.6,
  },
  title: {
    color: semantic.text.primary,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  outcomes: {
    gap: tokens.spacing.xs,
  },
  outcomeRow: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.predict.rowBorderSoft,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.sm,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  outcomeLabel: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
    fontWeight: '500',
    flex: 1,
    marginRight: tokens.spacing.sm,
  },
  pctYes: {
    color: semantic.sentiment.positive,
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '700',
  },
  pctNo: {
    color: semantic.sentiment.negative,
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '700',
  },
  pctDim: {
    color: semantic.text.dim,
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '700',
  },
  description: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.md,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    flexWrap: 'wrap',
  },
  statText: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xs,
    letterSpacing: 0.8,
    fontFamily: 'monospace',
  },
  statTextValue: {
    color: semantic.text.dim,
  },
  stateCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  stateTitle: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  stateText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.md,
  },
  retryButton: {
    marginTop: tokens.spacing.xs,
    backgroundColor: semantic.text.accent,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
    alignSelf: 'flex-start',
  },
  retryText: {
    color: semantic.background.screen,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});
