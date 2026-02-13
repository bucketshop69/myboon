const JUPITER_TOKENS_SEARCH_URL = 'https://api.jup.ag/tokens/v2/search';
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface JupiterTokenResponseItem {
  id?: unknown;
  name?: unknown;
  symbol?: unknown;
  icon?: unknown;
  decimals?: unknown;
  holderCount?: unknown;
  organicScore?: unknown;
  isVerified?: unknown;
  tags?: unknown;
  usdPrice?: unknown;
  liquidity?: unknown;
  mcap?: unknown;
  fdv?: unknown;
  updatedAt?: unknown;
}

export interface TokenMetadata {
  mint: string;
  name?: string;
  symbol?: string;
  icon?: string;
  decimals?: number;
  holderCount?: number;
  organicScore?: number;
  isVerified?: boolean;
  tags?: string[];
  usdPrice?: number;
  liquidity?: number;
  marketCap?: number;
  fdv?: number;
  updatedAt?: string;
  source: 'jupiter-tokens-v2';
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeToken(raw: JupiterTokenResponseItem): TokenMetadata | null {
  const mint = asString(raw.id);
  if (!mint) {
    return null;
  }

  return {
    mint,
    name: asString(raw.name),
    symbol: asString(raw.symbol),
    icon: asString(raw.icon),
    decimals: asNumber(raw.decimals),
    holderCount: asNumber(raw.holderCount),
    organicScore: asNumber(raw.organicScore),
    isVerified: typeof raw.isVerified === 'boolean' ? raw.isVerified : undefined,
    tags: asStringArray(raw.tags),
    usdPrice: asNumber(raw.usdPrice),
    liquidity: asNumber(raw.liquidity),
    marketCap: asNumber(raw.mcap),
    fdv: asNumber(raw.fdv),
    updatedAt: asString(raw.updatedAt),
    source: 'jupiter-tokens-v2'
  };
}

export interface JupiterTokensClientOptions {
  apiKey?: string;
}

export class JupiterTokensClient {
  private readonly apiKey?: string;

  constructor(options?: JupiterTokensClientOptions) {
    this.apiKey = options?.apiKey ?? process.env.JUPITER_API_KEY;
  }

  async getTokenByMint(mint: string): Promise<TokenMetadata | null> {
    const normalizedMint = mint.trim();
    if (!MINT_PATTERN.test(normalizedMint)) {
      throw new Error(`Invalid mint address: ${mint}`);
    }

    const url = new URL(JUPITER_TOKENS_SEARCH_URL);
    url.searchParams.set('query', normalizedMint);

    const headers: Record<string, string> = {
      Accept: 'application/json'
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jupiter Tokens API ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as unknown;
    const items = this.extractItems(payload);
    if (items.length === 0) {
      return null;
    }

    const exactMatch = items.find((item) => asString(item.id) === normalizedMint) ?? items[0];
    return normalizeToken(exactMatch);
  }

  private extractItems(payload: unknown): JupiterTokenResponseItem[] {
    if (Array.isArray(payload)) {
      return payload as JupiterTokenResponseItem[];
    }

    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as JupiterTokenResponseItem[];
    }

    const tokens = (payload as { tokens?: unknown }).tokens;
    if (Array.isArray(tokens)) {
      return tokens as JupiterTokenResponseItem[];
    }

    return [];
  }
}
