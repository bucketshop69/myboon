import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { withdrawFromPolymarket } from '@/features/predict/predict.api';
import { semantic, tokens } from '@/theme';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  polygonAddress: string;
  solanaAddress: string;
  cashBalance: number | null;
  onSuccess?: () => void;
}

type WithdrawState = 'input' | 'confirming' | 'submitting' | 'success' | 'error';

export function WithdrawModal({
  isOpen,
  onClose,
  polygonAddress,
  solanaAddress,
  cashBalance,
  onSuccess,
}: WithdrawModalProps) {
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<WithdrawState>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount);
  const isValid = parsedAmount > 0 && (cashBalance === null || parsedAmount <= cashBalance);
  console.log('[withdraw-modal] cashBalance:', cashBalance, '| amount:', amount, '| parsedAmount:', parsedAmount, '| isValid:', isValid);

  const handleClose = () => {
    setAmount('');
    setState('input');
    setTxHash(null);
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    if (!isValid) return;
    setState('confirming');
  };

  const handleSubmit = async () => {
    setState('submitting');
    setError(null);
    try {
      const result = await withdrawFromPolymarket({
        polygonAddress,
        amount: parsedAmount,
        solanaAddress,
      });
      if (result.ok) {
        setTxHash(result.txHash ?? null);
        setState('success');
        onSuccess?.();
      } else {
        setError(result.error ?? 'Withdraw failed');
        setState('error');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Withdraw failed');
      setState('error');
    }
  };

  const handleMax = () => {
    if (cashBalance !== null && cashBalance > 0) {
      // Floor to 2 decimals to avoid exceeding balance
      setAmount((Math.floor(cashBalance * 100) / 100).toFixed(2));
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Withdraw</Text>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={18} color={semantic.text.dim} />
            </Pressable>
          </View>

          {state === 'input' && (
            <>
              <Text style={styles.subtitle}>
                Withdraw USDC from Polymarket to your Solana wallet.
              </Text>

              {/* Balance row */}
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Available</Text>
                <Text style={styles.balanceValue}>
                  {cashBalance !== null ? `$${cashBalance.toFixed(2)}` : '--'}
                </Text>
              </View>

              {/* Amount input */}
              <View style={styles.inputRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={semantic.text.faint}
                  keyboardType="decimal-pad"
                  autoFocus
                />
                <Pressable onPress={handleMax} style={styles.maxBtn}>
                  <Text style={styles.maxText}>MAX</Text>
                </Pressable>
              </View>

              {/* Destination */}
              <View style={styles.destRow}>
                <MaterialIcons name="arrow-forward" size={10} color={semantic.text.faint} />
                <Text style={styles.destLabel}>To Solana:</Text>
                <Text style={styles.destAddr} numberOfLines={1}>
                  {solanaAddress.slice(0, 8)}...{solanaAddress.slice(-6)}
                </Text>
              </View>

              <Pressable
                onPress={handleConfirm}
                disabled={!isValid}
                style={[styles.withdrawBtn, !isValid && styles.btnDisabled]}
              >
                <Text style={styles.withdrawBtnText}>Review Withdraw</Text>
              </Pressable>
            </>
          )}

          {state === 'confirming' && (
            <>
              <Text style={styles.subtitle}>Confirm your withdrawal</Text>

              <View style={styles.confirmCard}>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Amount</Text>
                  <Text style={styles.confirmValue}>${parsedAmount.toFixed(2)} USDC</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>From</Text>
                  <Text style={styles.confirmValue}>Polymarket Safe</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>To</Text>
                  <Text style={styles.confirmValue}>
                    {solanaAddress.slice(0, 8)}...{solanaAddress.slice(-6)}
                  </Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Gas</Text>
                  <Text style={[styles.confirmValue, { color: tokens.colors.viridian }]}>Free (Builder)</Text>
                </View>
              </View>

              <View style={styles.confirmActions}>
                <Pressable onPress={() => setState('input')} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>Back</Text>
                </Pressable>
                <Pressable onPress={handleSubmit} style={[styles.withdrawBtn, { flex: 2 }]}>
                  <Text style={styles.withdrawBtnText}>Withdraw</Text>
                </Pressable>
              </View>
            </>
          )}

          {state === 'submitting' && (
            <View style={styles.statusWrap}>
              <ActivityIndicator color={tokens.colors.primary} />
              <Text style={styles.statusText}>Withdrawing ${parsedAmount.toFixed(2)} USDC...</Text>
              <Text style={styles.statusSubtext}>Relaying via builder (gasless)</Text>
            </View>
          )}

          {state === 'success' && (
            <View style={styles.statusWrap}>
              <MaterialIcons name="check-circle" size={32} color={tokens.colors.viridian} />
              <Text style={styles.statusText}>Withdraw submitted!</Text>
              <Text style={styles.statusSubtext}>
                ${parsedAmount.toFixed(2)} USDC bridging to your Solana wallet.{'\n'}
                May take a few minutes to arrive.
              </Text>
              {txHash && (
                <Text style={styles.txHash}>tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}</Text>
              )}
              <Pressable onPress={handleClose} style={[styles.withdrawBtn, { marginTop: 16, alignSelf: 'stretch' }]}>
                <Text style={styles.withdrawBtnText}>Done</Text>
              </Pressable>
            </View>
          )}

          {state === 'error' && (
            <View style={styles.statusWrap}>
              <MaterialIcons name="error-outline" size={32} color={tokens.colors.vermillion} />
              <Text style={styles.statusText}>Withdraw failed</Text>
              <Text style={styles.statusSubtext}>{error}</Text>
              <Pressable onPress={() => setState('input')} style={[styles.withdrawBtn, { marginTop: 16, alignSelf: 'stretch' }]}>
                <Text style={styles.withdrawBtnText}>Try Again</Text>
              </Pressable>
            </View>
          )}
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
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: semantic.background.lift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.primary,
    lineHeight: 14,
    marginBottom: 14,
    opacity: 0.7,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  balanceLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.dim,
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 4,
  },
  dollarSign: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: semantic.text.dim,
  },
  amountInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: semantic.text.primary,
    padding: 0,
  },
  maxBtn: {
    backgroundColor: 'rgba(232,197,71,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,197,71,0.25)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  maxText: {
    fontFamily: 'monospace',
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colors.primary,
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  destLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.dim,
  },
  destAddr: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.accent,
    flex: 1,
  },
  withdrawBtn: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  withdrawBtnText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: tokens.colors.backgroundDark,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  btnDisabled: { opacity: 0.4 },
  confirmCard: {
    backgroundColor: semantic.background.lift,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.dim,
    letterSpacing: 0.5,
  },
  confirmValue: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 8,
  },
  backBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  backBtnText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: semantic.text.dim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  statusSubtext: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.dim,
    textAlign: 'center',
    lineHeight: 14,
  },
  txHash: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
    marginTop: 4,
  },
});
