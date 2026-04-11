import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { DepositModal } from '@/components/predict/DepositModal';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { useWallet } from '@/hooks/useWallet';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { semantic, tokens } from '@/theme';

function truncate(addr: string, start = 6, end = 4): string {
  return `${addr.slice(0, start)}···${addr.slice(-end)}`;
}

// ── Hardcoded mock data (matches predict-mockup.html Screen 4) ──

const MOCK_EQUITY = {
  portfolio: '$1,840',
  unrealised: '+$84.70',
  cash: '$1,192',
};

const MOCK_HOLDINGS = [
  { name: 'USDC (Solana)', color: '#9945ff', amount: '1,192.00', usd: '$1,192.00' },
  { name: 'Open Positions', color: '#34c77b', amount: '4 markets', usd: '$648.00 cost' },
  { name: 'SOL', color: '#e8c547', amount: '0.41', usd: '~$68.04' },
];

const MOCK_STATS = [
  { label: 'Net PnL', value: '+$142', positive: true },
  { label: 'Realised PnL', value: '+$57', positive: true },
  { label: 'Win Rate', value: '63%', positive: true },
  { label: 'Markets traded', value: '17', positive: null },
  { label: 'Avg winner', value: '+$28', positive: true },
  { label: 'Avg loser', value: '−$9', positive: false },
];

const MOCK_POSITIONS = [
  { side: 'YES' as const, question: 'US forces enter Iran by Apr 30?', pnl: '+$48.40', entry: '0.41→0.62', up: true },
  { side: 'NO' as const, question: 'China invades Taiwan before 2027?', pnl: '+$22.10', entry: '0.76→0.82', up: true },
  { side: 'YES' as const, question: 'Real Madrid win vs Bayern Apr 7?', pnl: '+$24.10', entry: '0.38→0.47', up: true },
  { side: 'NO' as const, question: 'US–Iran ceasefire by April 7?', pnl: '−$9.80', entry: '0.62→0.56', up: false },
];

export default function PredictProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { connected, address: solanaAddress, shortAddress } = useWallet();
  const poly = usePolymarketWallet();
  const [busy, setBusy] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const handleOpenAccount = useCallback(() => {
    if (!connected) {
      Alert.alert('Connect Wallet', 'Connect your Solana wallet first.');
      return;
    }

    Alert.alert(
      'Open Polymarket Account',
      'This will create a Polymarket trading account linked to your Solana wallet.\n\n' +
        '• You\'ll sign a message with Phantom (not a transaction)\n' +
        '• A Polygon trading address is derived from your signature\n' +
        '• No extra seed phrases or wallets to manage\n' +
        '• You can deposit & trade on prediction markets',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Account',
          onPress: async () => {
            setBusy(true);
            try {
              await poly.enable();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to create account';
              Alert.alert('Error', msg);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [connected, poly]);

  const handleDisable = useCallback(() => {
    Alert.alert(
      'Disable Predictions?',
      'This will remove your derived Polymarket wallet. Your positions are safe on-chain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => void poly.disable(),
        },
      ],
    );
  }, [poly]);

  const isEnabled = poly.isReady && poly.polygonAddress;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialIcons name="arrow-back" size={14} color={semantic.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        {isEnabled && (
          <View style={styles.headerActions}>
            <Pressable onPress={() => setDepositOpen(true)} style={styles.headerActionBtn}>
              <MaterialIcons name="arrow-downward" size={12} color={tokens.colors.viridian} />
              <Text style={styles.headerActionText}>Deposit</Text>
            </Pressable>
            <Pressable style={styles.headerActionBtn}>
              <MaterialIcons name="arrow-upward" size={12} color={tokens.colors.primary} />
              <Text style={[styles.headerActionText, { color: tokens.colors.primary }]}>Withdraw</Text>
            </Pressable>
          </View>
        )}
        <Pressable style={[styles.headerBtn, styles.headerBtnGhost]}>
          <MaterialIcons name="settings" size={16} color={semantic.text.dim} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity ── */}
        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>B</Text>
            </View>
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.handle}>bucketshop69</Text>
            <View style={styles.addrRow}>
              <Text style={styles.addrText}>
                {solanaAddress ? truncate(solanaAddress) : '—'}
              </Text>
              <MaterialIcons name="content-copy" size={10} color={semantic.text.faint} />
            </View>
            {connected && (
              <View style={styles.connectedChip}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>Connected</Text>
              </View>
            )}
          </View>

          {/* Open Account / Status button — right side of identity banner */}
          {!isEnabled && !poly.isLoading && (
            <Pressable
              onPress={handleOpenAccount}
              disabled={busy || !connected}
              style={[styles.openAccountBtn, (busy || !connected) && styles.btnDisabled]}
            >
              {busy ? (
                <ActivityIndicator color={tokens.colors.backgroundDark} size="small" />
              ) : (
                <Text style={styles.openAccountBtnText}>Open{'\n'}Account</Text>
              )}
            </Pressable>
          )}
          {isEnabled && (
            <View style={styles.accountActiveBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.accountActiveText}>Active</Text>
            </View>
          )}
        </View>

        {poly.isLoading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={tokens.colors.primary} size="small" />
          </View>
        )}

        {/* ── Enabled: full profile ── */}
        {isEnabled && (
          <>
            {/* Equity card */}
            <View style={styles.equityCard}>
              <View style={styles.equityRow}>
                <View style={styles.eqItem}>
                  <Text style={styles.eqLabel}>Portfolio</Text>
                  <Text style={styles.eqVal}>{MOCK_EQUITY.portfolio}</Text>
                </View>
                <View style={[styles.eqItem, styles.eqItemCenter]}>
                  <Text style={styles.eqLabel}>Unrealised</Text>
                  <Text style={[styles.eqVal, styles.posText]}>{MOCK_EQUITY.unrealised}</Text>
                </View>
                <View style={[styles.eqItem, styles.eqItemRight]}>
                  <Text style={styles.eqLabel}>Cash</Text>
                  <Text style={styles.eqVal}>{MOCK_EQUITY.cash}</Text>
                </View>
              </View>

              <Text style={styles.holdingsLabel}>Holdings</Text>
              {MOCK_HOLDINGS.map((h) => (
                <View key={h.name} style={styles.holdingRow}>
                  <View style={styles.holdingName}>
                    <View style={[styles.holdingDot, { backgroundColor: h.color }]} />
                    <Text style={styles.holdingNameText}>{h.name}</Text>
                  </View>
                  <View style={styles.holdingValues}>
                    <Text style={styles.holdingAmount}>{h.amount}</Text>
                    <Text style={styles.holdingUsd}>{h.usd}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              {MOCK_STATS.map((s) => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text
                    style={[
                      styles.statVal,
                      s.positive === true && styles.posText,
                      s.positive === false && styles.negText,
                    ]}
                  >
                    {s.value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Open positions */}
            <View style={styles.positionsSection}>
              <View style={styles.posHeader}>
                <Text style={styles.posTitle}>Open Positions</Text>
                <Text style={styles.posCount}>{MOCK_POSITIONS.length} active</Text>
              </View>
              {MOCK_POSITIONS.map((p, i) => (
                <View key={i} style={styles.posRow}>
                  <View
                    style={[
                      styles.sideBadge,
                      p.side === 'YES' ? styles.sideBadgeYes : styles.sideBadgeNo,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sideBadgeText,
                        p.side === 'YES' ? styles.posText : styles.negText,
                      ]}
                    >
                      {p.side}
                    </Text>
                  </View>
                  <Text style={styles.posQuestion} numberOfLines={1}>
                    {p.question}
                  </Text>
                  <View style={styles.posPnlWrap}>
                    <Text style={[styles.posPnl, p.up ? styles.posText : styles.negText]}>
                      {p.pnl}
                    </Text>
                    <Text style={styles.posEntry}>{p.entry}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Addresses + disable */}
            <View style={styles.addressesSection}>
              <Text style={styles.sectionLabel}>ADDRESSES</Text>
              {solanaAddress && (
                <View style={styles.addressRow}>
                  <Text style={styles.chainLabel}>SOL</Text>
                  <Text style={styles.addressMono}>{truncate(solanaAddress)}</Text>
                </View>
              )}
              {poly.polygonAddress && (
                <View style={styles.addressRow}>
                  <Text style={styles.chainLabel}>POLY</Text>
                  <Text style={styles.addressMono}>{truncate(poly.polygonAddress)}</Text>
                </View>
              )}
              <Pressable onPress={handleDisable} style={styles.disableBtn}>
                <Text style={styles.disableBtnText}>Disable Predictions</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />

      {poly.polygonAddress && (
        <DepositModal
          isOpen={depositOpen}
          onClose={() => setDepositOpen(false)}
          polygonAddress={poly.polygonAddress}
        />
      )}
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },

  // Header
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnGhost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colors.viridian,
  },

  scroll: { flex: 1 },

  // Identity
  identity: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.primary,
  },
  identityInfo: { flex: 1 },
  handle: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
    marginBottom: 3,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addrText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
    letterSpacing: 0.3,
  },
  connectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52,199,123,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,123,0.22)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 5,
    alignSelf: 'flex-start',
  },
  connectedDot: {
    width: 4,
    height: 4,
    backgroundColor: tokens.colors.viridian,
    borderRadius: 2,
  },
  connectedText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 1,
    color: tokens.colors.viridian,
  },

  // Open Account button (in identity banner, right side)
  openAccountBtn: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openAccountBtnText: {
    color: tokens.colors.backgroundDark,
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 12,
  },
  accountActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52,199,123,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,123,0.22)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  accountActiveText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colors.viridian,
    textTransform: 'uppercase',
  },
  btnDisabled: { opacity: 0.5 },

  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },

  // Equity card
  equityCard: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: 12,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 10,
    padding: 14,
  },
  equityRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
    paddingBottom: 10,
    marginBottom: 10,
  },
  eqItem: { flex: 1, gap: 3 },
  eqItemCenter: { alignItems: 'center' },
  eqItemRight: { alignItems: 'flex-end' },
  eqLabel: {
    fontFamily: 'monospace',
    fontSize: 6.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  eqVal: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
  },

  holdingsLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.faint,
    marginBottom: 6,
  },
  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
  },
  holdingName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  holdingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  holdingNameText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
  },
  holdingValues: {
    alignItems: 'flex-end',
    gap: 1,
  },
  holdingAmount: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  holdingUsd: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.dim,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginHorizontal: tokens.spacing.lg,
    marginTop: 12,
  },
  statCard: {
    width: '48.5%' as any,
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 11,
    gap: 3,
  },
  statLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  statVal: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: semantic.text.primary,
    lineHeight: 20,
    letterSpacing: -0.5,
  },

  // Positions
  positionsSection: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: 12,
  },
  posHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  posTitle: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  posCount: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
  },
  posRow: {
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
  sideBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  sideBadgeYes: { backgroundColor: 'rgba(52,199,123,0.12)' },
  sideBadgeNo: { backgroundColor: 'rgba(244,88,78,0.12)' },
  sideBadgeText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    fontWeight: '700',
  },
  posQuestion: {
    flex: 1,
    fontSize: 9.5,
    color: semantic.text.primary,
    lineHeight: 13,
  },
  posPnlWrap: {
    alignItems: 'flex-end',
    gap: 1,
  },
  posPnl: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '700',
  },
  posEntry: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    color: semantic.text.faint,
  },

  // Addresses section
  addressesSection: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: 16,
    marginBottom: 8,
    gap: tokens.spacing.sm,
  },
  sectionLabel: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  chainLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    color: tokens.colors.primary,
    width: 36,
  },
  addressMono: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
  },
  disableBtn: {
    borderWidth: 1,
    borderColor: semantic.border.muted,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    marginTop: 4,
  },
  disableBtnText: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },

  // Color helpers
  posText: { color: tokens.colors.viridian },
  negText: { color: tokens.colors.vermillion },
});
