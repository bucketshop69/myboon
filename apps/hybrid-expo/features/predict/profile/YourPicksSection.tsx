import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import { redeemPosition } from '@/features/predict/predict.api';
import { semantic, tokens } from '@/theme';

type YourPick =
  | { kind: 'position'; id: string; position: PortfolioPosition }
  | { kind: 'order'; id: string; order: OpenOrder }
  | { kind: 'redeemable'; id: string; position: PortfolioPosition };

interface YourPicksSectionProps {
  positions: PortfolioPosition[];
  openOrders: OpenOrder[];
  redeemablePositions: PortfolioPosition[];
  polygonAddress: string | null;
  cancellingOrderId: string | null;
  onPositionPress: (position: PortfolioPosition) => void;
  onMarketPress: (slug: string) => void;
  onCancelOrder: (orderId: string) => void;
  onRedeemed: () => void;
}

function formatPnl(value: number): string {
  const prefix = value >= 0 ? '+$' : '-$';
  return `${prefix}${Math.abs(value).toFixed(2)}`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatChance(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatOutcome(label: string | null | undefined): string {
  if (!label) return 'Yes';
  return label.toLowerCase().includes('draw') ? 'Draw' : label;
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
  polygonAddress,
  cancellingOrderId,
  onPositionPress,
  onMarketPress,
  onCancelOrder,
  onRedeemed,
}: YourPicksSectionProps) {
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const picks = getYourPicks(positions, openOrders, redeemablePositions);
  const allCount = positions.length + openOrders.length + redeemablePositions.length;
  if (allCount === 0) return null;

  const activeCount = allCount;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Picks</Text>
        <View style={styles.scopeToggle} accessibilityRole="tablist">
          <Pressable
            style={[styles.scopeBtn, scope === 'active' && styles.scopeBtnActive]}
            onPress={() => setScope('active')}
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === 'active' }}
          >
            <Text style={[styles.scopeText, scope === 'active' && styles.scopeTextActive]}>
              Active {activeCount}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.scopeBtn, scope === 'all' && styles.scopeBtnActive]}
            onPress={() => setScope('all')}
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === 'all' }}
          >
            <Text style={[styles.scopeText, scope === 'all' && styles.scopeTextActive]}>
              All {allCount}
            </Text>
          </Pressable>
        </View>
      </View>

      {picks.length === 0 && (
        <View style={styles.emptyScope}>
          <Text style={styles.emptyScopeText}>No active picks right now</Text>
        </View>
      )}

      {picks.map((pick) => {
        if (pick.kind === 'order') {
          return (
            <OrderRow
              key={pick.id}
              order={pick.order}
              cancelling={cancellingOrderId === pick.order.id}
              onCancel={() => onCancelOrder(pick.order.id)}
            />
          );
        }
        if (pick.kind === 'redeemable') {
          return (
            <RedeemableRow
              key={pick.id}
              position={pick.position}
              polygonAddress={polygonAddress}
              onRedeemed={onRedeemed}
            />
          );
        }
        return (
          <PositionRow
            key={pick.id}
            position={pick.position}
            onPress={() => onPositionPress(pick.position)}
            onMarketPress={() => onMarketPress(pick.position.slug)}
          />
        );
      })}
    </View>
  );
}

function PositionRow({
  position: p,
  onPress,
  onMarketPress,
}: {
  position: PortfolioPosition;
  onPress: () => void;
  onMarketPress: () => void;
}) {
  const pnl = p.cashPnl ?? 0;
  const isUp = pnl >= 0;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityLabel={`View position: ${p.title}`}
    >
      <View style={styles.row}>
        <OutcomeBadge label={formatOutcome(p.outcome)} positive={p.outcome !== 'No'} />
        <View style={styles.info}>
          <Text style={styles.question} numberOfLines={2}>
            {formatOutcome(p.outcome)} {formatChance(p.curPrice)} now
          </Text>
          <Text style={styles.meta}>
            {p.title || p.slug || '--'} · Picked at {formatChance(p.avgPrice)}
          </Text>
        </View>
        <View style={styles.trailing}>
          <Text style={[styles.value, isUp ? styles.posText : styles.negText]}>{formatUsd(p.currentValue ?? 0)}</Text>
          <Text style={styles.subValue}>
            {formatPnl(pnl)}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={14} color={semantic.text.faint} />
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.secondaryAction} onPress={onPress}>
          <MaterialIcons name="payments" size={12} color={tokens.colors.viridian} />
          <Text style={styles.secondaryActionText}>Cash out now</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={onMarketPress}>
          <MaterialIcons name="add-chart" size={12} color={tokens.colors.primary} />
          <Text style={[styles.secondaryActionText, styles.primaryActionText]}>Back more</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function OrderRow({
  order: o,
  cancelling,
  onCancel,
}: {
  order: OpenOrder;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const sizeNum = Number.parseFloat(o.original_size) || 0;
  const matched = Number.parseFloat(o.size_matched) || 0;
  const priceNum = Number.parseFloat(o.price) || 0;
  const cost = sizeNum * priceNum;
  const fillPct = sizeNum > 0 ? Math.round((matched / sizeNum) * 100) : 0;
  const outcomeLabel = formatOutcome(o.outcome);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <OutcomeBadge label={outcomeLabel} positive={o.side !== 'SELL'} />
        <View style={styles.info}>
          <Text style={styles.question} numberOfLines={2}>
            {formatChance(priceNum)} on {outcomeLabel}
          </Text>
          <Text style={styles.meta}>
            Yet to be placed{fillPct > 0 ? ` · ${fillPct}% matched` : ''}
          </Text>
        </View>
        <View style={styles.trailing}>
          <Text style={styles.value}>{formatUsd(cost)}</Text>
          <Text style={styles.subValue}>{o.status || o.order_type}</Text>
        </View>
      </View>
      <Pressable
        style={styles.dangerAction}
        disabled={cancelling}
        onPress={onCancel}
        accessibilityLabel={`Cancel ${o.side.toLowerCase()} order`}
      >
        {cancelling ? (
          <ActivityIndicator size="small" color={semantic.sentiment.negative} />
        ) : (
          <>
            <MaterialIcons name="close" size={12} color={semantic.sentiment.negative} />
            <Text style={styles.dangerActionText}>Cancel</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function RedeemableRow({
  position: p,
  polygonAddress,
  onRedeemed,
}: {
  position: PortfolioPosition;
  polygonAddress: string | null;
  onRedeemed: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const value = p.currentValue ?? 0;

  async function handleRedeem() {
    if (!polygonAddress || status === 'loading' || status === 'success') return;

    setStatus('loading');
    try {
      const result = await redeemPosition(polygonAddress, {
        conditionId: p.conditionId,
        asset: p.asset,
        outcomeIndex: p.outcomeIndex,
        negativeRisk: p.negativeRisk,
      });
      if (!result.ok) throw new Error(result.error || 'Redeem failed');
      setStatus('success');
      onRedeemed();
    } catch {
      setStatus('error');
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <OutcomeBadge label={formatOutcome(p.outcome)} positive />
        <View style={styles.info}>
          <Text style={styles.question} numberOfLines={2}>
            {formatOutcome(p.outcome)} won
          </Text>
          <Text style={styles.meta}>
            {p.title || p.slug || '--'} · Ready to collect
          </Text>
        </View>
        <View style={styles.trailing}>
          <Text style={[styles.value, styles.posText]}>{formatUsd(value)}</Text>
          <Text style={styles.subValue}>Payout</Text>
        </View>
      </View>
      <Pressable
        style={[
          styles.redeemAction,
          status === 'success' && styles.redeemActionSuccess,
          status === 'error' && styles.redeemActionError,
        ]}
        disabled={status === 'loading' || status === 'success'}
        onPress={handleRedeem}
        accessibilityLabel={`Redeem ${formatUsd(value)} payout`}
      >
        {status === 'loading' ? (
          <ActivityIndicator size="small" color={tokens.colors.viridian} />
        ) : (
          <>
            <MaterialIcons
              name={status === 'success' ? 'check' : 'redeem'}
              size={12}
              color={status === 'error' ? tokens.colors.vermillion : tokens.colors.viridian}
            />
            <Text style={[styles.redeemActionText, status === 'error' && styles.errorText]}>
              {status === 'success' ? 'Redeemed' : status === 'error' ? 'Redeem failed' : `Redeem ${formatUsd(value)}`}
            </Text>
          </>
        )}
      </Pressable>
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
  emptyScope: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  emptyScopeText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scopeToggle: {
    flexDirection: 'row',
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 7,
    padding: 2,
  },
  scopeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    minHeight: 24,
    justifyContent: 'center',
  },
  scopeBtnActive: {
    backgroundColor: semantic.background.surface,
  },
  scopeText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    fontWeight: '700',
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  scopeTextActive: {
    color: semantic.text.primary,
  },
  card: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 11,
    gap: 9,
    marginBottom: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.lift,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  secondaryActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.viridian,
  },
  primaryActionText: {
    color: tokens.colors.primary,
  },
  dangerAction: {
    minHeight: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
    minHeight: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.25)',
    backgroundColor: 'rgba(74,140,111,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  redeemActionSuccess: {
    backgroundColor: 'rgba(74,140,111,0.25)',
  },
  redeemActionError: {
    borderColor: 'rgba(217,83,79,0.4)',
    backgroundColor: 'rgba(217,83,79,0.1)',
  },
  redeemActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.viridian,
  },
  errorText: {
    color: tokens.colors.vermillion,
  },
  posText: { color: tokens.colors.viridian },
  negText: { color: tokens.colors.vermillion },
});
