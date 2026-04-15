// Raw API response shapes — Pacific Protocol REST
export interface RawMarketInfo {
  symbol: string;
  tick_size: string;
  lot_size: string;
  max_leverage: number;
  min_order_size: string;
  max_order_size: string;
  funding_rate: string;
  next_funding_rate: string;
  isolated_only: boolean;
  created_at: number;
}

export interface RawPriceInfo {
  symbol: string;
  oracle: string;
  mark: string;
  mid: string;
  funding: string;
  next_funding: string;
  open_interest: string;
  volume_24h: string;
  yesterday_price: string;
  timestamp: number;
}

export interface RawPosition {
  symbol: string;
  side: 'bid' | 'ask';
  amount: string;
  entry_price: string;
  funding: string;
  isolated: boolean;
  created_at: number;
  updated_at: number;
}

export interface RawAccountInfo {
  balance: string;
  account_equity: string;
  available_to_spend: string;
  available_to_withdraw: string;
  total_margin_used: string;
  cross_mmr: string;
  fee_level: number;
  maker_fee: string;
  taker_fee: string;
  positions_count: number;
  orders_count: number;
  updated_at: number;
}

// Display-ready merged type (MarketInfo + PriceInfo combined)
export interface PerpsMarket {
  symbol: string;
  maxLeverage: number;
  tickSize: string;
  lotSize: string;
  minOrderSize: string;
  // Live price data
  markPrice: number;
  oraclePrice: number;
  midPrice: number;
  fundingRate: number;    // per 8h as decimal, e.g. 0.00012
  openInterest: number;   // USD notional
  volume24h: number;      // USD
  change24h: number;      // percentage, e.g. 2.14 means +2.14%
  yesterdayPrice: number;
}

export interface PerpsPosition {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;    // USD
  unrealizedPnlPct: number; // percentage
}

export interface PerpsAccount {
  equity: number;
  availableToSpend: number;
  totalMarginUsed: number;
  positionsCount: number;
}

// Kline / candle data from /api/v1/kline
export interface RawCandle {
  t: number;   // candle start time (ms)
  T: number;   // candle end time (ms)
  s: string;   // symbol
  i: string;   // interval
  o: string;   // open
  c: string;   // close
  h: string;   // high
  l: string;   // low
  v: string;   // volume
  n: number;   // number of trades
}

export interface Candle {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

// Open orders (TP/SL, limit, stop)
export interface RawOrder {
  order_id: number;
  client_order_id: string | null;
  symbol: string;
  side: 'bid' | 'ask';
  price: string;
  initial_amount: string;
  filled_amount: string;
  cancelled_amount: string;
  stop_price: string | null;
  order_type: string; // 'take_profit_limit' | 'stop_loss_limit' | 'limit' | 'market' etc.
  stop_parent_order_id: number | null;
  trigger_price_type: string | null;
  reduce_only: boolean;
  instrument_type: string;
  created_at: number;
  updated_at: number;
}

export interface PerpsOrder {
  orderId: number;
  symbol: string;
  side: 'bid' | 'ask';
  price: number;
  stopPrice: number | null;
  orderType: string;
  reduceOnly: boolean;
  createdAt: number;
}

export interface LivePriceUpdate {
  mark: string;
  oracle: string;
  funding: string;
  openInterest: string;
}
