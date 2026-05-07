import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PortfolioPosition } from '@/features/predict/predict.api';
import { redeemPosition } from '@/features/predict/predict.api';
import { formatPredictTitle } from '@/features/predict/formatPredictTitle';
import { semantic, tokens } from '@/theme';

interface RedeemableSectionProps {
  positions: PortfolioPosition[];
  polygonAddress: string | null;
  onRedeemed?: () => void;
}

export function RedeemableSection({ positions, polygonAddress, onRedeemed }: RedeemableSectionProps) {
  const visiblePositions = positions.filter((position) => (position.currentValue ?? 0) >= 0.01);
  if (visiblePositions.length === 0) return null;

  const totalRedeemable = visiblePositions.reduce((sum, p) => sum + (p.currentValue ?? 0), 0);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Redeemable</Text>
        <Text style={styles.total}>${totalRedeemable.toFixed(2)}</Text>
      </View>

      {visiblePositions.map((p, i) => (
        <RedeemRow
          key={`${p.conditionId}-${p.outcomeIndex}-${i}`}
          position={p}
          polygonAddress={polygonAddress}
          onRedeemed={onRedeemed}
        />
      ))}
    </View>
  );
}

function RedeemRow({
  position: p,
  polygonAddress,
  onRedeemed,
}: {
  position: PortfolioPosition;
  polygonAddress: string | null;
  onRedeemed?: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const value = p.currentValue ?? 0;

  async function handleRedeem() {
    if (!polygonAddress || status === 'loading' || status === 'success') return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const result = await redeemPosition(polygonAddress, {
        conditionId: p.conditionId,
        asset: p.asset,
        outcomeIndex: p.outcomeIndex,
        negativeRisk: p.negativeRisk,
      });
      if (result.ok) {
        setStatus('success');
        onRedeemed?.();
      } else {
        setStatus('error');
        setErrorMsg(result.error ?? 'Redeem failed');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Unknown error');
    }
  }

  return (
    <View style={styles.row}>
      <View style={[styles.outcomeBadge, styles.badgePos]}>
        <Text style={[styles.outcomeBadgeText, styles.posText]}>
          {p.outcome?.toUpperCase() ?? 'YES'}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {formatPredictTitle({ title: p.title, slug: p.slug || p.eventSlug })}
        </Text>
        <Text style={styles.rowShares}>{p.size.toFixed(2)} shares</Text>
      </View>
      <Pressable
        style={[
          styles.redeemBtn,
          status === 'success' && styles.redeemBtnSuccess,
          status === 'error' && styles.redeemBtnError,
        ]}
        onPress={handleRedeem}
        disabled={status === 'loading' || status === 'success'}
        accessibilityLabel={`Redeem $${value.toFixed(2)} from ${p.title}`}
      >
        {status === 'loading' ? (
          <ActivityIndicator size="small" color={tokens.colors.viridian} />
        ) : status === 'success' ? (
          <Text style={styles.redeemBtnText}>Redeemed</Text>
        ) : status === 'error' ? (
          <Text style={[styles.redeemBtnText, styles.errorText]} numberOfLines={1}>
            {errorMsg || 'Failed'}
          </Text>
        ) : (
          <Text style={styles.redeemBtnText}>Redeem ${value.toFixed(2)}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: 12,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  total: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: tokens.colors.viridian,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 10,
    minHeight: 44,
  },
  outcomeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  outcomeBadgeText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    fontWeight: '700',
  },
  badgePos: { backgroundColor: 'rgba(52,199,123,0.12)' },
  posText: { color: tokens.colors.viridian },
  info: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 9.5,
    color: semantic.text.primary,
    lineHeight: 13,
  },
  rowShares: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
  },
  redeemBtn: {
    backgroundColor: 'rgba(74,140,111,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.25)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  redeemBtnSuccess: {
    backgroundColor: 'rgba(74,140,111,0.25)',
  },
  redeemBtnError: {
    borderColor: 'rgba(217,83,79,0.4)',
    backgroundColor: 'rgba(217,83,79,0.1)',
  },
  redeemBtnText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colors.viridian,
  },
  errorText: {
    color: tokens.colors.vermillion,
  },
});
