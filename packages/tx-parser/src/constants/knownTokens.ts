export const KNOWN_FUNDING_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
} as const;

const knownFundingTokenSet = new Set<string>(Object.values(KNOWN_FUNDING_TOKENS));

export function isKnownFundingToken(mint: string): boolean {
  return knownFundingTokenSet.has(mint);
}
