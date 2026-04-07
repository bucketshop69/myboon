import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Platform } from 'react-native';
import { useWallet } from '@/hooks/useWallet';
import { closePosition, fetchPerpsAccount, fetchPerpsPositions, formatPrice } from '@/features/perps/perps.api';
import type { PerpsAccount, PerpsPosition } from '@/features/perps/perps.types';
import { semantic, tokens } from '@/theme';

interface ProfileViewProps {
  onBack: () => void;
}

export function ProfileView({ onBack }: ProfileViewProps) {
  const { connected, address, shortAddress, connect, signMessage } = useWallet();
  const [account, setAccount] = useState<PerpsAccount | null>(null);
  const [positions, setPositions] = useState<PerpsPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);

  function refreshData() {
    if (!connected || !address) return;
    setLoading(true);
    Promise.all([fetchPerpsPositions(address), fetchPerpsAccount(address)])
      .then(([pos, acc]) => {
        setPositions(pos);
        setAccount(acc);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (connected && address) {
      refreshData();
    } else {
      setAccount(null);
      setPositions([]);
    }
  }, [connected, address]);

  async function handleClose(pos: PerpsPosition) {
    if (!address) return;
    // Opposite side to close
    const closeSide = pos.side === 'long' ? 'ask' : 'bid';
    const doClose = async () => {
      setClosingSymbol(pos.symbol);
      try {
        await closePosition(pos.symbol, closeSide as 'bid' | 'ask', String(pos.size), address, signMessage);
        refreshData();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Close failed';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Close failed', msg);
        }
      } finally {
        setClosingSymbol(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Close ${pos.side.toUpperCase()} ${pos.symbol} (${pos.size})?`)) {
        await doClose();
      }
    } else {
      Alert.alert(
        'Close Position',
        `Close ${pos.side.toUpperCase()} ${pos.symbol} (${pos.size})?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Close', style: 'destructive', onPress: doClose },
        ],
      );
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={onBack}>
          <MaterialIcons name="arrow-back-ios" size={14} color={semantic.text.primary} />
          <Text style={styles.backLabel}>Markets</Text>
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {/* Wallet card */}
        <View style={styles.walletCard}>
          <View style={styles.walletRow}>
            <Text style={styles.walletLabel}>Wallet</Text>
            {connected ? (
              <View style={styles.connectedBadge}>
                <Text style={styles.connectedBadgeText}>{shortAddress}</Text>
              </View>
            ) : (
              <Pressable style={styles.connectBtn} onPress={connect}>
                <Text style={styles.connectBtnText}>Connect</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.equityRow}>
            <View style={styles.eqItem}>
              <Text style={styles.eqLabel}>Equity</Text>
              <Text style={styles.eqVal}>
                {account ? `$${account.equity.toFixed(2)}` : '—'}
              </Text>
            </View>
            <View style={[styles.eqItem, styles.eqItemCenter]}>
              <Text style={styles.eqLabel}>Margin Used</Text>
              <Text style={styles.eqVal}>
                {account ? `$${account.totalMarginUsed.toFixed(2)}` : '—'}
              </Text>
            </View>
            <View style={[styles.eqItem, styles.eqItemRight]}>
              <Text style={styles.eqLabel}>Available</Text>
              <Text style={styles.eqVal}>
                {account ? `$${account.availableToSpend.toFixed(2)}` : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Open positions */}
        <View style={styles.posSection}>
          <View style={styles.posSectionHeader}>
            <Text style={styles.posSectionTitle}>Open Positions</Text>
            <Text style={styles.posSectionBadge}>
              {loading ? '…' : `${positions.length} open`}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={semantic.text.accent} style={{ marginTop: 12 }} />
          ) : !connected ? (
            <View style={styles.posEmpty}>
              <Text style={styles.posEmptyText}>Connect wallet to view positions</Text>
            </View>
          ) : positions.length === 0 ? (
            <View style={styles.posEmpty}>
              <MaterialIcons name="inbox" size={22} color={semantic.text.faint} />
              <Text style={styles.posEmptyText}>No open positions</Text>
            </View>
          ) : (
            positions.map((pos) => {
              const isUp = pos.unrealizedPnl >= 0;
              const isClosing = closingSymbol === pos.symbol;
              return (
                <View key={pos.symbol} style={styles.posRow}>
                  <View style={styles.posLeft}>
                    <Text style={styles.posSym}>{pos.symbol}</Text>
                    <Text style={[styles.posSide, pos.side === 'long' ? styles.textPos : styles.textNeg]}>
                      {pos.side.toUpperCase()} · {pos.size}
                    </Text>
                  </View>
                  <View style={styles.posRight}>
                    <Text style={styles.posEntry}>Entry {formatPrice(pos.entryPrice)}</Text>
                    <Text style={[styles.posPnl, isUp ? styles.textPos : styles.textNeg]}>
                      {isUp ? '+' : ''}{pos.unrealizedPnl.toFixed(2)} ({pos.unrealizedPnlPct.toFixed(1)}%)
                    </Text>
                    <Pressable
                      style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
                      onPress={() => handleClose(pos)}
                      disabled={isClosing}>
                      {isClosing ? (
                        <ActivityIndicator size="small" color={tokens.colors.vermillion} />
                      ) : (
                        <Text style={styles.closeBtnText}>Close</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    width: 70,
  },
  backLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.primary,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },

  // Wallet card
  walletCard: {
    backgroundColor: semantic.background.lift,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
    letterSpacing: 1,
  },
  connectedBadge: {
    backgroundColor: 'rgba(74,140,111,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.25)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  connectedBadgeText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: tokens.colors.viridian,
    letterSpacing: 0.8,
  },
  connectBtn: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 4,
  },
  connectBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    color: tokens.colors.backgroundDark,
    letterSpacing: 1,
  },
  equityRow: {
    flexDirection: 'row',
  },
  eqItem: {
    flex: 1,
    gap: 2,
  },
  eqItemCenter: {
    alignItems: 'center',
  },
  eqItemRight: {
    alignItems: 'flex-end',
  },
  eqLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    letterSpacing: 0.8,
  },
  eqVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    color: semantic.text.primary,
  },

  // Positions
  posSection: {
    gap: tokens.spacing.xs,
  },
  posSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  posSectionTitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.8,
  },
  posSectionBadge: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
  },
  posEmpty: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingVertical: tokens.spacing.lg,
  },
  posEmptyText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.faint,
  },
  posRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: semantic.background.lift,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    padding: tokens.spacing.md,
  },
  posLeft: {
    gap: 2,
  },
  posSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  posSide: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 0.8,
  },
  posRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  posEntry: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
  },
  posPnl: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
  },

  textPos: { color: tokens.colors.viridian },
  textNeg: { color: tokens.colors.vermillion },
  closeBtn: {
    marginTop: 4,
    backgroundColor: 'rgba(217,83,79,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.25)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-end',
  },
  closeBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.colors.vermillion,
  },
});
