import { Decimal } from 'decimal.js';

export interface MarketInfo {
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

export interface PriceInfo {
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

export interface AccountInfo {
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
  stop_orders_count: number;
  updated_at: number;
}

export interface Position {
  symbol: string;
  side: 'bid' | 'ask';
  amount: string;
  entry_price: string;
  funding: string;
  isolated: boolean;
  created_at: number;
  updated_at: number;
}

export interface Order {
  order_id: number;
  client_order_id: string;
  symbol: string;
  side: 'bid' | 'ask';
  price: string;
  initial_amount: string;
  filled_amount: string;
  cancelled_amount: string;
  order_type: 'market' | 'limit' | 'stop_limit' | 'stop_market';
  reduce_only: boolean;
  created_at: number;
  updated_at: number;
}

export interface CreateMarketOrderParams {
  symbol: string;
  amount: string | Decimal;
  side: 'bid' | 'ask';
  slippagePercent: string | Decimal;
  reduceOnly: boolean;
  clientOrderId?: string;
  takeProfit?: { stopPrice: string | Decimal; limitPrice: string | Decimal };
  stopLoss?: { stopPrice: string | Decimal; limitPrice: string | Decimal };
  builderCode?: string;
}

export interface CreateLimitOrderParams {
  symbol: string;
  price: string | Decimal;
  amount: string | Decimal;
  side: 'bid' | 'ask';
  tif: 'GTC' | 'IOC' | 'ALO' | 'TOB';
  reduceOnly: boolean;
  clientOrderId?: string;
  builderCode?: string;
}

export interface SetTPSLParams {
  symbol: string;
  side: 'bid' | 'ask';
  takeProfit?: { stopPrice: string | Decimal; limitPrice: string | Decimal };
  stopLoss?: { stopPrice: string | Decimal; limitPrice: string | Decimal };
  builderCode?: string;
}

export class PacificApiError extends Error {
  constructor(public code: number, public status: number, message: string) {
    super(message);
    this.name = 'PacificApiError';
  }
}

export class RateLimitError extends Error {
  constructor(public resetAfterMs: number) {
    super(`Rate limit exceeded. Try again in ${resetAfterMs}ms`);
    this.name = 'RateLimitError';
  }
}
