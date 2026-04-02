import type {
  PerpsAccount,
  PerpsMarket,
  PerpsPosition,
  RawAccountInfo,
  RawMarketInfo,
  RawPosition,
  RawPriceInfo,
} from '@/features/perps/perps.types';

const PACIFIC_REST = 'https://api.pacifica.fi/api/v1';

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
