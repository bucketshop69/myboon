import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { MeteoraStrategy } from '@myboon/shared/meteora';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  dragPixelsToBinDelta,
  liquidityDistributionWeight,
} from '@/features/meteora/meteora.form';

export const METEORA_COLORS = {
  screen: '#103D4C',
  surface: '#151B30',
  surfaceLift: '#1D2540',
  surfaceQuiet: '#11162A',
  border: '#2B3453',
  text: '#F6F3FF',
  textDim: '#9AA3BD',
  textFaint: '#68728E',
  violet: '#7A6CFF',
  cyan: '#29C6D1',
  coral: '#FF6B4A',
  green: '#34D399',
  red: '#FF627D',
  amber: '#F6B94A',
} as const;

export function FormSection({
  title,
  caption,
  action,
  children,
}: {
  title: string;
  caption?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionTitleBlock}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: T;
  options: { id: T; label: string; description?: string; icon?: keyof typeof MaterialIcons.glyphMap }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      style={styles.segmented}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && styles.pressed,
            ]}
          >
            {option.icon ? (
              <MaterialIcons
                name={option.icon}
                size={17}
                color={selected ? METEORA_COLORS.text : METEORA_COLORS.textDim}
              />
            ) : null}
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChoiceChips<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: T;
  options: { id: T; label: string; description?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      style={styles.chips}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = value === option.id;
        const disabled = !!option.disabled;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[
              styles.chipText,
              selected && styles.chipTextSelected,
              disabled && styles.chipTextDisabled,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TokenAmountField({
  symbol,
  iconUrl,
  value,
  balance,
  error,
  onChangeText,
  onBlur,
  onMax,
  disabled,
  accent,
}: {
  symbol: string;
  iconUrl: string | null;
  value: string;
  balance: string;
  error?: string | null;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  onMax?: () => void;
  disabled?: boolean;
  accent: string;
}) {
  return (
    <View>
      <View style={[styles.amountField, error && styles.fieldError, disabled && styles.disabled]}>
        <View style={styles.tokenIdentity}>
          {iconUrl ? (
            <Image source={{ uri: iconUrl }} style={styles.tokenIcon} />
          ) : (
            <View style={[styles.tokenFallback, { backgroundColor: accent }]}>
              <Text style={styles.tokenFallbackText}>{symbol.charAt(0) || '?'}</Text>
            </View>
          )}
          <View>
            <Text style={styles.tokenSymbol}>{symbol}</Text>
            <Text style={styles.balanceText}>Balance {balance}</Text>
          </View>
        </View>
        <View style={styles.amountInputWrap}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onBlur={onBlur}
            editable={!disabled}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={METEORA_COLORS.textFaint}
            accessibilityLabel={`${symbol} amount`}
            accessibilityHint={`Enter the amount of ${symbol} to use`}
            accessibilityState={{ disabled: !!disabled }}
            style={styles.amountInput}
          />
          {onMax ? (
            <Pressable
              onPress={onMax}
              accessibilityRole="button"
              accessibilityLabel={`Use maximum spendable ${symbol}`}
              hitSlop={6}
              style={styles.maxButton}
            >
              <Text style={styles.maxText}>MAX</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function AutoFillControl({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.autoFill}>
      <View style={styles.autoFillCopy}>
        <Text style={styles.autoFillTitle}>Auto-Fill</Text>
        <Text style={styles.autoFillCaption}>Calculate the other pool token</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel="Auto-Fill the other pool token"
        trackColor={{
          false: METEORA_COLORS.border,
          true: 'rgba(122,108,255,0.56)',
        }}
        thumbColor={value ? METEORA_COLORS.violet : METEORA_COLORS.textDim}
      />
    </View>
  );
}

export function RangeVisualization({
  strategy,
  minLabel,
  maxLabel,
  currentLabel,
  minPercent = 22,
  maxPercent = 78,
  onAdjustMin,
  onAdjustMax,
  interactive = true,
}: {
  strategy: MeteoraStrategy;
  minLabel: string;
  maxLabel: string;
  currentLabel: string;
  minPercent?: number;
  maxPercent?: number;
  onAdjustMin?: (deltaBins: number) => void;
  onAdjustMax?: (deltaBins: number) => void;
  /**
   * Beta ships one server-calculated default range with no drag or manual
   * entry (see the PRD's Beta Scope Amendment). Set false to render the
   * range as fixed, read-only context — no draggable handles, and the
   * accessible label states the range is calculated rather than adjustable.
   */
  interactive?: boolean;
}) {
  const safeMin = Math.max(3, Math.min(95.5, minPercent));
  const safeMax = Math.max(safeMin + 1.5, Math.min(97, maxPercent));
  const [trackWidth, setTrackWidth] = useState(0);

  return (
    <View
      style={styles.rangeCard}
      testID="meteora-range-selector"
      accessibilityLabel={
        interactive
          ? `Liquidity range. Minimum ${minLabel}. Current ${currentLabel}. Maximum ${maxLabel}.`
          : `Calculated liquidity range. Minimum ${minLabel}. Current ${currentLabel}. Maximum ${maxLabel}.`
      }
    >
      <View style={styles.histogram} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 24 }, (_, index) => {
          const center = ((index + 0.5) / 24) * 100;
          const barStart = (index / 24) * 100;
          const barEnd = ((index + 1) / 24) * 100;
          const active = barEnd >= safeMin && barStart <= safeMax;
          const selectedPosition = (center - safeMin) / (safeMax - safeMin);
          const height = 13 + Math.round(
            liquidityDistributionWeight(strategy, selectedPosition) * 31,
          );
          return (
            <View
              key={index}
              testID={`meteora-liquidity-bar-${index}`}
              style={[
                styles.histogramBar,
                { height },
                active ? styles.histogramBarActive : styles.histogramBarMuted,
              ]}
            />
          );
        })}
      </View>
      <View
        style={styles.rangeTrack}
        testID="meteora-range-track"
        onLayout={({ nativeEvent }) => {
          setTrackWidth(nativeEvent.layout.width);
        }}
      >
        <View
          style={[
            styles.rangeSelected,
            { left: `${safeMin}%`, right: `${100 - safeMax}%` },
          ]}
        />
        <View style={styles.currentMarker}>
          <View style={styles.currentMarkerLine} />
          <Text style={styles.currentMarkerText}>NOW</Text>
        </View>
        {interactive ? (
          <>
            <AdjustableHandle
              label="Minimum price"
              testID="meteora-min-handle"
              value={minLabel}
              percent={safeMin}
              trackWidth={trackWidth}
              onAdjust={onAdjustMin ?? noop}
            />
            <AdjustableHandle
              label="Maximum price"
              testID="meteora-max-handle"
              value={maxLabel}
              percent={safeMax}
              trackWidth={trackWidth}
              onAdjust={onAdjustMax ?? noop}
            />
          </>
        ) : (
          <>
            <View style={[styles.handleTouch, styles.handleTouchStatic, { left: `${safeMin}%` }]}>
              <View style={styles.handleStem} />
              <View style={styles.handleKnobStatic} />
            </View>
            <View style={[styles.handleTouch, styles.handleTouchStatic, { left: `${safeMax}%` }]}>
              <View style={styles.handleStem} />
              <View style={styles.handleKnobStatic} />
            </View>
          </>
        )}
      </View>
      <View style={styles.rangeLabels}>
        <Text style={styles.rangeEdgeText}>{minLabel}</Text>
        <Text style={styles.rangeCurrentText}>{currentLabel}</Text>
        <Text style={[styles.rangeEdgeText, styles.rangeRight]}>{maxLabel}</Text>
      </View>
      <Text style={styles.rangeInstruction}>
        {interactive
          ? 'Adjust either handle or enter exact prices below.'
          : 'This range is calculated automatically for beta and cannot be edited.'}
      </Text>
    </View>
  );
}

function noop() {
  // Range editing is disabled for beta; handles render as static context.
}

function AdjustableHandle({
  label,
  testID,
  value,
  percent,
  trackWidth,
  onAdjust,
}: {
  label: string;
  testID: string;
  value: string;
  percent: number;
  trackWidth: number;
  onAdjust: (deltaBins: number) => void;
}) {
  const previousStep = useRef(0);
  const pointerStartX = useRef<number | null>(null);
  const onAdjustRef = useRef(onAdjust);
  onAdjustRef.current = onAdjust;
  const applyHorizontalDrag = useCallback((horizontalPixels: number) => {
    const step = dragPixelsToBinDelta(horizontalPixels, trackWidth);
    const delta = step - previousStep.current;
    if (delta !== 0) {
      onAdjustRef.current(delta);
      previousStep.current = step;
    }
  }, [trackWidth]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy)
    ),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      previousStep.current = 0;
    },
    onPanResponderMove: (_, gesture) => {
      applyHorizontalDrag(gesture.dx);
    },
    onPanResponderRelease: () => {
      previousStep.current = 0;
    },
    onPanResponderTerminate: () => {
      previousStep.current = 0;
    },
  }), [applyHorizontalDrag]);

  return (
    <View
      {...(Platform.OS === 'web' ? {} : panResponder.panHandlers)}
      onPointerDown={Platform.OS === 'web' ? (event) => {
        pointerStartX.current = event.nativeEvent.pageX;
        previousStep.current = 0;
        const target = event.currentTarget as unknown as {
          setPointerCapture?: (pointerId: number) => void;
        };
        target.setPointerCapture?.(event.nativeEvent.pointerId);
      } : undefined}
      onPointerMove={Platform.OS === 'web' ? (event) => {
        if (pointerStartX.current === null) return;
        applyHorizontalDrag(event.nativeEvent.pageX - pointerStartX.current);
      } : undefined}
      onPointerUp={Platform.OS === 'web' ? (event) => {
        pointerStartX.current = null;
        previousStep.current = 0;
        const target = event.currentTarget as unknown as {
          releasePointerCapture?: (pointerId: number) => void;
        };
        target.releasePointerCapture?.(event.nativeEvent.pointerId);
      } : undefined}
      onPointerCancel={Platform.OS === 'web' ? () => {
        pointerStartX.current = null;
        previousStep.current = 0;
      } : undefined}
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[
        { name: 'decrement', label: `Decrease ${label.toLowerCase()}` },
        { name: 'increment', label: `Increase ${label.toLowerCase()}` },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'decrement' || nativeEvent.actionName === 'increment') {
          onAdjustRef.current(nativeEvent.actionName === 'increment' ? 1 : -1);
        }
      }}
      style={[styles.handleTouch, { left: `${percent}%` }]}
    >
      <View style={styles.handleStem} />
      <View style={styles.handleKnob}>
        <View style={styles.handleGrip} />
      </View>
    </View>
  );
}

export function PriceField({
  label,
  value,
  suffix,
  error,
  onChangeText,
  onBlur,
  onStep,
}: {
  label: string;
  value: string;
  suffix: string;
  error?: string | null;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  onStep: (direction: 'decrement' | 'increment') => void;
}) {
  return (
    <View style={styles.priceFieldWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.priceField, error && styles.fieldError]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={METEORA_COLORS.textFaint}
          accessibilityLabel={label}
          style={styles.priceInput}
        />
        <Text style={styles.priceSuffix}>{suffix}</Text>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => onStep('increment')}
            accessibilityRole="button"
            accessibilityLabel={`Increase ${label.toLowerCase()} by one bin`}
            style={styles.stepButton}
          >
            <MaterialIcons name="add" size={17} color={METEORA_COLORS.textDim} />
          </Pressable>
          <View style={styles.stepDivider} />
          <Pressable
            onPress={() => onStep('decrement')}
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${label.toLowerCase()} by one bin`}
            style={styles.stepButton}
          >
            <MaterialIcons name="remove" size={17} color={METEORA_COLORS.textDim} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function InlineNotice({
  tone,
  title,
  message,
}: {
  tone: 'info' | 'warning' | 'error' | 'success' | 'pending';
  title: string;
  message: string;
}) {
  const icon = tone === 'success'
    ? 'check-circle'
    : tone === 'error'
      ? 'error'
      : tone === 'warning'
        ? 'warning'
        : tone === 'pending'
          ? 'schedule'
          : 'info';
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={[
        styles.notice,
        tone === 'error' && styles.noticeError,
        tone === 'warning' && styles.noticeWarning,
        tone === 'success' && styles.noticeSuccess,
        tone === 'pending' && styles.noticePending,
      ]}
    >
      <MaterialIcons
        name={icon}
        size={18}
        color={
          tone === 'error'
            ? METEORA_COLORS.red
            : tone === 'warning'
              ? METEORA_COLORS.amber
              : tone === 'success'
                ? METEORA_COLORS.green
                : METEORA_COLORS.cyan
        }
      />
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeMessage}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METEORA_COLORS.border,
  },
  sectionHeading: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 3,
  },
  sectionTitle: {
    color: METEORA_COLORS.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  sectionCaption: {
    color: METEORA_COLORS.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  segmented: {
    minHeight: 48,
    flexDirection: 'row',
    padding: 4,
    borderRadius: 13,
    backgroundColor: METEORA_COLORS.surfaceQuiet,
  },
  segment: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 7,
  },
  segmentSelected: {
    backgroundColor: METEORA_COLORS.surfaceLift,
    borderWidth: 1,
    borderColor: 'rgba(122,108,255,0.42)',
  },
  segmentText: {
    color: METEORA_COLORS.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  segmentTextSelected: {
    color: METEORA_COLORS.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: METEORA_COLORS.border,
    backgroundColor: 'rgba(21,27,48,0.58)',
  },
  chipSelected: {
    borderColor: METEORA_COLORS.violet,
    backgroundColor: 'rgba(122,108,255,0.18)',
  },
  chipText: {
    color: METEORA_COLORS.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: METEORA_COLORS.text,
  },
  chipTextDisabled: {
    color: METEORA_COLORS.textFaint,
  },
  amountField: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: METEORA_COLORS.border,
    backgroundColor: METEORA_COLORS.surfaceLift,
  },
  tokenIdentity: {
    minWidth: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tokenIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: METEORA_COLORS.surfaceQuiet,
  },
  tokenFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenFallbackText: {
    color: '#081219',
    fontSize: 13,
    fontWeight: '900',
  },
  tokenSymbol: {
    color: METEORA_COLORS.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
  },
  balanceText: {
    color: METEORA_COLORS.textFaint,
    fontFamily: 'monospace',
    fontSize: 9,
    lineHeight: 13,
  },
  amountInputWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  amountInput: {
    width: '100%',
    minHeight: 36,
    paddingVertical: 0,
    color: METEORA_COLORS.text,
    fontFamily: 'monospace',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'right',
  },
  maxButton: {
    minWidth: 44,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxText: {
    color: METEORA_COLORS.cyan,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  autoFill: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 2,
  },
  autoFillCopy: {
    flex: 1,
  },
  autoFillTitle: {
    color: METEORA_COLORS.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  autoFillCaption: {
    color: METEORA_COLORS.textDim,
    fontSize: 11,
    lineHeight: 16,
  },
  rangeCard: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: METEORA_COLORS.border,
    backgroundColor: METEORA_COLORS.surfaceQuiet,
    overflow: 'hidden',
  },
  histogram: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    opacity: 0.92,
  },
  histogramBar: {
    flex: 1,
    minWidth: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  histogramBarActive: {
    backgroundColor: METEORA_COLORS.coral,
  },
  histogramBarMuted: {
    backgroundColor: '#343A55',
  },
  rangeTrack: {
    height: 46,
    marginTop: -1,
    justifyContent: 'center',
  },
  rangeSelected: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: METEORA_COLORS.coral,
  },
  currentMarker: {
    position: 'absolute',
    left: '50%',
    top: 3,
    bottom: 3,
    width: 30,
    marginLeft: -15,
    alignItems: 'center',
  },
  currentMarkerLine: {
    width: 1,
    flex: 1,
    backgroundColor: METEORA_COLORS.cyan,
    opacity: 0.8,
  },
  currentMarkerText: {
    marginTop: 2,
    color: METEORA_COLORS.cyan,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  handleTouch: {
    position: 'absolute',
    top: 1,
    width: 44,
    height: 44,
    marginLeft: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleStem: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    width: 2,
    backgroundColor: METEORA_COLORS.coral,
  },
  handleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF8B70',
    backgroundColor: METEORA_COLORS.coral,
  },
  handleGrip: {
    width: 2,
    height: 8,
    borderRadius: 1,
    backgroundColor: METEORA_COLORS.surfaceQuiet,
    opacity: 0.75,
  },
  handleTouchStatic: {
    width: 16,
    marginLeft: -8,
  },
  handleKnobStatic: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FF8B70',
    backgroundColor: METEORA_COLORS.coral,
    opacity: 0.85,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  rangeEdgeText: {
    flex: 1,
    color: METEORA_COLORS.textDim,
    fontFamily: 'monospace',
    fontSize: 9,
    lineHeight: 13,
  },
  rangeCurrentText: {
    flex: 1,
    color: METEORA_COLORS.cyan,
    fontFamily: 'monospace',
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
  },
  rangeRight: {
    textAlign: 'right',
  },
  rangeInstruction: {
    marginTop: 9,
    color: METEORA_COLORS.textFaint,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  priceFieldWrap: {
    flex: 1,
    gap: 6,
  },
  inputLabel: {
    color: METEORA_COLORS.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  priceField: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: METEORA_COLORS.border,
    borderRadius: 12,
    backgroundColor: METEORA_COLORS.surfaceLift,
    overflow: 'hidden',
  },
  priceInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    paddingHorizontal: 11,
    paddingVertical: 8,
    color: METEORA_COLORS.text,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
  priceSuffix: {
    maxWidth: 55,
    color: METEORA_COLORS.textFaint,
    fontSize: 8,
    lineHeight: 11,
  },
  stepper: {
    width: 44,
    alignSelf: 'stretch',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: METEORA_COLORS.border,
  },
  stepButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: METEORA_COLORS.border,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(41,198,209,0.32)',
    backgroundColor: 'rgba(41,198,209,0.08)',
  },
  noticeError: {
    borderColor: 'rgba(255,98,125,0.34)',
    backgroundColor: 'rgba(255,98,125,0.08)',
  },
  noticeWarning: {
    borderColor: 'rgba(246,185,74,0.34)',
    backgroundColor: 'rgba(246,185,74,0.08)',
  },
  noticeSuccess: {
    borderColor: 'rgba(52,211,153,0.34)',
    backgroundColor: 'rgba(52,211,153,0.08)',
  },
  noticePending: {
    borderColor: 'rgba(122,108,255,0.34)',
    backgroundColor: 'rgba(122,108,255,0.08)',
  },
  noticeCopy: {
    flex: 1,
    gap: 2,
  },
  noticeTitle: {
    color: METEORA_COLORS.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  noticeMessage: {
    color: METEORA_COLORS.textDim,
    fontSize: 11,
    lineHeight: 16,
  },
  fieldError: {
    borderColor: METEORA_COLORS.red,
  },
  errorText: {
    marginTop: 5,
    marginLeft: 3,
    color: METEORA_COLORS.red,
    fontSize: 11,
    lineHeight: 15,
  },
  disabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.78,
  },
});
