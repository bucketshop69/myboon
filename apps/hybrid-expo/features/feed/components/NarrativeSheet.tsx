import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fetchNarrativeDetail, fetchPredictMarket, extractSport, toRelativeTime } from '@/features/feed/feed.api';
import { CATEGORY_STYLES, DEFAULT_CATEGORY_STYLE } from '@/features/feed/feed.constants';
import type { NarrativeAction } from '@/features/feed/feed.types';
import type { PredictMarketData } from '@/features/feed/feed.api';
import type { FeedCategory } from '@/features/feed/feed.types';
import { semantic, tokens } from '@/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.75);

function formatVolume(v: number | null): string {
  if (!v || !Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

function formatPct(price: number | null): string {
  if (price === null) return '—';
  return `${Math.round(price * 100)}%`;
}

function formatResolves(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `Resolves ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatChange(val: number | null): { label: string; color: string; bg: string } | null {
  if (val === null) return null;
  const pct = Math.round(val * 100);
  if (pct > 0) return { label: `↑ ${pct}%`, color: tokens.colors.viridian, bg: 'rgba(74,140,111,0.12)' };
  if (pct < 0) return { label: `↓ ${Math.abs(pct)}%`, color: tokens.colors.vermillion, bg: 'rgba(217,83,79,0.10)' };
  return { label: '→ 0%', color: tokens.colors.textDim, bg: 'rgba(90,88,64,0.15)' };
}

interface PredictBlockProps {
  slug: string;
}

function PredictBlock({ slug }: PredictBlockProps) {
  const router = useRouter();
  const [market, setMarket] = useState<PredictMarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchPredictMarket(slug)
      .then((data) => {
        if (!cancelled) {
          setMarket(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <View style={predictStyles.container}>
        <Text style={predictStyles.sectionLabel}>PREDICTION MARKET</Text>
        <View style={predictStyles.block}>
          <Text style={predictStyles.loadingText}>Loading market data...</Text>
        </View>
      </View>
    );
  }

  if (error || !market) {
    return null;
  }

  // ── Multi-outcome (sports) ────────────────────────────────────────────────
  if (market.marketType === 'multi') {
    return (
      <View style={predictStyles.container}>
        <Text style={predictStyles.sectionLabel}>PREDICTION MARKET</Text>
        <View style={predictStyles.block}>
          {/* Header */}
          {market.question ? (
            <Text style={predictStyles.question}>{market.question}</Text>
          ) : null}

          {/* Outcomes list */}
          <View style={predictStyles.outcomesContainer}>
            {market.outcomes.map((outcome) => (
              <TouchableOpacity
                key={outcome.label}
                style={predictStyles.outcomeRow}
                onPress={() => router.push(`/predict-sport/${extractSport(slug)}/${slug}`)}
                activeOpacity={0.7}
              >
                <Text style={predictStyles.outcomeLabel}>{outcome.label}</Text>
                <View style={predictStyles.outcomeBarContainer}>
                  <View
                    style={[
                      predictStyles.outcomeBar,
                      { width: `${Math.round(outcome.price * 100)}%` as `${number}%` },
                    ]}
                  />
                </View>
                <Text style={predictStyles.outcomePrice}>{Math.round(outcome.price * 100)}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Meta row */}
          <View style={predictStyles.metaRow}>
            <View style={predictStyles.metaItem}>
              <Text style={predictStyles.metaLabel}>Vol 24h</Text>
              <Text style={predictStyles.metaValue}>{formatVolume(market.volume24h)}</Text>
            </View>
          </View>

          {/* View Market button */}
          <View style={predictStyles.btnsRow}>
            <Pressable
              style={({ pressed }) => [predictStyles.btn, predictStyles.btnViewMarket, pressed && predictStyles.btnPressed]}
              onPress={() => router.push(`/predict-sport/${extractSport(slug)}/${slug}`)}
              accessibilityRole="button"
              accessibilityLabel="View Market"
            >
              <Text style={[predictStyles.btnText, predictStyles.btnTextViewMarket]}>VIEW MARKET</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── Binary market ─────────────────────────────────────────────────────────
  const yesWidth = market.yesPrice !== null ? `${Math.round(market.yesPrice * 100)}%` : '0%';
  const noWidth  = market.noPrice  !== null ? `${Math.round(market.noPrice  * 100)}%` : '0%';
  const resolvesLabel = formatResolves(market.endDateIso);
  const todayChange = formatChange(market.oneDayPriceChange);
  const weekChange  = formatChange(market.oneWeekPriceChange);

  return (
    <View style={predictStyles.container}>
      <Text style={predictStyles.sectionLabel}>PREDICTION MARKET</Text>
      <View style={predictStyles.block}>
        {/* Header */}
        <View style={predictStyles.headerSection}>
          {market.question ? (
            <Text style={predictStyles.question}>{market.question}</Text>
          ) : null}
          {resolvesLabel ? (
            <Text style={predictStyles.resolvesText}>{resolvesLabel}</Text>
          ) : null}
        </View>

        {/* Odds bars — side by side */}
        <View style={predictStyles.oddsRow}>
          {/* YES */}
          <View style={predictStyles.oddsItem}>
            <View style={predictStyles.oddsLabelRow}>
              <Text style={[predictStyles.oddsLabel, predictStyles.oddsLabelYes]}>YES</Text>
              <Text style={[predictStyles.oddsPct, predictStyles.oddsPctYes]}>{formatPct(market.yesPrice)}</Text>
            </View>
            <View style={predictStyles.barTrack}>
              <View style={[predictStyles.barFill, predictStyles.barFillYes, { width: yesWidth as `${number}%` }]} />
            </View>
          </View>
          {/* NO */}
          <View style={predictStyles.oddsItem}>
            <View style={predictStyles.oddsLabelRow}>
              <Text style={[predictStyles.oddsLabel, predictStyles.oddsLabelNo]}>NO</Text>
              <Text style={[predictStyles.oddsPct, predictStyles.oddsPctNo]}>{formatPct(market.noPrice)}</Text>
            </View>
            <View style={predictStyles.barTrack}>
              <View style={[predictStyles.barFill, predictStyles.barFillNo, { width: noWidth as `${number}%` }]} />
            </View>
          </View>
        </View>

        {/* Meta row: volume + price change pills */}
        <View style={predictStyles.metaRow}>
          <View style={predictStyles.metaItem}>
            <Text style={predictStyles.metaLabel}>Vol 24h</Text>
            <Text style={predictStyles.metaValue}>{formatVolume(market.volume24h)}</Text>
          </View>
          {todayChange ? (
            <View style={predictStyles.metaItem}>
              <Text style={predictStyles.metaLabel}>Today</Text>
              <View style={[predictStyles.changePill, { backgroundColor: todayChange.bg }]}>
                <Text style={[predictStyles.changePillText, { color: todayChange.color }]}>{todayChange.label}</Text>
              </View>
            </View>
          ) : null}
          {weekChange ? (
            <View style={predictStyles.metaItem}>
              <Text style={predictStyles.metaLabel}>1w</Text>
              <View style={[predictStyles.changePill, { backgroundColor: weekChange.bg }]}>
                <Text style={[predictStyles.changePillText, { color: weekChange.color }]}>{weekChange.label}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* YES / NO buttons */}
        <View style={predictStyles.btnsRow}>
          <Pressable
            style={({ pressed }) => [predictStyles.btn, predictStyles.btnYes, pressed && predictStyles.btnPressed]}
            onPress={() => router.push(`/predict-market/${slug}`)}
            accessibilityRole="button"
            accessibilityLabel="YES"
          >
            <Text style={[predictStyles.btnText, predictStyles.btnTextYes]}>YES</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [predictStyles.btn, predictStyles.btnNo, pressed && predictStyles.btnPressed]}
            onPress={() => router.push(`/predict-market/${slug}`)}
            accessibilityRole="button"
            accessibilityLabel="NO"
          >
            <Text style={[predictStyles.btnText, predictStyles.btnTextNo]}>NO</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const predictStyles = StyleSheet.create({
  container: {
    gap: 0,
  },
  sectionLabel: {
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: tokens.letterSpacing.monoWide,
    color: tokens.colors.textDim,
    marginBottom: tokens.spacing.md,
  },
  block: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.lift,
    borderRadius: tokens.radius.md,
    padding: 14,
    gap: tokens.spacing.md,
  },
  headerSection: {
    gap: tokens.spacing.xxs,
  },
  question: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.bone,
    lineHeight: 18,
    letterSpacing: tokens.letterSpacing.nav,
    fontWeight: '500',
  },
  resolvesText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.textDim,
    fontFamily: 'monospace',
  },
  // Binary odds — side-by-side columns
  oddsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  oddsItem: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  oddsLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  oddsLabel: {
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: tokens.letterSpacing.mono,
    textTransform: 'uppercase',
    color: tokens.colors.textDim,
  },
  oddsLabelYes: {
    color: tokens.colors.textDim,
  },
  oddsLabelNo: {
    color: tokens.colors.textDim,
  },
  barTrack: {
    height: 4,
    backgroundColor: tokens.colors.borderMuted,
    borderRadius: tokens.radius.xs,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: tokens.radius.xs,
  },
  barFillYes: {
    backgroundColor: tokens.colors.viridian,
  },
  barFillNo: {
    backgroundColor: tokens.colors.vermillion,
  },
  oddsPct: {
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  oddsPctYes: {
    color: tokens.colors.viridian,
  },
  oddsPctNo: {
    color: tokens.colors.vermillion,
  },
  // Meta row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  metaLabel: {
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    color: tokens.colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: tokens.letterSpacing.nav,
  },
  metaValue: {
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    color: tokens.colors.primaryDim,
  },
  changePill: {
    paddingHorizontal: tokens.spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
  },
  changePillText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  // Buttons
  btnsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  btn: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.sm,
  },
  btnYes: {
    backgroundColor: 'rgba(74,140,111,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.25)',
  },
  btnNo: {
    backgroundColor: 'rgba(217,83,79,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.20)',
  },
  btnViewMarket: {
    backgroundColor: 'rgba(199,183,112,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(199,183,112,0.25)',
  },
  btnPressed: {
    opacity: 0.75,
  },
  btnText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: tokens.letterSpacing.mono,
    textTransform: 'uppercase',
  },
  btnTextYes: {
    color: tokens.colors.viridian,
  },
  btnTextNo: {
    color: tokens.colors.vermillion,
  },
  btnTextViewMarket: {
    color: tokens.colors.primary,
  },
  loadingText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textDim,
    fontFamily: 'monospace',
  },
  // Multi-outcome (sports)
  outcomesContainer: {
    gap: tokens.spacing.sm,
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  outcomeLabel: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.bone,
    fontFamily: 'monospace',
    width: 100,
    flexShrink: 0,
  },
  outcomeBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: tokens.colors.borderMuted,
    borderRadius: tokens.radius.xs,
    overflow: 'hidden',
  },
  outcomeBar: {
    height: '100%',
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.xs,
  },
  outcomePrice: {
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: tokens.colors.primary,
    width: 34,
    textAlign: 'right',
  },
});

// ─── Sheet ────────────────────────────────────────────────────────────────────

export interface NarrativeSheetItem {
  id: string;
  category: FeedCategory;
  createdAt: string;
  actions: NarrativeAction[];
}

interface NarrativeSheetProps {
  item: NarrativeSheetItem | null;
  onClose: () => void;
}

export function NarrativeSheet({ item, onClose }: NarrativeSheetProps) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [contentFull, setContentFull] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Animate open/close
  useEffect(() => {
    if (item) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 240,
        useNativeDriver: true,
      }).start();
    }
  }, [item, translateY]);

  // Fetch full content when item changes
  useEffect(() => {
    if (!item) {
      setContentFull(null);
      return;
    }
    setContentLoading(true);
    setContentFull(null);

    fetchNarrativeDetail(item.id)
      .then((detail) => {
        setContentFull(detail.content_full ?? detail.content_small ?? '');
        setContentLoading(false);
      })
      .catch(() => {
        setContentFull('');
        setContentLoading(false);
      });
  }, [item?.id]);

  // Drag-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 8 && Math.abs(gestureState.dx) < Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
        }
      },
    })
  ).current;

  const catStyle = item
    ? (CATEGORY_STYLES[item.category] ?? DEFAULT_CATEGORY_STYLE)
    : DEFAULT_CATEGORY_STYLE;

  // Collect up to 3 predict actions with slugs
  const predictActions = (item?.actions ?? [])
    .filter((a) => a.type === 'predict' && a.slug)
    .slice(0, 3);

  return (
    <Modal
      visible={item !== null}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
      <Pressable style={styles.scrim} onPress={onClose} />

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        {/* Drag handle */}
        <View style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* Meta row */}
          <View style={styles.metaRow}>
            <View style={[styles.catPill, { backgroundColor: catStyle.backgroundColor }]}>
              <Text style={[styles.catPillText, { color: catStyle.color }]}>
                {item?.category.toUpperCase() ?? ''}
              </Text>
            </View>
            <Text style={styles.timeText}>{item?.createdAt ? toRelativeTime(item.createdAt) : ''}</Text>
          </View>

          {/* Full text */}
          {contentLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : (
            <Text style={styles.fullText}>{contentFull ?? ''}</Text>
          )}

          {/* Prediction blocks — up to 3 predict actions */}
          {predictActions.map((action) => (
            <View key={action.slug}>
              <View style={styles.divider} />
              <PredictBlock slug={action.slug!} />
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: semantic.background.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    overflow: 'hidden',
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: semantic.border.muted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catPill: {
    height: 18,
    paddingHorizontal: 7,
    borderRadius: tokens.radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catPillText: {
    fontSize: tokens.fontSize.xxs,  // 9
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  timeText: {
    fontSize: tokens.fontSize.xs,   // 10
    fontFamily: 'monospace',
    color: semantic.text.faint,
  },
  fullText: {
    fontSize: 15,
    color: semantic.text.primary,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  loadingText: {
    fontSize: tokens.fontSize.sm,
    color: semantic.text.faint,
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: semantic.border.muted,
  },
});
