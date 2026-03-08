export interface SwapToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface SwapQuotePreview {
  inAmount: number;
  outAmount: number;
  priceImpactPct: number;
}

export type SwapSide = 'sell' | 'buy';
