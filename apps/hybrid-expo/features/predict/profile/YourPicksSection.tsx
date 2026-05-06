import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import { semantic, tokens } from '@/theme';

type YourPick =
  | { kind: 'position'; id: string; position: PortfolioPosition }
  | { kind: 'order'; id: string; order: OpenOrder }
  | { kind: 'redeemable'; id: string; position: PortfolioPosition };

interface YourPicksSectionProps {
  positions: PortfolioPosition[];
  openOrders: OpenOrder[];
  redeemablePositions: PortfolioPosition[];
  onPositionPress: (position: PortfolioPosition) => void;
}

function formatPnl(value: number): string {
  const prefix = value >= 0 ? '+$' : '-$';
  return `${prefix}${Math.abs(value).toFixed(2)}`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function makePositionId(prefix: string, p: PortfolioPosition, index: number): string {
  return `${prefix}-${p.conditionId}-${p.outcomeIndex}-${index}`;
}

function getYourPicks(
  positions: PortfolioPosition[],
  openOrders: OpenOrder[],
  redeemablePositions: PortfolioPosition[],
): YourPick[] {
  return [
    ...positions.map((position, index) => ({
      kind: 'position' as const,
      id: makePositionId('position', position, index),
      position,
    })),
    ...openOrders.map((order) => ({
      kind: 'order' as const,
      id: `order-${order.id}`,
      order,
    })),
    ...redeemablePositions.map((position, index) => ({
      kind: 'redeemable' as const,
      id: makePositionId('redeemable', position, index),
      position,
    })),
  ];
}

export function YourPicksSection({
  positions,
  openOrders,
  redeemablePositions,
  onPositionPress,
}: YourPicksSectionProps) {
  const picks = getYourPicks(positions, openOrders, redeemablePositions);
  if (picks.length === 0) return null;

  const activeCount = positions.length + openOrders.length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Picks</Text>
        <Text style={styles.count}>
          {activeCount} active · {picks.length} total
        </Text>
      </View>

      {picks.map((pick) => {
        if (pick.kind === 'order') {
          return <OrderRow key={pick.id} order={pick.order} />;
        }
        if (pick.kind === 'redeemable') {
          return <RedeemableRow key={pick.id} position={pick.position} />;
        }
        return (
          <PositionRow
            key={pick.id}
            position={pick.position}
            onPress={() => onPositionPress(pick.position)}
          />
        );
      })}
    </View>
  );
}

function PositionRow({ position: p, onPress }: { position: PortfolioPosition; onPress: () => void }) {
  const pnl = p.cashPnl ?? 0;
  const isUp = pnl >= 0;

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityLabel={`View position: ${p.title}`}
    >
      <OutcomeBadge label={p.outcome ?? 'YES'} positive={p.outcome !== 'No'} />
      <View style={styles.info}>
        <Text style={styles.question} numberOfLines={2}>
          {p.title || p.slug || '--'}
        </Text>
        <Text style={styles.meta}>
          Live · {p.size.toFixed(2)} shares · {formatUsd(p.currentValue ?? 0)} value
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={[styles.value, isUp ? styles.posText : styles.negText]}>{formatPnl(pnl)}</Text>
        <Text style={styles.subValue}>
          {p.avgPrice?.toFixed(2) ?? '--'}→{p.curPrice?.toFixed(2) ?? '--'}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={14} color={semantic.text.faint} />
    </Pressable>
  );
}

function OrderRow({ order: o }: { order: OpenOrder }) {
  const sizeNum = Number.parseFloat(o.original_size) || 0;
  const matched = Number.parseFloat(o.size_matched) || 0;
  const priceNum = Number.parseFloat(o.price) || 0;
  const cost = sizeNum * priceNum;
  const fillPct = sizeNum > 0 ? Math.round((matched / sizeNum) * 100) : 0;

  return (
    <View style={styles.row}>
      <OutcomeBadge label={o.side} positive={o.side === 'BUY'} />
      <View style={styles.info}>
        <Text style={styles.question} numberOfLines={2}>
          {o.outcome || o.market || '--'}
        </Text>
        <Text style={styles.meta}>
          Waiting · {sizeNum.toFixed(2)} shares at {Math.round(priceNum * 100)}¢ · {fillPct}% filled
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.value}>{formatUsd(cost)}</Text>
        <Text style={styles.subValue}>{o.status || o.order_type}</Text>
      </View>
    </View>
  );
}

function RedeemableRow({ position: p }: { position: PortfolioPosition }) {
  const value = p.currentValue ?? 0;

  return (
    <View style={styles.row}>
      <OutcomeBadge label={p.outcome ?? 'YES'} positive />
      <View style={styles.info}>
        <Text style={styles.question} numberOfLines={2}>
          {p.title || p.slug || '--'}
        </Text>
        <Text style={styles.meta}>
          Ready · {p.size.toFixed(2)} shares won
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={[styles.value, styles.posText]}>{formatUsd(value)}</Text>
        <Text style={styles.subValue}>Redeemable</Text>
      </View>
    </View>
  );
}

function OutcomeBadge({ label, positive }: { label: string; positive: boolean }) {
  return (
    <View style={[styles.badge, positive ? styles.badgePos : styles.badgeNeg]}>
      <Text style={[styles.badgeText, positive ? styles.posText : styles.negText]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  count: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
  },
  row: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  badgePos: { backgroundColor: 'rgba(52,199,123,0.12)' },
  badgeNeg: { backgroundColor: 'rgba(244,88,78,0.12)' },
  badgeText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    fontWeight: '700',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  question: {
    fontSize: 9.5,
    color: semantic.text.primary,
    lineHeight: 13,
  },
  meta: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 1,
  },
  value: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  subValue: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  posText: { color: tokens.colors.viridian },
  negText: { color: tokens.colors.vermillion },
});
