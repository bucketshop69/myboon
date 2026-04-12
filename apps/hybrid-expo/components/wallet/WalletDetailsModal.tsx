import React from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useWallet } from '@/hooks/useWallet';
import { semantic, tokens } from '@/theme';

interface WalletDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletDetailsModal({ isOpen, onClose }: WalletDetailsModalProps) {
  const { address, shortAddress, disconnect } = useWallet();

  function handleDisconnect() {
    Alert.alert('Disconnect Wallet?', 'You can reconnect anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await disconnect();
          onClose();
        },
      },
    ]);
  }

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Wallet</Text>

          <View style={styles.addressBox}>
            <Text style={styles.addressLabel}>Address</Text>
            <Text style={styles.addressFull} numberOfLines={1} ellipsizeMode="middle">
              {address ?? '—'}
            </Text>
          </View>

          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Text style={styles.disconnectBtnText}>Disconnect</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
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
    textAlign: 'center',
    marginBottom: tokens.spacing.xs,
  },
  addressBox: {
    backgroundColor: semantic.background.lift,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    gap: 4,
  },
  addressLabel: {
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    fontFamily: 'monospace',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  addressFull: {
    fontSize: tokens.fontSize.sm,
    color: semantic.text.accent,
    fontFamily: 'monospace',
  },
  disconnectBtn: {
    backgroundColor: 'transparent',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.vermillion,
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  disconnectBtnText: {
    fontSize: tokens.fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: tokens.colors.vermillion,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  closeBtn: {
    paddingVertical: tokens.spacing.md,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: tokens.fontSize.sm,
    color: semantic.text.dim,
    fontFamily: 'monospace',
  },
});
