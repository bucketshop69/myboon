import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomGlassNav } from '@/features/feed/components/BottomGlassNav';
import { FeedHeader } from '@/features/feed/components/FeedHeader';
import { BOTTOM_NAV_ITEMS } from '@/features/feed/feed.mock';
import {
  fetchSwapQuotePreview,
  fetchTokenPrices,
  getFallbackTokens,
  searchSwapTokens,
} from '@/features/swap/swap.api';
import type { SwapQuotePreview, SwapSide, SwapToken } from '@/features/swap/swap.types';
import { semantic, tokens } from '@/theme';

const TRADE_TABS = ['Market', 'Limit', 'Swap'] as const;
const SLIPPAGE_OPTIONS = [
  { label: '0.5%', bps: 50 },
  { label: '1%', bps: 100 },
  { label: 'Custom', bps: 50 },
] as const;

const STARTING_TOKENS = getFallbackTokens();
const DEFAULT_SELL_TOKEN = STARTING_TOKENS.find((token) => token.symbol === 'USDC') ?? STARTING_TOKENS[0];
const DEFAULT_BUY_TOKEN = STARTING_TOKENS.find((token) => token.symbol === 'SOL') ?? STARTING_TOKENS[1];

const MOCK_BALANCES: Record<string, number> = {
  USDC: 69.48,
  SOL: 0.058402659,
};

function formatAmount(value: number, decimals = 6): string {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  return value.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function TokenSelector({
  token,
  onPress,
}: {
  token: SwapToken;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tokenSelector}>
      {token.logoURI ? (
        <Image source={{ uri: token.logoURI }} style={styles.tokenIconImage} />
      ) : (
        <View style={[styles.tokenIconFallback, { backgroundColor: '#3C3CFF' }]}>
          <Text style={styles.tokenIconLabel}>{token.symbol.slice(0, 1)}</Text>
        </View>
      )}
      <Text style={styles.tokenName}>{token.symbol}</Text>
      <MaterialIcons name="keyboard-arrow-down" size={14} color={semantic.text.dim} />
    </Pressable>
  );
}

export default function SwapScreen() {
  const [sellToken, setSellToken] = useState<SwapToken>(DEFAULT_SELL_TOKEN);
  const [buyToken, setBuyToken] = useState<SwapToken>(DEFAULT_BUY_TOKEN);
  const [sellAmount, setSellAmount] = useState('');

  const [slippageIndex, setSlippageIndex] = useState(0);
  const [quote, setQuote] = useState<SwapQuotePreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [prices, setPrices] = useState<Record<string, number>>({});

  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [tokenModalSide, setTokenModalSide] = useState<SwapSide>('sell');
  const [tokenSearch, setTokenSearch] = useState('');
  const [tokenResults, setTokenResults] = useState<SwapToken[]>(STARTING_TOKENS);
  const [tokenSearchLoading, setTokenSearchLoading] = useState(false);
  const [tokenSearchError, setTokenSearchError] = useState<string | null>(null);

  const slippageBps = SLIPPAGE_OPTIONS[slippageIndex].bps;
  const sellAmountNumeric = toNumber(sellAmount);

  useEffect(() => {
    let cancelled = false;

    async function loadPrices() {
      try {
        const nextPrices = await fetchTokenPrices([sellToken.address, buyToken.address]);
        if (!cancelled) setPrices(nextPrices);
      } catch {
        if (!cancelled) setPrices({});
      }
    }

    void loadPrices();

    return () => {
      cancelled = true;
    };
  }, [sellToken.address, buyToken.address]);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setTokenSearchLoading(true);
      setTokenSearchError(null);
      try {
        const found = await searchSwapTokens(tokenSearch);
        if (!cancelled) setTokenResults(found);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Token search failed';
          setTokenSearchError(message);
          setTokenResults(STARTING_TOKENS);
        }
      } finally {
        if (!cancelled) setTokenSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tokenSearch]);

  useEffect(() => {
    if (sellAmountNumeric <= 0 || sellToken.address === buyToken.address) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const nextQuote = await fetchSwapQuotePreview({
          inputMint: sellToken.address,
          outputMint: buyToken.address,
          amountUi: sellAmount,
          inputDecimals: sellToken.decimals,
          outputDecimals: buyToken.decimals,
          slippageBps,
        });
        if (!cancelled) setQuote(nextQuote);
      } catch (error) {
        if (!cancelled) {
          setQuote(null);
          const message = error instanceof Error ? error.message : 'Quote unavailable';
          setQuoteError(message);
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [buyToken.address, buyToken.decimals, sellAmount, sellAmountNumeric, sellToken.address, sellToken.decimals, slippageBps]);

  function openTokenPicker(side: SwapSide): void {
    setTokenModalSide(side);
    setTokenModalVisible(true);
  }

  function closeTokenPicker(): void {
    setTokenModalVisible(false);
    setTokenSearch('');
    setTokenSearchError(null);
  }

  function onSelectToken(nextToken: SwapToken): void {
    if (tokenModalSide === 'sell') {
      if (nextToken.address === buyToken.address) {
        setBuyToken(sellToken);
      }
      setSellToken(nextToken);
    } else {
      if (nextToken.address === sellToken.address) {
        setSellToken(buyToken);
      }
      setBuyToken(nextToken);
    }
    closeTokenPicker();
  }

  function onSwapDirection(): void {
    const previousSell = sellToken;
    setSellToken(buyToken);
    setBuyToken(previousSell);
  }

  function setHalfAmount(): void {
    const balance = MOCK_BALANCES[sellToken.symbol] ?? 0;
    if (balance <= 0) return;
    setSellAmount(String(balance / 2));
  }

  function setMaxAmount(): void {
    const balance = MOCK_BALANCES[sellToken.symbol] ?? 0;
    if (balance <= 0) return;
    setSellAmount(String(balance));
  }

  const sellUsdValue = sellAmountNumeric * (prices[sellToken.address] ?? 0);
  const buyAmountValue = quote?.outAmount ?? 0;
  const buyUsdValue = buyAmountValue * (prices[buyToken.address] ?? 0);

  const rateFromQuote = quote?.inAmount && quote?.outAmount ? quote.inAmount / quote.outAmount : 0;
  const rateFromPrice =
    prices[buyToken.address] && prices[sellToken.address]
      ? prices[buyToken.address] / prices[sellToken.address]
      : 0;
  const rate = rateFromQuote || rateFromPrice;

  const impactPercent = quote ? Math.abs(quote.priceImpactPct) : 0;
  const impactColor = impactPercent <= 1 ? semantic.sentiment.positive : semantic.sentiment.negative;

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FeedHeader />

      <View style={styles.tabsRow}>
        {TRADE_TABS.map((tab) => {
          const active = tab === 'Swap';
          return (
            <View key={tab} style={[styles.tradeTab, active ? styles.tradeTabActive : styles.tradeTabInactive]}>
              <Text style={[styles.tradeTabText, active ? styles.tradeTabTextActive : styles.tradeTabTextInactive]}>
                {tab}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.rule} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.swapCard}>
          <View style={styles.swapSection}>
            <View style={styles.sectionTop}>
              <Text style={styles.sectionLabel}>Sell</Text>
              <View style={styles.sectionBalance}>
                <Text style={styles.balanceText}>
                  {formatAmount(MOCK_BALANCES[sellToken.symbol] ?? 0, 6)} {sellToken.symbol}
                </Text>
                <Pressable onPress={setHalfAmount} style={styles.balancePill}>
                  <Text style={styles.balancePillText}>Half</Text>
                </Pressable>
                <Pressable onPress={setMaxAmount} style={styles.balancePill}>
                  <Text style={styles.balancePillText}>Max</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.tokenRow}>
              <TokenSelector token={sellToken} onPress={() => openTokenPicker('sell')} />
              <View style={styles.amountCol}>
                <TextInput
                  value={sellAmount}
                  onChangeText={setSellAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={semantic.text.faint}
                  style={styles.amountInput}
                />
                <Text style={styles.amountUsd}>{formatUsd(sellUsdValue)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.swapDirWrap}>
            <Pressable onPress={onSwapDirection} style={styles.swapDirButton}>
              <MaterialIcons name="swap-vert" size={15} color={semantic.text.accent} />
            </Pressable>
          </View>

          <View style={[styles.swapSection, styles.buySection]}>
            <View style={styles.sectionTop}>
              <Text style={styles.sectionLabel}>Buy</Text>
              <Text style={styles.balanceMuted}>
                {formatAmount(MOCK_BALANCES[buyToken.symbol] ?? 0, 9)} {buyToken.symbol}
              </Text>
            </View>

            <View style={styles.tokenRow}>
              <TokenSelector token={buyToken} onPress={() => openTokenPicker('buy')} />
              <View style={styles.amountCol}>
                <Text style={[styles.amountBig, buyAmountValue <= 0 && styles.amountPlaceholder]}>
                  {formatAmount(buyAmountValue, 6)}
                </Text>
                <Text style={styles.amountUsd}>{formatUsd(buyUsdValue)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>
              {rate > 0 ? `1 ${buyToken.symbol} ~ ${formatAmount(rate, 4)} ${sellToken.symbol}` : 'Waiting for quote...'}
            </Text>
            <Text style={styles.rateValue}>
              {quoteLoading ? 'Loading route...' : quoteError ? 'Route unavailable' : 'Preview route'}
            </Text>
          </View>
        </View>

        <View style={styles.slippageRow}>
          <Text style={styles.slippageLabel}>Slippage</Text>
          <View style={styles.slippageOptions}>
            {SLIPPAGE_OPTIONS.map((option, index) => {
              const active = index === slippageIndex;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setSlippageIndex(index)}
                  style={[styles.slippageOption, active ? styles.slippageOptionActive : styles.slippageOptionInactive]}>
                  <Text style={active ? styles.slippageTextActive : styles.slippageTextInactive}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.impactRow}>
          <Text style={styles.impactLabel}>Price impact</Text>
          <Text style={[styles.impactValue, { color: impactColor }]}>
            {quoteLoading ? '...' : `${formatAmount(impactPercent, 4)}%`}
          </Text>
        </View>

        {quoteError ? <Text style={styles.metaMessage}>{quoteError}</Text> : null}
      </ScrollView>

      <View style={styles.ctaWrap}>
        <View style={styles.ctaButton}>
          <Text style={styles.ctaText}>COMING SOON</Text>
        </View>
      </View>

      <BottomGlassNav items={BOTTOM_NAV_ITEMS} />

      <Modal visible={tokenModalVisible} transparent animationType="slide" onRequestClose={closeTokenPicker}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <Pressable onPress={closeTokenPicker}>
                <MaterialIcons name="close" size={18} color={semantic.text.dim} />
              </Pressable>
            </View>

            <TextInput
              value={tokenSearch}
              onChangeText={setTokenSearch}
              placeholder="Search symbol or mint"
              placeholderTextColor={semantic.text.faint}
              style={styles.searchInput}
            />

            {tokenSearchLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={semantic.text.accent} />
                <Text style={styles.loadingText}>Searching...</Text>
              </View>
            ) : null}

            {tokenSearchError ? <Text style={styles.errorText}>{tokenSearchError}</Text> : null}

            <ScrollView style={styles.tokenList} showsVerticalScrollIndicator={false}>
              {tokenResults.map((token) => (
                <Pressable key={token.address} onPress={() => onSelectToken(token)} style={styles.tokenRowItem}>
                  {token.logoURI ? (
                    <Image source={{ uri: token.logoURI }} style={styles.tokenListIcon} />
                  ) : (
                    <View style={[styles.tokenIconFallback, { backgroundColor: '#3C3CFF' }]}>
                      <Text style={styles.tokenIconLabel}>{token.symbol.slice(0, 1)}</Text>
                    </View>
                  )}
                  <View style={styles.tokenTextBlock}>
                    <Text style={styles.tokenRowSymbol}>{token.symbol}</Text>
                    <Text style={styles.tokenRowName}>{token.name}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.background.screen,
  },
  tabsRow: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    gap: tokens.spacing.xxs,
  },
  tradeTab: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: tokens.radius.xs,
  },
  tradeTabActive: {
    backgroundColor: semantic.text.accent,
  },
  tradeTabInactive: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.text.faint,
  },
  tradeTabText: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tradeTabTextActive: {
    color: semantic.background.screen,
    fontWeight: '600',
  },
  tradeTabTextInactive: {
    color: semantic.text.dim,
    fontWeight: '500',
  },
  rule: {
    height: 1,
    marginHorizontal: 20,
    backgroundColor: semantic.text.faint,
    opacity: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },
  swapCard: {
    backgroundColor: semantic.background.surface,
    borderWidth: 1,
    borderColor: semantic.border.imageSoft,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  swapSection: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  buySection: {
    borderTopWidth: 1,
    borderTopColor: semantic.border.imageSoft,
    paddingTop: 18,
  },
  sectionTop: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: semantic.text.dim,
  },
  sectionBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceText: {
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  balancePill: {
    borderWidth: 1,
    borderColor: 'rgba(200, 184, 112, 0.2)',
    borderRadius: tokens.radius.xs,
    backgroundColor: 'rgba(200, 184, 112, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: tokens.spacing.xxs,
  },
  balancePillText: {
    color: semantic.text.accentDim,
    fontSize: 7,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  balanceMuted: {
    color: semantic.text.faint,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.border.imageSoft,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 120,
  },
  tokenIconImage: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.full,
    backgroundColor: '#1B1C13',
  },
  tokenIconFallback: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  tokenName: {
    color: semantic.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  amountCol: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  amountInput: {
    color: semantic.text.primary,
    fontSize: 46,
    lineHeight: 46,
    fontWeight: '500',
    minWidth: 132,
    textAlign: 'right',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  amountBig: {
    color: semantic.text.primary,
    fontSize: 46,
    lineHeight: 46,
    fontWeight: '500',
  },
  amountPlaceholder: {
    color: semantic.text.faint,
  },
  amountUsd: {
    marginTop: tokens.spacing.xs,
    color: semantic.text.dim,
    fontSize: 8,
    letterSpacing: 0.7,
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  swapDirWrap: {
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  swapDirButton: {
    position: 'relative',
    top: -17,
    width: 34,
    height: 34,
    borderRadius: tokens.radius.full,
    backgroundColor: semantic.background.lift,
    borderWidth: 2,
    borderColor: semantic.background.screen,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: semantic.border.imageSoft,
  },
  rateLabel: {
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.6,
    flexShrink: 1,
    paddingRight: tokens.spacing.sm,
  },
  rateValue: {
    color: semantic.text.accentDim,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  slippageRow: {
    marginTop: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slippageLabel: {
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  slippageOptions: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  slippageOption: {
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  slippageOptionActive: {
    backgroundColor: semantic.text.accent,
  },
  slippageOptionInactive: {
    backgroundColor: semantic.background.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.text.faint,
  },
  slippageTextActive: {
    color: semantic.background.screen,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.8,
  },
  slippageTextInactive: {
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.8,
  },
  impactRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  impactLabel: {
    color: semantic.text.dim,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.6,
  },
  impactValue: {
    color: semantic.sentiment.positive,
    fontFamily: 'monospace',
    fontSize: 8,
    letterSpacing: 0.6,
  },
  metaMessage: {
    marginTop: tokens.spacing.sm,
    color: semantic.text.dim,
    fontSize: 11,
  },
  ctaWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 92,
  },
  ctaButton: {
    height: 52,
    borderRadius: tokens.radius.md,
    backgroundColor: semantic.text.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: semantic.background.screen,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '76%',
    backgroundColor: semantic.background.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: semantic.border.muted,
    padding: tokens.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.md,
  },
  modalTitle: {
    color: semantic.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: semantic.border.muted,
    borderRadius: tokens.radius.sm,
    color: semantic.text.primary,
    backgroundColor: semantic.background.surfaceRaised,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  loadingText: {
    color: semantic.text.dim,
    fontSize: 12,
  },
  errorText: {
    color: semantic.sentiment.negative,
    fontSize: 12,
    marginBottom: tokens.spacing.sm,
  },
  tokenList: {
    marginTop: tokens.spacing.sm,
  },
  tokenRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border.imageSoft,
  },
  tokenListIcon: {
    width: 26,
    height: 26,
    borderRadius: tokens.radius.full,
    backgroundColor: semantic.background.surfaceRaised,
  },
  tokenTextBlock: {
    flex: 1,
  },
  tokenRowSymbol: {
    color: semantic.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  tokenRowName: {
    color: semantic.text.dim,
    fontSize: 12,
    marginTop: 1,
  },
});
