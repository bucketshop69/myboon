import type { SwapQuotePreview, SwapToken } from '@/features/swap/swap.types';
import { fetchWithTimeout } from '@/lib/api';

const JUP_BASE_URL = 'https://api.jup.ag';

const FALLBACK_TOKENS: SwapToken[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  {
    address: 'Es9vMFrzaCER7xN4k3qfKxuxMxDPZWS9Vyuk3F7S3w7P',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCER7xN4k3qfKxuxMxDPZWS9Vyuk3F7S3w7P/logo.svg',
  },
  {
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
    logoURI: 'https://static.jup.ag/jup/icon.png',
  },
];

function jupiterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = process.env.EXPO_PUBLIC_JUP_API_KEY?.trim();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

function toSwapToken(row: unknown): SwapToken | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const address = typeof record.id === 'string' ? record.id : typeof record.address === 'string' ? record.address : null;
  const symbol = typeof record.symbol === 'string' ? record.symbol : null;
  const name = typeof record.name === 'string' ? record.name : symbol;
  const decimals = typeof record.decimals === 'number' ? record.decimals : 6;
  const logoURI = typeof record.icon === 'string' ? record.icon : typeof record.logoURI === 'string' ? record.logoURI : undefined;

  if (!address || !symbol || !name) return null;

  return {
    address,
    symbol: symbol.toUpperCase(),
    name,
    decimals,
    logoURI,
  };
}

export function getFallbackTokens(): SwapToken[] {
  return FALLBACK_TOKENS;
}

export async function searchSwapTokens(query: string): Promise<SwapToken[]> {
  const normalized = query.trim();
  if (!normalized) return FALLBACK_TOKENS;

  const response = await fetchWithTimeout(
    `${JUP_BASE_URL}/tokens/v2/search?query=${encodeURIComponent(normalized)}`,
    { headers: jupiterHeaders() }
  );

  if (!response.ok) {
    throw new Error(`Token search failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    return FALLBACK_TOKENS;
  }

  const mapped = payload.map(toSwapToken).filter((token): token is SwapToken => token !== null);
  return mapped.length > 0 ? mapped : FALLBACK_TOKENS;
}

export async function fetchTokenPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const response = await fetchWithTimeout(
    `${JUP_BASE_URL}/price/v3?ids=${encodeURIComponent(mints.join(','))}`,
    { headers: jupiterHeaders() }
  );

  if (!response.ok) {
    throw new Error(`Price fetch failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') return {};

  const data = payload as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const mint of mints) {
    const entry = data[mint];
    if (entry && typeof entry === 'object') {
      const usdPrice = (entry as Record<string, unknown>).usdPrice;
      if (typeof usdPrice === 'number') {
        result[mint] = usdPrice;
      }
    }
  }

  return result;
}

function toAtomicAmount(value: string, decimals: number): string {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  const atomic = Math.floor(numeric * 10 ** decimals);
  return String(Math.max(0, atomic));
}

function fromAtomicAmount(value: string | number, decimals: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric / 10 ** decimals;
}

export async function fetchSwapQuotePreview(args: {
  inputMint: string;
  outputMint: string;
  amountUi: string;
  inputDecimals: number;
  outputDecimals: number;
  slippageBps: number;
}): Promise<SwapQuotePreview> {
  const amount = toAtomicAmount(args.amountUi, args.inputDecimals);
  if (amount === '0') {
    return { inAmount: 0, outAmount: 0, priceImpactPct: 0 };
  }

  const url =
    `${JUP_BASE_URL}/swap/v1/quote` +
    `?inputMint=${encodeURIComponent(args.inputMint)}` +
    `&outputMint=${encodeURIComponent(args.outputMint)}` +
    `&amount=${encodeURIComponent(amount)}` +
    `&slippageBps=${encodeURIComponent(String(args.slippageBps))}`;

  const response = await fetchWithTimeout(url, { headers: jupiterHeaders() });
  if (!response.ok) {
    throw new Error(`Quote preview failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid quote response');
  }

  const quote = payload as Record<string, unknown>;
  const inAmount = fromAtomicAmount((quote.inAmount as string | number) ?? amount, args.inputDecimals);
  const outAmount = fromAtomicAmount((quote.outAmount as string | number) ?? 0, args.outputDecimals);
  const priceImpactPct = Number.parseFloat(String(quote.priceImpactPct ?? 0));

  return {
    inAmount,
    outAmount,
    priceImpactPct: Number.isFinite(priceImpactPct) ? priceImpactPct : 0,
  };
}
