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
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fetchNarrativeDetail, fetchPredictMarket } from '@/features/feed/feed.api';
import type { NarrativeAction } from '@/features/feed/feed.types';
import type { PredictMarketData } from '@/features/feed/feed.api';
import type { FeedCategory } from '@/features/feed/feed.types';
import { tokens } from '@/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.75);

// Category pill colors — same as FeedCard
const CATEGORY_STYLES: Record<string, { backgroundColor: string; color: string }> = {
  Geopolitics: { backgroundColor: 'rgba(199,183,112,0.12)', color: '#c7b770' },
  Macro:       { backgroundColor: 'rgba(90,88,64,0.30)',    color: '#8A7A50' },
  Markets:     { backgroundColor: 'rgba(74,140,111,0.12)',  color: '#4A8C6F' },
  Tech:        { backgroundColor: 'rgba(100,120,200,0.12)', color: '#7A9AC8' },
};

function formatVolume(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M volume`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K volume`;
  return `$${Math.round(v)} volume`;
}

function formatPct(price: number | null): string {
  if (price === null) return '—';
  return `${(price * 100).toFixed(1)}%`;
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

  const yesWidth = market.yesPrice !== null ? `${(market.yesPrice * 100).toFixed(1)}%` : '0%';
  const noWidth  = market.noPrice  !== null ? `${(market.noPrice  * 100).toFixed(1)}%` : '0%';

  return (
    <View style={predictStyles.container}>
      <Text style={predictStyles.sectionLabel}>PREDICTION MARKET</Text>
      <View style={predictStyles.block}>
        {market.question ? (
          <Text style={predictStyles.question}>{market.question}</Text>
        ) : null}

        {/* Odds bars */}
        <View style={predictStyles.oddsRow}>
          {/* YES */}
          <View style={predictStyles.oddsItem}>
            <Text style={[predictStyles.oddsLabel, predictStyles.oddsLabelYes]}>YES</Text>
            <View style={predictStyles.barTrack}>
              <View style={[predictStyles.barFill, predictStyles.barFillYes, { width: yesWidth as `${number}%` }]} />
            </View>
            <Text style={[predictStyles.oddsPct, predictStyles.oddsPctYes]}>{formatPct(market.yesPrice)}</Text>
          </View>
          {/* NO */}
          <View style={predictStyles.oddsItem}>
            <Text style={[predictStyles.oddsLabel, predictStyles.oddsLabelNo]}>NO</Text>
            <View style={predictStyles.barTrack}>
              <View style={[predictStyles.barFill, predictStyles.barFillNo, { width: noWidth as `${number}%` }]} />
            </View>
            <Text style={[predictStyles.oddsPct, predictStyles.oddsPctNo]}>{formatPct(market.noPrice)}</Text>
          </View>
        </View>

        {/* Volume */}
        {market.volume24h !== null ? (
          <Text style={predictStyles.volume}>{formatVolume(market.volume24h)}</Text>
        ) : null}

        {/* Bet buttons */}
        <View style={predictStyles.btnsRow}>
          <Pressable
            style={({ pressed }) => [predictStyles.btn, predictStyles.btnYes, pressed && predictStyles.btnPressed]}
            onPress={() => router.push(`/predict-market/${slug}`)}
            accessibilityRole="button"
            accessibilityLabel="Bet YES"
          >
            <Text style={[predictStyles.btnText, predictStyles.btnTextYes]}>BET YES</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [predictStyles.btn, predictStyles.btnNo, pressed && predictStyles.btnPressed]}
            onPress={() => router.push(`/predict-market/${slug}`)}
            accessibilityRole="button"
            accessibilityLabel="Bet NO"
          >
            <Text style={[predictStyles.btnText, predictStyles.btnTextNo]}>BET NO</Text>
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
    fontSize: tokens.fontSize.xxs,  // 9
    fontFamily: 'monospace',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#5A5840',
    marginBottom: 12,
  },
  block: {
    borderWidth: 1,
    borderColor: '#302F20',
    borderRadius: tokens.radius.md,
    padding: 14,
    gap: 12,
  },
  question: {
    fontSize: 13,
    color: '#D0CAA8',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  oddsRow: {
    gap: 7,
  },
  oddsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  oddsLabel: {
    fontSize: tokens.fontSize.xs,   // 10
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.5,
    width: 28,
  },
  oddsLabelYes: {
    color: '#4A8C6F',
  },
  oddsLabelNo: {
    color: '#D9534F',
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#302F20',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barFillYes: {
    backgroundColor: '#4A8C6F',
  },
  barFillNo: {
    backgroundColor: '#D9534F',
  },
  oddsPct: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '700',
    width: 38,
    textAlign: 'right',
  },
  oddsPctYes: {
    color: '#4A8C6F',
  },
  oddsPctNo: {
    color: '#D9534F',
  },
  volume: {
    fontSize: tokens.fontSize.xs,   // 10
    fontFamily: 'monospace',
    color: '#5A5840',
    letterSpacing: 0.3,
  },
  btnsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.sm,
  },
  btnYes: {
    backgroundColor: 'rgba(74,140,111,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.35)',
  },
  btnNo: {
    backgroundColor: 'rgba(217,79,61,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217,79,61,0.3)',
  },
  btnPressed: {
    opacity: 0.75,
  },
  btnText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  btnTextYes: {
    color: '#4A8C6F',
  },
  btnTextNo: {
    color: '#D9534F',
  },
  loadingText: {
    fontSize: tokens.fontSize.sm,
    color: '#5A5840',
    fontFamily: 'monospace',
  },
});

// ─── Sheet ────────────────────────────────────────────────────────────────────

export interface NarrativeSheetItem {
  id: string;
  category: FeedCategory;
  timeAgo: string;
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
    ? (CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.Macro)
    : CATEGORY_STYLES.Macro;

  // Find first predict action with a slug
  const predictAction = item?.actions.find((a) => a.type === 'predict' && a.slug);
  const hasPrediction = Boolean(predictAction?.slug);

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
            <Text style={styles.timeText}>{item?.timeAgo ?? ''}</Text>
          </View>

          {/* Full text */}
          {contentLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : (
            <Text style={styles.fullText}>{contentFull ?? ''}</Text>
          )}

          {/* Prediction block — only if predict action present */}
          {hasPrediction && predictAction?.slug ? (
            <>
              <View style={styles.divider} />
              <PredictBlock slug={predictAction.slug} />
            </>
          ) : null}
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
    backgroundColor: '#222318',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#302F20',
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
    backgroundColor: '#302F20',
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
    color: '#5A5840',
  },
  fullText: {
    fontSize: 15,
    color: 'rgba(208,202,168,0.88)',
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  loadingText: {
    fontSize: tokens.fontSize.sm,
    color: '#5A5840',
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: '#302F20',
  },
});
