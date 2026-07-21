import type {
  MeteoraFreshness,
  MeteoraPoolDetail,
  MeteoraStrategy,
} from '@myboon/shared/meteora';

export type MeteoraExecutionTab = 'position' | 'limit';
export type MeteoraFundingMode = 'both' | 'single';
export type MeteoraRangePreset = 'focused' | 'balanced' | 'wide' | 'manual';
export type MeteoraLimitSide = 'buy' | 'sell';
export type MeteoraOperationState =
  | 'editing'
  | 'preparing'
  | 'ready'
  | 'building'
  | 'simulating'
  | 'awaiting_wallet'
  | 'submitted'
  | 'confirming'
  | 'syncing'
  | 'partial'
  | 'success'
  | 'error';

export interface MeteoraPositionDraft {
  fundingMode: MeteoraFundingMode;
  singleTokenSide: 'x' | 'y';
  amountX: string;
  amountY: string;
  autoFill: boolean;
  strategy: MeteoraStrategy;
  preset: MeteoraRangePreset;
  requestedMinPrice: string;
  requestedMaxPrice: string;
}

export interface MeteoraLimitDraft {
  side: MeteoraLimitSide;
  amount: string;
  requestedPrice: string;
}

export interface MeteoraPreviewCost {
  label: string;
  value: string;
  refundable?: boolean;
}

export interface MeteoraExecutionWarning {
  code: string;
  message: string;
  blocking: boolean;
}

export interface MeteoraPhaseTwoPreview {
  id: string;
  kind: MeteoraExecutionTab;
  createdAt: string;
  expiresAt: string;
  currentPrice: string;
  activeBinId?: number;
  requestedMinPrice?: string;
  requestedMaxPrice?: string;
  executableMinPrice?: string;
  executableMaxPrice?: string;
  minBinId?: number;
  maxBinId?: number;
  binCount?: number;
  requestedTargetPrice?: string;
  executableTargetPrice?: string;
  targetBinId?: number;
  distanceFromCurrentPct?: string;
  estimatedOutput?: string;
  zapRoute?: string;
  zapSwapAmount?: string;
  zapExpectedOutput?: string;
  zapMinimumOutput?: string;
  zapPriceImpactPct?: string;
  zapSlippageBps?: number;
  requiredAmountX?: string;
  requiredAmountY?: string;
  spendableBalanceX?: string;
  spendableBalanceY?: string;
  transactionCount: number;
  costs: MeteoraPreviewCost[];
  warnings: MeteoraExecutionWarning[];
  canExecute: boolean;
  walletAddress: string | null;
  network: 'mainnet-beta';
  sourcePreview?: unknown;
}

export interface MeteoraPrepareContext {
  pool: MeteoraPoolDetail;
  poolFreshness: MeteoraFreshness;
  walletAddress: string | null;
  wallet: {
    connected: boolean;
    address: string | null;
    source?: string;
    isPreparing?: boolean;
    signAndSendTransaction?: ((transaction: unknown) => Promise<unknown>) | null;
  };
  connection: unknown;
  getWalletSnapshot?: () => MeteoraPrepareContext['wallet'];
}

export interface MeteoraExecuteResult {
  state: 'submitted' | 'confirmed' | 'syncing' | 'partial' | 'cancelled';
  message: string;
  signature?: string;
  explorerUrl?: string;
  resourceAddress?: string;
  currentStep?: number;
  totalSteps?: number;
}

export interface MeteoraExecutionUpdate {
  state: MeteoraOperationState;
  message: string;
  currentStep?: number;
  totalSteps?: number;
  explorerUrl?: string;
}

export interface MeteoraPhaseTwoAdapter {
  getDefaultRange?(pool: MeteoraPoolDetail): Promise<{
    requestedMinPrice: string;
    requestedMaxPrice: string;
    binCount: number;
  }>;
  getCapabilities?(poolAddress: string): Promise<{
    createPosition: boolean;
    zapIn: boolean;
    limitOrder: boolean;
  }>;
  /**
   * Reads the connected wallet's spendable balance for both pool tokens,
   * independent of preview preparation. The pool-detail screen calls this on
   * mount when a wallet is connected so the balance row can show a real
   * value (or an explicit failure) before the user has entered an amount —
   * preview-driven balances alone leave the row showing "Checking…"
   * indefinitely until a valid amount triggers a preview.
   */
  getWalletBalances?(
    pool: MeteoraPoolDetail,
    walletAddress: string,
  ): Promise<{ x: string | null; y: string | null }>;
  recoverPending?(
    context: MeteoraPrepareContext,
    onProgress?: (update: MeteoraExecutionUpdate) => void,
  ): Promise<MeteoraExecuteResult | null>;
  preparePosition(
    context: MeteoraPrepareContext,
    draft: MeteoraPositionDraft,
  ): Promise<MeteoraPhaseTwoPreview>;
  prepareLimitOrder(
    context: MeteoraPrepareContext,
    draft: MeteoraLimitDraft,
  ): Promise<MeteoraPhaseTwoPreview>;
  execute(
    context: MeteoraPrepareContext,
    preview: MeteoraPhaseTwoPreview,
    onProgress?: (update: MeteoraExecutionUpdate) => void,
  ): Promise<MeteoraExecuteResult>;
}

export const EMPTY_POSITION_DRAFT: MeteoraPositionDraft = {
  fundingMode: 'both',
  singleTokenSide: 'x',
  amountX: '',
  amountY: '',
  autoFill: false,
  strategy: 'spot',
  preset: 'manual',
  requestedMinPrice: '',
  requestedMaxPrice: '',
};

export const EMPTY_LIMIT_DRAFT: MeteoraLimitDraft = {
  side: 'buy',
  amount: '',
  requestedPrice: '',
};

export function sanitizeDecimalInput(value: string, decimals: number): string {
  // Preserve invalid pasted characters so validation can explain the correction
  // instead of silently turning "-1" into "1" or "1e3" into "13".
  const maxLength = Math.max(24, decimals + 20);
  return value.replace(/,/g, '').trimStart().slice(0, maxLength);
}

export const METEORA_DEFAULT_RANGE_BIN_DELTA = 34;
export const METEORA_RANGE_VISUAL_MIN_PERCENT = 3;
export const METEORA_RANGE_VISUAL_MAX_PERCENT = 97;

export function createCenteredRange(
  currentPrice: string | null,
  binStep: number,
  binDelta = METEORA_DEFAULT_RANGE_BIN_DELTA,
): {
  requestedMinPrice: string;
  requestedMaxPrice: string;
  binCount: number;
} | null {
  const price = Number(currentPrice);
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(binDelta) || binDelta < 1) {
    return null;
  }
  const factor = 1 + Math.max(1, binStep) / 10_000;
  return {
    requestedMinPrice: formatCalculatedPrice(price / (factor ** binDelta)),
    requestedMaxPrice: formatCalculatedPrice(price * (factor ** binDelta)),
    binCount: (binDelta * 2) + 1,
  };
}

export function movePriceByBins(
  value: string,
  binStep: number,
  deltaBins: number,
): string {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(deltaBins)) return '';
  const bins = Math.trunc(deltaBins);
  if (bins === 0) return value;
  const factor = 1 + Math.max(1, binStep) / 10_000;
  return formatCalculatedPrice(price * (factor ** bins));
}

export function applyRangeEdgeBinDelta({
  minPrice,
  maxPrice,
  currentPrice,
  binStep,
  edge,
  deltaBins,
  bounds,
}: {
  minPrice: string;
  maxPrice: string;
  currentPrice: string | null;
  binStep: number;
  edge: 'min' | 'max';
  deltaBins: number;
  bounds?: { minPrice: string; maxPrice: string } | null;
}): { minPrice: string; maxPrice: string } | null {
  const currentEdge = edge === 'min' ? minPrice : maxPrice;
  const adjusted = movePriceByBins(currentEdge || currentPrice || '', binStep, deltaBins);
  if (!adjusted) return null;
  const nextMin = edge === 'min' ? adjusted : minPrice;
  const nextMax = edge === 'max' ? adjusted : maxPrice;
  if (
    !nextMin
    || !nextMax
    || compareDecimalStrings(nextMin, nextMax) >= 0
  ) {
    return null;
  }
  if (
    bounds
    && (
      compareDecimalStrings(nextMin, bounds.minPrice) < 0
      || compareDecimalStrings(nextMax, bounds.maxPrice) > 0
    )
  ) {
    return null;
  }
  return { minPrice: nextMin, maxPrice: nextMax };
}

export function relativeBinToRangePercent(relativeBin: number): number {
  if (!Number.isFinite(relativeBin)) return 50;
  const percent = 50 + (
    relativeBin / METEORA_DEFAULT_RANGE_BIN_DELTA
  ) * (
    (METEORA_RANGE_VISUAL_MAX_PERCENT - METEORA_RANGE_VISUAL_MIN_PERCENT) / 2
  );
  return Math.max(
    METEORA_RANGE_VISUAL_MIN_PERCENT,
    Math.min(METEORA_RANGE_VISUAL_MAX_PERCENT, percent),
  );
}

export function dragPixelsToBinDelta(
  horizontalPixels: number,
  trackWidth: number,
): number {
  if (
    !Number.isFinite(horizontalPixels)
    || !Number.isFinite(trackWidth)
    || trackWidth <= 0
  ) {
    return 0;
  }
  const usableWidth = trackWidth * (
    (METEORA_RANGE_VISUAL_MAX_PERCENT - METEORA_RANGE_VISUAL_MIN_PERCENT) / 100
  );
  const intervals = METEORA_DEFAULT_RANGE_BIN_DELTA * 2;
  return Math.max(
    -intervals,
    Math.min(intervals, Math.round(horizontalPixels / (usableWidth / intervals))),
  );
}

export function liquidityDistributionWeight(
  strategy: MeteoraStrategy,
  normalizedPosition: number,
): number {
  const position = Math.max(0, Math.min(1, normalizedPosition));
  const distanceFromCenter = Math.abs((position * 2) - 1);
  if (strategy === 'curve') return 0.38 + (0.62 * (1 - distanceFromCenter));
  if (strategy === 'bid_ask') return 0.38 + (0.62 * distanceFromCenter);
  return 0.72;
}

export function validateAmount(
  value: string,
  decimals: number,
  touched: boolean,
): string | null {
  if (!touched) return null;
  if (!value) return 'Enter an amount';
  if (value.length > 40) return 'Amount is too long';
  if (!/^\d+(?:\.\d+)?$/.test(value)) return 'Use a positive decimal amount';
  const [, fraction = ''] = value.split('.');
  if (fraction.length > decimals) return `Use no more than ${decimals} decimal places`;
  if (!isPositiveDecimal(value)) return 'Amount must be greater than zero';
  return null;
}

export function validateRange(
  minPrice: string,
  maxPrice: string,
  touched: boolean,
): string | null {
  if (!touched) return null;
  if (!minPrice || !maxPrice) return 'Enter both minimum and maximum prices';
  if (!isPositiveDecimal(minPrice) || !isPositiveDecimal(maxPrice)) {
    return 'Prices must be greater than zero';
  }
  if (compareDecimalStrings(minPrice, maxPrice) >= 0) {
    return 'Minimum price must be below maximum price';
  }
  return null;
}

export function validateLimitPrice(
  value: string,
  currentPrice: string | null,
  side: MeteoraLimitSide,
  touched: boolean,
): string | null {
  if (!touched) return null;
  if (!value || !isPositiveDecimal(value)) return 'Enter a target price greater than zero';
  if (!currentPrice || !isPositiveDecimal(currentPrice)) return null;
  const comparison = compareDecimalStrings(value, currentPrice);
  if (side === 'buy' && comparison >= 0) return 'Buy price must be below the current price';
  if (side === 'sell' && comparison <= 0) return 'Sell price must be above the current price';
  return null;
}

export function decimalToAtomic(value: string, decimals: number): string {
  if (!/^\d+(?:\.\d+)?$/.test(value) || !isPositiveDecimal(value)) {
    throw new Error('Amount must be a positive decimal');
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount exceeds ${decimals} decimal places`);
  }
  const atomic = `${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '');
  return atomic || '0';
}

export function isPositiveDecimal(value: string): boolean {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  return /[1-9]/.test(value);
}

export function compareDecimalStrings(left: string, right: string): -1 | 0 | 1 {
  const [leftWhole, leftFraction = ''] = normalizeDecimal(left).split('.');
  const [rightWhole, rightFraction = ''] = normalizeDecimal(right).split('.');
  if (leftWhole.length !== rightWhole.length) {
    return leftWhole.length < rightWhole.length ? -1 : 1;
  }
  if (leftWhole !== rightWhole) return leftWhole < rightWhole ? -1 : 1;
  const width = Math.max(leftFraction.length, rightFraction.length);
  const paddedLeft = leftFraction.padEnd(width, '0');
  const paddedRight = rightFraction.padEnd(width, '0');
  if (paddedLeft === paddedRight) return 0;
  return paddedLeft < paddedRight ? -1 : 1;
}

export function formatPoolPrice(value: string | null, maximumFractionDigits = 8): string {
  if (!value || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (number === 0) return '0';
  if (Math.abs(number) < 0.000001) return number.toExponential(4);
  return number.toLocaleString('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
}

export function formatUsdCompact(value: string | null): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(amount) >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(amount) >= 1_000 ? 1 : 2,
  }).format(amount);
}

export function previewSecondsRemaining(preview: MeteoraPhaseTwoPreview | null): number {
  if (!preview) return 0;
  const remaining = new Date(preview.expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 1_000));
}

function normalizeDecimal(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function formatCalculatedPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const precision = value.toPrecision(12);
  const expanded = precision.includes('e')
    ? expandScientificNotation(precision)
    : precision;
  return expanded.replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
}

function expandScientificNotation(value: string): string {
  const [coefficient, rawExponent] = value.toLowerCase().split('e');
  const exponent = Number(rawExponent);
  if (!coefficient || !Number.isInteger(exponent)) return value;
  const negative = coefficient.startsWith('-');
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const [whole, fraction = ''] = unsigned.split('.');
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  const expanded = decimalIndex <= 0
    ? `0.${'0'.repeat(-decimalIndex)}${digits}`
    : decimalIndex >= digits.length
      ? `${digits}${'0'.repeat(decimalIndex - digits.length)}`
      : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  return negative ? `-${expanded}` : expanded;
}
