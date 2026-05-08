import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClosedPortfolioPosition, OpenOrder, PortfolioPosition } from '@/features/predict/predict.api';
import { redeemPosition } from '@/features/predict/predict.api';
import { PredictActivityDetailModal } from '@/features/predict/components/PredictActivityDetailModal';
import { PredictActivityRow } from '@/features/predict/components/PredictActivityRow';
import {
  buildPredictActivityItems,
  formatPredictFreshness,
  type PredictActivityItem,
  type PredictDataFreshness,
} from '@/features/predict/predictActivityState';
import { semantic, tokens } from '@/theme';

interface YourPicksSectionProps {
  positions: PortfolioPosition[];
  openOrders: OpenOrder[];
  redeemablePositions: PortfolioPosition[];
  closedPositions: ClosedPortfolioPosition[];
  polygonAddress: string | null;
  cancellingOrderId: string | null;
  freshness: PredictDataFreshness;
  onCashOutPress: (position: PortfolioPosition) => void;
  onMarketPress: (slug: string) => void;
  onCancelOrder: (orderId: string) => void;
  onRedeemed: () => void;
}

export function YourPicksSection({
  positions,
  openOrders,
  redeemablePositions,
  closedPositions,
  polygonAddress,
  cancellingOrderId,
  freshness,
  onCashOutPress,
  onMarketPress,
  onCancelOrder,
  onRedeemed,
}: YourPicksSectionProps) {
  const [scope, setScope] = useState<'active' | 'all'>('all');
  const [selectedItem, setSelectedItem] = useState<PredictActivityItem | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const allPicks = useMemo(
    () => buildPredictActivityItems({ positions, redeemablePositions, openOrders, closedPositions }),
    [positions, redeemablePositions, openOrders, closedPositions],
  );
  const activePicks = allPicks.filter((item) =>
    item.status === 'syncing'
    || item.status === 'waiting_to_match'
    || item.status === 'active'
    || item.status === 'ready_to_collect'
  );
  const picks = scope === 'all' ? allPicks : activePicks;
  const allCount = allPicks.length;
  if (allCount === 0) return null;

  const activeCount = positions.length + openOrders.length;
  const readyCount = redeemablePositions.length;
  const closedCount = closedPositions.length;
  const countLabel = `${activeCount} active${readyCount > 0 ? ` · ${readyCount} ready` : ''}${closedCount > 0 ? ` · ${closedCount} history` : ''}`;

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
      onRedeemed();
    } catch (error) {
      Alert.alert('Redeem failed', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setRedeemingId(null);
    }
  }

  function cashOutItem(item: PredictActivityItem) {
    if (!item.rawPosition) return;
    setSelectedItem(null);
    onCashOutPress(item.rawPosition);
  }

  function backMoreItem(item: PredictActivityItem) {
    if (!item.rawPosition?.slug) return;
    setSelectedItem(null);
    onMarketPress(item.rawPosition.slug);
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Your Picks</Text>
          <Text style={[styles.freshness, freshness.error && styles.freshnessError]}>
            {formatPredictFreshness(freshness)}
          </Text>
        </View>
        <View style={styles.headerSide}>
          <Text style={styles.count}>{countLabel}</Text>
          {closedCount > 0 && activePicks.length > 0 && (
            <View style={styles.scopeTabs}>
              <Pressable
                style={[styles.scopeTab, scope === 'all' && styles.scopeTabActive]}
                onPress={() => setScope('all')}
                accessibilityState={{ selected: scope === 'all' }}
              >
                <Text style={[styles.scopeTabText, scope === 'all' && styles.scopeTabTextActive]}>All picks</Text>
              </Pressable>
              <Pressable
                style={[styles.scopeTab, scope === 'active' && styles.scopeTabActive]}
                onPress={() => setScope('active')}
                accessibilityState={{ selected: scope === 'active' }}
              >
                <Text style={[styles.scopeTabText, scope === 'active' && styles.scopeTabTextActive]}>Active</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {picks.length === 0 && (
        <View style={styles.emptyScope}>
          <Text style={styles.emptyScopeText}>No active picks right now</Text>
        </View>
      )}

      {picks.map((item) => (
        <PredictActivityRow
          key={item.id}
          item={item}
          showMarketTitle
          cancelling={cancellingOrderId === item.orderId}
          redeeming={redeemingId === item.id}
          onPress={() => setSelectedItem(item)}
          onCashOut={() => cashOutItem(item)}
          onBackMore={() => backMoreItem(item)}
          onCancelOrder={item.orderId ? () => onCancelOrder(item.orderId!) : undefined}
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
          onCancelOrder(orderId);
        }}
        onRedeem={(item) => void handleRedeem(item)}
      />
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
    gap: 10,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 2,
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
  headerSide: {
    alignItems: 'flex-end',
    gap: 5,
    flexShrink: 0,
  },
  count: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
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
});
