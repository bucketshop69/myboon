import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import {
  fetchPhoenixCandles,
  formatPhoenixPrice,
  type PhoenixCandle,
  type PhoenixCandleInterval,
} from '@/features/perps/phoenix.api';
import { semantic, tokens } from '@/theme';

const TIMEFRAMES: { label: string; interval: PhoenixCandleInterval; count: number }[] = [
  { label: '1H', interval: '1m', count: 60 },
  { label: '1D', interval: '15m', count: 96 },
  { label: '1W', interval: '1h', count: 168 },
  { label: '1M', interval: '4h', count: 180 },
];

const ChartDefs = Defs as unknown as ComponentType<{ children?: ReactNode }>;

interface PhoenixPriceChartProps {
  symbol: string;
  height?: number;
  onScrub?: (price: number | null, time: number | null) => void;
  onLatestPrice?: (price: number | null) => void;
}

export function PhoenixPriceChart({
  symbol,
  height = 150,
  onScrub,
  onLatestPrice,
}: PhoenixPriceChartProps) {
  const [tfIndex, setTfIndex] = useState(1);
  const [candles, setCandles] = useState<PhoenixCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const tf = TIMEFRAMES[tfIndex];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    fetchPhoenixCandles(symbol, tf.interval, tf.count)
      .then((data) => {
        if (cancelled) return;
        setCandles(data);
        onLatestPrice?.(data.at(-1)?.close ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setCandles([]);
        onLatestPrice?.(null);
        setErrorMessage(err instanceof Error ? err.message : 'Phoenix candles unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [symbol, tf.interval, tf.count, onLatestPrice]);

  const isUp = candles.length >= 2 ? candles[candles.length - 1].close >= candles[0].open : true;
  const lineColor = isUp ? tokens.colors.viridian : tokens.colors.vermillion;
  const scrubCandle = scrubIndex !== null ? candles[scrubIndex] : null;

  const handleScrub = useCallback((index: number | null) => {
    setScrubIndex(index);
    if (index !== null && candles[index]) {
      onScrub?.(candles[index].close, candles[index].time);
      return;
    }
    onScrub?.(null, null);
  }, [candles, onScrub]);

  return (
    <View style={styles.container}>
      {scrubCandle && (
        <View style={styles.scrubOverlay}>
          <Text style={[styles.scrubPrice, { color: lineColor }]}>
            {formatPhoenixPrice(scrubCandle.close)}
          </Text>
          <Text style={styles.scrubTime}>{formatScrubTime(scrubCandle.time, tf.interval)}</Text>
        </View>
      )}

      <View style={[styles.chartArea, { height }]}>
        {loading ? (
          <ActivityIndicator size="small" color={semantic.text.accent} />
        ) : errorMessage ? (
          <View style={styles.noDataWrap}>
            <Text style={styles.noData}>Candles unavailable</Text>
            <Text style={styles.noDataDetail} numberOfLines={2}>{errorMessage}</Text>
          </View>
        ) : candles.length < 2 ? (
          <Text style={styles.noData}>No candle data</Text>
        ) : (
          <InteractiveChart
            candles={candles}
            height={height}
            color={lineColor}
            scrubIndex={scrubIndex}
            onScrub={handleScrub}
          />
        )}
      </View>

      <View style={styles.tfRow}>
        {TIMEFRAMES.map((timeframe, index) => (
          <Pressable
            key={timeframe.label}
            style={[
              styles.tfPill,
              index === tfIndex && {
                backgroundColor: isUp ? 'rgba(6,214,160,0.12)' : 'rgba(239,71,111,0.12)',
              },
            ]}
            onPress={() => {
              setTfIndex(index);
              setScrubIndex(null);
              onScrub?.(null, null);
            }}>
            <Text style={[styles.tfText, index === tfIndex && { color: lineColor }]}>
              {timeframe.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function formatScrubTime(ms: number, interval: PhoenixCandleInterval): string {
  const date = new Date(ms);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (interval === '1s' || interval === '5s' || interval === '1m' || interval === '5m' || interval === '15m' || interval === '30m') {
    return time;
  }
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return interval === '1d' ? day : `${day}, ${time}`;
}

interface InteractiveChartProps {
  candles: PhoenixCandle[];
  height: number;
  color: string;
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
}

const CHART_PAD_TOP = 8;
const CHART_PAD_BOTTOM = 8;

function InteractiveChart({ candles, height, color, scrubIndex, onScrub }: InteractiveChartProps) {
  const layoutWidth = useRef(0);
  const layoutXRef = useRef(0);

  const closes = useMemo(() => candles.map((candle) => candle.close), [candles]);
  const min = useMemo(() => Math.min(...closes), [closes]);
  const max = useMemo(() => Math.max(...closes), [closes]);
  const range = max - min || 1;
  const drawHeight = height - CHART_PAD_TOP - CHART_PAD_BOTTOM;

  const points = useMemo(() =>
    closes.map((value, index) => ({
      x: (index / (closes.length - 1)) * 100,
      y: CHART_PAD_TOP + drawHeight - ((value - min) / range) * drawHeight,
    })),
    [closes, min, range, drawHeight],
  );

  const linePath = useMemo(() =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(1)}`).join(' '),
    [points],
  );

  const fillPath = `${linePath} L100,${height} L0,${height} Z`;
  const lastPoint = points[points.length - 1];
  const scrubPoint = scrubIndex !== null ? points[scrubIndex] : null;

  const getIndexFromX = useCallback((pageX: number, layoutX: number) => {
    const x = pageX - layoutX;
    const pct = Math.max(0, Math.min(1, x / layoutWidth.current));
    return Math.round(pct * (candles.length - 1));
  }, [candles.length]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      onScrub(getIndexFromX(event.nativeEvent.pageX, layoutXRef.current));
    },
    onPanResponderMove: (event) => {
      onScrub(getIndexFromX(event.nativeEvent.pageX, layoutXRef.current));
    },
    onPanResponderRelease: () => onScrub(null),
    onPanResponderTerminate: () => onScrub(null),
  }), [getIndexFromX, onScrub]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    layoutWidth.current = event.nativeEvent.layout.width;
    layoutXRef.current = event.nativeEvent.layout.x;
    (event.target as unknown as { measureInWindow?: (callback: (x: number) => void) => void })
      ?.measureInWindow?.((x) => {
        layoutXRef.current = x;
      });
  }, []);

  return (
    <View style={{ width: '100%', height }} onLayout={handleLayout} {...panResponder.panHandlers}>
      <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        <ChartDefs>
          <LinearGradient id="phoenixChartFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </ChartDefs>
        <Path d={fillPath} fill="url(#phoenixChartFill)" />
        <Path d={linePath} fill="none" stroke={color} strokeWidth={0.6} />

        {scrubPoint && (
          <>
            <Line
              x1={scrubPoint.x}
              y1={0}
              x2={scrubPoint.x}
              y2={height}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={0.3}
              strokeDasharray="2,2"
            />
            <Circle cx={scrubPoint.x} cy={scrubPoint.y} r={1.2} fill="#fff" />
            <Circle cx={scrubPoint.x} cy={scrubPoint.y} r={2.5} fill={color} opacity={0.4} />
          </>
        )}

        {scrubIndex === null && lastPoint && (
          <>
            <Circle cx={lastPoint.x} cy={lastPoint.y} r={1} fill={color} />
            <Circle cx={lastPoint.x} cy={lastPoint.y} r={2} fill={color} opacity={0.3} />
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: semantic.background.screen,
    paddingTop: tokens.spacing.sm,
  },
  chartArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataWrap: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.lg,
  },
  noData: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    color: semantic.text.dim,
  },
  noDataDetail: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    lineHeight: 13,
    color: semantic.text.faint,
    textAlign: 'center',
  },
  scrubOverlay: {
    position: 'absolute',
    top: tokens.spacing.sm,
    left: tokens.spacing.lg,
    zIndex: 2,
  },
  scrubPrice: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  scrubTime: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    marginTop: 2,
  },
  tfRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  tfPill: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 6,
    borderRadius: tokens.radius.xs,
  },
  tfText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    color: semantic.text.faint,
  },
});
