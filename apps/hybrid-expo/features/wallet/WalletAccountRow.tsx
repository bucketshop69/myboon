import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { semantic, tokens } from '@/theme';
import type {
  MeteoraRowDetail,
  SpotChipToken,
  SpotRowDetail,
  WalletProtocolId,
  WalletSourceState,
} from '@/features/wallet/wallet.types';

/**
 * Shared Spot/Meteora account row for Home's Wallet section (issue #238).
 *
 * No icon badges, no colored left-edge rail (PRD design decision #15,
 * TC-ROWS-007) — protocol identity is carried entirely by the row's name
 * text color and a faint background tint drawn from that protocol's real
 * brand color. Each row shows exactly one dollar value (PRD decision #7,
 * TC-ROWS-001); multiple positions render as small pills/chips rather than a
 * spelled-out count (PRD decision #17).
 */

const ROW_LABEL: Record<'spot' | 'meteora', string> = {
  spot: 'Spot',
  meteora: 'Meteora',
};

const ROW_TINT: Record<'spot' | 'meteora', string> = {
  // Faint per-protocol background wash, matching wallet_mock.html's
  // `.acc-row.{spot,meteora}` gradient stops.
  spot: 'rgba(153,69,255,0.07)',
  meteora: 'rgba(110,69,255,0.08)',
};

const ROW_NAME_COLOR: Record<'spot' | 'meteora', string> = {
  spot: tokens.walletBrand.spot,
  meteora: tokens.walletBrand.meteora,
};

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function WalletAccountRow({
  protocol,
  source,
  onRetry,
  onPress,
}: {
  protocol: 'spot' | 'meteora';
  source: WalletSourceState;
  onRetry: (id: WalletProtocolId) => void;
  /**
   * Tap-through destination for this row (issue #240). Spot has no profile
   * screen anywhere in the app, so it is never passed an `onPress` — the row
   * renders as visually non-interactive (no chevron, not `Pressable`) rather
   * than a dead tap target (PRD decision #7, TC-NAV-004).
   */
  onPress?: () => void;
}) {
  const isPending = source.status === 'idle' || source.status === 'loading' || source.status === 'failed';

  const content = (
    <>
      <View style={styles.topRow}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: ROW_NAME_COLOR[protocol] }]}>{ROW_LABEL[protocol]}</Text>
          {onPress ? (
            <MaterialIcons name="chevron-right" size={14} color={semantic.text.faint} />
          ) : null}
        </View>
        {source.status === 'resolved' && source.valueUsd !== null ? (
          <Text style={styles.value}>{formatUsd(source.valueUsd)}</Text>
        ) : (
          <View style={styles.valueSkeleton} />
        )}
      </View>

      {source.status === 'resolved' ? (
        <RowSignal protocol={protocol} detail={source.detail} />
      ) : (
        <SyncingSignal
          failed={source.status === 'failed'}
          onRetry={() => onRetry(protocol)}
        />
      )}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, { backgroundColor: ROW_TINT[protocol] }, isPending && styles.rowPending]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${ROW_LABEL[protocol]}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: ROW_TINT[protocol] },
        isPending && styles.rowPending,
        pressed && styles.rowPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

function RowSignal({
  protocol,
  detail,
}: {
  protocol: 'spot' | 'meteora';
  detail: WalletSourceState['detail'];
}) {
  if (protocol === 'spot') {
    return <SpotSignal detail={detail as SpotRowDetail | null} />;
  }
  return <MeteoraSignal detail={detail as MeteoraRowDetail | null} />;
}

function SpotSignal({ detail }: { detail: SpotRowDetail | null }) {
  // Zero-position/zero-holding row (TC-ROWS-006): row stays visible with its
  // real value and no chips, rather than an empty or broken-looking row.
  if (!detail || detail.topTokens.length === 0) return null;

  return (
    <View style={styles.tokenStack}>
      {detail.topTokens.map((token, index) => (
        <TokenChip key={token.mint} token={token} overlap={index > 0} />
      ))}
      {detail.overflowCount > 0 ? (
        <View style={[styles.tokenChip, styles.overflowChip, styles.tokenChipOverlap]}>
          <Text style={styles.overflowChipText}>{`+${detail.overflowCount}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Distinct, deterministic fallback colors for tokens with no logo (e.g.
// obscure/unverified tokens per issue #238) — picked from the existing
// walletBrand palette so fallback chips still read as "myboon-native" rather
// than introducing new arbitrary colors.
const FALLBACK_CHIP_COLORS = [
  tokens.walletBrand.spot,
  tokens.walletBrand.meteora,
  tokens.walletBrand.phoenix,
  tokens.walletBrand.pacifica,
];

function fallbackChipColor(mint: string): string {
  let hash = 0;
  for (let i = 0; i < mint.length; i += 1) {
    hash = (hash * 31 + mint.charCodeAt(i)) | 0;
  }
  return FALLBACK_CHIP_COLORS[Math.abs(hash) % FALLBACK_CHIP_COLORS.length];
}

function TokenChip({ token, overlap }: { token: SpotChipToken; overlap: boolean }) {
  const initial = (token.symbol ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[styles.tokenChip, overlap && styles.tokenChipOverlap]}>
      {token.logoUri ? (
        <Image source={{ uri: token.logoUri }} style={styles.tokenChipImage} />
      ) : (
        <View style={[styles.tokenChipFallback, { backgroundColor: fallbackChipColor(token.mint) }]}>
          <Text style={styles.tokenChipFallbackText}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

function MeteoraSignal({ detail }: { detail: MeteoraRowDetail | null }) {
  // Zero-position row (TC-ROWS-006): still shown, no pills.
  if (!detail || detail.pills.length === 0) return null;

  return (
    <View style={styles.meteoraSignal}>
      <View style={styles.pillRow}>
        {detail.pills.map((pill) => (
          <View
            key={pill.poolAddress}
            style={[
              styles.pill,
              pill.inRange === true && styles.pillWin,
              pill.inRange === false && styles.pillLose,
            ]}
          >
            <View
              style={[
                styles.pillRing,
                pill.inRange === true && styles.ringIn,
                pill.inRange === false && styles.ringOut,
              ]}
            />
            <Text style={styles.pillText} numberOfLines={1}>{pill.pair}</Text>
          </View>
        ))}
      </View>
      {detail.unclaimedFeesUsd !== null ? (
        <Text style={styles.feesText}>{`${formatUsd(detail.unclaimedFeesUsd)} fees`}</Text>
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
  rowPressed: {
    opacity: 0.82,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    marginBottom: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
  tokenStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenChip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(8,61,80,0.90)',
    overflow: 'hidden',
    backgroundColor: semantic.background.lift,
  },
  tokenChipOverlap: {
    marginLeft: -6,
  },
  tokenChipImage: {
    width: '100%',
    height: '100%',
  },
  tokenChipFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenChipFallbackText: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
  },
  overflowChip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.background.lift,
  },
  overflowChipText: {
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '800',
  },
  meteoraSignal: {
    gap: 4,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  feesText: {
    color: semantic.text.faint,
    fontFamily: 'monospace',
    fontSize: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  pillRing: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: semantic.text.faint,
  },
  ringIn: {
    borderColor: semantic.sentiment.positive,
  },
  ringOut: {
    borderColor: semantic.sentiment.negative,
  },
  pillText: {
    color: semantic.text.primary,
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.1,
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
