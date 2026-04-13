import type {
  Candle,
  PerpsAccount,
  PerpsMarket,
  PerpsOrder,
  PerpsPosition,
  RawAccountInfo,
  RawCandle,
  RawMarketInfo,
  RawOrder,
  RawPosition,
  RawPriceInfo,
} from '@/features/perps/perps.types';

import bs58 from 'bs58';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  PACIFIC_REST,
  PACIFIC_PROGRAM_ID,
  PACIFIC_CENTRAL_STATE,
  PACIFIC_VAULT,
  USDC_MINT,
} from '@/features/perps/pacific.config';

function safeNum(val: unknown): number {
  const n = parseFloat(String(val));
  return Number.isFinite(n) ? n : 0;
}

// ─── Signing helpers (matches Python SDK's common/utils.py) ─────────────────

type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

/** Deep-sort all object keys recursively (matches Python SDK sort_json_keys) */
function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortJsonKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Build the signing message exactly as Pacific expects */
function buildSigningMessage(
  type: string,
  payload: Record<string, unknown>,
  timestamp: number,
  expiryWindow: number = 60000,
): string {
  const header = {
    timestamp,
    expiry_window: expiryWindow,
    type,
    data: payload,
  };
  return JSON.stringify(sortJsonKeys(header));
}


/** Sign and POST to Pacific authenticated endpoint */
async function pacificSignedPost(
  path: string,
  type: string,
  payload: Record<string, unknown>,
  account: string,
  signMessage: SignMessageFn,
  expiryWindow: number = 30000,
): Promise<any> {
  const timestamp = Date.now();
  const message = buildSigningMessage(type, payload, timestamp, expiryWindow);
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = await signMessage(messageBytes);
  console.log('[Pacific] signMessage returned', signatureBytes.length, 'bytes');

  // bs58 encode the signature (same as lpcli)
  const encoded = bs58.encode(signatureBytes);

  const body = {
    account,
    signature: encoded,
    timestamp,
    expiry_window: expiryWindow,
    ...payload,
  };

  // Debug: log hex of sig + pubkey for offline verification
  const sigHex = Array.from(signatureBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const pubHex = Array.from(new PublicKey(account).toBytes()).map(b => b.toString(16).padStart(2, '0')).join('');
  console.log('[Pacific] sig hex:', sigHex);
  console.log('[Pacific] pub hex:', pubHex);

  console.log('[Pacific] POST', path, 'type:', type);
  console.log('[Pacific] message to sign:', message);
  console.log('[Pacific] body:', JSON.stringify(body));

  const res = await fetch(`${PACIFIC_REST}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error('Rate limit — try again shortly');
  const text = await res.text();
  console.log('[Pacific] Response (HTTP', res.status, '):', text.slice(0, 500));
  let json: any;
  try {
    json = JSON.parse(text);
  } catch (parseErr) {
    console.error('[Pacific] JSON parse failed:', parseErr, 'raw:', text.slice(0, 200));
    throw new Error(`Bad response from Pacific (HTTP ${res.status}): ${text.slice(0, 100)}`);
  }
  if (!res.ok || json.success === false) {
    console.error('[Pacific] API error:', json.error ?? json.message ?? text);
    const err = new Error(json.error ?? json.message ?? text ?? `HTTP ${res.status}`);
    (err as any).code = json.code ?? res.status;
    throw err;
  }
  return json;
}

// ─── Public GET helper ──────────────────────────────────────────────────────

async function pacificGet<T>(path: string): Promise<T> {
  const res = await fetch(`${PACIFIC_REST}${path}`);
  if (res.status === 429) throw new Error('Rate limit — try again shortly');
  const json = (await res.json()) as { success?: boolean; data?: T; error?: string };
  if (!res.ok || json.success === false) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

export async function fetchPerpsMarkets(): Promise<PerpsMarket[]> {
  const [markets, prices] = await Promise.all([
    pacificGet<RawMarketInfo[]>('/info'),
    pacificGet<RawPriceInfo[]>('/info/prices'),
  ]);

  const priceMap = new Map(prices.map((p) => [p.symbol, p]));

  return markets
    .map((m): PerpsMarket | null => {
      const p = priceMap.get(m.symbol);
      if (!p) return null;

      const mark = safeNum(p.mark);
      const yesterday = safeNum(p.yesterday_price);
      const change24h = yesterday > 0 ? ((mark - yesterday) / yesterday) * 100 : 0;

      return {
        symbol: m.symbol,
        maxLeverage: m.max_leverage,
        tickSize: m.tick_size,
        lotSize: m.lot_size,
        minOrderSize: m.min_order_size,
        markPrice: mark,
        oraclePrice: safeNum(p.oracle),
        midPrice: safeNum(p.mid),
        fundingRate: safeNum(p.funding),
        openInterest: safeNum(p.open_interest),
        volume24h: safeNum(p.volume_24h),
        change24h,
        yesterdayPrice: yesterday,
      };
    })
    .filter((m): m is PerpsMarket => m !== null)
    .sort((a, b) => b.volume24h - a.volume24h);
}

export async function fetchPerpsPositions(address: string): Promise<PerpsPosition[]> {
  const [rawPositions, prices] = await Promise.all([
    pacificGet<RawPosition[]>(`/positions?account=${encodeURIComponent(address)}`),
    pacificGet<RawPriceInfo[]>('/info/prices'),
  ]);

  const priceMap = new Map(prices.map((p) => [p.symbol, safeNum(p.mark)]));

  return rawPositions.map((pos): PerpsPosition => {
    const entry = safeNum(pos.entry_price);
    const size = safeNum(pos.amount);
    const mark = priceMap.get(pos.symbol) ?? entry;
    const side = pos.side === 'bid' ? 'long' : ('short' as const);
    const direction = side === 'long' ? 1 : -1;
    const pnl = (mark - entry) * size * direction;
    const pnlPct = entry > 0 && size > 0 ? (pnl / (entry * size)) * 100 : 0;

    return { symbol: pos.symbol, side, size, entryPrice: entry, markPrice: mark, unrealizedPnl: pnl, unrealizedPnlPct: pnlPct };
  });
}

export async function fetchPerpsAccount(address: string): Promise<PerpsAccount> {
  const acc = await pacificGet<RawAccountInfo>(`/account?account=${encodeURIComponent(address)}`);
  return {
    equity: safeNum(acc.account_equity),
    availableToSpend: safeNum(acc.available_to_spend),
    totalMarginUsed: safeNum(acc.total_margin_used),
    positionsCount: acc.positions_count,
  };
}

// ─── Open orders ───────────────────────────────────────────────────────────

export async function fetchOpenOrders(address: string): Promise<PerpsOrder[]> {
  const raw = await pacificGet<RawOrder[]>(`/orders?account=${encodeURIComponent(address)}`);
  return raw.map((o): PerpsOrder => ({
    orderId: o.order_id,
    symbol: o.symbol,
    side: o.side,
    price: safeNum(o.price),
    stopPrice: o.stop_price ? safeNum(o.stop_price) : null,
    orderType: o.order_type,
    reduceOnly: o.reduce_only,
    createdAt: o.created_at,
  }));
}

export async function cancelOrder(
  orderId: number,
  symbol: string,
  account: string,
  signMessage: SignMessageFn,
): Promise<void> {
  await pacificSignedPost('/orders/cancel', 'cancel_order', { symbol, order_id: orderId }, account, signMessage);
}

/** Cancel a stop order (TP/SL) via the dedicated stop cancel endpoint */
export async function cancelStopOrder(
  orderId: number,
  symbol: string,
  account: string,
  signMessage: SignMessageFn,
): Promise<void> {
  await pacificSignedPost('/orders/stop/cancel', 'cancel_stop_order', { symbol, order_id: orderId }, account, signMessage);
}

/**
 * Remove a TP or SL by re-calling /positions/tpsl.
 * Sends null for the field to clear, preserves the other.
 */
export async function removeTPSL(
  symbol: string,
  side: 'bid' | 'ask',
  remove: 'tp' | 'sl' | 'both',
  account: string,
  signMessage: SignMessageFn,
  currentOrders: PerpsOrder[],
): Promise<void> {
  const payload: Record<string, unknown> = { symbol, side };

  // Send stop_price "0" to clear a field, preserve the other
  if (remove === 'tp' || remove === 'both') {
    payload.take_profit = { stop_price: '0', limit_price: '0', client_order_id: crypto.randomUUID() };
  } else {
    const tp = currentOrders.find(o => o.symbol === symbol && o.orderType === 'take_profit_limit');
    if (tp?.stopPrice) {
      payload.take_profit = {
        stop_price: tp.stopPrice.toString(),
        limit_price: tp.stopPrice.toString(),
        client_order_id: crypto.randomUUID(),
      };
    }
  }

  if (remove === 'sl' || remove === 'both') {
    payload.stop_loss = { stop_price: '0', limit_price: '0', client_order_id: crypto.randomUUID() };
  } else {
    const sl = currentOrders.find(o => o.symbol === symbol && o.orderType === 'stop_loss_limit');
    if (sl?.stopPrice) {
      payload.stop_loss = {
        stop_price: sl.stopPrice.toString(),
        limit_price: sl.stopPrice.toString(),
        client_order_id: crypto.randomUUID(),
      };
    }
  }

  await pacificSignedPost('/positions/tpsl', 'set_position_tpsl', payload, account, signMessage);
}

// ─── Candle / kline data ────────────────────────────────────────────────────

export type CandleInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d';

/** Duration in ms for each interval — used to compute start_time */
const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000,
  '30m': 1_800_000, '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000,
  '8h': 28_800_000, '12h': 43_200_000, '1d': 86_400_000,
};

export async function fetchCandles(
  symbol: string,
  interval: CandleInterval,
  count: number = 100,
): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - INTERVAL_MS[interval] * count;
  const params = new URLSearchParams({
    symbol,
    interval,
    start_time: String(startTime),
    end_time: String(endTime),
  });
  const raw = await pacificGet<RawCandle[]>(`/kline?${params}`);
  return raw.map((c) => ({
    time: c.t,
    open: safeNum(c.o),
    close: safeNum(c.c),
    high: safeNum(c.h),
    low: safeNum(c.l),
    volume: safeNum(c.v),
  }));
}

// ─── Trade execution (signed API calls) ─────────────────────────────────────

export async function placeOrder(
  params: {
    symbol: string;
    side: 'bid' | 'ask';
    /** Amount in USDC (UI value). Converted to asset units internally. */
    amountUsdc: number;
    slippage: string;
    builderCode?: string;
  },
  account: string,
  signMessage: SignMessageFn,
): Promise<number> {
  // Fetch market info to get mark price and lot_size for conversion
  const [markets, prices] = await Promise.all([
    pacificGet<RawMarketInfo[]>('/info'),
    pacificGet<RawPriceInfo[]>('/info/prices'),
  ]);
  const market = markets.find((m) => m.symbol === params.symbol);
  const price = prices.find((p) => p.symbol === params.symbol);
  if (!market || !price) throw new Error(`Market ${params.symbol} not found`);

  const markPrice = safeNum(price.mark);
  if (markPrice <= 0) throw new Error('Invalid mark price');

  // Convert USDC to asset units: $50 at SOL=$150 → 0.333 SOL
  const rawAmount = params.amountUsdc / markPrice;

  // Round down to lot_size (same as lpcli's roundToLotSize)
  const lotSize = parseFloat(market.lot_size);
  const amount = lotSize > 0
    ? Math.floor(rawAmount / lotSize) * lotSize
    : rawAmount;

  if (amount <= 0) {
    throw new Error(`Amount too small — minimum lot size is ${market.lot_size} ${params.symbol}`);
  }

  const payload: Record<string, unknown> = {
    symbol: params.symbol,
    side: params.side,
    amount: amount.toString(),
    slippage_percent: params.slippage,
    reduce_only: false,
    client_order_id: crypto.randomUUID(),
  };
  if (params.builderCode) {
    payload.builder_code = params.builderCode;
  }
  const res = await pacificSignedPost(
    '/orders/create_market',
    'create_market_order',
    payload,
    account,
    signMessage,
  );
  return res.data?.order_id ?? res.order_id;
}

export async function closePosition(
  symbol: string,
  side: 'bid' | 'ask',
  amount: number,
  account: string,
  signMessage: SignMessageFn,
  builderCode?: string,
): Promise<number> {
  // Fetch market info to format amount to lot_size precision (server may normalise)
  const markets = await pacificGet<RawMarketInfo[]>('/info');
  const market = markets.find((m) => m.symbol === symbol);
  if (!market) throw new Error(`Market ${symbol} not found`);

  const lotSize = parseFloat(market.lot_size);
  const rounded = lotSize > 0
    ? Math.floor(amount / lotSize) * lotSize
    : amount;

  // Format with lot_size decimal precision so "25" becomes "25.0" if lot_size is "0.1"
  const decimals = market.lot_size.includes('.')
    ? market.lot_size.split('.')[1].length
    : 0;
  const amountStr = rounded.toFixed(decimals);

  const payload: Record<string, unknown> = {
    symbol,
    side,
    amount: amountStr,
    slippage_percent: '1',
    reduce_only: true,
    client_order_id: crypto.randomUUID(),
  };
  if (builderCode) {
    payload.builder_code = builderCode;
  }
  const res = await pacificSignedPost(
    '/orders/create_market',
    'create_market_order',
    payload,
    account,
    signMessage,
  );
  return res.data?.order_id ?? res.order_id;
}

// ─── TP/SL on existing position ─────────────────────────────────────────────

export async function setTPSL(
  params: {
    symbol: string;
    side: 'bid' | 'ask';
    takeProfit?: { stopPrice: string; limitPrice: string };
    stopLoss?: { stopPrice: string; limitPrice: string };
    builderCode?: string;
  },
  account: string,
  signMessage: SignMessageFn,
): Promise<void> {
  const payload: Record<string, unknown> = {
    symbol: params.symbol,
    side: params.side,
  };

  if (params.takeProfit) {
    payload.take_profit = {
      stop_price: params.takeProfit.stopPrice,
      limit_price: params.takeProfit.limitPrice,
      client_order_id: crypto.randomUUID(),
    };
  }

  if (params.stopLoss) {
    payload.stop_loss = {
      stop_price: params.stopLoss.stopPrice,
      limit_price: params.stopLoss.limitPrice,
      client_order_id: crypto.randomUUID(),
    };
  }

  if (params.builderCode) {
    payload.builder_code = params.builderCode;
  }

  await pacificSignedPost('/positions/tpsl', 'set_position_tpsl', payload, account, signMessage);
}

// ─── Withdrawal (signed API call) ───────────────────────────────────────────

export async function requestWithdrawal(
  amountUsdc: number,
  account: string,
  signMessage: SignMessageFn,
): Promise<void> {
  await pacificSignedPost(
    '/account/withdraw',
    'withdraw',
    { amount: amountUsdc.toFixed(6) },
    account,
    signMessage,
    30000,
  );
}

// Format helpers used across screens

export function formatPrice(price: number): string {
  if (price === 0) return '--';
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(3)}`;
  if (price >= 0.001) return `$${price.toFixed(6)}`;
  return `$${price.toExponential(3)}`;
}

export function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export function formatUsdCompact(value: number): string {
  if (value === 0) return '--';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatFunding(rate: number): string {
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${(rate * 100).toFixed(4)}%`;
}

// ─── Deposit instruction builder ────────────────────────────────────────────

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM,
  );
  return ata;
}

// sha256("global:deposit")[:8] — Anchor instruction discriminator (pre-computed)
const DEPOSIT_DISCRIMINATOR = new Uint8Array([242, 35, 198, 137, 82, 225, 242, 182]);

function buildDepositData(amountUsdc: number): Uint8Array {
  // Borsh U64 little-endian
  const amountLamports = BigInt(Math.round(amountUsdc * 1_000_000));
  const amountBytes = new Uint8Array(8);
  const view = new DataView(amountBytes.buffer);
  view.setBigUint64(0, amountLamports, true); // little-endian
  const data = new Uint8Array(16);
  data.set(DEPOSIT_DISCRIMINATOR, 0);
  data.set(amountBytes, 8);
  return data;
}

export function buildDepositInstruction(
  depositor: PublicKey,
  amountUsdc: number,
): TransactionInstruction {
  const programId = new PublicKey(PACIFIC_PROGRAM_ID);
  const centralState = new PublicKey(PACIFIC_CENTRAL_STATE);
  const vault = new PublicKey(PACIFIC_VAULT);
  const usdcMint = new PublicKey(USDC_MINT);
  const userAta = getAssociatedTokenAddress(depositor, usdcMint);
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('__event_authority')],
    programId,
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: centralState, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data: buildDepositData(amountUsdc),
  });
}

