import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import { useWallet } from '@/hooks/useWallet';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { semantic, tokens } from '@/theme';

type EnableStep = 'idle' | 'email' | 'otp';

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function PredictProfileScreen() {
  const router = useRouter();
  const { connected, address: solanaAddress, shortAddress } = useWallet();
  const poly = usePolymarketWallet();

  const [step, setStep] = useState<EnableStep>('idle');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSendOtp = useCallback(async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await poly.loginWithOtp({ email: email.trim() });
      setStep('otp');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send code';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }, [email, poly]);

  const handleVerifyOtp = useCallback(async () => {
    if (!otpCode.trim()) return;
    setBusy(true);
    try {
      await poly.verifyOtp({ otpCode: otpCode.trim() });
      setStep('idle');
      setEmail('');
      setOtpCode('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid code';
      Alert.alert('Verification Failed', msg);
    } finally {
      setBusy(false);
    }
  }, [otpCode, poly]);

  const handleDisable = useCallback(() => {
    Alert.alert(
      'Disable Predictions?',
      'This will unlink your Polymarket wallet. Your positions are safe on-chain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            void poly.disable();
            setStep('idle');
          },
        },
      ],
    );
  }, [poly]);

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={16} color={semantic.text.primary} />
          <Text style={styles.backText}>Predict</Text>
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.body}>
        {/* Solana Wallet */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SOLANA WALLET</Text>
          {connected ? (
            <View style={styles.walletRow}>
              <View style={[styles.statusDot, styles.statusConnected]} />
              <Text style={styles.addressText}>{shortAddress}</Text>
            </View>
          ) : (
            <Text style={styles.dimText}>Not connected</Text>
          )}
        </View>

        {/* Polymarket Predictions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PREDICTIONS</Text>

          {poly.isLoading ? (
            <ActivityIndicator color={tokens.colors.primary} size="small" />
          ) : poly.polygonAddress ? (
            /* Linked state */
            <>
              <View style={styles.walletRow}>
                <View
                  style={[
                    styles.statusDot,
                    poly.isReady ? styles.statusConnected : styles.statusPending,
                  ]}
                />
                <Text style={styles.addressText}>{truncate(poly.polygonAddress)}</Text>
              </View>
              <Text style={styles.helperText}>
                Embedded Polygon wallet for Polymarket
              </Text>
              <Pressable onPress={handleDisable} style={styles.disableBtn}>
                <Text style={styles.disableBtnText}>Disable Predictions</Text>
              </Pressable>
            </>
          ) : step === 'email' ? (
            /* Email input step */
            <>
              <Text style={styles.dimText}>
                Enter your email to create a prediction wallet.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="you@email.com"
                placeholderTextColor={semantic.text.faint}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
              <View style={styles.btnRow}>
                <Pressable onPress={() => setStep('idle')} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSendOtp}
                  disabled={busy || !email.trim()}
                  style={[styles.enableBtn, (busy || !email.trim()) && styles.enableBtnDisabled]}
                >
                  {busy ? (
                    <ActivityIndicator color={tokens.colors.backgroundDark} size="small" />
                  ) : (
                    <Text style={styles.enableBtnText}>Send Code</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : step === 'otp' ? (
            /* OTP verification step */
            <>
              <Text style={styles.dimText}>
                Code sent to {email}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter code"
                placeholderTextColor={semantic.text.faint}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                editable={!busy}
              />
              <View style={styles.btnRow}>
                <Pressable onPress={() => setStep('email')} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={handleVerifyOtp}
                  disabled={busy || !otpCode.trim()}
                  style={[styles.enableBtn, (busy || !otpCode.trim()) && styles.enableBtnDisabled]}
                >
                  {busy ? (
                    <ActivityIndicator color={tokens.colors.backgroundDark} size="small" />
                  ) : (
                    <Text style={styles.enableBtnText}>Verify</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            /* Idle — show enable button */
            <>
              <Text style={styles.dimText}>
                Enable predictions to place bets on Polymarket.
              </Text>
              <Text style={styles.helperText}>
                Creates an embedded wallet — no seed phrase needed.
              </Text>
              <Pressable onPress={() => setStep('email')} style={styles.enableBtn}>
                <Text style={styles.enableBtnText}>Enable Predictions</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Address Summary */}
        {(solanaAddress || poly.polygonAddress) && (
          <View style={styles.section}>
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
          </View>
        )}
      </View>

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background.screen },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    width: 60,
  },
  backText: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
  },
  title: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xs,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  body: {
    flex: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.xl,
    gap: tokens.spacing.xl,
  },
  section: { gap: tokens.spacing.sm },
  sectionLabel: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusConnected: { backgroundColor: tokens.colors.viridian },
  statusPending: { backgroundColor: tokens.colors.primary },
  addressText: {
    color: semantic.text.primary,
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
  },
  dimText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
  },
  helperText: {
    color: semantic.text.faint,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
  },
  input: {
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    color: semantic.text.primary,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    backgroundColor: semantic.background.surface,
  },
  btnRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  enableBtn: {
    flex: 1,
    backgroundColor: tokens.colors.primary,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
  },
  enableBtnDisabled: { opacity: 0.5 },
  enableBtnText: {
    color: tokens.colors.backgroundDark,
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cancelBtn: {
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
  },
  disableBtn: {
    borderWidth: 1,
    borderColor: semantic.border.muted,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    marginTop: tokens.spacing.sm,
  },
  disableBtnText: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  chainLabel: {
    color: semantic.text.accent,
    fontSize: tokens.fontSize.xxs,
    fontFamily: 'monospace',
    fontWeight: '700',
    width: 36,
  },
  addressMono: {
    color: semantic.text.dim,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
  },
});
