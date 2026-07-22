import { StyleSheet, Text, View } from 'react-native';
import { semantic, tokens } from '@/theme';
import type { PerpsRowDetail, WalletProtocolId, WalletSourceState } from '@/features/wallet/wallet.types';

/**
 * Shared account row for perps protocols (Phoenix, Pacifica — issue #239).
 *
 * One implementation parameterized by protocol identity, mirroring
 * `WalletAccountRow`'s Spot/Meteora pattern (issue #238): no icon badges, no
 * colored left-edge rail (PRD design decision #15, TC-ROWS-007) — protocol
 * identity lives entirely in the row's name-text color and a faint
 * background tint drawn from that protocol's real brand color. Each row
 * shows exactly one dollar value — equity (collateral + unrealized PnL), not
 * static collateral (PRD decision #6, TC-ROWS-002) — and one small pill per
 * open position, tinted by that position's own live PnL sign, never a
 * spelled-out count (PRD decision #17, TC-ROWS-005).
 */

/** Cap displayed pills before switching to a "+N" overflow chip (PRD decision #17, TC-ROWS-005). */
const MAX_VISIBLE_PILLS = 4;

const ROW_LABEL: Record<'phoenix' | 'pacifica', string> = {
  phoenix: 'Phoenix',
  pacifica: 'Pacifica',
};

const ROW_TINT: Record<'phoenix' | 'pacifica', string> = {
  // Faint per-protocol background wash, matching wallet_mock.html's
  // `.acc-row.{phoenix,pacifica}` gradient stops.
  phoenix: 'rgba(255,141,42,0.08)',
  pacifica: 'rgba(97,215,239,0.08)',
};

const ROW_NAME_COLOR: Record<'phoenix' | 'pacifica', string> = {
  phoenix: tokens.walletBrand.phoenix,
  pacifica: tokens.walletBrand.pacifica,
};

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PerpsAccountRow({
  protocol,
  source,
  onRetry,
}: {
  protocol: 'phoenix' | 'pacifica';
  source: WalletSourceState;
  onRetry: (id: WalletProtocolId) => void;
}) {
  const isPending = source.status === 'idle' || source.status === 'loading' || source.status === 'failed';

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: ROW_TINT[protocol] },
        isPending && styles.rowPending,
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.name, { color: ROW_NAME_COLOR[protocol] }]}>{ROW_LABEL[protocol]}</Text>
        {source.status === 'resolved' && source.valueUsd !== null ? (
          <Text style={styles.value}>{formatUsd(source.valueUsd)}</Text>
        ) : (
          <View style={styles.valueSkeleton} />
        )}
      </View>

      {source.status === 'resolved' ? (
        <PerpsSignal detail={source.detail as PerpsRowDetail | null} />
      ) : (
        <SyncingSignal
          failed={source.status === 'failed'}
          onRetry={() => onRetry(protocol)}
        />
      )}
    </View>
  );
}

function PerpsSignal({ detail }: { detail: PerpsRowDetail | null }) {
  // Zero-position row (TC-ROWS-006): still shown with its real equity, no pills.
  if (!detail || detail.pills.length === 0) return null;

  const visiblePills = detail.pills.slice(0, MAX_VISIBLE_PILLS);
  const overflowCount = Math.max(0, detail.pills.length - visiblePills.length);

  return (
    <View style={styles.pillRow}>
      {visiblePills.map((pill, index) => {
        const winning = pill.unrealizedPnl >= 0;
        return (
          <View
            key={`${pill.symbol}-${index}`}
            style={[styles.pill, winning ? styles.pillWin : styles.pillLose]}
          >
            <Text style={styles.pillText}>{pill.symbol}</Text>
            <Text style={[styles.pillArrow, winning ? styles.textPositive : styles.textNegative]}>
              {winning ? '↑' : '↓'}
            </Text>
          </View>
        );
      })}
      {overflowCount > 0 ? (
        <View style={styles.overflowPill}>
          <Text style={styles.overflowPillText}>{`+${overflowCount}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SyncingSignal({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <View style={styles.syncingRow}>
      <View style={styles.spinnerDot} />
      <Text style={styles.syncingText}>{failed ? 'syncing · tap to retry' : 'syncing'}</Text>
      {failed ? (
        <Text style={styles.retryLink} onPress={onRetry}>Retry</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(24,90,112,0.78)',
    backgroundColor: 'rgba(8,61,80,0.90)',
    padding: 11,
    paddingHorizontal: 12,
  },
  rowPending: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255,209,102,0.35)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    marginBottom: 5,
  },
  name: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  value: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  valueSkeleton: {
    width: 64,
    height: 15,
    borderRadius: 4,
    backgroundColor: semantic.background.lift,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pillWin: {
    borderColor: 'rgba(6,214,160,0.5)',
  },
  pillLose: {
    borderColor: 'rgba(239,71,111,0.5)',
  },
  pillText: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  pillArrow: {
    fontSize: 9,
    fontWeight: '800',
  },
  textPositive: {
    color: semantic.sentiment.positive,
  },
  textNegative: {
    color: semantic.sentiment.negative,
  },
  overflowPill: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: semantic.background.lift,
  },
  overflowPillText: {
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
  },
  syncingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spinnerDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,209,102,0.25)',
    borderTopColor: tokens.colors.accent,
  },
  syncingText: {
    color: tokens.colors.accent,
    fontFamily: 'monospace',
    fontSize: 8.5,
  },
  retryLink: {
    color: tokens.colors.primary,
    fontFamily: 'monospace',
    fontSize: 8.5,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
