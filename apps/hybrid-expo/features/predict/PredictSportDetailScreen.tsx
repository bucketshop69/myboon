import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { FeedHeader } from '@/features/feed/components/FeedHeader';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { fetchSportMarketDetail } from '@/features/predict/predict.api';
import type { PredictSport, SportMarketDetail } from '@/features/predict/predict.types';
import { semantic, tokens } from '@/theme';

interface PredictSportDetailScreenProps {
  sport: PredictSport;
  slug: string;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return value.toFixed(3);
}

function formatUsdCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatKickoff(isoDate: string | null): string {
  if (!isoDate) return 'TBD';
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return 'TBD';
  const date = new Date(time);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const clock = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${month} ${day} · ${clock}`;
}

export function PredictSportDetailScreen({ sport, slug }: PredictSportDetailScreenProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<SportMarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadDetail() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await fetchSportMarketDetail(sport, slug);
      setDetail(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load sport market';
      setErrorMessage(message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [slug, sport]);

  const sortedOutcomes = useMemo(() => {
    if (!detail) return [];
    return [...detail.outcomes].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  }, [detail]);

  const leadPrice = sortedOutcomes[0]?.price ?? null;

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
            <Text style={styles.stateText}>Loading fixture detail...</Text>
          </View>
        ) : null}

        {!loading && errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Fixture unavailable</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <Pressable onPress={() => void loadDetail()} style={styles.retryButton}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorMessage && detail ? (
          <View style={styles.card}>
            <View style={styles.metaRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{detail.sport.toUpperCase()}</Text>
              </View>
              <Text style={styles.deadlineText}>{formatKickoff(detail.endDate ?? detail.startDate)}</Text>
            </View>

            <Text style={styles.title}>{detail.title}</Text>

            <View style={styles.outcomes}>
              {sortedOutcomes.map((outcome) => {
                const isLead = leadPrice !== null && outcome.price === leadPrice;
                const isDraw = outcome.label.toLowerCase().includes('draw');
                return (
                  <View key={outcome.conditionId ?? outcome.label} style={styles.outcomeRow}>
                    <View style={styles.outcomeLeft}>
                      {isDraw ? (
                        <View style={styles.drawTag}>
                          <Text style={styles.drawTagText}>DRAW</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.outcomeLabel, !isLead && styles.outcomeLabelDim]} numberOfLines={1}>
                        {outcome.label.replace(/^Draw\s*\((.*)\)$/i, 'Draw')}
                      </Text>
                    </View>
                    <Text style={isLead ? styles.pctLead : styles.pctDim}>{formatPercent(outcome.price)}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.bookWrap}>
              {sortedOutcomes.map((outcome) => (
                <View key={`${outcome.conditionId ?? outcome.label}-book`} style={styles.bookRow}>
                  <Text style={styles.bookLabel} numberOfLines={1}>
                    {outcome.label.replace(/^Draw\s*\((.*)\)$/i, 'Draw')}
                  </Text>
                  <Text style={styles.bookValue}>
                    Bid {formatPrice(outcome.bestBid)} · Ask {formatPrice(outcome.bestAsk)}
                  </Text>
                </View>
              ))}
            </View>

            {detail.description ? <Text style={styles.description}>{detail.description}</Text> : null}

            <View style={styles.statsRow}>
              <Text style={styles.statText}>
                Vol 24h <Text style={styles.statTextValue}>{formatUsdCompact(detail.volume24h)}</Text>
              </Text>
              <Text style={styles.statText}>
                Liquidity <Text style={styles.statTextValue}>{formatUsdCompact(detail.liquidity)}</Text>
              </Text>
              <Text style={styles.statText}>
                NegRisk <Text style={styles.statTextValue}>{detail.negRisk ? 'true' : 'false'}</Text>
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
    backgroundColor: semantic.predict.badgeSportBg,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: semantic.sentiment.positive,
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
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  outcomeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    flex: 1,
    marginRight: tokens.spacing.sm,
  },
  drawTag: {
    backgroundColor: semantic.predict.outcomeDrawBg,
    borderColor: semantic.predict.outcomeDrawBorder,
    borderWidth: 1,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  drawTagText: {
    color: semantic.text.dim,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  outcomeLabel: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  outcomeLabelDim: {
    color: semantic.text.dim,
  },
  pctLead: {
    color: semantic.text.accent,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '700',
  },
  pctDim: {
    color: semantic.text.dim,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '700',
  },
  bookWrap: {
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    paddingTop: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  bookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  bookLabel: {
    flex: 1,
    color: semantic.text.dim,
    fontSize: tokens.fontSize.xs,
  },
  bookValue: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
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
