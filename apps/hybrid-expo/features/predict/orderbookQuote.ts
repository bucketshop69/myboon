import type { Orderbook, OrderbookLevel } from '@/features/predict/predict.types';

export interface ExecutableBuyQuote {
  executable: boolean;
  amount: number;
  shares: number;
  averagePrice: number | null;
  limitPrice: number | null;
  bestAsk: number | null;
  estimatedCost: number;
  unfilledAmount: number;
}

function sortedAsks(book: Orderbook | null): OrderbookLevel[] {
  return [...(book?.asks ?? [])]
    .filter((level) => Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.size) && level.size > 0)
    .sort((a, b) => a.price - b.price);
}

export function getBestAsk(book: Orderbook | null): number | null {
  const asks = sortedAsks(book);
  return asks[0]?.price ?? null;
}

export function buildExecutableBuyQuote(book: Orderbook | null, amount: number): ExecutableBuyQuote {
  const asks = sortedAsks(book);
  const bestAsk = asks[0]?.price ?? null;
  if (!Number.isFinite(amount) || amount <= 0 || asks.length === 0) {
    return {
      executable: false,
      amount,
      shares: 0,
      averagePrice: null,
      limitPrice: null,
      bestAsk,
      estimatedCost: 0,
      unfilledAmount: Math.max(amount, 0),
    };
  }

  let remaining = amount;
  let shares = 0;
  let estimatedCost = 0;
  let limitPrice: number | null = null;

  for (const ask of asks) {
    if (remaining <= 0) break;
    const levelCost = ask.price * ask.size;
    const costAtLevel = Math.min(remaining, levelCost);
    const sharesAtLevel = Math.floor((costAtLevel / ask.price) * 100) / 100;
    if (sharesAtLevel <= 0) break;

    const consumedCost = sharesAtLevel * ask.price;
    shares += sharesAtLevel;
    estimatedCost += consumedCost;
    remaining -= consumedCost;
    limitPrice = ask.price;
  }

  const roundedShares = Math.floor(shares * 100) / 100;
  const roundedCost = Math.round(estimatedCost * 100) / 100;
  const unfilledAmount = Math.max(0, amount - roundedCost);

  return {
    executable: roundedShares > 0 && unfilledAmount <= 0.02 && limitPrice !== null,
    amount,
    shares: roundedShares,
    averagePrice: roundedShares > 0 ? roundedCost / roundedShares : null,
    limitPrice,
    bestAsk,
    estimatedCost: roundedCost,
    unfilledAmount,
  };
}
