import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { semantic, tokens } from '@/theme';

interface InlineNumpadProps {
  visible: boolean;
  side: 'yes' | 'no';
  price: number;
  amount: string;
  onAmountChange: (amount: string) => void;
  onConfirm: () => void;
  /** Whether an order is currently being submitted */
  submitting?: boolean;
  /** Whether the confirm button should be disabled (e.g. wallet not ready) */
  disabled?: boolean;
}

const QUICK_AMOUNTS = ['10', '25', '50', '100'];

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

export function InlineNumpad({ visible, side, price, amount, onAmountChange, onConfirm, submitting = false, disabled = false }: InlineNumpadProps) {
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: visible ? 450 : 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [visible, heightAnim]);

  const amountNum = parseFloat(amount) || 0;
  const payout = price > 0 ? amountNum / price : 0;
  const sideLabel = side === 'yes' ? 'Yes' : 'No';
  const isYes = side === 'yes';

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
          <Text style={styles.payoutLabel}>Potential payout</Text>
          <Text style={styles.payoutValue}>${payout.toFixed(2)}</Text>
        </View>

        {/* Confirm button */}
        <Pressable
          style={[styles.confirmBtn, isYes ? styles.confirmYes : styles.confirmNo, (disabled || submitting || amountNum <= 0) && styles.confirmDisabled]}
          disabled={disabled || submitting || amountNum <= 0}
          onPress={onConfirm}>
          <Text style={styles.confirmText}>
            {submitting ? 'Placing order\u2026' : `Confirm ${sideLabel} \u2014 $${amountNum}`}
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
