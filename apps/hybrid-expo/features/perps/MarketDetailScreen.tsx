import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { FeedHeader } from '@/features/feed/components/FeedHeader';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import {
  fetchPerpsAccount,
  fetchPerpsMarkets,
  fetchPerpsPositions,
  formatChange,
  formatFunding,
  formatPrice,
  formatUsdCompact,
} from '@/features/perps/perps.api';
import type { PerpsAccount, PerpsMarket, PerpsPosition } from '@/features/perps/perps.types';
import { usePerpsLivePrice } from '@/features/perps/usePerpsWebSocket';
import { semantic, tokens } from '@/theme';

type Tab = 'market' | 'profile';
type Side = 'long' | 'short';
type Timeframe = '15m' | '1h' | '4h' | '1d';

const TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1d'];
const LEVERAGE_MAX = 10;

interface MarketDetailScreenProps {
  symbol: string;
}

export function MarketDetailScreen({ symbol }: MarketDetailScreenProps) {
  const router = useRouter();
  const { connected, publicKey } = useWallet();

  // Market data
  const [market, setMarket] = useState<PerpsMarket | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Profile data (loaded when wallet connected)
  const [positions, setPositions] = useState<PerpsPosition[]>([]);
  const [account, setAccount] = useState<PerpsAccount | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('market');
  const [side, setSide] = useState<Side>('long');
  const [leverage, setLeverage] = useState(2);
  const [size, setSize] = useState(100);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');


  // Live price via WebSocket
  const livePrice = usePerpsLivePrice(symbol);

  // Displayed price: prefer live WebSocket, fall back to REST snapshot
  const displayPrice = useMemo(() => {
    if (livePrice?.mark) return parseFloat(livePrice.mark);
    return market?.markPrice ?? 0;
  }, [livePrice, market]);

  const displayFunding = useMemo(() => {
    if (livePrice?.funding) return parseFloat(livePrice.funding);
    return market?.fundingRate ?? 0;
  }, [livePrice, market]);

  // Load market info (REST snapshot for initial render)
  async function loadMarket() {
    setLoadingMarket(true);
    setMarketError(null);
    try {
      const all = await fetchPerpsMarkets();
      const found = all.find((m) => m.symbol === symbol) ?? null;
      if (!found) throw new Error(`Market ${symbol} not found`);
      setMarket(found);
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : 'Failed to load market');
    } finally {
      setLoadingMarket(false);
    }
  }

  // Load profile data when wallet connects
  async function loadProfile(address: string) {
    setLoadingProfile(true);
    try {
      const [pos, acc] = await Promise.all([
        fetchPerpsPositions(address),
        fetchPerpsAccount(address),
      ]);
      setPositions(pos);
      setAccount(acc);
    } catch {
      // Non-fatal — positions stay empty
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    void loadMarket();
  }, [symbol]);

  useEffect(() => {
    if (connected && publicKey) {
      void loadProfile(publicKey.toString());
    } else {
      setPositions([]);
      setAccount(null);
    }
  }, [connected, publicKey]);

  const change24h = market?.change24h ?? 0;
  const isUp = change24h >= 0;

  return (
    <SafeAreaView style={styles.screen}>
      <FeedHeader />

      {/* Detail header */}
      <View style={styles.detailHeader}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => router.back()}>
          <MaterialIcons name="arrow-back-ios" size={14} color={semantic.text.primary} />
          <Text style={styles.backLabel}>Markets</Text>
        </Pressable>

        <View style={styles.detailTitleWrap}>
          <Text style={styles.detailSym}>{symbol}</Text>
          <View style={styles.perpChip}>
            <Text style={styles.perpChipText}>PERP</Text>
          </View>
        </View>

        <Pressable style={styles.infoBtn}>
          <MaterialIcons name="info-outline" size={16} color={semantic.text.dim} />
        </Pressable>
      </View>

      {loadingMarket ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="small" color={semantic.text.accent} />
          <Text style={styles.stateText}>Loading {symbol}...</Text>
        </View>
      ) : marketError ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorTitle}>Market unavailable</Text>
          <Text style={styles.stateText}>{marketError}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadMarket()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Hero zone */}
          <View style={styles.heroZone}>
            {/* Timeframe row + price */}
            <View style={styles.heroTop}>
              <View style={styles.timeframeRow}>
                {TIMEFRAMES.map((tf) => (
                  <Pressable
                    key={tf}
                    style={[styles.tfBtn, tf === timeframe && styles.tfBtnActive]}
                    onPress={() => setTimeframe(tf)}>
                    <Text style={[styles.tfText, tf === timeframe && styles.tfTextActive]}>
                      {tf}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.priceCol}>
                <Text style={styles.heroPrice}>{formatPrice(displayPrice)}</Text>
                <Text style={[styles.heroChange, isUp ? styles.textPos : styles.textNeg]}>
                  {isUp ? '▲' : '▼'} {formatChange(change24h)}
                </Text>
              </View>
            </View>

            {/* Chart placeholder — react-native-svg not installed, Phase 1 */}
            <View style={styles.chartPlaceholder}>
              <Text style={styles.chartPlaceholderText}>Chart · coming in next release</Text>
            </View>

            {/* Stats strip */}
            <View style={styles.heroStats}>
              <View style={styles.hstat}>
                <Text style={styles.hstatLabel}>Mark</Text>
                <Text style={styles.hstatVal}>{formatPrice(displayPrice)}</Text>
              </View>
              <View style={styles.hstat}>
                <Text style={styles.hstatLabel}>Fund/8h</Text>
                <Text style={[styles.hstatVal, displayFunding >= 0 ? styles.textPos : styles.textNeg]}>
                  {formatFunding(displayFunding)}
                </Text>
              </View>
              <View style={styles.hstat}>
                <Text style={styles.hstatLabel}>OI</Text>
                <Text style={styles.hstatVal}>
                  {formatUsdCompact(market?.openInterest ?? 0)}
                </Text>
              </View>
              <View style={styles.hstat}>
                <Text style={styles.hstatLabel}>Max Lev</Text>
                <Text style={styles.hstatVal}>{market?.maxLeverage ?? '--'}×</Text>
              </View>
            </View>
          </View>

          {/* Tab bar */}
          <View style={styles.tabBar}>
            {(['market', 'profile'] as Tab[]).map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
                onPress={() => setActiveTab(tab)}>
                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                  {tab === 'market' ? 'Market' : 'Profile'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Tab content */}
          {activeTab === 'market' ? (
            <MarketTab
              market={market}
              side={side}
              leverage={leverage}
              displayPrice={displayPrice}
              size={size}
              onSizeChange={setSize}
              onLeverageChange={setLeverage}
            />
          ) : (
            <ProfileTab
              connected={connected}
              account={account}
              positions={positions}
              loading={loadingProfile}
            />
          )}

          {/* Action dock — Long/Short pinned at thumb zone above nav */}
          <ActionDock
            connected={connected}
            side={side}
            onSideChange={setSide}
            leverage={leverage}
            displayPrice={displayPrice}
          />
        </>
      )}

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />
    </SafeAreaView>
  );
}

// ─── Market Tab ──────────────────────────────────────────────────────────────

interface MarketTabProps {
  market: PerpsMarket | null;
  side: Side;
  leverage: number;
  displayPrice: number;
  size: number;
  onSizeChange: (val: number) => void;
  onLeverageChange: (val: number) => void;
}

function MarketTab({ market, side, leverage, displayPrice, size, onSizeChange, onLeverageChange }: MarketTabProps) {
  const trackWidthRef = useRef(0);
  const startLevRef = useRef(leverage);
  const leveragePct = (leverage - 1) / (LEVERAGE_MAX - 1);
  const notional = size * leverage;

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      startLevRef.current = leverage;
      const x = evt.nativeEvent.locationX;
      if (trackWidthRef.current > 0) {
        const pct = Math.max(0, Math.min(1, x / trackWidthRef.current));
        onLeverageChange(Math.max(1, Math.round(1 + pct * (LEVERAGE_MAX - 1))));
      }
    },
    onPanResponderMove: (_evt, gestureState) => {
      if (trackWidthRef.current === 0) return;
      const startPct = (startLevRef.current - 1) / (LEVERAGE_MAX - 1);
      const deltaPct = gestureState.dx / trackWidthRef.current;
      const pct = Math.max(0, Math.min(1, startPct + deltaPct));
      onLeverageChange(Math.max(1, Math.round(1 + pct * (LEVERAGE_MAX - 1))));
    },
  }), [leverage, onLeverageChange]);
  const liqEstimate =
    side === 'long'
      ? displayPrice * (1 - 1 / leverage)
      : displayPrice * (1 + 1 / leverage);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.tabScrollContent}>
      {/* Order inputs */}
      <View style={styles.orderInputsRow}>
        <View style={styles.oField}>
          <Text style={styles.oLabel}>Size</Text>
          <View style={[styles.oInput, styles.oInputActive]}>
            <TextInput
              style={styles.oInputVal}
              value={size === 0 ? '' : String(size)}
              onChangeText={(t) => {
                const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                onSizeChange(isNaN(n) ? 0 : n);
              }}
              keyboardType="numeric"
              selectTextOnFocus
            />
            <Text style={styles.oInputUnit}>USDC</Text>
          </View>
        </View>
        <View style={styles.oField}>
          <Text style={styles.oLabel}>Order Type</Text>
          <View style={styles.oInput}>
            <Text style={styles.oInputVal}>Market</Text>
            <Text style={styles.oInputUnit}>▾</Text>
          </View>
        </View>
      </View>

      {/* Leverage row */}
      <View style={styles.levRow}>
        <Text style={styles.levLabel}>Leverage</Text>
        <View
          style={styles.levTrack}
          onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
          {...panResponder.panHandlers}>
          <View style={[styles.levFill, { width: `${leveragePct * 100}%` }]} />
          <View style={[styles.levThumb, { left: `${leveragePct * 100}%` as any }]} />
        </View>
        <Text style={styles.levVal}>{leverage}×</Text>
      </View>

      {/* Order preview */}
      <View style={styles.orderPreview}>
        <View style={styles.opItem}>
          <Text style={styles.opLabel}>Notional</Text>
          <Text style={styles.opVal}>${notional.toFixed(0)}</Text>
        </View>
        <View style={[styles.opItem, styles.opItemCenter]}>
          <Text style={styles.opLabel}>Fee (est.)</Text>
          <Text style={styles.opVal}>${(notional * 0.0002).toFixed(2)}</Text>
        </View>
        <View style={[styles.opItem, styles.opItemRight]}>
          <Text style={styles.opLabel}>Liq Price</Text>
          <Text style={styles.opVal}>~{formatPrice(liqEstimate)}</Text>
        </View>
      </View>

      {/* Market info rows */}
      <View style={styles.marketInfoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>24h Volume</Text>
          <Text style={styles.infoVal}>{formatUsdCompact(market?.volume24h ?? 0)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Oracle Price</Text>
          <Text style={styles.infoVal}>{formatPrice(market?.oraclePrice ?? 0)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Min Order Size</Text>
          <Text style={styles.infoVal}>{market?.minOrderSize ?? '--'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Tick Size</Text>
          <Text style={styles.infoVal}>{market?.tickSize ?? '--'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

interface ProfileTabProps {
  connected: boolean;
  account: PerpsAccount | null;
  positions: PerpsPosition[];
  loading: boolean;
}

function ProfileTab({ connected, account, positions, loading }: ProfileTabProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.tabScrollContent}>
      {/* Wallet card */}
      <View style={styles.walletCard}>
        <View style={styles.walletRow}>
          <Text style={styles.walletLabel}>Wallet</Text>
          {connected ? (
            <View style={styles.connectedBadge}>
              <Text style={styles.connectedBadgeText}>Connected</Text>
            </View>
          ) : (
            <View style={styles.connectBtn}>
              <Text style={styles.connectBtnText}>Connect</Text>
            </View>
          )}
        </View>

        <View style={styles.equityRow}>
          <View style={styles.eqItem}>
            <Text style={styles.eqLabel}>Equity</Text>
            <Text style={styles.eqVal}>
              {account ? `$${account.equity.toFixed(2)}` : '—'}
            </Text>
          </View>
          <View style={[styles.eqItem, styles.eqItemCenter]}>
            <Text style={styles.eqLabel}>Margin Used</Text>
            <Text style={styles.eqVal}>
              {account ? `$${account.totalMarginUsed.toFixed(2)}` : '—'}
            </Text>
          </View>
          <View style={[styles.eqItem, styles.eqItemRight]}>
            <Text style={styles.eqLabel}>Available</Text>
            <Text style={styles.eqVal}>
              {account ? `$${account.availableToSpend.toFixed(2)}` : '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats placeholder — no trade history API yet */}
      <View style={styles.statsPlaceholder}>
        <MaterialIcons name="bar-chart" size={20} color={semantic.text.faint} />
        <Text style={styles.statsPlaceholderText}>
          PnL stats available once trade history{'\n'}endpoint is added to Pacific API
        </Text>
      </View>

      {/* Open positions */}
      <View style={styles.posSection}>
        <View style={styles.posSectionHeader}>
          <Text style={styles.posSectionTitle}>Open Positions</Text>
          <Text style={styles.posSectionBadge}>
            {loading ? '…' : `${positions.length} open`}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={semantic.text.accent} style={styles.posLoader} />
        ) : !connected ? (
          <View style={styles.posEmpty}>
            <Text style={styles.posEmptyText}>Connect wallet to view positions</Text>
          </View>
        ) : positions.length === 0 ? (
          <View style={styles.posEmpty}>
            <MaterialIcons name="inbox" size={22} color={semantic.text.faint} />
            <Text style={styles.posEmptyText}>No open positions</Text>
          </View>
        ) : (
          positions.map((pos) => <PositionRow key={pos.symbol} pos={pos} />)
        )}
      </View>

      <View style={styles.tabFooterPad} />
    </ScrollView>
  );
}

// ─── Action Dock ─────────────────────────────────────────────────────────────

interface ActionDockProps {
  connected: boolean;
  side: Side;
  onSideChange: (s: Side) => void;
  leverage: number;
  displayPrice: number;
}

function ActionDock({ connected, side, onSideChange, leverage, displayPrice }: ActionDockProps) {
  const liqEstimate =
    side === 'long'
      ? displayPrice * (1 - 1 / leverage)
      : displayPrice * (1 + 1 / leverage);

  return (
    <View style={styles.actionDock}>
      {!connected ? (
        <Pressable
          style={({ pressed }) => [styles.dockConnectBtn, pressed && styles.dockConnectBtnPressed]}>
          <MaterialIcons name="lock-outline" size={14} color={semantic.text.dim} />
          <Text style={styles.dockConnectText}>Connect Wallet</Text>
        </Pressable>
      ) : (
        <>
          {/* Param chips */}
          <View style={styles.dockParams}>
            <View style={styles.dockChip}>
              <Text style={styles.dockChipLabel}>Size</Text>
              <Text style={styles.dockChipVal}>$100</Text>
            </View>
            <Text style={styles.dockSep}>·</Text>
            <View style={styles.dockChip}>
              <Text style={styles.dockChipLabel}>Lev</Text>
              <Text style={styles.dockChipVal}>{leverage}×</Text>
            </View>
            <Text style={styles.dockSep}>·</Text>
            <View style={styles.dockChip}>
              <Text style={styles.dockChipLabel}>Liq</Text>
              <Text style={[styles.dockChipVal, styles.textNeg]}>~{formatPrice(liqEstimate)}</Text>
            </View>
          </View>

          {/* Long / Short buttons */}
          <View style={styles.dockActions}>
            <Pressable
              style={({ pressed }) => [
                styles.dockBtn,
                styles.dockShort,
                side === 'short' && styles.dockShortActive,
                pressed && styles.dockBtnPressed,
              ]}
              onPress={() => onSideChange('short')}>
              <Text style={[styles.dockBtnText, styles.textNeg]}>Short</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dockBtn,
                styles.dockLong,
                side === 'long' && styles.dockLongActive,
                pressed && styles.dockBtnPressed,
              ]}
              onPress={() => onSideChange('long')}>
              <Text style={[styles.dockBtnText, styles.textPos]}>Long</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function PositionRow({ pos }: { pos: PerpsPosition }) {
  const isUp = pos.unrealizedPnl >= 0;
  return (
    <View style={styles.posRow}>
      <View style={styles.posLeft}>
        <View style={styles.posSymRow}>
          <Text style={styles.posSym}>{pos.symbol}</Text>
          <View style={[styles.posDirBadge, pos.side === 'long' ? styles.posDirLong : styles.posDirShort]}>
            <Text style={[styles.posDirText, pos.side === 'long' ? styles.textPos : styles.textNeg]}>
              {pos.side === 'long' ? 'Long' : 'Short'}
            </Text>
          </View>
        </View>
        <Text style={styles.posSubText}>
          {pos.size.toFixed(4)} · Entry {formatPrice(pos.entryPrice)}
        </Text>
      </View>
      <View style={styles.posRight}>
        <Text style={[styles.posPnl, isUp ? styles.textPos : styles.textNeg]}>
          {isUp ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
        </Text>
        <Text style={[styles.posPnlPct, isUp ? styles.textPos : styles.textNeg]}>
          {isUp ? '+' : ''}{pos.unrealizedPnlPct.toFixed(2)}%
        </Text>
        <View style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Close</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },

  // Detail header
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    opacity: 0.8,
    minWidth: 72,
  },
  backBtnPressed: { opacity: 1 },
  backLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.primary,
  },
  detailTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  detailSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    color: semantic.text.primary,
    letterSpacing: 0.5,
  },
  perpChip: {
    borderWidth: 1,
    borderColor: 'rgba(199,183,112,0.14)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  perpChipText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: tokens.colors.primaryDim,
  },
  infoBtn: {
    minWidth: 72,
    alignItems: 'flex-end',
    padding: tokens.spacing.xs,
  },

  // Centered state
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xl,
  },
  stateText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    color: semantic.text.dim,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  retryButton: {
    backgroundColor: semantic.text.accent,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
    marginTop: tokens.spacing.xs,
  },
  retryText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: semantic.background.screen,
  },

  // Hero zone
  heroZone: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: tokens.spacing.sm,
  },
  timeframeRow: {
    flexDirection: 'row',
    gap: tokens.spacing.xxs,
    alignItems: 'center',
  },
  tfBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tfBtnActive: {
    borderColor: 'rgba(199,183,112,0.14)',
    backgroundColor: 'rgba(199,183,112,0.06)',
  },
  tfText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  tfTextActive: {
    color: tokens.colors.primary,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  heroPrice: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
    color: semantic.text.primary,
    lineHeight: 28,
  },
  heroChange: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },

  // Chart placeholder
  chartPlaceholder: {
    height: 52,
    borderRadius: tokens.radius.sm,
    backgroundColor: 'rgba(48,47,32,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing.sm,
  },
  chartPlaceholderText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1,
    color: semantic.text.faint,
  },

  // Hero stats
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hstat: {
    gap: 2,
  },
  hstatLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  hstatVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
    color: semantic.text.primary,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.muted,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: tokens.colors.primary,
  },
  tabLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  tabLabelActive: {
    color: tokens.colors.primary,
  },

  // Shared scroll content padding
  tabScrollContent: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
    paddingBottom: 130,
  },

  // Order inputs
  orderInputsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  oField: {
    flex: 1,
    gap: tokens.spacing.xxs,
  },
  oLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  oInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
    opacity: 0.55,
  },
  oInputVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    color: semantic.text.primary,
  },
  oInputUnit: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.dim,
    letterSpacing: 1,
  },

  // Leverage
  levRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  levLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.dim,
    width: 60,
  },
  levTrack: {
    flex: 1,
    height: 3,
    backgroundColor: semantic.border.muted,
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  levFill: {
    height: '100%',
    backgroundColor: tokens.colors.primary,
    borderRadius: 2,
  },
  levThumb: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.colors.primary,
    marginLeft: -5,
    top: -3.5,
  },
  levVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: tokens.colors.primary,
    width: 28,
    textAlign: 'right',
  },

  // Order preview
  orderPreview: {
    flexDirection: 'row',
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    opacity: 0.7,
  },
  opItem: {
    flex: 1,
    gap: 2,
  },
  opItemCenter: {
    alignItems: 'center',
  },
  opItemRight: {
    alignItems: 'flex-end',
  },
  opLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  opVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs + 1,
    fontWeight: '600',
    color: semantic.text.primary,
  },

  // Market info rows
  marketInfoSection: {
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    paddingTop: tokens.spacing.sm,
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(48,47,32,0.4)',
  },
  infoKey: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  infoVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs + 1,
    fontWeight: '600',
    color: semantic.text.primary,
  },

  // Profile tab — wallet card
  walletCard: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  connectedBadge: {
    backgroundColor: 'rgba(74,140,111,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(74,140,111,0.25)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  connectedBadgeText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1,
    color: tokens.colors.viridian,
  },
  connectBtn: {
    backgroundColor: 'rgba(199,183,112,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(199,183,112,0.18)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  connectBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    color: tokens.colors.primary,
  },
  equityRow: {
    flexDirection: 'row',
    paddingTop: tokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
  },
  eqItem: {
    flex: 1,
    gap: 2,
  },
  eqItemCenter: {
    alignItems: 'center',
  },
  eqItemRight: {
    alignItems: 'flex-end',
  },
  eqLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  eqVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs + 1,
    fontWeight: '700',
    color: semantic.text.primary,
  },

  // Stats placeholder
  statsPlaceholder: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: tokens.spacing.lg,
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  statsPlaceholderText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 0.5,
    color: semantic.text.faint,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Positions section
  posSection: {
    gap: tokens.spacing.sm,
  },
  posSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posSectionTitle: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  posSectionBadge: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
  },
  posLoader: {
    paddingVertical: tokens.spacing.md,
  },
  posEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xl,
    opacity: 0.4,
  },
  posEmptyText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: semantic.text.dim,
    textAlign: 'center',
  },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
    padding: tokens.spacing.sm,
  },
  posLeft: {
    flex: 1,
    gap: 3,
  },
  posSymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  posSym: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  posDirBadge: {
    borderWidth: 1,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  posDirLong: {
    backgroundColor: 'rgba(74,140,111,0.15)',
    borderColor: 'rgba(74,140,111,0.25)',
  },
  posDirShort: {
    backgroundColor: 'rgba(217,83,79,0.12)',
    borderColor: 'rgba(217,83,79,0.20)',
  },
  posDirText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  posSubText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    color: semantic.text.faint,
    letterSpacing: 0.5,
  },
  posRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  posPnl: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  posPnlPct: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '600',
  },
  closeBtn: {
    backgroundColor: 'rgba(217,83,79,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(217,83,79,0.18)',
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  closeBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.colors.vermillion,
  },

  tabFooterPad: {
    height: 0,
  },

  // Action dock
  actionDock: {
    borderTopWidth: 1,
    borderTopColor: semantic.border.muted,
    backgroundColor: 'rgba(10,10,8,0.97)',
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    gap: 8,
  },
  dockConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    height: 44,
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 8,
  },
  dockConnectBtnPressed: {
    opacity: 0.7,
  },
  dockConnectText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  dockParams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  dockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dockChipLabel: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xxs - 1,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semantic.text.faint,
  },
  dockChipVal: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    color: semantic.text.primary,
  },
  dockSep: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: semantic.text.faint,
  },
  dockActions: {
    flexDirection: 'row',
    gap: 8,
  },
  dockBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  dockBtnPressed: {
    opacity: 0.7,
  },
  dockBtnText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  dockShort: {
    backgroundColor: 'rgba(217,83,79,0.08)',
    borderColor: 'rgba(217,83,79,0.20)',
  },
  dockShortActive: {
    backgroundColor: 'rgba(217,83,79,0.16)',
    borderColor: 'rgba(217,83,79,0.38)',
  },
  dockLong: {
    backgroundColor: 'rgba(74,140,111,0.09)',
    borderColor: 'rgba(74,140,111,0.22)',
  },
  dockLongActive: {
    backgroundColor: 'rgba(74,140,111,0.18)',
    borderColor: 'rgba(74,140,111,0.40)',
  },

  // Color helpers
  textPos: {
    color: tokens.colors.viridian,
  },
  textNeg: {
    color: tokens.colors.vermillion,
  },

  // oInput active (editable size field)
  oInputActive: {
    opacity: 1,
    borderColor: 'rgba(199,183,112,0.28)',
  },

});
