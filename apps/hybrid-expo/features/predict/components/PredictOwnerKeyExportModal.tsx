import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { deriveEvmSignerFromSignature, PREDICT_DERIVE_MESSAGE } from '@/hooks/useEvmSigner';
import { semantic, tokens } from '@/theme';

interface PredictOwnerKeyExportModalProps {
  visible: boolean;
  onClose: () => void;
  solanaAddress: string | null;
  polygonAddress: string | null;
  depositWalletAddress: string | null;
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
}

type ExportState = 'idle' | 'signing' | 'ready' | 'error';

function truncateAddress(address: string | null | undefined, start = 8, end = 6): string {
  if (!address) return '--';
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function PredictOwnerKeyExportModal({
  visible,
  onClose,
  solanaAddress,
  polygonAddress,
  depositWalletAddress,
  signMessage,
}: PredictOwnerKeyExportModalProps) {
  const [state, setState] = useState<ExportState>('idle');
  const [acknowledged, setAcknowledged] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canStart = useMemo(
    () => acknowledged && !!signMessage && !!polygonAddress && !!solanaAddress,
    [acknowledged, signMessage, polygonAddress, solanaAddress],
  );

  const reset = useCallback(() => {
    setState('idle');
    setAcknowledged(false);
    setRevealed(false);
    setPrivateKey(null);
    setDerivedAddress(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') reset();
    });
    return () => subscription.remove();
  }, [reset, visible]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleExport = useCallback(async () => {
    if (!canStart || !signMessage || !polygonAddress) return;
    setState('signing');
    setError(null);
    setPrivateKey(null);
    setDerivedAddress(null);
    setRevealed(false);
    try {
      const signature = await signMessage(new TextEncoder().encode(PREDICT_DERIVE_MESSAGE));
      const { eoaAddress, wallet } = deriveEvmSignerFromSignature(signature);
      if (eoaAddress.toLowerCase() !== polygonAddress.toLowerCase()) {
        throw new Error('This Solana wallet derives a different Predict owner key.');
      }
      setDerivedAddress(eoaAddress);
      setPrivateKey(wallet.privateKey);
      setState('ready');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export Predict owner key.');
      setState('error');
    }
  }, [canStart, polygonAddress, signMessage]);

  const copyPrivateKey = useCallback(async () => {
    if (!privateKey || !revealed) return;
    await Clipboard.setStringAsync(privateKey);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [privateKey, revealed]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close export Predict owner key" />
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Predict wallet</Text>
              <Text style={styles.title}>Export owner key</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={handleClose} style={styles.iconButton}>
              <MaterialIcons name="close" size={16} color={semantic.text.dim} />
            </Pressable>
          </View>

          <Text style={styles.copy}>
            This exports the Polygon owner key that controls your Predict deposit wallet. The deposit wallet is a smart contract wallet and does not have its own private key.
          </Text>

          <View style={styles.addressBox}>
            <AddressRow label="Solana wallet" value={truncateAddress(solanaAddress)} />
            <AddressRow label="Owner EOA" value={truncateAddress(derivedAddress ?? polygonAddress)} />
            <AddressRow label="Deposit wallet" value={truncateAddress(depositWalletAddress)} />
          </View>

          <View style={styles.warningBox}>
            <MaterialIcons name="warning" size={15} color={tokens.colors.vermillion} />
            <Text style={styles.warningText}>
              Anyone with this key can control your Predict owner wallet. Do not share it or paste it into a site you do not trust.
            </Text>
          </View>

          {state !== 'ready' && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
              style={styles.checkRow}
              onPress={() => setAcknowledged((current) => !current)}
            >
              <View style={[styles.checkbox, acknowledged && styles.checkboxOn]}>
                {acknowledged && <MaterialIcons name="check" size={12} color={tokens.colors.backgroundDark} />}
              </View>
              <Text style={styles.checkText}>I understand this private key gives full control of my Predict owner wallet.</Text>
            </Pressable>
          )}

          {state === 'ready' && privateKey && (
            <View style={styles.secretBox}>
              <Text style={styles.secretLabel}>Private key</Text>
              <Text style={styles.secretValue} numberOfLines={revealed ? 4 : 1}>
                {revealed ? privateKey : '************************************************'}
              </Text>
              <View style={styles.secretActions}>
                <Pressable style={styles.secondaryAction} onPress={() => setRevealed((current) => !current)}>
                  <Text style={styles.secondaryActionText}>{revealed ? 'Hide' : 'Reveal'}</Text>
                </Pressable>
                <Pressable style={[styles.secondaryAction, !revealed && styles.disabledAction]} onPress={copyPrivateKey} disabled={!revealed}>
                  <Text style={styles.secondaryActionText}>Copy key</Text>
                </Pressable>
              </View>
            </View>
          )}

          {state === 'error' && error && <Text style={styles.errorText}>{error}</Text>}

          {state !== 'ready' ? (
            <Pressable
              style={[styles.primaryAction, !canStart && styles.disabledAction]}
              onPress={handleExport}
              disabled={!canStart || state === 'signing'}
            >
              {state === 'signing' ? (
                <ActivityIndicator size="small" color={tokens.colors.backgroundDark} />
              ) : (
                <Text style={styles.primaryActionText}>Sign to export</Text>
              )}
            </Pressable>
          ) : (
            <Pressable style={styles.primaryAction} onPress={handleClose}>
              <Text style={styles.primaryActionText}>Done</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function AddressRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.addressRow}>
      <Text style={styles.addressLabel}>{label}</Text>
      <Text style={styles.addressValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: tokens.colors.ground,
    padding: 18,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
    color: semantic.text.faint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 3,
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  copy: {
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 15,
    color: semantic.text.dim,
  },
  addressBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
    padding: 12,
    gap: 9,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  addressLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  addressValue: {
    flexShrink: 1,
    fontFamily: 'monospace',
    fontSize: 10,
    color: semantic.text.primary,
    textAlign: 'right',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(244,88,78,0.34)',
    backgroundColor: 'rgba(244,88,78,0.10)',
    padding: 11,
  },
  warningText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 9,
    lineHeight: 14,
    color: semantic.text.primary,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primary,
  },
  checkText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 9,
    lineHeight: 14,
    color: semantic.text.dim,
  },
  secretBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: 12,
    gap: 8,
  },
  secretLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '800',
    color: semantic.text.faint,
    textTransform: 'uppercase',
  },
  secretValue: {
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 15,
    color: semantic.text.primary,
  },
  secretActions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryAction: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: tokens.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.backgroundDark,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  disabledAction: {
    opacity: 0.45,
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 9,
    lineHeight: 14,
    color: tokens.colors.vermillion,
  },
});
