import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PortfolioPosition } from '@/features/predict/predict.api';
import { formatPredictTitle } from '@/features/predict/formatPredictTitle';
import { portfolioPositionCost, truncateSignedUsd, truncateUsd } from '@/features/predict/formatPredictMoney';
import { semantic, tokens } from '@/theme';

interface PredictPositionRowProps {
  position: PortfolioPosition;
  showMarketTitle?: boolean;
  onPress?: () => void;
  onCashOut: () => void;
  onBackMore: () => void;
}

function formatChance(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatOutcome(label: string | null | undefined): string {
  if (!label) return 'Yes';
  return label.toLowerCase().includes('draw') ? 'Draw' : label;
}

function formatPositionTitle(position: PortfolioPosition): string {
  return formatPredictTitle({
    title: position.title,
    slug: position.slug || position.eventSlug,
  });
}

export function PredictPositionRow({
  position,
  showMarketTitle = true,
  onPress,
  onCashOut,
  onBackMore,
}: PredictPositionRowProps) {
  const outcome = formatOutcome(position.outcome);
  const priceLine = `${formatChance(position.avgPrice)} entry -> ${formatChance(position.curPrice)} now`;
  const cost = portfolioPositionCost(position);
  const pnl = (position.currentValue ?? 0) - cost;
  const pnlState = pnl > 0.005 ? 'positive' : pnl < -0.005 ? 'negative' : 'flat';
  const pnlStyle = pnlState === 'positive' ? styles.pnlPositive : pnlState === 'negative' ? styles.pnlNegative : styles.pnlFlat;

  return (
    <Pressable style={[styles.rowCard, styles.activeCard, styles.activeStrip]} onPress={onPress}>
      <View style={styles.rowMain}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{outcome}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {showMarketTitle ? `${formatPositionTitle(position)} · ${priceLine}` : priceLine}
          </Text>
          <Text style={[styles.rowPnl, pnlStyle]}>{truncateSignedUsd(pnl)}</Text>
        </View>
        <View style={styles.rowActions}>
          <Pressable
            style={[
              styles.cashAction,
              pnlState === 'positive' ? styles.cashActionPositive : pnlState === 'negative' ? styles.cashActionNegative : styles.cashActionFlat,
            ]}
            onPress={(event) => {
              event.stopPropagation();
              onCashOut();
            }}
          >
            <Text style={[
              styles.cashActionText,
              pnlState === 'positive' ? styles.cashActionTextPositive : pnlState === 'negative' ? styles.cashActionTextNegative : styles.cashActionTextFlat,
            ]}>
              {truncateUsd(position.currentValue ?? 0)} cash out now
            </Text>
          </Pressable>
          <Pressable
            style={styles.backAction}
            onPress={(event) => {
              event.stopPropagation();
              onBackMore();
            }}
          >
            <Text style={styles.backActionText}>Back more</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 7,
  },
  activeCard: {
    borderColor: 'rgba(74,140,111,0.24)',
    backgroundColor: 'rgba(74,140,111,0.10)',
  },
  activeStrip: {
    borderLeftColor: tokens.colors.viridian,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  rowMeta: {
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: 11,
    color: semantic.text.dim,
  },
  rowPnl: {
    marginTop: 4,
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '800',
  },
  pnlPositive: {
    color: tokens.colors.viridian,
  },
  pnlNegative: {
    color: tokens.colors.vermillion,
  },
  pnlFlat: {
    color: semantic.text.faint,
  },
  rowActions: {
    width: 112,
    gap: 6,
  },
  cashAction: {
    minHeight: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  cashActionPositive: {
    borderColor: 'rgba(74,140,111,0.34)',
    backgroundColor: 'rgba(74,140,111,0.12)',
  },
  cashActionNegative: {
    borderColor: 'rgba(244,88,78,0.30)',
    backgroundColor: 'rgba(244,88,78,0.10)',
  },
  cashActionFlat: {
    borderColor: semantic.border.muted,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  cashActionText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  cashActionTextPositive: {
    color: tokens.colors.viridian,
  },
  cashActionTextNegative: {
    color: tokens.colors.vermillion,
  },
  cashActionTextFlat: {
    color: semantic.text.dim,
  },
  backAction: {
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: 'rgba(255,255,255,0.025)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.dim,
    fontWeight: '800',
  },
});
