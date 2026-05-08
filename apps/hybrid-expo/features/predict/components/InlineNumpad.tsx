import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { truncateUsd } from '@/features/predict/formatPredictMoney';
import type { PredictOrderGuardrail } from '@/features/predict/predictActivityState';
import { semantic, tokens } from '@/theme';

interface InlineNumpadProps {
  visible: boolean;
  side: 'yes' | 'no';
  price: number;
  amount: string;
  /** Label for the selected outcome, e.g. YES, NO, or a team name */
  pickLabel?: string;
  /** Override for the confirm button label */
  confirmLabel?: string;
  /** Override for the payout helper label */
  payoutLabel?: string;
  /** Available cash for the Max quick action. */
  availableCash?: number | null;
  onAmountChange: (amount: string) => void;
  onConfirm: () => void;
  /** Whether an order is currently being submitted */
  submitting?: boolean;
  /** Whether the confirm button should be disabled (e.g. wallet not ready) */
  disabled?: boolean;
  guardrail?: PredictOrderGuardrail | null;
}

const QUICK_AMOUNTS = ['10', '25', '50'] as const;

function formatAmountInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const truncated = Math.trunc(value * 100) / 100;
  return truncated.toFixed(2).replace(/\.00$/u, '').replace(/(\.\d)0$/u, '$1');
}

function numpadKey(current: string, key: string): string {
  if (key === '.' && current.includes('.')) return current;
  if (current === '0' && key !== '.') return key;
  const dotIdx = current.indexOf('.');
  if (dotIdx !== -1 && current.length - dotIdx > 2) return current;
  if (current.length >= 7) return current;
  return current + key;
}

function numpadDel(current: string): string {
  if (current.length <= 1) return '0';
  return current.slice(0, -1);
}

export function InlineNumpad({
  visible,
  side,
  price,
  amount,
  pickLabel,
  confirmLabel,
  payoutLabel = 'You could receive',
  availableCash,
  onAmountChange,
  onConfirm,
  submitting = false,
  disabled = false,
  guardrail = null,
}: InlineNumpadProps) {
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: visible ? 450 : 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [visible, heightAnim]);

  const amountNum = parseFloat(amount) || 0;
  const hasCashLimit = availableCash !== null && availableCash !== undefined && Number.isFinite(availableCash);
  const exceedsCash = hasCashLimit && amountNum > (availableCash ?? 0) + 0.000001;
  const payout = price > 0 ? amountNum / price : 0;
  const outcomeLabel = pickLabel ?? (side === 'yes' ? 'YES' : 'NO');
  const isYes = side === 'yes';
  const backLabel = confirmLabel ?? `Back ${outcomeLabel} with $${amountNum.toFixed(amountNum % 1 === 0 ? 0 : 2)}`;
  const confirmDisabled = disabled || submitting || amountNum <= 0 || exceedsCash || guardrail?.blocking === true;
  const feedbackText = guardrail?.message ?? (exceedsCash ? 'Not enough cash' : 'If you are wrong, you lose');
  const feedbackValue = guardrail
    ? guardrail.title
    : exceedsCash
      ? `Cash ${truncateUsd(availableCash)}`
      : `$${amountNum.toFixed(2)}`;

  return (
    <Animated.View style={[styles.container, { maxHeight: heightAnim }]}>
      <View style={styles.inner}>
        {/* Amount display */}
        <View style={styles.amountDisplay}>
          <Text style={styles.currencyLabel}>USDC</Text>
          <Text style={styles.amountValue}>{amount}</Text>
        </View>

        {/* Quick amounts */}
        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((q) => (
            <Pressable key={q} style={styles.quickBtn} onPress={() => onAmountChange(q)}>
              <Text style={styles.quickBtnText}>${q}</Text>
            </Pressable>
          ))}
          <Pressable
            style={styles.quickBtn}
            onPress={() => onAmountChange(formatAmountInput(availableCash ?? 0))}
          >
            <Text style={styles.quickBtnText}>Max</Text>
          </Pressable>
        </View>

        {/* Numpad grid */}
        <View style={styles.grid}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((key) => (
            <Pressable
              key={key}
              style={[styles.key, key === 'del' && styles.keyDel]}
              onPress={() => {
                if (key === 'del') onAmountChange(numpadDel(amount));
                else onAmountChange(numpadKey(amount, key));
              }}>
              <Text style={[styles.keyText, key === 'del' && styles.keyTextDel]}>
                {key === 'del' ? '\u232B' : key}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Payout row */}
        <View style={styles.payoutRow}>
          <Text style={styles.payoutLabel}>{payoutLabel}</Text>
          <Text style={styles.payoutValue}>${payout.toFixed(2)}</Text>
        </View>
        <View style={styles.downsideRow}>
          <Text style={[styles.downsideLabel, (exceedsCash || guardrail?.blocking) && styles.errorText, guardrail && !guardrail.blocking && styles.noticeText]}>
            {feedbackText}
          </Text>
          <Text style={[styles.downsideValue, (exceedsCash || guardrail?.blocking) && styles.errorText, guardrail && !guardrail.blocking && styles.noticeText]}>
            {feedbackValue}
          </Text>
        </View>

        {/* Confirm button */}
        <Pressable
          style={[styles.confirmBtn, isYes ? styles.confirmYes : styles.confirmNo, confirmDisabled && styles.confirmDisabled]}
          disabled={confirmDisabled}
          onPress={onConfirm}>
          <Text style={styles.confirmText}>
            {submitting ? 'Placing order\u2026' : guardrail?.blocking ? guardrail.title : exceedsCash ? 'Not enough cash' : backLabel}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    paddingHorizontal: 20,
    backgroundColor: tokens.colors.ground,
  },
  inner: {
    paddingTop: 4,
    paddingBottom: 6,
  },
  amountDisplay: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  currencyLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: semantic.text.faint,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  amountValue: {
    fontFamily: 'monospace',
    fontSize: 36,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: -1,
    lineHeight: 42,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  quickBtn: {
    flex: 1,
    height: 36,
    backgroundColor: tokens.colors.lift,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtnText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: semantic.text.dim,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  key: {
    width: '31.5%',
    height: 44,
    borderRadius: 12,
    backgroundColor: tokens.colors.lift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDel: {},
  keyText: {
    fontFamily: 'monospace',
    fontSize: 20,
    fontWeight: '600',
    color: semantic.text.primary,
  },
  keyTextDel: {
    fontSize: 16,
    color: semantic.text.dim,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  payoutLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.5,
    color: semantic.text.dim,
  },
  payoutValue: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    color: semantic.sentiment.positive,
  },
  downsideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 2,
  },
  downsideLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.5,
    color: semantic.text.faint,
  },
  downsideValue: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: semantic.text.dim,
  },
  errorText: {
    color: tokens.colors.vermillion,
  },
  noticeText: {
    color: tokens.colors.primary,
  },
  confirmBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  confirmYes: { backgroundColor: semantic.sentiment.positive },
  confirmNo: { backgroundColor: semantic.sentiment.negative },
  confirmDisabled: { opacity: 0.45 },
  confirmText: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
