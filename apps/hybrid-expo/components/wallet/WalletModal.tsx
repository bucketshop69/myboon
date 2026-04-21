import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { semantic, tokens } from '@/theme';
import { useWallet } from '@/hooks/useWallet';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { connected, shortAddress, connect, disconnect } = useWallet();

  async function handleConnect() {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      window.alert('Wallet connect is available on the mobile app.');
      onClose();
      return;
    }
    await connect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }

  async function handleDisconnect() {
    await disconnect();
    onClose();
  }

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {connected ? 'Wallet Connected' : 'Connect Wallet'}
          </Text>

          {connected && shortAddress ? (
            <>
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>Address</Text>
                <Text style={styles.addressValue}>{shortAddress}</Text>
              </View>

              <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
                <Text style={styles.disconnectButtonText}>Disconnect</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
              <Text style={styles.connectButtonText}>Connect Wallet</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: semantic.background.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: semantic.border.muted,
    padding: tokens.spacing.xl,
    paddingBottom: 40,
    gap: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: tokens.letterSpacing.mono,
    marginBottom: tokens.spacing.sm,
    textAlign: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: semantic.background.lift,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  addressLabel: {
    fontSize: tokens.fontSize.sm,
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontWeight: '400',
    letterSpacing: tokens.letterSpacing.mono,
  },
  addressValue: {
    fontSize: tokens.fontSize.sm,
    color: semantic.text.accent,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: tokens.letterSpacing.monoWide,
  },
  connectButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  connectButtonText: {
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: tokens.colors.backgroundDark,
    letterSpacing: tokens.letterSpacing.mono,
  },
  disconnectButton: {
    backgroundColor: 'transparent',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.vermillion,
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  disconnectButtonText: {
    fontSize: tokens.fontSize.md,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: tokens.colors.vermillion,
    letterSpacing: tokens.letterSpacing.mono,
  },
  cancelButton: {
    paddingVertical: tokens.spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: tokens.fontSize.sm,
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontWeight: '400',
    letterSpacing: tokens.letterSpacing.mono,
  },
});
