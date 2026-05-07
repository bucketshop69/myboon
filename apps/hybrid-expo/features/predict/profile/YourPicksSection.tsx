import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClosedPortfolioPosition, OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import { redeemPosition } from '@/features/predict/predict.api';
import { semantic, tokens } from '@/theme';

type YourPick =
  | { kind: 'position'; id: string; position: PortfolioPosition }
  | { kind: 'order'; id: string; order: OpenOrder }
  | { kind: 'redeemable'; id: string; position: PortfolioPosition }
  | { kind: 'closed'; id: string; position: ClosedPortfolioPosition };

interface YourPicksSectionProps {
  positions: PortfolioPosition[];
  openOrders: OpenOrder[];
  redeemablePositions: PortfolioPosition[];
  closedPositions: ClosedPortfolioPosition[];
  polygonAddress: string | null;
  cancellingOrderId: string | null;
  onCashOutPress: (position: PortfolioPosition) => void;
  onMarketPress: (slug: string) => void;
  onCancelOrder: (orderId: string) => void;
  onRedeemed: () => void;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatActionUsd(value: number): string {
  return `$${Math.round(value)}`;
}

function formatChance(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatOutcome(label: string | null | undefined): string {
  if (!label) return 'Yes';
  return label.toLowerCase().includes('draw') ? 'Draw' : label;
}

function getClosedPayout(position: ClosedPortfolioPosition): number {
  const putIn = Number.isFinite(position.totalBought) ? position.totalBought : 0;
  const realized = Number.isFinite(position.realizedPnl) ? position.realizedPnl : 0;
  return Math.max(putIn + realized, 0);
}

function makePositionId(prefix: string, p: PortfolioPosition, index: number): string {
  return `${prefix}-${p.conditionId}-${p.outcomeIndex}-${index}`;
}

function getYourPicks(
  positions: PortfolioPosition[],
  openOrders: OpenOrder[],
  redeemablePositions: PortfolioPosition[],
  closedPositions: ClosedPortfolioPosition[],
  scope: 'active' | 'all',
): YourPick[] {
  const livePicks: YourPick[] = positions.map((position, index) => ({
    kind: 'position' as const,
    id: makePositionId('position', position, index),
    position,
  }));
  const waitingPicks: YourPick[] = openOrders.map((order) => ({
    kind: 'order' as const,
    id: `order-${order.id}`,
    order,
  }));
  const readyPicks: YourPick[] = redeemablePositions.map((position, index) => ({
    kind: 'redeemable' as const,
    id: makePositionId('redeemable', position, index),
    position,
  }));
  const closedPicks: YourPick[] = closedPositions.map((position, index) => ({
    kind: 'closed' as const,
    id: `closed-${position.conditionId}-${position.outcomeIndex}-${position.timestamp}-${index}`,
    position,
  }));

  if (scope === 'all') {
    return [...readyPicks, ...livePicks, ...waitingPicks, ...closedPicks];
  }

  return [
    ...livePicks,
    ...waitingPicks,
    ...readyPicks,
  ];
}

export function YourPicksSection({
  positions,
  openOrders,
  redeemablePositions,
  closedPositions,
  polygonAddress,
  cancellingOrderId,
  onCashOutPress,
  onMarketPress,
  onCancelOrder,
  onRedeemed,
}: YourPicksSectionProps) {
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const hasActiveRows = positions.length + openOrders.length + redeemablePositions.length > 0;
  const effectiveScope = hasActiveRows ? scope : 'all';
  const picks = getYourPicks(positions, openOrders, redeemablePositions, closedPositions, effectiveScope);
  const allCount = positions.length + openOrders.length + redeemablePositions.length + closedPositions.length;
  if (allCount === 0) return null;

  const activeCount = positions.length + openOrders.length;
  const readyCount = redeemablePositions.length;
  const closedCount = closedPositions.length;
  const scopeSwitchLabel = effectiveScope === 'active' ? 'All' : 'Active';
  const countLabel = hasActiveRows
    ? `${activeCount} active${readyCount > 0 ? ` · ${readyCount} ready` : ''}${closedCount > 0 ? ` · ${closedCount} history` : ''}`
    : `${closedCount} history`;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Picks</Text>
        <View style={styles.headerSide}>
          <Text style={styles.count}>
            {countLabel}
          </Text>
          {hasActiveRows && closedCount > 0 && (
            <Pressable
              style={[styles.scopeSwitch, effectiveScope === 'all' && styles.scopeSwitchActive]}
              onPress={() => setScope(scope === 'active' ? 'all' : 'active')}
              accessibilityRole="switch"
              accessibilityState={{ checked: effectiveScope === 'all' }}
            >
              <View style={styles.scopeSwitchKnob} />
              <Text style={styles.scopeSwitchText}>{scopeSwitchLabel}</Text>
            </Pressable>
          )}
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
        if (pick.kind === 'closed') {
          return (
            <ClosedRow
              key={pick.id}
              position={pick.position}
            />
          );
        }
        return (
          <PositionRow
            key={pick.id}
            position={pick.position}
            onCashOut={() => onCashOutPress(pick.position)}
            onMarketPress={() => onMarketPress(pick.position.slug)}
          />
        );
      })}
    </View>
  );
}

function ClosedRow({ position: p }: { position: ClosedPortfolioPosition }) {
  const payout = getClosedPayout(p);
  const won = payout > 0 && (p.curPrice >= 0.99 || (p.realizedPnl ?? 0) > 0);

  return (
    <View style={[styles.card, won ? styles.finishedCard : styles.lostCard]}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.question} numberOfLines={2}>
            {formatOutcome(p.outcome)} {won ? 'won' : 'lost'}
          </Text>
          <Text style={styles.meta}>
            {p.title || p.slug || '--'} · {won ? `collected ${formatActionUsd(payout)}` : 'settled'}
          </Text>
        </View>
        <View style={styles.actions}>
          <View style={styles.settledAction}>
            <Text style={styles.settledActionText}>{won ? 'Collected' : 'No payout'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function PositionRow({
  position: p,
  onCashOut,
  onMarketPress,
}: {
  position: PortfolioPosition;
  onCashOut: () => void;
  onMarketPress: () => void;
}) {
  return (
    <View
      style={[styles.card, p.outcome === 'No' ? styles.noCard : styles.liveCard]}
    >
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.question} numberOfLines={2}>
            {formatOutcome(p.outcome)} {formatChance(p.curPrice)} now
          </Text>
          <Text style={styles.meta}>
            {p.title || p.slug || '--'} · avg entry {formatChance(p.avgPrice)}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.cashAction} onPress={onCashOut}>
            <Text style={styles.cashActionText}>{formatActionUsd(p.currentValue ?? 0)} cash out now</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={onMarketPress}>
            <Text style={styles.secondaryActionText}>Back more</Text>
          </Pressable>
        </View>
      </View>
    </View>
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
  const fillPct = sizeNum > 0 ? Math.round((matched / sizeNum) * 100) : 0;
  const outcomeLabel = formatOutcome(o.outcome);

  return (
    <View style={[styles.card, styles.waitingCard]}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.question} numberOfLines={2}>
            {formatChance(priceNum)} on {outcomeLabel}
          </Text>
          <Text style={styles.meta}>
            Yet to be placed{fillPct > 0 ? ` · ${fillPct}% matched` : ''}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={styles.dangerAction}
            disabled={cancelling}
            onPress={onCancel}
            accessibilityLabel={`Cancel waiting pick`}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color={semantic.sentiment.negative} />
            ) : (
              <Text style={styles.dangerActionText}>Cancel</Text>
            )}
          </Pressable>
        </View>
      </View>
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
    <View style={[styles.card, styles.attentionCard]}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.question} numberOfLines={2}>
            {formatOutcome(p.outcome)} won
          </Text>
          <Text style={styles.meta}>
            {p.title || p.slug || '--'} · Ready to collect
          </Text>
        </View>
        <View style={styles.actions}>
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
              <ActivityIndicator size="small" color={tokens.colors.backgroundDark} />
            ) : (
              <Text style={[styles.redeemActionText, status === 'error' && styles.errorText]}>
                {status === 'success' ? 'Redeemed' : status === 'error' ? 'Redeem failed' : `Redeem ${formatActionUsd(value)}`}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
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
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.primary,
    fontWeight: '700',
  },
  headerSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  scopeSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: 'rgba(232,197,71,0.25)',
    borderRadius: 999,
    paddingHorizontal: 7,
    minHeight: 28,
  },
  scopeSwitchActive: {
    borderColor: 'rgba(232,197,71,0.45)',
  },
  scopeSwitchKnob: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.colors.accent,
  },
  scopeSwitchText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    color: semantic.text.primary,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 13,
    marginBottom: 8,
    minHeight: 70,
  },
  liveCard: {
    borderColor: 'rgba(74,140,111,0.22)',
    backgroundColor: 'rgba(74,140,111,0.07)',
  },
  noCard: {
    borderColor: 'rgba(244,88,78,0.22)',
    backgroundColor: 'rgba(244,88,78,0.07)',
  },
  waitingCard: {
    borderColor: 'rgba(232,197,71,0.25)',
    backgroundColor: 'rgba(232,197,71,0.08)',
  },
  attentionCard: {
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
  actions: {
    width: 112,
    gap: 6,
  },
  cashAction: {
    minHeight: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(232,197,71,0.36)',
    backgroundColor: 'rgba(232,197,71,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cashActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: tokens.colors.primary,
    textAlign: 'center',
  },
  secondaryAction: {
    minHeight: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  secondaryActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.viridian,
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
    paddingHorizontal: 8,
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
  errorText: {
    color: tokens.colors.vermillion,
  },
  posText: { color: tokens.colors.viridian },
  negText: { color: tokens.colors.vermillion },
});
