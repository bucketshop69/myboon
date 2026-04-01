import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {
  MarketInfo,
  PriceInfo,
  AccountInfo,
  Position,
  Order,
  CreateMarketOrderParams,
  CreateLimitOrderParams,
  SetTPSLParams,
  PacificApiError,
  RateLimitError
} from './types';

export const PACIFIC_CONFIG = {
  mainnet: {
    rest: 'https://api.pacifica.fi/api/v1',
    ws: 'wss://ws.pacifica.fi/ws',
  },
  testnet: {
    rest: 'https://test-api.pacifica.fi/api/v1',
    ws: 'wss://test-ws.pacifica.fi/ws',
  },
};

export class PacificClient {
  private baseUrl: string;

  constructor(
    public readonly env: 'mainnet' | 'testnet' = 'mainnet',
    private readonly keypair?: Keypair
  ) {
    this.baseUrl = PACIFIC_CONFIG[env].rest;
  }

  // --- Core Fetcher ---

  private async fetch(endpoint: string, options?: RequestInit): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Auto-retry on rate limit (simple backoff not fully implemented here to keep it async linear, instead we'll throw RateLimitError so consumer can decide)
    const response = await fetch(url, options);

    // Rate Limit Checks
    const remaining = response.headers.get('ratelimit');
    if (remaining) {
      const creditsRemaining = parseInt(remaining, 10) / 10;
      if (creditsRemaining < 5) {
        console.warn(`[PacificClient] Warning: Low rate limit credits remaining: ${creditsRemaining}`);
      }
    }

    if (response.status === 429) {
      throw new RateLimitError(5000); // Wait 5s on 429
    }

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new PacificApiError(
        data.code || 0,
        response.status,
        data.error || response.statusText || 'Unknown error'
      );
    }

    return data;
  }

  // --- Authentication / Signing ---

  private signRequest(type: string, payload: Record<string, any>, expiryWindow = 5000) {
    if (!this.keypair) {
      throw new Error("PacificClient: Keypair is required for authenticated requests");
    }

    const timestamp = Date.now();
    const header = {
      timestamp,
      expiry_window: expiryWindow,
      type,
      data: payload,
    };

    // Deterministic JSON serialization
    const message = JSON.stringify(header, Object.keys(header).sort());
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(message), this.keypair.secretKey)
    );

    return { timestamp, signature };
  }

  private async authenticatedPost(endpoint: string, type: string, payload: Record<string, any>) {
    if (!this.keypair) {
      throw new Error("PacificClient: Keypair is required for authenticated requests");
    }

    const { timestamp, signature } = this.signRequest(type, payload);
    
    const requestBody = {
      account: this.keypair.publicKey.toString(),
      signature,
      timestamp,
      expiry_window: 5000,
      ...payload,
    };

    return this.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  }

  // --- Public Unauthenticated Endpoints ---

  async getMarkets(): Promise<MarketInfo[]> {
    const res = await this.fetch('/info');
    return res.data;
  }

  async getPrices(): Promise<PriceInfo[]> {
    const res = await this.fetch('/info/prices');
    return res.data;
  }

  // --- Public Authenticated Endpoints ---

  async getAccountInfo(address: string): Promise<AccountInfo> {
    const res = await this.fetch(`/account?account=${address}`);
    return res.data;
  }

  async getPositions(address: string): Promise<{ positions: Position[]; lastOrderId: number }> {
    const res = await this.fetch(`/positions?account=${address}`);
    return { positions: res.data, lastOrderId: res.last_order_id };
  }

  async getOpenOrders(address: string): Promise<{ orders: Order[]; lastOrderId: number }> {
    const res = await this.fetch(`/orders?account=${address}`);
    return { orders: res.data, lastOrderId: res.last_order_id };
  }

  // --- Trading Endpoints ---

  async createMarketOrder(params: CreateMarketOrderParams): Promise<number> {
    const payload: Record<string, any> = {
      symbol: params.symbol,
      amount: params.amount.toString(),
      side: params.side,
      slippage_percent: params.slippagePercent.toString(),
      reduce_only: params.reduceOnly,
      client_order_id: params.clientOrderId || crypto.randomUUID(),
    };

    if (params.takeProfit) {
      payload.take_profit = {
        stop_price: params.takeProfit.stopPrice.toString(),
        limit_price: params.takeProfit.limitPrice.toString(),
        client_order_id: crypto.randomUUID(),
      };
    }

    if (params.stopLoss) {
      payload.stop_loss = {
        stop_price: params.stopLoss.stopPrice.toString(),
        limit_price: params.stopLoss.limitPrice.toString(),
        client_order_id: crypto.randomUUID(),
      };
    }

    if (params.builderCode) {
      payload.builder_code = params.builderCode;
    }

    const res = await this.authenticatedPost('/orders/create_market', 'create_market_order', payload);
    return res.order_id;
  }

  async createLimitOrder(params: CreateLimitOrderParams): Promise<number> {
    const payload: Record<string, any> = {
      symbol: params.symbol,
      price: params.price.toString(),
      amount: params.amount.toString(),
      side: params.side,
      tif: params.tif,
      reduce_only: params.reduceOnly,
      client_order_id: params.clientOrderId || crypto.randomUUID(),
    };

    if (params.builderCode) {
      payload.builder_code = params.builderCode;
    }

    const res = await this.authenticatedPost('/orders/create', 'create_order', payload);
    return res.order_id;
  }

  async cancelOrder(orderId: number): Promise<boolean> {
    await this.authenticatedPost('/orders/cancel', 'cancel_order', { order_id: orderId });
    return true;
  }

  async cancelAllOrders(): Promise<boolean> {
    await this.authenticatedPost('/orders/cancel_all', 'cancel_all_orders', {});
    return true;
  }

  async setTPSL(params: SetTPSLParams): Promise<boolean> {
    const payload: Record<string, any> = {
      symbol: params.symbol,
      side: params.side,
    };

    if (params.takeProfit) {
      payload.take_profit = {
        stop_price: params.takeProfit.stopPrice.toString(),
        limit_price: params.takeProfit.limitPrice.toString(),
        client_order_id: crypto.randomUUID(),
      };
    }

    if (params.stopLoss) {
      payload.stop_loss = {
        stop_price: params.stopLoss.stopPrice.toString(),
        limit_price: params.stopLoss.limitPrice.toString(),
        client_order_id: crypto.randomUUID(),
      };
    }

    if (params.builderCode) {
      payload.builder_code = params.builderCode;
    }

    await this.authenticatedPost('/positions/tpsl', 'set_position_tpsl', payload);
    return true;
  }

  // --- Builder Code API ---
  
  async approveBuilderCode(builderCode: string, maxFeeRate: string = '0.001'): Promise<boolean> {
    const payload = {
      builder_code: builderCode,
      max_fee_rate: maxFeeRate,
    };
    await this.authenticatedPost('/account/builder_codes/approve', 'approve_builder_code', payload);
    return true;
  }
}
