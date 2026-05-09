import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useDrawer } from './DrawerProvider';
import { useWallet } from '@/hooks/useWallet';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { usePolymarketWallet } from '@/hooks/usePolymarketWallet';
import { fetchClobBalance, fetchPortfolio } from '@/features/predict/predict.api';
import { semantic, tokens } from '@/theme';

const DRAWER_WIDTH = 280;

type WalletOption = {
  name: string;
  readyState?: string;
};

export function WalletDrawer() {
  const { isOpen, close } = useDrawer();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    connected,
    address,
    source,
    connect: walletConnect,
    disconnect: walletDisconnect,
    walletOptions = [],
  } = useWallet();
  const privy = usePrivyWallet();
  const poly = usePolymarketWallet();

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const [predictValue, setPredictValue] = useState<string | null>(null);

  // Fetch predict portfolio value when drawer opens
  useEffect(() => {
    if (!isOpen || !poly.polygonAddress) return;
    const addr = poly.tradingAddress ?? poly.polygonAddress;
    Promise.all([
      fetchPortfolio(addr).catch(() => null),
      fetchClobBalance(poly.polygonAddress).catch(() => null),
    ]).then(([portfolio, balance]) => {
      const total = (portfolio?.portfolioValue ?? 0) + (balance?.balance ?? 0);
      setPredictValue(total > 0 ? `$${total.toFixed(0)}` : '$0');
    });
  }, [isOpen, poly.polygonAddress, poly.tradingAddress]);

  // Email OTP state
  const [emailInput, setEmailInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVisible(false);
        // Reset email state when drawer closes
        setOtpSent(false);
        setOtpCode('');
      });
    }
  }, [isOpen, overlayOpacity, translateX]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    close();
  }, [close]);

  const handleCopyAddress = useCallback(async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [address]);

  const handleDisconnect = useCallback(() => {
    Alert.alert('Disconnect?', 'You can reconnect anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            // Clear derived Polymarket session/local state before the base wallet address disappears.
            poly.disable();
            if (source === 'privy') {
              await privy.disconnect();
            } else {
              await walletDisconnect();
            }
            close();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to disconnect wallet';
            Alert.alert('Disconnect failed', msg);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [source, poly, privy, walletDisconnect, close]);

  const handleSendEmail = useCallback(async () => {
    if (!emailInput.trim() || busy) return;
    setBusy(true);
    try {
      await privy.sendEmailOTP(emailInput.trim());
      setOtpSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send code';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }, [emailInput, busy, privy]);

  const handleVerifyOTP = useCallback(async () => {
    if (!otpCode.trim() || busy) return;
    setBusy(true);
    try {
      await privy.loginWithEmailOTP(otpCode.trim());
      await privy.waitForWallet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpSent(false);
      setOtpCode('');
      setEmailInput('');
      close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid code';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }, [otpCode, busy, privy, close]);

  const handlePasskey = useCallback(async () => {
    setBusy(true);
    try {
      try {
        await privy.loginWithPasskey();
      } catch {
        await privy.signupWithPasskey();
      }
      await privy.waitForWallet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Passkey failed';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }, [privy, close]);

  const handleWalletConnect = useCallback(async (walletName?: string) => {
    setBusy(true);
    try {
      // MWA connect via useWallet hook
      await walletConnect(walletName);
      close();
    } catch {
      // Fallback: just close and let user use the in-context wallet connect
      close();
    } finally {
      setBusy(false);
    }
  }, [walletConnect, close]);

  if (!visible) return null;

  const shortAddr = address
    ? `${address.slice(0, 6)}···${address.slice(-4)}`
    : '—';

  const authLabel =
    privy.authMethod === 'email'
      ? 'Email'
      : privy.authMethod === 'passkey'
        ? 'Passkey'
        : source === 'privy'
          ? 'Privy'
          : 'Wallet';

  const installedWalletOptions = (walletOptions as WalletOption[]).filter(
    (option) => option.readyState !== 'Unsupported',
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 8 },
          { transform: [{ translateX }] },
        ]}
      >
        {connected ? (
          /* ── CONNECTED STATE ── */
          <>
            <View style={styles.header}>
              <View style={styles.avatarRow}>
                <View style={styles.avatar}>
                  <View style={styles.avatarInner}>
                    <Text style={styles.avatarLetter}>
                      {shortAddr.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.avatarDot} />
                </View>
                <View style={styles.identity}>
                  <TouchableOpacity
                    style={styles.addressRow}
                    onPress={handleCopyAddress}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addressText}>{shortAddr}</Text>
                    <MaterialIcons
                      name="content-copy"
                      size={11}
                      color={semantic.text.faint}
                    />
                  </TouchableOpacity>
                  <View style={styles.authRow}>
                    <View style={styles.authDot} />
                    <Text style={styles.authLabel}>
                      Connected via {authLabel}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Protocol summary cards */}
            <View style={styles.protocolSection}>
              <Text style={styles.protocolSectionLabel}>Accounts</Text>

              {/* Predict (Polymarket) */}
              <TouchableOpacity
                style={styles.protocolCard}
                activeOpacity={0.7}
                onPress={() => { close(); router.push('/predict-profile'); }}
              >
                <View style={[styles.protocolIcon, styles.protocolIconPredict]}>
                  <MaterialIcons name="schedule" size={14} color={tokens.colors.viridian} />
                </View>
                <View style={styles.protocolInfo}>
                  <Text style={styles.protocolName}>Predict</Text>
                  <Text style={styles.protocolSub}>Polymarket</Text>
                </View>
                <Text style={styles.protocolValue}>{predictValue ?? '--'}</Text>
                <MaterialIcons name="chevron-right" size={14} color={semantic.text.faint} />
              </TouchableOpacity>

              {/* Trade (Pacifica) */}
              <TouchableOpacity
                style={styles.protocolCard}
                activeOpacity={0.7}
                onPress={() => { close(); router.push({ pathname: '/trade', params: { view: 'profile' } }); }}
              >
                <View style={[styles.protocolIcon, styles.protocolIconTrade]}>
                  <MaterialIcons name="show-chart" size={14} color={tokens.colors.primary} />
                </View>
                <View style={styles.protocolInfo}>
                  <Text style={styles.protocolName}>Trade</Text>
                  <Text style={styles.protocolSub}>Perps · Pacifica</Text>
                </View>
                <Text style={styles.protocolValue}>$1,204</Text>
                <MaterialIcons name="chevron-right" size={14} color={semantic.text.faint} />
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                onPress={handleDisconnect}
                activeOpacity={0.6}
                style={styles.disconnectRow}
              >
                <MaterialIcons
                  name="power-settings-new"
                  size={12}
                  color={tokens.colors.vermillion}
                />
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
              <Text style={styles.version}>myboon v0.1.0</Text>
            </View>
          </>
        ) : (
          /* ── DISCONNECTED STATE ── */
          <>
            <View style={styles.connectHeader}>
              <View style={styles.lockAvatar}>
                <View style={styles.lockAvatarInner}>
                  <MaterialIcons
                    name="lock"
                    size={22}
                    color={semantic.text.faint}
                  />
                </View>
              </View>
              <Text style={styles.connectTitle}>Sign In</Text>
              <Text style={styles.connectSub}>
                Trade, predict, and track your portfolio. MFA secures every
                transaction.
              </Text>
            </View>

            <View style={styles.connectActions}>
              {!otpSent ? (
                <>
                  {/* Email input */}
                  <View style={styles.emailInputRow}>
                    <MaterialIcons
                      name="email"
                      size={14}
                      color={semantic.text.faint}
                    />
                    <TextInput
                      style={styles.emailInput}
                      placeholder="you@email.com"
                      placeholderTextColor={semantic.text.faint}
                      value={emailInput}
                      onChangeText={setEmailInput}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      (!emailInput.trim() || busy) && styles.btnDisabled,
                    ]}
                    onPress={handleSendEmail}
                    disabled={!emailInput.trim() || busy}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryBtnText}>
                      {busy ? 'Sending...' : 'Continue with Email'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* OTP input */}
                  <Text style={styles.otpLabel}>
                    Code sent to {emailInput}
                  </Text>
                  <View style={styles.emailInputRow}>
                    <MaterialIcons
                      name="pin"
                      size={14}
                      color={semantic.text.faint}
                    />
                    <TextInput
                      style={styles.emailInput}
                      placeholder="Enter code"
                      placeholderTextColor={semantic.text.faint}
                      value={otpCode}
                      onChangeText={setOtpCode}
                      keyboardType="number-pad"
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      (!otpCode.trim() || busy) && styles.btnDisabled,
                    ]}
                    onPress={handleVerifyOTP}
                    disabled={!otpCode.trim() || busy}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryBtnText}>
                      {busy ? 'Verifying...' : 'Verify Code'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setOtpSent(false);
                      setOtpCode('');
                    }}
                  >
                    <Text style={styles.backLink}>Back</Text>
                  </TouchableOpacity>
                </>
              )}

              {!otpSent && (
                <>
                  {/* OR divider */}
                  <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>or</Text>
                    <View style={styles.orLine} />
                  </View>

                  {/* Passkey */}
                  <TouchableOpacity
                    style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                    onPress={handlePasskey}
                    disabled={busy}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name="fingerprint"
                      size={16}
                      color={semantic.text.dim}
                    />
                    <Text style={styles.secondaryBtnText}>
                      Sign in with Passkey
                    </Text>
                  </TouchableOpacity>

                  {/* Solana Wallet */}
                  {installedWalletOptions.length > 1 ? (
                    <View style={styles.walletOptionGroup}>
                      {installedWalletOptions.map((option) => (
                        <TouchableOpacity
                          key={option.name}
                          style={[styles.secondaryBtn, styles.walletOptionBtn, busy && styles.btnDisabled]}
                          onPress={() => handleWalletConnect(option.name)}
                          disabled={busy}
                          activeOpacity={0.7}
                        >
                          <MaterialIcons
                            name="account-balance-wallet"
                            size={16}
                            color={semantic.text.dim}
                          />
                          <Text style={styles.secondaryBtnText}>{option.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                      onPress={() => handleWalletConnect(installedWalletOptions[0]?.name)}
                      disabled={busy}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name="account-balance-wallet"
                        size={16}
                        color={semantic.text.dim}
                      />
                      <Text style={styles.secondaryBtnText}>Solana Wallet</Text>
                    </TouchableOpacity>
                  )}

                  {/* MFA note */}
                  <View style={styles.mfaNote}>
                    <MaterialIcons
                      name="lock"
                      size={10}
                      color={semantic.text.faint}
                    />
                    <Text style={styles.mfaText}>
                      MFA required for transactions
                    </Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.footer}>
              <Text style={styles.version}>myboon v0.1.0</Text>
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 998,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: semantic.background.screen,
    borderRightWidth: 1,
    borderRightColor: semantic.border.muted,
    zIndex: 999,
    flexDirection: 'column',
  },

  // ── Connected: Header ──
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: tokens.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.primary,
  },
  avatarDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.colors.viridian,
    borderWidth: 2.5,
    borderColor: semantic.background.screen,
  },
  identity: {
    flex: 1,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '600',
    color: semantic.text.primary,
    letterSpacing: 0.3,
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  authDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: tokens.colors.viridian,
  },
  authLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: tokens.colors.viridian,
  },

  // ── Protocol Cards ──
  protocolSection: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 6,
  },
  protocolSectionLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: semantic.text.faint,
    marginBottom: 4,
  },
  protocolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 10,
  },
  protocolIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  protocolIconPredict: {
    backgroundColor: 'rgba(74,140,111,0.12)',
  },
  protocolIconTrade: {
    backgroundColor: 'rgba(199,183,112,0.12)',
  },
  protocolInfo: {
    flex: 1,
  },
  protocolName: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: semantic.text.primary,
  },
  protocolSub: {
    fontFamily: 'monospace',
    fontSize: 7,
    color: semantic.text.faint,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  protocolValue: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: -0.2,
  },

  // ── Footer ──
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    alignItems: 'center',
    gap: 8,
  },
  disconnectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  disconnectText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.colors.vermillion,
  },
  version: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },

  // ── Disconnected ──
  connectHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  lockAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: semantic.text.faint,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockAvatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectTitle: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: semantic.text.primary,
  },
  connectSub: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.faint,
    textAlign: 'center',
    lineHeight: 15,
    letterSpacing: 0.3,
    maxWidth: 220,
  },

  connectActions: {
    paddingHorizontal: 20,
    gap: 8,
    flex: 1,
  },
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emailInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 11,
    color: semantic.text.primary,
    letterSpacing: 0.3,
    padding: 0,
  },
  otpLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  backLink: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
    textAlign: 'center',
    letterSpacing: 0.5,
    paddingVertical: 4,
  },
  primaryBtn: {
    backgroundColor: tokens.colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.colors.backgroundDark,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: semantic.border.muted,
  },
  orText: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 10,
    paddingVertical: 11,
  },
  secondaryBtnText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  walletOptionGroup: {
    gap: 8,
  },
  walletOptionBtn: {
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
  },

  mfaNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
  },
  mfaText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
    letterSpacing: 0.5,
  },
});
