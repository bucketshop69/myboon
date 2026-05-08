import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClosedPortfolioPosition, OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import { redeemPosition } from '@/features/predict/predict.api';
import { PredictActivityDetailModal } from '@/features/predict/components/PredictActivityDetailModal';
import { PredictActivityRow } from '@/features/predict/components/PredictActivityRow';
import {
  buildPredictActivityItems,
  filterActivityByScope,
  formatPredictFreshness,
  type PredictActivityItem,
  type PredictActivityScope,
  type PredictDataFreshness,
} from '@/features/predict/predictActivityState';
import { semantic, tokens } from '@/theme';

interface DetailPicksPanelProps {
  scope: PredictActivityScope;
  marketSlug: string;
  loading: boolean;
  freshness: PredictDataFreshness;
  marketTokenIds?: string[];
  marketConditionIds?: string[];
  marketPositions: PortfolioPosition[];
  allPositions: PortfolioPosition[];
  redeemablePositions: PortfolioPosition[];
  closedPositions: ClosedPortfolioPosition[];
  openOrders: OpenOrder[];
  cancellingOrderId?: string | null;
  polygonAddress?: string | null;
  onScopeChange: (scope: PredictActivityScope) => void;
  onBackMore: (position: PortfolioPosition) => void;
  onCashOut: (position: PortfolioPosition) => void;
  onCancelOrder?: (orderId: string) => void;
  onRedeemed?: () => void;
  onRetry?: () => void;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function mergePositions(primary: PortfolioPosition[], fallback: PortfolioPosition[]): PortfolioPosition[] {
  const seen = new Set<string>();
  const merged: PortfolioPosition[] = [];
  for (const position of [...primary, ...fallback]) {
    const key = `${position.asset}-${position.conditionId}-${position.outcomeIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(position);
  }
  return merged;
}

export function DetailPicksPanel({
  scope,
  marketSlug,
  loading,
  freshness,
  marketTokenIds = [],
  marketConditionIds = [],
  marketPositions,
  allPositions,
  redeemablePositions,
  closedPositions,
  openOrders,
  cancellingOrderId,
  polygonAddress,
  onScopeChange,
  onBackMore,
  onCashOut,
  onCancelOrder,
  onRedeemed,
  onRetry,
}: DetailPicksPanelProps) {
  const [selectedItem, setSelectedItem] = useState<PredictActivityItem | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const allItems = useMemo(
    () => buildPredictActivityItems({
      positions: mergePositions(allPositions, marketPositions),
      redeemablePositions,
      openOrders,
      closedPositions,
    }),
    [allPositions, marketPositions, redeemablePositions, openOrders, closedPositions],
  );
  const rows = useMemo(
    () => filterActivityByScope(allItems, scope, {
      slug: marketSlug,
      tokenIds: marketTokenIds,
      conditionIds: marketConditionIds,
    }),
    [allItems, scope, marketSlug, marketTokenIds, marketConditionIds],
  );
  const worthNow = rows.reduce((sum, row) => sum + (row.currentValue ?? 0), 0);
  const putIn = rows.reduce((sum, row) => sum + row.putIn, 0);
  const freshnessCopy = formatPredictFreshness(freshness);

  async function handleRedeem(item: PredictActivityItem) {
    if (!polygonAddress || !item.rawPosition || redeemingId) return;
    setRedeemingId(item.id);
    try {
      const result = await redeemPosition(polygonAddress, {
        conditionId: item.rawPosition.conditionId,
        asset: item.rawPosition.asset,
        outcomeIndex: item.rawPosition.outcomeIndex,
        negativeRisk: item.rawPosition.negativeRisk,
      });
      if (!result.ok) throw new Error(result.error || 'Redeem failed');
      setSelectedItem(null);
      onRedeemed?.();
    } catch (error) {
      Alert.alert('Redeem failed', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setRedeemingId(null);
    }
  }

  function cashOutItem(item: PredictActivityItem) {
    if (!item.rawPosition) return;
    setSelectedItem(null);
    onCashOut(item.rawPosition);
  }

  function backMoreItem(item: PredictActivityItem) {
    if (!item.rawPosition) return;
    setSelectedItem(null);
    onBackMore(item.rawPosition);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.title}>Your Picks</Text>
          <Text style={[styles.freshness, freshness.error && styles.freshnessError]}>{freshnessCopy}</Text>
        </View>
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
          <Text style={styles.summaryLabel}>{scope === 'market' ? 'In this market' : 'All picks'}</Text>
          <Text style={styles.summaryValue}>{scope === 'market' ? formatUsd(putIn) : rows.length}</Text>
        </View>
        <View>
          <Text style={styles.summaryLabel}>Worth now</Text>
          <Text style={styles.summaryValue}>{formatUsd(worthNow)}</Text>
        </View>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={tokens.colors.primary} size="small" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{freshness.error ? 'Could not refresh picks' : 'No picks here yet'}</Text>
          <Text style={styles.emptyText}>
            {freshness.error
              ? 'Your last activity could not be loaded. Try refreshing in a moment.'
              : 'Make a pick below. Active, waiting, redeemable, and settled picks show here.'}
          </Text>
          {freshness.error && onRetry && (
            <Pressable style={styles.retryBtn} onPress={onRetry}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
      ) : rows.map((item) => (
        <PredictActivityRow
          key={item.id}
          item={item}
          showMarketTitle
          cancelling={cancellingOrderId === item.orderId}
          redeeming={redeemingId === item.id}
          onPress={() => setSelectedItem(item)}
          onCashOut={() => cashOutItem(item)}
          onBackMore={() => backMoreItem(item)}
          onCancelOrder={item.orderId && onCancelOrder ? () => onCancelOrder(item.orderId!) : undefined}
          onRedeem={() => void handleRedeem(item)}
        />
      ))}

      <PredictActivityDetailModal
        visible={selectedItem !== null}
        item={selectedItem}
        freshness={freshness}
        onClose={() => setSelectedItem(null)}
        onCashOut={cashOutItem}
        onBackMore={backMoreItem}
        onCancelOrder={(orderId) => {
          setSelectedItem(null);
          onCancelOrder?.(orderId);
        }}
        onRedeem={(item) => void handleRedeem(item)}
      />
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
  freshness: {
    marginTop: 3,
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  freshnessError: {
    color: tokens.colors.vermillion,
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
  retryBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: tokens.colors.primary,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  retryText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
    color: tokens.colors.backgroundDark,
    textTransform: 'uppercase',
  },
});
