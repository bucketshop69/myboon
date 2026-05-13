import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PortfolioPosition } from '@/features/predict/predict.api';
import { formatPredictTitle } from '@/features/predict/formatPredictTitle';
import { makeSignedMoneyFormatter, portfolioPositionCost, truncateUsd, type MoneyFormatter } from '@/features/predict/formatPredictMoney';
import { semantic, tokens } from '@/theme';

interface PredictPositionRowProps {
  position: PortfolioPosition;
  showMarketTitle?: boolean;
  onPress?: () => void;
  onCashOut: () => void;
  onBackMore: () => void;
  formatMoney?: MoneyFormatter;
}

function formatChance(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.05) return '0.0%';
  const sign = value > 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
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
  formatMoney = truncateUsd,
}: PredictPositionRowProps) {
  const outcome = formatOutcome(position.outcome);
  const priceLine = `${formatChance(position.avgPrice)} entry -> ${formatChance(position.curPrice)} now`;
  const cost = portfolioPositionCost(position);
  const pnl = (position.currentValue ?? 0) - cost;
  const pnlPercent = cost > 0 ? (pnl / cost) * 100 : null;
  const formatSignedMoney = makeSignedMoneyFormatter(formatMoney);
  const pnlText = `${formatSignedMoney(pnl)} (${formatSignedPercent(pnlPercent)})`;
  const pnlState = pnl > 0.005 ? 'positive' : pnl < -0.005 ? 'negative' : 'flat';
  const pnlStyle = pnlState === 'positive' ? styles.pnlPositive : pnlState === 'negative' ? styles.pnlNegative : styles.pnlFlat;
  const marketTitle = formatPositionTitle(position);
  const cashOutValue = formatMoney(position.currentValue ?? 0);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${outcome} pick. ${priceLine}. ${showMarketTitle ? `${marketTitle}. ` : ''}P and L ${pnlText}.`}
      accessibilityHint={onPress ? 'Open pick details' : undefined}
      style={[styles.rowCard, styles.activeCard, styles.activeStrip]}
      onPress={onPress}>
      <View style={styles.rowMain}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{outcome}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>{priceLine}</Text>
          {showMarketTitle && (
            <View style={styles.rowMarketLine}>
              <Text style={styles.rowMarket} numberOfLines={1}>{marketTitle}</Text>
              <Text style={[styles.rowPnl, pnlStyle]}>{pnlText}</Text>
            </View>
          )}
          {!showMarketTitle && (
            <Text style={[styles.rowPnl, styles.rowPnlSolo, pnlStyle]}>{pnlText}</Text>
          )}
        </View>
        <View style={styles.rowActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cash out ${cashOutValue}`}
            accessibilityHint="Open cash out confirmation"
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
              {cashOutValue} cash out now
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back more"
            accessibilityHint="Add more to this pick"
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
  rowMarketLine: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  rowMarket: {
    flexShrink: 1,
    fontFamily: 'monospace',
    fontSize: 11,
    color: semantic.text.faint,
  },
  rowPnl: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '800',
  },
  rowPnlSolo: {
    marginTop: 4,
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
