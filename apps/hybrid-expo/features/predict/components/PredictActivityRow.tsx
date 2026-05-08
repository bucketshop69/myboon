import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PredictActivityItem } from '@/features/predict/predictActivityState';
import { getPredictActivityStatusLabel } from '@/features/predict/predictActivityState';
import { PredictPositionRow } from '@/features/predict/components/PredictPositionRow';
import { truncateSignedUsd, truncateUsd } from '@/features/predict/formatPredictMoney';
import { semantic, tokens } from '@/theme';

interface PredictActivityRowProps {
  item: PredictActivityItem;
  showMarketTitle?: boolean;
  cancelling?: boolean;
  redeeming?: boolean;
  onPress: () => void;
  onCashOut: () => void;
  onBackMore: () => void;
  onCancelOrder?: () => void;
  onRedeem?: () => void;
}

function formatChance(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function rowMeta(item: PredictActivityItem, showMarketTitle: boolean): string {
  const status = getPredictActivityStatusLabel(item.status);
  const title = showMarketTitle ? `${item.marketTitle} · ` : '';
  if (item.status === 'waiting_to_match') return `${title}${status} · cash reserved`;
  if (item.status === 'syncing') return `${title}${status}`;
  if (item.status === 'ready_to_collect') return `${title}${status}`;
  if (item.status === 'closed_won' || item.status === 'closed_lost') return `${title}${status}`;
  return `${title}${formatChance(item.avgPrice)} entry -> ${formatChance(item.currentPrice)} now`;
}

function cardStyle(item: PredictActivityItem) {
  switch (item.status) {
    case 'syncing':
    case 'waiting_to_match':
      return [styles.card, styles.waitingCard];
    case 'ready_to_collect':
      return [styles.card, styles.readyCard];
    case 'closed_won':
      return [styles.card, styles.finishedCard];
    case 'closed_lost':
    case 'failed':
      return [styles.card, styles.lostCard];
    case 'active':
      return [styles.card, styles.activeCard];
  }
}

export function PredictActivityRow({
  item,
  showMarketTitle = true,
  cancelling = false,
  redeeming = false,
  onPress,
  onCashOut,
  onBackMore,
  onCancelOrder,
  onRedeem,
}: PredictActivityRowProps) {
  if (item.status === 'active' && item.rawPosition) {
    return (
      <PredictPositionRow
        position={item.rawPosition}
        showMarketTitle={showMarketTitle}
        onPress={onPress}
        onCashOut={onCashOut}
        onBackMore={onBackMore}
      />
    );
  }

  const pnlPositive = (item.pnl ?? 0) > 0.005;
  const pnlNegative = (item.pnl ?? 0) < -0.005;
  const value = item.currentValue === null ? null : truncateUsd(item.currentValue);
  const status = getPredictActivityStatusLabel(item.status);

  return (
    <Pressable style={cardStyle(item)} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.question} numberOfLines={2}>
            {item.status === 'closed_won'
              ? `${item.outcome} won`
              : item.status === 'closed_lost'
                ? `${item.outcome} lost`
                : item.status === 'waiting_to_match' || item.status === 'syncing'
                  ? `${formatChance(item.avgPrice)} on ${item.outcome}`
                  : item.outcome}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>{rowMeta(item, showMarketTitle)}</Text>
          {item.pnl !== null && (
            <Text style={[styles.pnl, pnlPositive ? styles.positive : pnlNegative ? styles.negative : styles.flat]}>
              {truncateSignedUsd(item.pnl)}
            </Text>
          )}
        </View>
        <View style={styles.actions}>
          {(item.status === 'waiting_to_match' || item.status === 'syncing') && (
            <Pressable
              style={styles.dangerAction}
              disabled={item.status === 'syncing' || !onCancelOrder || cancelling}
              onPress={(event) => {
                event.stopPropagation();
                onCancelOrder?.();
              }}
              accessibilityLabel="Cancel waiting pick"
            >
              {cancelling ? (
                <ActivityIndicator size="small" color={semantic.sentiment.negative} />
              ) : (
                <Text style={styles.dangerActionText}>{item.status === 'syncing' ? 'Syncing' : 'Cancel'}</Text>
              )}
            </Pressable>
          )}
          {item.status === 'ready_to_collect' && (
            <Pressable
              style={styles.redeemAction}
              disabled={!onRedeem || redeeming}
              onPress={(event) => {
                event.stopPropagation();
                onRedeem?.();
              }}
              accessibilityLabel="Redeem payout"
            >
              {redeeming ? (
                <ActivityIndicator size="small" color={tokens.colors.backgroundDark} />
              ) : (
                <>
                  <MaterialIcons name="redeem" size={12} color={tokens.colors.backgroundDark} />
                  <Text style={styles.redeemActionText}>Redeem {value ?? ''}</Text>
                </>
              )}
            </Pressable>
          )}
          {(item.status === 'closed_won' || item.status === 'closed_lost' || item.status === 'failed') && (
            <View style={styles.settledAction}>
              <Text style={styles.settledActionText}>{status}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 13,
    marginBottom: 8,
    minHeight: 70,
  },
  activeCard: {
    borderColor: 'rgba(74,140,111,0.22)',
    backgroundColor: 'rgba(74,140,111,0.07)',
  },
  waitingCard: {
    borderColor: 'rgba(232,197,71,0.25)',
    backgroundColor: 'rgba(232,197,71,0.08)',
  },
  readyCard: {
    borderColor: 'rgba(74,140,111,0.28)',
    backgroundColor: 'rgba(74,140,111,0.10)',
  },
  lostCard: {
    borderColor: 'rgba(244,88,78,0.20)',
    backgroundColor: 'rgba(244,88,78,0.06)',
  },
  finishedCard: {
    borderColor: 'rgba(210,202,157,0.12)',
    backgroundColor: 'rgba(210,202,157,0.05)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  question: {
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
    lineHeight: 16,
  },
  meta: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
  },
  pnl: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '800',
  },
  positive: {
    color: tokens.colors.viridian,
  },
  negative: {
    color: tokens.colors.vermillion,
  },
  flat: {
    color: semantic.text.faint,
  },
  actions: {
    width: 112,
    gap: 6,
  },
  dangerAction: {
    minHeight: 46,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,88,78,0.06)',
    paddingHorizontal: 8,
  },
  dangerActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: semantic.sentiment.negative,
  },
  redeemAction: {
    minHeight: 46,
    borderRadius: 7,
    backgroundColor: tokens.colors.viridian,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
  },
  redeemActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
    color: tokens.colors.backgroundDark,
  },
  settledAction: {
    minHeight: 46,
    borderRadius: 7,
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    opacity: 0.78,
  },
  settledActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: semantic.text.dim,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
