import type {
  MeteoraPoolDetail,
  MeteoraResult,
} from '@myboon/shared/meteora';

const pool: MeteoraPoolDetail = {
  address: '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6',
  pair: 'SOL / USDC',
  tokenX: {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Wrapped SOL',
    decimals: 9,
    iconUrl: null,
    verified: true,
  },
  tokenY: {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    iconUrl: null,
    verified: true,
  },
  currentPrice: '76.33028516759326',
  tvlUsd: '4481128.92894453',
  volume24hUsd: '35103340.46032323',
  fees24hUsd: '13243.07492366214',
  feeTvl24hPct: '0.29552987949358933',
  baseFeePct: '0.04',
  dynamicFeePct: '0.000012',
  apr24hPct: '0.29552987949358933',
  apy24hPct: '193.613261018708',
  binStep: 4,
  hasFarm: false,
  tags: [],
  approvedByMeteora: true,
  reserveX: 'EYj9xKw6ZszwpyNibHY7JD5o3QgTVrSdcBp1fMJhrR9o',
  reserveY: 'CoaxzEh8p5YyGLcj36Eo3cUThVJxeKCs7qvLAGDYwBcz',
  tokenXAmount: '10.5',
  tokenYAmount: '1000',
  maxFeePct: '0',
  protocolFeePct: '5',
  collectFeeMode: 0,
  rewardMintX: null,
  rewardMintY: null,
  createdAt: '2024-03-30T03:27:42.000Z',
};

export const meteoraE2eClient = {
  clearCache() {},
  async getPool(): Promise<MeteoraResult<MeteoraPoolDetail>> {
    return {
      data: pool,
      freshness: {
        state: 'live',
        source: 'meteora_data_api',
        servedAt: new Date().toISOString(),
        ageMs: 0,
      },
    };
  },
};
