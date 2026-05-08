import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import { redeemPosition } from '@/features/predict/predict.api';
import { portfolioPositionCost } from '@/features/predict/formatPredictMoney';
import { PredictPositionRow } from '@/features/predict/components/PredictPositionRow';
import { semantic, tokens } from '@/theme';

type DetailPickScope = 'market' | 'all';

interface DetailPicksPanelProps {
  scope: DetailPickScope;
  marketSlug: string;
  loading: boolean;
  marketTokenIds?: string[];
  marketPositions: PortfolioPosition[];
  allPositions: PortfolioPosition[];
  redeemablePositions: PortfolioPosition[];
  openOrders: OpenOrder[];
  cancellingOrderId?: string | null;
  polygonAddress?: string | null;
  onScopeChange: (scope: DetailPickScope) => void;
  onBackMore: (position: PortfolioPosition) => void;
  onCashOut: (position: PortfolioPosition) => void;
  onCancelOrder?: (orderId: string) => void;
  onRedeemed?: () => void;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatChance(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatOutcome(label: string | null | undefined): string {
  if (!label) return 'Yes';
  return label.toLowerCase().includes('draw') ? 'Draw' : label;
}

function pickId(prefix: string, position: PortfolioPosition, index: number): string {
  return `${prefix}-${position.conditionId}-${position.outcomeIndex}-${index}`;
}

function orderCost(order: OpenOrder): number {
  const size = Number.parseFloat(order.original_size) || 0;
  const price = Number.parseFloat(order.price) || 0;
  return size * price;
}

function positionCost(position: PortfolioPosition): number {
  return portfolioPositionCost(position);
}

function isSameMarket(position: PortfolioPosition, marketSlug: string): boolean {
  return position.slug === marketSlug || position.eventSlug === marketSlug;
}

function isMarketOrder(order: OpenOrder, marketSlug: string, marketTokenIds: readonly string[]): boolean {
  const orderAsset = order.asset_id?.toLowerCase();
  if (orderAsset && marketTokenIds.some((id) => id.toLowerCase() === orderAsset)) return true;

  const market = order.market?.toLowerCase() ?? '';
  const slug = marketSlug.toLowerCase();
  if (!market) return false;
  return market.includes(slug) || slug.includes(market);
}

export function DetailPicksPanel({
  scope,
  marketSlug,
  loading,
  marketTokenIds = [],
  marketPositions,
  allPositions,
  redeemablePositions,
  openOrders,
  cancellingOrderId,
  polygonAddress,
  onScopeChange,
  onBackMore,
  onCashOut,
  onCancelOrder,
  onRedeemed,
}: DetailPicksPanelProps) {
  const marketRedeemables = redeemablePositions.filter((position) => isSameMarket(position, marketSlug));
  const marketOrders = openOrders.filter((order) => isMarketOrder(order, marketSlug, marketTokenIds));
  const rows = scope === 'market'
    ? [
        ...marketPositions.map((position, index) => ({ kind: 'position' as const, id: pickId('market', position, index), position })),
        ...marketOrders.map((order) => ({ kind: 'order' as const, id: `market-order-${order.id}`, order })),
        ...marketRedeemables.map((position, index) => ({ kind: 'redeemable' as const, id: pickId('market-ready', position, index), position })),
      ]
    : [
        ...redeemablePositions.map((position, index) => ({ kind: 'redeemable' as const, id: pickId('ready', position, index), position })),
        ...allPositions.map((position, index) => ({ kind: 'position' as const, id: pickId('all', position, index), position })),
        ...openOrders.map((order) => ({ kind: 'order' as const, id: `order-${order.id}`, order })),
      ];
  const worthNow = rows.reduce((sum, row) => {
    if (row.kind === 'order') return sum;
    return sum + (row.position.currentValue ?? 0);
  }, 0);
  const putIn = rows.reduce((sum, row) => {
    if (row.kind === 'order') return sum + orderCost(row.order);
    return sum + positionCost(row.position);
  }, 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text style={styles.title}>Your Picks</Text>
        <View style={styles.headingSide}>
          <Text style={styles.subtitle}>
            {scope === 'market' ? `${rows.length} this market` : `${rows.length} all picks`}
          </Text>
          <View style={styles.scopeTabs}>
            <Pressable
              style={[styles.scopeTab, scope === 'market' && styles.scopeTabActive]}
              onPress={() => onScopeChange('market')}
              accessibilityState={{ selected: scope === 'market' }}
            >
              <Text style={[styles.scopeTabText, scope === 'market' && styles.scopeTabTextActive]}>This market</Text>
            </Pressable>
            <Pressable
              style={[styles.scopeTab, scope === 'all' && styles.scopeTabActive]}
              onPress={() => onScopeChange('all')}
              accessibilityState={{ selected: scope === 'all' }}
            >
              <Text style={[styles.scopeTabText, scope === 'all' && styles.scopeTabTextActive]}>All picks</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryLabel}>{scope === 'market' ? 'In this market' : 'All active picks'}</Text>
          <Text style={styles.summaryValue}>{scope === 'market' ? formatUsd(putIn) : rows.length}</Text>
        </View>
        <View>
          <Text style={styles.summaryLabel}>Worth now</Text>
          <Text style={styles.summaryValue}>{formatUsd(worthNow)}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={tokens.colors.primary} size="small" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No picks here yet</Text>
          <Text style={styles.emptyText}>Make a pick below. Once it is active, cash out and back-more actions show here.</Text>
        </View>
      ) : rows.map((row) => {
        if (row.kind === 'order') {
          return (
            <OrderRow
              key={row.id}
              order={row.order}
              cancelling={cancellingOrderId === row.order.id}
              onCancel={onCancelOrder ? () => onCancelOrder(row.order.id) : undefined}
            />
          );
        }
        if (row.kind === 'redeemable') {
          return (
            <RedeemableRow
              key={row.id}
              position={row.position}
              polygonAddress={polygonAddress}
              onRedeemed={onRedeemed}
            />
          );
        }
        return (
          <PredictPositionRow
            key={row.id}
            position={row.position}
            showMarketTitle={scope === 'all'}
            onCashOut={() => onCashOut(row.position)}
            onBackMore={() => onBackMore(row.position)}
          />
        );
      })}
    </View>
  );
}

function OrderRow({
  order,
  cancelling,
  onCancel,
}: {
  order: OpenOrder;
  cancelling: boolean;
  onCancel?: () => void;
}) {
  const price = Number.parseFloat(order.price) || 0;
  const outcome = formatOutcome(order.outcome);
  const pending = order.status === 'local-pending';
  return (
    <View style={[styles.rowCard, styles.waitingCard, styles.limitStrip]}>
      <View style={styles.rowMain}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{formatChance(price)} on {outcome}</Text>
          <Text style={styles.rowMeta}>{pending ? 'Syncing with market' : 'Waiting to match'}</Text>
        </View>
        <Pressable style={styles.cancelAction} disabled={pending || !onCancel || cancelling} onPress={onCancel}>
          {cancelling ? (
            <ActivityIndicator size="small" color={semantic.sentiment.negative} />
          ) : (
            <Text style={styles.cancelActionText}>Cancel</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function RedeemableRow({
  position,
  polygonAddress,
  onRedeemed,
}: {
  position: PortfolioPosition;
  polygonAddress?: string | null;
  onRedeemed?: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleRedeem() {
    if (!polygonAddress || status === 'loading' || status === 'success') return;
    setStatus('loading');
    try {
      const result = await redeemPosition(polygonAddress, {
        conditionId: position.conditionId,
        asset: position.asset,
        outcomeIndex: position.outcomeIndex,
        negativeRisk: position.negativeRisk,
      });
      if (!result.ok) throw new Error(result.error || 'Redeem failed');
      setStatus('success');
      onRedeemed?.();
    } catch {
      setStatus('error');
    }
  }

  return (
    <View style={[styles.rowCard, styles.readyCard, styles.readyStrip]}>
      <View style={styles.rowMain}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{formatOutcome(position.outcome)} <Text style={styles.winText}>won</Text></Text>
          <Text style={styles.rowMeta} numberOfLines={1}>Ready to collect</Text>
        </View>
        <Pressable
          style={[styles.redeemAction, status === 'error' && styles.redeemActionError]}
          disabled={!polygonAddress || status === 'loading' || status === 'success'}
          onPress={handleRedeem}
        >
          {status === 'loading' ? (
            <ActivityIndicator size="small" color={tokens.colors.viridian} />
          ) : (
            <>
              <MaterialIcons name={status === 'success' ? 'check' : 'redeem'} size={12} color={tokens.colors.viridian} />
              <Text style={styles.redeemActionText}>
                {status === 'success' ? 'Redeemed' : status === 'error' ? 'Try again' : `Redeem ${formatUsd(position.currentValue ?? 0)}`}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: 10,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: semantic.text.primary,
    fontWeight: '700',
  },
  headingSide: {
    alignItems: 'flex-end',
    gap: 4,
  },
  subtitle: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  scopeTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,197,71,0.25)',
    backgroundColor: semantic.background.lift,
  },
  scopeTab: {
    minHeight: 24,
    borderRadius: 8,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeTabActive: {
    backgroundColor: tokens.colors.surface,
  },
  scopeTabText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scopeTabTextActive: {
    color: semantic.text.primary,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
    borderRadius: 12,
    padding: 10,
  },
  summaryLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  summaryValue: {
    marginTop: 2,
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  empty: {
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
    borderRadius: 12,
    padding: 14,
  },
  emptyTitle: {
    color: semantic.text.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyText: {
    color: semantic.text.dim,
    fontSize: 10,
    lineHeight: 15,
  },
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
  waitingCard: {
    borderColor: 'rgba(232,197,71,0.25)',
    backgroundColor: 'rgba(232,197,71,0.08)',
  },
  limitStrip: {
    borderLeftColor: tokens.colors.primary,
  },
  readyCard: {
    borderColor: 'rgba(74,140,111,0.28)',
    backgroundColor: 'rgba(74,140,111,0.10)',
  },
  readyStrip: {
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
  winText: {
    color: tokens.colors.viridian,
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
  cancelAction: {
    minHeight: 34,
    minWidth: 86,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(244,88,78,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.sentiment.negative,
    fontWeight: '800',
  },
  redeemAction: {
    minHeight: 36,
    minWidth: 102,
    borderRadius: 10,
    backgroundColor: 'rgba(74,140,111,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  redeemActionError: {
    borderWidth: 1,
    borderColor: 'rgba(244,88,78,0.30)',
    backgroundColor: 'rgba(244,88,78,0.10)',
  },
  redeemActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: tokens.colors.viridian,
    fontWeight: '800',
  },
});
