import type {
  PerpsAccount,
  PerpsMarket,
  PerpsPosition,
  RawAccountInfo,
  RawMarketInfo,
  RawPosition,
  RawPriceInfo,
} from '@/features/perps/perps.types';

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

