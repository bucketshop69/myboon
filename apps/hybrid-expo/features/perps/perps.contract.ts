export const PERPS_VENUE_IDS = ['pacifica', 'phoenix'] as const;

export type PerpsVenueId = (typeof PERPS_VENUE_IDS)[number];
export type PerpsVenueEnvironment = 'mainnet' | 'testnet' | 'devnet' | 'local';
export type PerpsVenueIntegrationStatus = 'active' | 'read_only' | 'incomplete' | 'disabled';
export type PerpsSide = 'long' | 'short';
export type PerpsVenueSide = 'bid' | 'ask';
export type PerpsMarginMode = 'cross' | 'isolated' | 'unknown';
export type PerpsOrderKind = 'market' | 'limit' | 'stop_market' | 'stop_limit' | 'take_profit' | 'stop_loss';
export type PerpsTimeInForce = 'GTC' | 'IOC' | 'FOK' | 'ALO' | 'TOB' | 'unknown';
export type PerpsMarketStatus =
  | 'active'
  | 'post_only'
  | 'paused'
  | 'closed'
  | 'tombstoned'
  | 'maintenance'
  | 'unknown';
export type PerpsDataFreshness = 'live' | 'snapshot' | 'stale' | 'partial' | 'unavailable';
export type PerpsQuoteAsset = 'USD' | 'USDC';
export type PerpsCollateralAsset = 'USDC' | 'USDC-P';

export type PerpsCandleInterval =
  | '1s'
  | '5s'
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '8h'
  | '12h'
  | '1d';

export type PerpsAction =
  | 'deposit'
  | 'withdraw'
  | 'place_order'
  | 'cancel_order'
  | 'close_position'
  | 'set_tpsl';

export type PerpsExecutionMode = 'signed_rest' | 'solana_transaction' | 'read_only_unavailable';
export type PerpsSignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;
export type PerpsSignTransactionFn<TTransaction = unknown> = (transaction: TTransaction) => Promise<TTransaction>;
export type PerpsSignAndSendTransactionFn<TTransaction = unknown> = (transaction: TTransaction) => Promise<string>;

export interface PerpsVenueCapabilities {
  publicMarkets: boolean;
  candles: boolean;
  liveMarketData: boolean;
  accountRead: boolean;
  positionsRead: boolean;
  ordersRead: boolean;
  deposit: boolean;
  withdraw: boolean;
  marketOrder: boolean;
  limitOrder: boolean;
  cancelOrder: boolean;
  closePosition: boolean;
  takeProfitStopLoss: boolean;
  history: boolean;
  messageSigningExecution: boolean;
  transactionSigningExecution: boolean;
  accessCodeRequired?: boolean;
  regionRestricted?: boolean;
  readOnly?: boolean;
  incomplete?: boolean;
}

export interface PerpsVenueDescriptor {
  venueId: PerpsVenueId;
  displayName: string;
  shortName?: string;
  routeBase: string;
  apiBasePath: string;
  env: PerpsVenueEnvironment;
  integrationStatus: PerpsVenueIntegrationStatus;
  quoteAsset: PerpsQuoteAsset;
  defaultCollateralAsset: PerpsCollateralAsset;
  publicRestBaseUrl?: string;
  publicWsBaseUrl?: string;
  collateralMint?: string;
  minDepositUsdc?: number;
  supportedIntervals: readonly PerpsCandleInterval[];
  defaultInterval: PerpsCandleInterval;
  capabilities: PerpsVenueCapabilities;
  notes?: readonly string[];
}

export interface PerpsPrecisionMetadata {
  priceDecimals?: number | null;
  sizeDecimals?: number | null;
  baseLotsDecimals?: number | null;
  priceTickRaw?: string | null;
  baseLotSizeRaw?: string | null;
  leverageTiers?: readonly PerpsLeverageTier[];
}

export interface PerpsLeverageTier {
  maxLeverage: number;
  notionalCapUsd?: number | null;
}

export interface PerpsMarket {
  venueId: PerpsVenueId;
  symbol: string;
  venueSymbol: string;
  baseSymbol: string;
  quoteSymbol: PerpsQuoteAsset;
  displayName: string;
  iconPath?: string | null;
  status: PerpsMarketStatus;
  tradeable: boolean;
  dataFreshness: PerpsDataFreshness;
  updatedAt?: number | null;
  maxLeverage: number | null;
  marginModes: readonly PerpsMarginMode[];
  isolatedOnly?: boolean;
  tickSize: string | null;
  lotSize: string | null;
  minOrderSize: string | null;
  minOrderSizeUsd?: number | null;
  maxOrderSizeUsd?: number | null;
  precision?: PerpsPrecisionMetadata;
  markPrice: number | null;
  oraclePrice: number | null;
  midPrice: number | null;
  fundingRate: number | null;
  openInterest: number | null;
  volume24h: number | null;
  change24h: number | null;
  yesterdayPrice: number | null;
  raw?: unknown;
}

export interface PerpsCandle {
  venueId: PerpsVenueId;
  symbol: string;
  venueSymbol: string;
  interval: PerpsCandleInterval;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: 'trade' | 'mark' | 'oracle' | 'unknown';
}

export interface PerpsLiveMarketUpdate {
  venueId: PerpsVenueId;
  symbol: string;
  venueSymbol: string;
  markPrice?: number | null;
  oraclePrice?: number | null;
  midPrice?: number | null;
  fundingRate?: number | null;
  openInterest?: number | null;
  volume24h?: number | null;
  timestamp?: number | null;
  dataFreshness: PerpsDataFreshness;
}

export interface PerpsWalletCapabilities {
  connected: boolean;
  address: string | null;
  source?: 'privy' | 'mwa' | 'web' | 'e2e' | 'unknown';
  isPreparing?: boolean;
  canSignMessage: boolean;
  canSignTransaction: boolean;
  canSignAndSendTransaction: boolean;
}

export interface PerpsExecutionContext<TTransaction = unknown> {
  wallet: PerpsWalletCapabilities;
  signMessage?: PerpsSignMessageFn | null;
  signTransaction?: PerpsSignTransactionFn<TTransaction> | null;
  signAndSendTransaction?: PerpsSignAndSendTransactionFn<TTransaction> | null;
}

export type PerpsReadinessStatus =
  | 'disconnected'
  | 'wallet_preparing'
  | 'wallet_unsupported'
  | 'access_required'
  | 'region_blocked'
  | 'account_missing'
  | 'deposit_required'
  | 'ready'
  | 'risk_blocked'
  | 'market_unavailable'
  | 'maintenance'
  | 'read_only'
  | 'data_unavailable';

export type PerpsReadinessRequirement =
  | 'connect_wallet'
  | 'sign_message'
  | 'sign_transaction'
  | 'access_code'
  | 'region_ok'
  | 'deposit'
  | 'risk_reduction';

export interface PerpsReadiness {
  venueId: PerpsVenueId;
  status: PerpsReadinessStatus;
  canView: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  canTrade: boolean;
  canCancel: boolean;
  wallet: PerpsWalletCapabilities;
  reasonCode?: PerpsErrorCode;
  message?: string;
  requirements?: readonly PerpsReadinessRequirement[];
}

export interface PerpsAccount {
  venueId: PerpsVenueId;
  authority: string;
  accountId?: string | null;
  portfolioIndex?: number | null;
  subaccountIndex?: number | null;
  status: 'active' | 'missing' | 'restricted' | 'liquidatable' | 'unknown';
  equity: number | null;
  availableToSpend: number | null;
  availableToWithdraw: number | null;
  totalMarginUsed: number | null;
  unrealizedPnl?: number | null;
  positionsCount: number;
  ordersCount: number;
  riskTier?: string | null;
  updatedAt?: number | null;
  raw?: unknown;
}

export interface PerpsBalanceSummary {
  venueId: PerpsVenueId;
  authority: string;
  walletUsdc?: number | null;
  venueCollateralUsdc?: number | null;
  pendingDepositUsdc?: number | null;
  pendingWithdrawUsdc?: number | null;
  withdrawQueueState?: 'none' | 'queued' | 'processing' | 'failed' | 'unknown';
}

export interface PerpsPosition {
  id: string;
  venueId: PerpsVenueId;
  symbol: string;
  venueSymbol: string;
  side: PerpsSide;
  marginMode: PerpsMarginMode;
  size: number;
  sizeRaw?: string | null;
  notionalUsd?: number | null;
  entryPrice: number | null;
  markPrice: number | null;
  liquidationPrice?: number | null;
  leverage?: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  fundingPnl?: number | null;
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
  openedAt?: number | null;
  updatedAt?: number | null;
  raw?: unknown;
}

export type PerpsOrderStatus =
  | 'open'
  | 'pending'
  | 'filled'
  | 'cancel_requested'
  | 'cancelled'
  | 'rejected'
  | 'unknown';

export interface PerpsOrder {
  id: string;
  venueId: PerpsVenueId;
  venueOrderId?: string | number | null;
  clientOrderId?: string | null;
  symbol: string;
  venueSymbol: string;
  side: PerpsSide;
  venueSide?: PerpsVenueSide;
  orderKind: PerpsOrderKind;
  status: PerpsOrderStatus;
  price: number | null;
  triggerPrice?: number | null;
  stopPrice?: number | null;
  size: number | null;
  filledSize?: number | null;
  remainingSize?: number | null;
  reduceOnly: boolean;
  postOnly?: boolean;
  timeInForce?: PerpsTimeInForce;
  createdAt?: number | null;
  updatedAt?: number | null;
  raw?: unknown;
}

export interface PerpsTpSlInput {
  takeProfitTriggerPrice?: string;
  takeProfitLimitPrice?: string;
  stopLossTriggerPrice?: string;
  stopLossLimitPrice?: string;
  executionType?: 'market' | 'limit';
}

export interface PerpsOrderInput {
  venueId: PerpsVenueId;
  authority: string;
  symbol: string;
  side: PerpsSide;
  orderType: 'market' | 'limit';
  amountMode: 'notional_usdc' | 'base';
  amount: string;
  limitPrice?: string;
  slippageBps?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  timeInForce?: PerpsTimeInForce;
  tpSl?: PerpsTpSlInput;
  clientOrderId?: string;
}

export interface PerpsTransferInput {
  venueId: PerpsVenueId;
  authority: string;
  amountUsdc: string;
}

export interface PerpsCancelOrderInput {
  venueId: PerpsVenueId;
  authority: string;
  order: Pick<PerpsOrder, 'id' | 'venueOrderId' | 'symbol' | 'venueSymbol' | 'orderKind' | 'raw'>;
}

export interface PerpsSetTpSlInput {
  venueId: PerpsVenueId;
  authority: string;
  symbol: string;
  positionId?: string;
  tpSl: PerpsTpSlInput;
}

export interface PerpsBuiltTransaction {
  venueId: PerpsVenueId;
  mode: 'solana_transaction';
  action: PerpsAction;
  instructions: readonly PerpsInstructionDto[];
  estimatedLiquidationPrice?: number | null;
  warnings?: readonly string[];
  raw?: unknown;
}

export interface PerpsInstructionDto {
  programId: string;
  keys: readonly PerpsInstructionAccountMeta[];
  data: string;
}

export interface PerpsInstructionAccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface PerpsExecutionResult {
  venueId: PerpsVenueId;
  action: PerpsAction;
  status: 'built' | 'submitted' | 'confirmed' | 'partial_success' | 'failed';
  mode?: PerpsExecutionMode;
  orderId?: string | null;
  txSignature?: string | null;
  operationId?: string | null;
  warnings?: readonly string[];
  refreshAfterMs?: number;
  error?: PerpsError;
}

export type PerpsErrorCode =
  | 'WALLET_DISCONNECTED'
  | 'WALLET_PREPARING'
  | 'WALLET_MESSAGE_UNSUPPORTED'
  | 'WALLET_TX_UNSUPPORTED'
  | 'WALLET_REJECTED'
  | 'ACCESS_REQUIRED'
  | 'REGION_BLOCKED'
  | 'ACCOUNT_MISSING'
  | 'DEPOSIT_REQUIRED'
  | 'INSUFFICIENT_WALLET_USDC'
  | 'INSUFFICIENT_COLLATERAL'
  | 'AMOUNT_TOO_SMALL'
  | 'PRICE_TICK_INVALID'
  | 'UNSUPPORTED_INTERVAL'
  | 'MARKET_INACTIVE'
  | 'RISK_BLOCKED'
  | 'REDUCE_ONLY_WOULD_INCREASE'
  | 'SLIPPAGE_EXCEEDED'
  | 'ORDER_NOT_FILLED'
  | 'ORDER_NOT_FOUND'
  | 'TX_BUILD_FAILED'
  | 'TX_SEND_FAILED'
  | 'TX_EXPIRED'
  | 'TX_UNCONFIRMED'
  | 'WITHDRAW_QUEUED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'DATA_STALE'
  | 'UNKNOWN';

export interface PerpsError {
  code: PerpsErrorCode;
  message: string;
  retryable: boolean;
  venueId?: PerpsVenueId;
  cause?: unknown;
}

export interface PerpsCandleQuery {
  symbol: string;
  interval: PerpsCandleInterval;
  count?: number;
  startTime?: number;
  endTime?: number;
}

export interface PerpsReadinessInput {
  authority: string | null;
  wallet: PerpsWalletCapabilities;
  symbol?: string;
}

export interface PerpsPublicDataAdapter {
  descriptor: PerpsVenueDescriptor;
  getMarkets(): Promise<readonly PerpsMarket[]>;
  getMarket(symbol: string): Promise<PerpsMarket>;
  getCandles(query: PerpsCandleQuery): Promise<readonly PerpsCandle[]>;
  getAccount(authority: string): Promise<PerpsAccount | null>;
  getPositions(authority: string): Promise<readonly PerpsPosition[]>;
  getOpenOrders(authority: string): Promise<readonly PerpsOrder[]>;
  subscribeMarket?(symbol: string, onUpdate: (update: PerpsLiveMarketUpdate) => void): () => void;
}

export interface PerpsExecutionAdapter {
  descriptor: PerpsVenueDescriptor;
  getReadiness(input: PerpsReadinessInput): Promise<PerpsReadiness>;
  deposit(input: PerpsTransferInput, context?: PerpsExecutionContext): Promise<PerpsExecutionResult>;
  withdraw(input: PerpsTransferInput, context?: PerpsExecutionContext): Promise<PerpsExecutionResult>;
  placeOrder(input: PerpsOrderInput, context?: PerpsExecutionContext): Promise<PerpsExecutionResult>;
  closePosition(input: PerpsOrderInput, context?: PerpsExecutionContext): Promise<PerpsExecutionResult>;
  cancelOrder(input: PerpsCancelOrderInput, context?: PerpsExecutionContext): Promise<PerpsExecutionResult>;
  setTpSl(input: PerpsSetTpSlInput, context?: PerpsExecutionContext): Promise<PerpsExecutionResult>;
}
