export type PredictSport = 'epl' | 'ucl';
export type PredictFilter = 'All' | 'Geopolitics' | 'EPL' | 'UCL';

export interface GeopoliticsMarket {
  slug: string;
  question: string;
  category: 'geopolitics';
  conditionId: string | null;
  clobTokenIds: string[];
  yesPrice: number | null;
  noPrice: number | null;
  volume24h: number | null;
  endDate: string | null;
  active: boolean | null;
  image: string | null;
}

export interface SportOutcome {
  label: string;
  price: number | null;
  conditionId: string | null;
  clobTokenIds: string[];
}

export interface SportMarket {
  slug: string;
  title: string;
  sport: PredictSport;
  startDate: string | null;
  endDate: string | null;
  image: string | null;
  active: boolean | null;
  volume24h: number | null;
  liquidity: number | null;
  negRisk: boolean;
  outcomes: SportOutcome[];
}

export interface GeopoliticsMarketDetail {
  slug: string;
  question: string;
  description: string | null;
  endDate: string | null;
  active: boolean | null;
  volume24h: number | null;
  volume: number | null;
  liquidity: number | null;
  outcomes: string[];
  outcomePrices: number[];
  image: string | null;
}

export interface SportOutcomeDetail extends SportOutcome {
  question: string | null;
  liquidity: number | null;
  volume24h: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  acceptingOrders: boolean | null;
}

export interface SportMarketDetail {
  slug: string;
  title: string;
  description: string | null;
  sport: PredictSport;
  startDate: string | null;
  endDate: string | null;
  image: string | null;
  active: boolean | null;
  negRisk: boolean;
  volume24h: number | null;
  liquidity: number | null;
  outcomes: SportOutcomeDetail[];
}
