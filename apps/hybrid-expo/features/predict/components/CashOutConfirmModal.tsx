import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PortfolioPosition } from '@/features/predict/predict.api';
import { portfolioPositionCost, truncateSignedUsd, truncateUsd } from '@/features/predict/formatPredictMoney';
import { semantic, tokens } from '@/theme';

interface CashOutConfirmModalProps {
  position: PortfolioPosition | null;
  visible: boolean;
  onClose: () => void;
}

export function CashOutConfirmModal({ position, visible, onClose }: CashOutConfirmModalProps) {
  const cashOutValue = position?.currentValue ?? 0;
  const pnl = position ? cashOutValue - portfolioPositionCost(position) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Cash out</Text>
          <Text style={styles.title}>Are you sure?</Text>
          <Text style={styles.copy}>
            You are cashing out {position?.outcome || 'this pick'}.
          </Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>You will get</Text>
            <Text style={styles.amountValue}>{truncateUsd(cashOutValue)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>P/L</Text>
            <Text style={[styles.amountValue, pnl > 0 ? styles.pnlPositive : pnl < 0 ? styles.pnlNegative : styles.pnlFlat]}>
              {truncateSignedUsd(pnl)}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryAction} onPress={onClose}>
              <Text style={styles.secondaryActionText}>Not now</Text>
            </Pressable>
            <Pressable style={styles.primaryAction} onPress={onClose}>
              <Text style={styles.primaryActionText}>Cash out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: tokens.colors.ground,
    padding: 18,
  },
  eyebrow: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  title: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  copy: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: semantic.text.dim,
  },
  amountRow: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    backgroundColor: semantic.background.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  amountLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: semantic.text.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  amountValue: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '800',
    color: semantic.text.primary,
  },
  pnlPositive: {
    color: tokens.colors.viridian,
  },
  pnlNegative: {
    color: tokens.colors.vermillion,
  },
  pnlFlat: {
    color: semantic.text.faint,
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '800',
    color: semantic.text.dim,
    textTransform: 'uppercase',
  },
  primaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: tokens.colors.viridian,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '800',
    color: tokens.colors.backgroundDark,
    textTransform: 'uppercase',
  },
});
